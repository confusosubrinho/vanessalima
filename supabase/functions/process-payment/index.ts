import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Environment-based URLs ───
function authUrl(env: string) {
  return env === "sandbox"
    ? "https://auth.sandboxappmax.com.br"
    : "https://auth.appmax.com.br";
}
function apiUrl(env: string) {
  return env === "sandbox"
    ? "https://api.sandboxappmax.com.br"
    : "https://api.appmax.com.br";
}

// ─── OAuth Token Management (cached in store_settings) ───
async function getAppmaxToken(
  supabase: ReturnType<typeof createClient>,
  env: string
): Promise<string> {
  // Check cached token
  const { data: settings } = await supabase
    .from("store_settings")
    .select("appmax_access_token, bling_token_expires_at")
    .limit(1)
    .maybeSingle();

  // Reuse bling_token_expires_at field for appmax token expiry (avoids migration)
  // Actually we have appmax_access_token already - let's reuse it as cache
  const cachedToken = settings?.appmax_access_token;
  const expiresAt = settings?.bling_token_expires_at;

  if (cachedToken && expiresAt) {
    const expiresDate = new Date(expiresAt);
    // 60s buffer
    if (expiresDate > new Date(Date.now() + 60_000)) {
      return cachedToken;
    }
  }

  // Generate new token via OAuth client_credentials
  const clientId = Deno.env.get("APPMAX_CLIENT_ID");
  const clientSecret = Deno.env.get("APPMAX_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais OAuth da Appmax não configuradas (APPMAX_CLIENT_ID / APPMAX_CLIENT_SECRET)");
  }

  const tokenUrl = `${authUrl(env)}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OAuth token error [${resp.status}]: ${errText}`);
  }

  const tokenData = await resp.json();
  const accessToken = tokenData.access_token;
  const expiresIn = Number(tokenData.expires_in ?? 3600);
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Cache token in store_settings
  await supabase
    .from("store_settings")
    .update({
      appmax_access_token: accessToken,
      bling_token_expires_at: newExpiresAt,
    })
    .not("id", "is", null); // update all rows (single row table)

  return accessToken;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read appmax environment from store_settings
    const { data: settings, error: settingsError } = await supabase
      .from("store_settings")
      .select("appmax_environment")
      .limit(1)
      .maybeSingle();

    if (settingsError) throw new Error(`Settings error: ${settingsError.message}`);

    const appmaxEnv = settings?.appmax_environment || "production";

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
      const hasCredentials = !!Deno.env.get("APPMAX_CLIENT_ID") && !!Deno.env.get("APPMAX_CLIENT_SECRET");
      return new Response(
        JSON.stringify({
          // Full pricing config from payment_pricing_config (single source of truth)
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
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── All transactional actions require OAuth token ───
    const token = await getAppmaxToken(supabase, appmaxEnv);
    const baseApiUrl = apiUrl(appmaxEnv);

    // ─── Action: tokenize_card (server-side tokenization) ───
    if (action === "tokenize_card") {
      const { card_number, card_holder, expiration_month, expiration_year, security_code } = payload;
      if (!card_number || !card_holder || !expiration_month || !expiration_year || !security_code) {
        return new Response(
          JSON.stringify({ error: "Dados do cartão incompletos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const tokenizeResp = await appmaxFetch(baseApiUrl, token, "payments/tokenize", {
        number: card_number.replace(/\s/g, ""),
        cvv: security_code,
        month: parseInt(expiration_month) || 1,
        year: parseInt(expiration_year) || 2025,
        name: card_holder,
      });
      const cardToken = tokenizeResp?.data?.token || tokenizeResp?.token;
      if (!cardToken) {
        return new Response(
          JSON.stringify({ error: "Falha ao tokenizar cartão" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ token: cardToken }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Action: create_transaction ───
    if (action === "create_transaction") {
      const {
        order_id,
        amount,
        installments = 1,
        customer_name,
        customer_email,
        customer_phone,
        customer_cpf,
        customer_ip,
        shipping_zip,
        shipping_address,
        shipping_number,
        shipping_complement,
        shipping_neighborhood,
        shipping_city,
        shipping_state,
        payment_method = "pix",
        products = [],
        coupon_code,
        discount_amount = 0,
        // Card token (from tokenize_card action - PCI compliant)
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

        if (couponError || !coupon) {
          return new Response(
            JSON.stringify({ error: "Cupom inválido ou inativo" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) {
          return new Response(
            JSON.stringify({ error: "Cupom expirado" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (coupon.max_uses && (coupon.uses_count || 0) >= coupon.max_uses) {
          return new Response(
            JSON.stringify({ error: "Cupom esgotado" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const expectedSubtotal = products.reduce(
          (sum: number, p: any) => sum + p.price * (p.quantity || 1),
          0
        );

        if (coupon.min_purchase_amount && expectedSubtotal < coupon.min_purchase_amount) {
          return new Response(
            JSON.stringify({
              error: `Valor mínimo para este cupom: R$ ${coupon.min_purchase_amount}`,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        validatedDiscount =
          coupon.discount_type === "percentage"
            ? (expectedSubtotal * coupon.discount_value) / 100
            : coupon.discount_value;

        if (Math.abs(validatedDiscount - discount_amount) > 0.1) {
          return new Response(
            JSON.stringify({ error: "Valor do desconto divergente. Recarregue a página." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        validatedCouponId = coupon.id;
      }

      // ── Stock validation + atomic decrement (prevents race condition) ──
      // decrement_stock now returns jsonb with success/error details and uses FOR UPDATE lock
      const stockDecrements: { variant_id: string; quantity: number; name: string }[] = [];
      for (const product of products) {
        if (!product.variant_id) continue;
        const qty = product.quantity || 1;
        const { data: result, error: rpcError } = await supabase.rpc("decrement_stock", {
          p_variant_id: product.variant_id,
          p_quantity: qty,
        });

        if (rpcError) {
          // Rollback already decremented stock
          for (const dec of stockDecrements) {
            await supabase.rpc("increment_stock", {
              p_variant_id: dec.variant_id,
              p_quantity: dec.quantity,
            });
          }
          throw new Error(`Erro ao verificar estoque: ${rpcError.message}`);
        }

        const stockResult = typeof result === 'string' ? JSON.parse(result) : result;

        if (!stockResult?.success) {
          // Rollback already decremented stock
          for (const dec of stockDecrements) {
            await supabase.rpc("increment_stock", {
              p_variant_id: dec.variant_id,
              p_quantity: dec.quantity,
            });
          }
          return new Response(
            JSON.stringify({
              error: stockResult?.message || `Estoque insuficiente para "${product.name}"`,
              error_code: stockResult?.error,
              available_stock: stockResult?.available_stock,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
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
      const orderProducts =
        products.length > 0
          ? products.map((p: any) => ({
              sku: p.sku || p.product_id || "SKU001",
              name: p.name || "Produto",
              qty: p.quantity || 1,
              price: p.price || 0,
            }))
          : [{ sku: "ORDER", name: "Pedido", qty: 1, price: amount }];

      const orderPayload = {
        customer_id: appmaxCustomerId,
        products: orderProducts,
      };

      const orderData = await appmaxFetch(baseApiUrl, token, "orders", orderPayload);
      const appmaxOrderId = orderData?.data?.id || orderData?.id;
      if (!appmaxOrderId) throw new Error("Falha ao criar pedido na Appmax");

      // ── Step 3: Process payment (v1) ──
      let paymentEndpoint: string;
      let paymentPayload: Record<string, unknown> = {
        order_id: appmaxOrderId,
      };

      if (payment_method === "pix") {
        paymentEndpoint = "payments/pix";
        paymentPayload.payment_data = {
          pix: {
            document_number: (customer_cpf || "").replace(/\D/g, ""),
          },
        };
      } else if (payment_method === "credit-card" || payment_method === "card") {
        paymentEndpoint = "payments/credit-card";

        if (!card_token) {
          throw new Error("Token do cartão obrigatório. Dados brutos não são aceitos.");
        }
        paymentPayload.payment_data = {
          credit_card: {
            token: card_token,
            document_number: (customer_cpf || "").replace(/\D/g, ""),
            installments: installments,
            soft_descriptor: "VANESSALIMA",
          },
        };
      } else {
        throw new Error(`Método de pagamento não suportado: ${payment_method}`);
      }

      let paymentData;
      try {
        paymentData = await appmaxFetch(baseApiUrl, token, paymentEndpoint, paymentPayload);
      } catch (paymentError: any) {
        // Rollback stock on payment failure using proper increment_stock
        for (const dec of stockDecrements) {
          await supabase.rpc("increment_stock", {
            p_variant_id: dec.variant_id,
            p_quantity: dec.quantity,
          });
        }
        throw paymentError;
      }

      // ── Post-payment: update internal order ──
      if (order_id) {
        const updateData: Record<string, unknown> = {
          status: "processing",
          coupon_code: coupon_code || null,
          discount_amount: validatedDiscount || discount_amount || 0,
          appmax_customer_id: String(appmaxCustomerId),
          appmax_order_id: String(appmaxOrderId),
          payment_method: payment_method === "credit-card" || payment_method === "card" ? "card" : payment_method,
        };

        await supabase.from("orders").update(updateData).eq("id", order_id);

        // Find or create customer record
        if (customer_email) {
          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("id, total_orders, total_spent")
            .eq("email", customer_email.toLowerCase())
            .maybeSingle();

          let dbCustomerId: string;
          if (existingCustomer) {
            dbCustomerId = existingCustomer.id;
            await supabase
              .from("customers")
              .update({
                total_orders: (existingCustomer.total_orders || 0) + 1,
                total_spent: (existingCustomer.total_spent || 0) + amount,
                full_name: customer_name || "Cliente",
                phone: customer_phone || null,
              })
              .eq("id", existingCustomer.id);
          } else {
            const { data: newCustomer } = await supabase
              .from("customers")
              .insert({
                email: customer_email.toLowerCase(),
                full_name: customer_name || "Cliente",
                phone: customer_phone || null,
                total_orders: 1,
                total_spent: amount,
              })
              .select("id")
              .single();
            dbCustomerId = newCustomer?.id || "";
          }

          if (dbCustomerId) {
            await supabase.from("orders").update({ customer_id: dbCustomerId }).eq("id", order_id);
          }
        }
      }

      // Stock already decremented atomically before payment (see above)

      // Increment coupon uses atomically
      if (validatedCouponId) {
        await supabase.rpc("increment_coupon_uses", {
          p_coupon_id: validatedCouponId,
        });
      }

      // Build response
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

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Action: get_order_status ───
    if (action === "get_order_status") {
      const { appmax_order_id: oid } = payload;
      if (!oid) {
        return new Response(JSON.stringify({ error: "appmax_order_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const orderStatus = await appmaxFetch(baseApiUrl, token, `orders/${oid}`, {}, "GET");
      return new Response(JSON.stringify(orderStatus), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Payment error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao processar pagamento" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
