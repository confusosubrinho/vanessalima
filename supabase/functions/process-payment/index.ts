import {
  corsHeaders,
  getServiceClient,
  getActiveSettings,
  getAppToken,
  logAppmax,
  errorResponse,
  jsonResponse,
} from "../_shared/appmax.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── In-memory rate limiting ───
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_PAYMENT = 10;

function isRateLimited(identifier: string, maxRequests: number): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(identifier) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitMap.set(identifier, recent);
  if (rateLimitMap.size > 10000) {
    for (const [key, vals] of rateLimitMap) {
      const filtered = vals.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (filtered.length === 0) rateLimitMap.delete(key);
      else rateLimitMap.set(key, filtered);
    }
  }
  return recent.length > maxRequests;
}

// ─── Appmax v1 API helper ───
async function appmaxFetch(
  baseUrl: string,
  token: string,
  endpoint: string,
  body: Record<string, unknown>,
  method = "POST"
) {
  const url = `${baseUrl}/v1/${endpoint}`;
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  if (!response.ok) {
    const errMsg = data?.message || data?.error || data?.text || `Appmax API error [${response.status}]`;
    throw new Error(errMsg);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limit by IP
  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`payment:${clientIP}`, RATE_LIMIT_MAX_PAYMENT)) {
    return new Response(
      JSON.stringify({ error: "Muitas requisições. Tente novamente em instantes." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = getServiceClient();

    // Read active environment settings from appmax_settings
    const settings = await getActiveSettings(supabase);
    const appmaxEnv = settings?.environment || "production";
    const baseApiUrl = settings?.base_api_url || (appmaxEnv === "sandbox" ? "https://api.sandboxappmax.com.br" : "https://api.appmax.com.br");

    // Read financial config from payment_pricing_config (single source of truth)
    const { data: pricingConfig } = await supabase
      .from("payment_pricing_config")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const { action, ...payload } = await req.json();

    // ─── Action: get_payment_config ───
    if (action === "get_payment_config") {
      const hasCredentials = !!(settings?.client_id || Deno.env.get("APPMAX_CLIENT_ID"));
      return jsonResponse({
        max_installments: pricingConfig?.max_installments || 6,
        interest_free_installments: pricingConfig?.interest_free_installments || 3,
        interest_mode: pricingConfig?.interest_mode || "fixed",
        monthly_rate_fixed: Number(pricingConfig?.monthly_rate_fixed) || 0,
        monthly_rate_by_installment: pricingConfig?.monthly_rate_by_installment || {},
        min_installment_value: Number(pricingConfig?.min_installment_value) || 30,
        pix_discount: Number(pricingConfig?.pix_discount) || 0,
        cash_discount: Number(pricingConfig?.cash_discount) || 0,
        card_cash_rate: Number(pricingConfig?.card_cash_rate) || 0,
        rounding_mode: pricingConfig?.rounding_mode || "adjust_last",
        transparent_checkout_fee_enabled: pricingConfig?.transparent_checkout_fee_enabled ?? false,
        transparent_checkout_fee_percent: Number(pricingConfig?.transparent_checkout_fee_percent) || 0,
        gateway_configured: hasCredentials,
        gateway: "appmax",
      });
    }

    // ─── Authentication required for transactional actions ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Autenticação necessária", 401);
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const jwtToken = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(jwtToken);
    if (claimsError || !claimsData?.claims?.sub) {
      return errorResponse("Token inválido ou expirado", 401);
    }

    // ─── Get OAuth token via shared helper (encrypted cache) ───
    let token: string;
    if (settings) {
      token = await getAppToken(supabase, settings);
    } else {
      // Fallback: legacy env-var based token
      const clientId = Deno.env.get("APPMAX_CLIENT_ID");
      const clientSecret = Deno.env.get("APPMAX_CLIENT_SECRET");
      if (!clientId || !clientSecret) throw new Error("Credenciais Appmax não configuradas");
      const authUrl = appmaxEnv === "sandbox" ? "https://auth.sandboxappmax.com.br" : "https://auth.appmax.com.br";
      const resp = await fetch(`${authUrl}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }).toString(),
      });
      const tokenData = await resp.json();
      if (!resp.ok || !tokenData.access_token) throw new Error("Falha ao obter token OAuth");
      token = tokenData.access_token;
    }

    // ─── Action: tokenize_card ───
    if (action === "tokenize_card") {
      const { card_number, card_holder, expiration_month, expiration_year, security_code } = payload;
      if (!card_number || !card_holder || !expiration_month || !expiration_year || !security_code) {
        return errorResponse("Dados do cartão incompletos", 400);
      }
      const tokenizeResp = await appmaxFetch(baseApiUrl, token, "payments/tokenize", {
        number: card_number.replace(/\s/g, ""),
        cvv: security_code,
        month: parseInt(expiration_month) || 1,
        year: parseInt(expiration_year) || 2025,
        name: card_holder,
      });
      const cardToken = tokenizeResp?.data?.token || tokenizeResp?.token;
      if (!cardToken) return errorResponse("Falha ao tokenizar cartão", 400);
      return jsonResponse({ token: cardToken });
    }

    // ─── Action: create_transaction ───
    if (action === "create_transaction") {
      const {
        order_id, amount, installments = 1,
        customer_name, customer_email, customer_phone, customer_cpf, customer_ip,
        shipping_zip, shipping_address, shipping_number, shipping_complement,
        shipping_neighborhood, shipping_city, shipping_state,
        payment_method = "pix", products = [], coupon_code, discount_amount = 0,
        card_token,
      } = payload;

      // ── Server-side coupon validation ──
      let validatedDiscount = 0;
      let validatedCouponId: string | null = null;

      if (coupon_code) {
        const { data: coupon, error: couponError } = await supabase
          .from("coupons")
          .select("*")
          .eq("code", coupon_code.toUpperCase())
          .eq("is_active", true)
          .maybeSingle();

        if (couponError || !coupon) return errorResponse("Cupom inválido ou inativo", 400);
        if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) return errorResponse("Cupom expirado", 400);
        if (coupon.max_uses && (coupon.uses_count || 0) >= coupon.max_uses) return errorResponse("Cupom esgotado", 400);

        const expectedSubtotal = products.reduce((sum: number, p: any) => sum + p.price * (p.quantity || 1), 0);
        if (coupon.min_purchase_amount && expectedSubtotal < coupon.min_purchase_amount) {
          return errorResponse(`Valor mínimo para este cupom: R$ ${coupon.min_purchase_amount}`, 400);
        }

        validatedDiscount = coupon.discount_type === "percentage"
          ? (expectedSubtotal * coupon.discount_value) / 100
          : coupon.discount_value;

        if (Math.abs(validatedDiscount - discount_amount) > 0.1) {
          return errorResponse("Valor do desconto divergente. Recarregue a página.", 400);
        }
        validatedCouponId = coupon.id;
      }

      // ── BUG #3: Server-side price validation ──
      let serverSubtotal = 0;
      const priceErrors: string[] = [];

      for (const product of products) {
        if (!product.variant_id) continue;

        const { data: variantData } = await supabase
          .from("product_variants")
          .select(`
            id, price_modifier, sale_price, base_price,
            products!inner(id, base_price, sale_price, is_active)
          `)
          .eq("id", product.variant_id)
          .single();

        if (!variantData) {
          priceErrors.push(`Variante ${product.variant_id} não encontrada`);
          continue;
        }

        const productData = variantData.products as any;
        if (!productData?.is_active) {
          priceErrors.push(`Produto "${product.name}" não está mais disponível`);
          continue;
        }

        let realUnitPrice: number;
        if (variantData.sale_price && Number(variantData.sale_price) > 0) {
          realUnitPrice = Number(variantData.sale_price);
        } else if (variantData.base_price && Number(variantData.base_price) > 0) {
          realUnitPrice = Number(variantData.base_price);
        } else {
          const productPrice = Number(productData.sale_price || productData.base_price);
          realUnitPrice = productPrice + Number(variantData.price_modifier || 0);
        }

        serverSubtotal += realUnitPrice * (product.quantity || 1);
      }

      if (priceErrors.length > 0) {
        return errorResponse(priceErrors.join("; "), 400);
      }

      // Calculate server total
      const serverDiscount = validatedCouponId ? validatedDiscount : 0;
      const clientShippingCost = Math.max(0, amount - (serverSubtotal - serverDiscount));
      let serverTotal: number;

      if (payment_method === "pix") {
        const pixDiscountPct = Number(pricingConfig?.pix_discount || 0) / 100;
        serverTotal = (serverSubtotal - serverDiscount) * (1 - pixDiscountPct) + clientShippingCost;
      } else {
        serverTotal = serverSubtotal - serverDiscount + clientShippingCost;
      }

      // Allow 1% tolerance for rounding
      const tolerance = Math.max(0.10, serverTotal * 0.01);
      if (Math.abs(serverTotal - amount) > tolerance) {
        await logAppmax(supabase, "warn", `Divergência de valor: cliente=${amount}, servidor=${serverTotal}`, {
          order_id, products: products.map((p: any) => p.variant_id),
        });
        return errorResponse("Valor do pedido divergente. Recarregue a página e tente novamente.", 400);
      }

      // Use serverTotal as authoritative amount
      const authorizedAmount = serverTotal;

      // ── Stock validation + atomic decrement ──
      const stockDecrements: { variant_id: string; quantity: number; name: string }[] = [];
      for (const product of products) {
        if (!product.variant_id) continue;
        const qty = product.quantity || 1;
        const { data: result, error: rpcError } = await supabase.rpc("decrement_stock", {
          p_variant_id: product.variant_id,
          p_quantity: qty,
        });

        if (rpcError) {
          for (const dec of stockDecrements) {
            await supabase.rpc("increment_stock", { p_variant_id: dec.variant_id, p_quantity: dec.quantity });
          }
          throw new Error(`Erro ao verificar estoque: ${rpcError.message}`);
        }

        const stockResult = typeof result === 'string' ? JSON.parse(result) : result;
        if (!stockResult?.success) {
          for (const dec of stockDecrements) {
            await supabase.rpc("increment_stock", { p_variant_id: dec.variant_id, p_quantity: dec.quantity });
          }
          return jsonResponse({
            error: stockResult?.message || `Estoque insuficiente para "${product.name}"`,
            error_code: stockResult?.error,
            available_stock: stockResult?.available_stock,
          }, 400);
        }
        stockDecrements.push({ variant_id: product.variant_id, quantity: qty, name: product.name });
      }

      // ── Step 1: Create/update customer (v1) ──
      const nameParts = (customer_name || "Cliente").split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || firstName;

      const customerPayload = {
        first_name: firstName,
        last_name: lastName,
        email: customer_email || "cliente@loja.com",
        phone: (customer_phone || "").replace(/\D/g, ""),
        ip: customer_ip || "0.0.0.0",
        postcode: (shipping_zip || "").replace(/\D/g, ""),
        address_street: shipping_address || "",
        address_street_number: shipping_number || "0",
        address_street_complement: shipping_complement || "",
        address_street_district: shipping_neighborhood || "",
        address_city: shipping_city || "",
        address_state: shipping_state || "",
      };

      const customerData = await appmaxFetch(baseApiUrl, token, "customers", customerPayload);
      const appmaxCustomerId = customerData?.data?.id || customerData?.id;
      if (!appmaxCustomerId) throw new Error("Falha ao criar cliente na Appmax");

      // ── Step 2: Create order (v1) ──
      const orderProducts = products.length > 0
        ? products.map((p: any) => ({
            sku: p.sku || p.product_id || "SKU001",
            name: p.name || "Produto",
            qty: p.quantity || 1,
            price: p.price || 0,
          }))
        : [{ sku: "ORDER", name: "Pedido", qty: 1, price: authorizedAmount }];

      const orderData = await appmaxFetch(baseApiUrl, token, "orders", {
        customer_id: appmaxCustomerId,
        products: orderProducts,
      });
      const appmaxOrderId = orderData?.data?.id || orderData?.id;
      if (!appmaxOrderId) throw new Error("Falha ao criar pedido na Appmax");

      // ── BUG #8: Dynamic soft_descriptor from store_settings ──
      const { data: storeSettings } = await supabase
        .from("store_settings")
        .select("store_name")
        .limit(1)
        .maybeSingle();

      const storeName = storeSettings?.store_name || "LOJA";
      const softDescriptor = storeName
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, "")
        .slice(0, 13)
        .trim() || "LOJA";

      // ── Step 3: Process payment (v1) ──
      let paymentEndpoint: string;
      let paymentPayload: Record<string, unknown> = { order_id: appmaxOrderId };

      if (payment_method === "pix") {
        paymentEndpoint = "payments/pix";
        paymentPayload.payment_data = {
          pix: { document_number: (customer_cpf || "").replace(/\D/g, "") },
        };
      } else if (payment_method === "credit-card" || payment_method === "card") {
        paymentEndpoint = "payments/credit-card";
        if (!card_token) throw new Error("Token do cartão obrigatório. Dados brutos não são aceitos.");
        paymentPayload.payment_data = {
          credit_card: {
            token: card_token,
            document_number: (customer_cpf || "").replace(/\D/g, ""),
            installments,
            soft_descriptor: softDescriptor,
          },
        };
      } else {
        throw new Error(`Método de pagamento não suportado: ${payment_method}`);
      }

      let paymentData;
      try {
        paymentData = await appmaxFetch(baseApiUrl, token, paymentEndpoint, paymentPayload);
      } catch (paymentError: any) {
        for (const dec of stockDecrements) {
          await supabase.rpc("increment_stock", { p_variant_id: dec.variant_id, p_quantity: dec.quantity });
        }
        throw paymentError;
      }

      // ── Post-payment: update internal order ──
      if (order_id) {
        await supabase.from("orders").update({
          status: "processing",
          coupon_code: coupon_code || null,
          discount_amount: validatedDiscount || discount_amount || 0,
          appmax_customer_id: String(appmaxCustomerId),
          appmax_order_id: String(appmaxOrderId),
          payment_method: payment_method === "credit-card" || payment_method === "card" ? "card" : payment_method,
        }).eq("id", order_id);

        if (customer_email) {
          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("id, total_orders, total_spent")
            .eq("email", customer_email.toLowerCase())
            .maybeSingle();

          let dbCustomerId: string;
          if (existingCustomer) {
            dbCustomerId = existingCustomer.id;
            await supabase.from("customers").update({
              total_orders: (existingCustomer.total_orders || 0) + 1,
              total_spent: (existingCustomer.total_spent || 0) + authorizedAmount,
              full_name: customer_name || "Cliente",
              phone: customer_phone || null,
            }).eq("id", existingCustomer.id);
          } else {
            const { data: newCustomer } = await supabase.from("customers").insert({
              email: customer_email.toLowerCase(),
              full_name: customer_name || "Cliente",
              phone: customer_phone || null,
              total_orders: 1,
              total_spent: authorizedAmount,
            }).select("id").single();
            dbCustomerId = newCustomer?.id || "";
          }

          if (dbCustomerId) {
            await supabase.from("orders").update({ customer_id: dbCustomerId }).eq("id", order_id);
          }
        }
      }

      if (validatedCouponId) {
        await supabase.rpc("increment_coupon_uses", { p_coupon_id: validatedCouponId });
      }

      const result: Record<string, unknown> = {
        success: true,
        appmax_order_id: appmaxOrderId,
        pay_reference: paymentData?.data?.pay_reference || paymentData?.pay_reference,
      };

      if (payment_method === "pix" && paymentData?.data) {
        result.pix_qrcode = paymentData.data.pix_qrcode || paymentData.data.qr_code;
        result.pix_emv = paymentData.data.pix_emv || paymentData.data.emv;
        result.pix_expiration_date = paymentData.data.pix_expiration_date || paymentData.data.expiration_date;
      }

      return jsonResponse(result);
    }

    // ─── Action: get_order_status ───
    if (action === "get_order_status") {
      const { appmax_order_id: oid } = payload;
      if (!oid) return errorResponse("appmax_order_id required", 400);
      const orderStatus = await appmaxFetch(baseApiUrl, token, `orders/${oid}`, {}, "GET");
      return jsonResponse(orderStatus);
    }

    return errorResponse("Ação inválida", 400);
  } catch (error: any) {
    console.error("Payment error:", error.message);
    return errorResponse(error.message || "Erro ao processar pagamento");
  }
});
