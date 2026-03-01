import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    // ─── Action: get_config ───
    if (action === "get_config") {
      // Return the publishable key for the frontend
      const { data: provider } = await supabase
        .from("integrations_checkout_providers")
        .select("config, is_active")
        .eq("provider", "stripe")
        .maybeSingle();

      const config = (provider?.config || {}) as Record<string, unknown>;
      return jsonRes({
        publishable_key: config.publishable_key || null,
        is_active: provider?.is_active || false,
      });
    }

    // ─── Action: create_payment_intent ───
    if (action === "create_payment_intent") {
      const {
        order_id,
        amount,
        payment_method,
        customer_email,
        customer_name,
        products,
        coupon_code,
        discount_amount = 0,
        installments = 1,
        order_access_token,
      } = body;

      if (!order_id || !amount) {
        return jsonRes({ error: "order_id e amount são obrigatórios" }, 400);
      }

      // ── Auth: Bearer or guest token ──
      const authHeader = req.headers.get("Authorization");
      const hasBearer = !!authHeader?.startsWith("Bearer ");

      if (!hasBearer) {
        if (!order_access_token) return jsonRes({ error: "Autenticação necessária" }, 401);
        const { data: orderRow } = await supabase
          .from("orders")
          .select("id")
          .eq("id", order_id)
          .eq("access_token", order_access_token)
          .maybeSingle();
        if (!orderRow) return jsonRes({ error: "Acesso negado ao pedido" }, 403);
      }

      // ── Read pricing config ──
      const { data: pricingConfig } = await supabase
        .from("payment_pricing_config")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      // ── Server-side price validation ──
      let serverSubtotal = 0;
      let serverSubtotalFull = 0;
      let serverSubtotalSale = 0;
      const priceErrors: string[] = [];

      for (const product of (products || [])) {
        if (!product.variant_id) continue;
        const { data: variantData } = await supabase
          .from("product_variants")
          .select("id, price_modifier, sale_price, base_price, products!inner(id, base_price, sale_price, is_active)")
          .eq("id", product.variant_id)
          .single();

        if (!variantData) { priceErrors.push(`Variante ${product.variant_id} não encontrada`); continue; }
        const productData = variantData.products as any;
        if (!productData?.is_active) { priceErrors.push(`Produto "${product.name}" indisponível`); continue; }

        let realUnitPrice: number;
        if (variantData.sale_price && Number(variantData.sale_price) > 0) {
          realUnitPrice = Number(variantData.sale_price);
        } else if (variantData.base_price && Number(variantData.base_price) > 0) {
          realUnitPrice = Number(variantData.base_price);
        } else {
          realUnitPrice = Number(productData.sale_price || productData.base_price) + Number(variantData.price_modifier || 0);
        }

        const lineTotal = realUnitPrice * (product.quantity || 1);
        serverSubtotal += lineTotal;

        const isSale =
          (variantData.sale_price != null && variantData.base_price != null && Number(variantData.sale_price) < Number(variantData.base_price)) ||
          (productData.sale_price != null && productData.base_price != null && Number(productData.sale_price) < Number(productData.base_price));
        if (isSale) serverSubtotalSale += lineTotal;
        else serverSubtotalFull += lineTotal;
      }

      if (priceErrors.length > 0) return jsonRes({ error: priceErrors.join("; ") }, 400);

      // ── Coupon validation ──
      let validatedDiscount = 0;
      if (coupon_code) {
        const { data: coupon } = await supabase
          .from("coupons")
          .select("*")
          .eq("code", coupon_code.toUpperCase())
          .eq("is_active", true)
          .maybeSingle();

        if (coupon) {
          if (coupon.expiry_date && new Date(coupon.expiry_date as string) < new Date()) {
            return jsonRes({ error: "Cupom expirado" }, 400);
          }
          validatedDiscount = (coupon.discount_type as string) === "percentage"
            ? (serverSubtotal * Number(coupon.discount_value)) / 100
            : Number(coupon.discount_value);
          validatedDiscount = Math.min(serverSubtotal, Math.max(0, validatedDiscount));
        }
      }

      // ── Compute server total ──
      const { data: orderRow } = await supabase
        .from("orders")
        .select("shipping_cost")
        .eq("id", order_id)
        .maybeSingle();
      const orderShippingCost = Number(orderRow?.shipping_cost ?? 0);

      const serverBaseTotal = serverSubtotal - validatedDiscount + orderShippingCost;
      let serverTotal: number;
      const isPixMethod = payment_method === "pix";

      if (isPixMethod) {
        const pixDiscountPct = Number(pricingConfig?.pix_discount || 0) / 100;
        const applyPixToSale = pricingConfig?.pix_discount_applies_to_sale_products !== false;
        if (!applyPixToSale && serverSubtotal > 0) {
          const afterCoupon = serverSubtotal - validatedDiscount;
          const ratioFull = serverSubtotalFull / serverSubtotal;
          const ratioSale = serverSubtotalSale / serverSubtotal;
          serverTotal = afterCoupon * ratioFull * (1 - pixDiscountPct) + afterCoupon * ratioSale + orderShippingCost;
        } else {
          serverTotal = (serverSubtotal - validatedDiscount) * (1 - pixDiscountPct) + orderShippingCost;
        }
      } else {
        // Cartão: aplicar juros quando parcelas > sem juros
        const effectiveInterestFree =
          serverSubtotalSale > 0 && pricingConfig?.interest_free_installments_sale != null
            ? Number(pricingConfig.interest_free_installments_sale)
            : Number(pricingConfig?.interest_free_installments || 3);
        const n = Math.max(1, Number(installments) || 1);

        if (n > effectiveInterestFree) {
          const monthlyRatePct =
            pricingConfig?.interest_mode === "by_installment"
              ? Number((pricingConfig?.monthly_rate_by_installment || {})[String(n)] ?? pricingConfig?.monthly_rate_fixed ?? 0)
              : Number(pricingConfig?.monthly_rate_fixed || 0);
          const monthlyRate = monthlyRatePct / 100;
          const i = monthlyRate;
          const rawInstallment = (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1) * serverBaseTotal;
          const totalExact = rawInstallment * n;
          serverTotal = Math.round(totalExact * 100) / 100;
        } else {
          serverTotal = serverBaseTotal;
        }
      }

      // Tolerance check
      const tolerance = Math.max(0.10, serverTotal * 0.01);
      if (Math.abs(serverTotal - amount) > tolerance) {
        await supabase.from("error_logs").insert({
          error_type: "price_divergence",
          error_message: "Valor do pedido divergente (create_payment_intent)",
          error_context: { order_id, client_amount: amount, server_total: serverTotal },
          severity: "warning",
        });
        return jsonRes({ error: "Valor do pedido divergente. Recarregue a página." }, 400);
      }

      const authorizedAmount = serverTotal;

      // ── Stock validation ──
      const stockDecrements: { variant_id: string; quantity: number }[] = [];
      for (const product of (products || [])) {
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
          return jsonRes({ error: `Erro de estoque: ${rpcError.message}` }, 400);
        }
        const stockResult = typeof result === "string" ? JSON.parse(result) : result;
        if (!stockResult?.success) {
          for (const dec of stockDecrements) {
            await supabase.rpc("increment_stock", { p_variant_id: dec.variant_id, p_quantity: dec.quantity });
          }
          return jsonRes({ error: stockResult?.message || "Estoque insuficiente" }, 400);
        }
        stockDecrements.push({ variant_id: product.variant_id, quantity: qty });
      }

      // ── Create or find Stripe customer ──
      let stripeCustomerId: string | undefined;
      if (customer_email) {
        const customers = await stripe.customers.list({ email: customer_email, limit: 1 });
        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0].id;
        } else {
          const newCustomer = await stripe.customers.create({
            email: customer_email,
            name: customer_name || undefined,
          });
          stripeCustomerId = newCustomer.id;
        }
      }

      // ── Determine payment method types ──
      // Only use "pix" if the method was requested; card is always safe
      const paymentMethodTypes: string[] = isPixMethod ? ["pix"] : ["card"];

      // Amount in centavos (BRL)
      const amountInCents = Math.round(authorizedAmount * 100);

      // ── Create PaymentIntent ──
      const intentParams: Stripe.PaymentIntentCreateParams = {
        amount: amountInCents,
        currency: "brl",
        payment_method_types: paymentMethodTypes,
        metadata: {
          order_id,
          coupon_code: coupon_code || "",
          discount_amount: String(validatedDiscount),
          installments: String(installments),
        },
      };

      if (stripeCustomerId) {
        intentParams.customer = stripeCustomerId;
      }

      // ── Store name for statement descriptor ──
      const { data: storeSettings } = await supabase
        .from("store_settings")
        .select("store_name")
        .limit(1)
        .maybeSingle();
      const storeName = storeSettings?.store_name || "LOJA";
      const descriptor = storeName.toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, 22).trim() || "LOJA";
      intentParams.statement_descriptor = descriptor.slice(0, 22);

      let paymentIntent;
      try {
        paymentIntent = await stripe.paymentIntents.create(intentParams);
      } catch (stripeErr: any) {
        // If PIX is not enabled in the Stripe account, return a clear message
        if (isPixMethod && stripeErr.message?.includes("pix")) {
          // Rollback stock
          for (const dec of stockDecrements) {
            await supabase.rpc("increment_stock", { p_variant_id: dec.variant_id, p_quantity: dec.quantity });
          }
          return jsonRes({ error: "O método PIX não está ativado na sua conta Stripe. Use cartão de crédito ou ative o PIX no painel Stripe." }, 400);
        }
        throw stripeErr;
      }

      // ── Update order with Stripe info ──
      await supabase.from("orders").update({
        provider: "stripe",
        gateway: "stripe",
        transaction_id: paymentIntent.id,
        payment_method: isPixMethod ? "pix" : "card",
        installments: isPixMethod ? null : installments,
        total_amount: authorizedAmount,
      }).eq("id", order_id);

      const res: Record<string, unknown> = {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        amount: authorizedAmount,
      };

      // PIX: return QR and copy-paste for display on checkout (no redirect)
      if (isPixMethod) {
        let pixAction = paymentIntent.next_action?.type === "pix_display_qr_code"
          ? (paymentIntent.next_action.pix_display_qr_code as { image_url_png?: string; image_url_svg?: string; expires_at?: number; data?: string } | undefined)
          : undefined;
        if (!pixAction) {
          const retrieved = await stripe.paymentIntents.retrieve(paymentIntent.id);
          if (retrieved.next_action?.type === "pix_display_qr_code") {
            pixAction = retrieved.next_action.pix_display_qr_code as { image_url_png?: string; image_url_svg?: string; expires_at?: number; data?: string };
          }
        }
        if (pixAction) {
          res.pix_qr_url = pixAction.image_url_png ?? pixAction.image_url_svg ?? null;
          res.pix_emv = pixAction.data ?? null;
          res.pix_expires_at = pixAction.expires_at ?? null;
        }
      }

      return jsonRes(res);
    }

    // ─── Action: create_checkout_session (external Stripe Checkout) ───
    if (action === "create_checkout_session") {
      const { order_id, amount, customer_email, customer_name, products, success_url, cancel_url, order_access_token, coupon_code, discount_amount = 0 } = body;

      if (!order_id || !amount || !success_url) {
        return jsonRes({ error: "order_id, amount e success_url são obrigatórios" }, 400);
      }

      // ── Auth check ──
      const authHeader = req.headers.get("Authorization");
      const hasBearer = !!authHeader?.startsWith("Bearer ");
      if (!hasBearer) {
        if (!order_access_token) return jsonRes({ error: "Autenticação necessária" }, 401);
        const { data: orderRow } = await supabase
          .from("orders")
          .select("id")
          .eq("id", order_id)
          .eq("access_token", order_access_token)
          .maybeSingle();
        if (!orderRow) return jsonRes({ error: "Acesso negado ao pedido" }, 403);
      }

      // ── Server-side price validation ──
      const lineItems: any[] = [];
      const stockDecrements: { variant_id: string; quantity: number }[] = [];
      let serverSubtotal = 0;

      for (const product of (products || [])) {
        if (!product.variant_id) continue;
        const { data: variantData } = await supabase
          .from("product_variants")
          .select("id, price_modifier, sale_price, base_price, products!inner(id, base_price, sale_price, is_active, name)")
          .eq("id", product.variant_id)
          .single();

        if (!variantData) return jsonRes({ error: `Variante ${product.variant_id} não encontrada` }, 400);
        const productData = variantData.products as any;
        if (!productData?.is_active) return jsonRes({ error: `Produto "${productData?.name || product.name}" indisponível` }, 400);

        let realUnitPrice: number;
        if (variantData.sale_price && Number(variantData.sale_price) > 0) {
          realUnitPrice = Number(variantData.sale_price);
        } else if (variantData.base_price && Number(variantData.base_price) > 0) {
          realUnitPrice = Number(variantData.base_price);
        } else {
          realUnitPrice = Number(productData.sale_price || productData.base_price) + Number(variantData.price_modifier || 0);
        }

        serverSubtotal += realUnitPrice * (product.quantity || 1);

        // Stock validation
        const qty = product.quantity || 1;
        const { data: result, error: rpcError } = await supabase.rpc("decrement_stock", {
          p_variant_id: product.variant_id,
          p_quantity: qty,
        });
        if (rpcError) {
          for (const dec of stockDecrements) {
            await supabase.rpc("increment_stock", { p_variant_id: dec.variant_id, p_quantity: dec.quantity });
          }
          return jsonRes({ error: `Erro de estoque: ${rpcError.message}` }, 400);
        }
        const stockResult = typeof result === "string" ? JSON.parse(result) : result;
        if (!stockResult?.success) {
          for (const dec of stockDecrements) {
            await supabase.rpc("increment_stock", { p_variant_id: dec.variant_id, p_quantity: dec.quantity });
          }
          return jsonRes({ error: stockResult?.message || "Estoque insuficiente" }, 400);
        }
        stockDecrements.push({ variant_id: product.variant_id, quantity: qty });

        lineItems.push({
          price_data: {
            currency: "brl",
            product_data: { name: product.name },
            unit_amount: Math.round(realUnitPrice * 100),
          },
          quantity: qty,
        });
      }

      // ── Shipping as line item ──
      const { data: orderRow } = await supabase.from("orders").select("shipping_cost").eq("id", order_id).maybeSingle();
      const shippingCost = Number(orderRow?.shipping_cost ?? 0);
      if (shippingCost > 0) {
        lineItems.push({
          price_data: {
            currency: "brl",
            product_data: { name: "Frete" },
            unit_amount: Math.round(shippingCost * 100),
          },
          quantity: 1,
        });
      }

      // ── Coupon / discount ──
      let validatedDiscount = 0;
      if (coupon_code) {
        const { data: coupon } = await supabase
          .from("coupons")
          .select("*")
          .eq("code", coupon_code.toUpperCase())
          .eq("is_active", true)
          .maybeSingle();
        if (coupon) {
          validatedDiscount = (coupon.discount_type as string) === "percentage"
            ? (serverSubtotal * Number(coupon.discount_value)) / 100
            : Number(coupon.discount_value);
          validatedDiscount = Math.min(serverSubtotal, Math.max(0, validatedDiscount));
        }
      }

      // ── Build Stripe Checkout session ──
      const sessionParams: any = {
        mode: "payment",
        customer_email: customer_email || undefined,
        line_items: lineItems,
        success_url,
        cancel_url: cancel_url || success_url,
        metadata: { order_id, order_access_token: order_access_token || "" },
        payment_intent_data: {
          metadata: { order_id, order_access_token: order_access_token || "" },
        },
        payment_method_types: ["card", "boleto"],
        locale: "pt-BR",
        shipping_address_collection: {
          allowed_countries: ["BR"],
        },
        phone_number_collection: {
          enabled: true,
        },
      };

      // Apply discount as Stripe coupon
      if (validatedDiscount > 0) {
        const stripeCoupon = await stripe.coupons.create({
          amount_off: Math.round(validatedDiscount * 100),
          currency: "brl",
          duration: "once",
          name: coupon_code || "Desconto",
        });
        sessionParams.discounts = [{ coupon: stripeCoupon.id }];
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      await supabase.from("orders").update({
        provider: "stripe",
        gateway: "stripe",
        transaction_id: session.payment_intent as string,
        external_reference: session.id,
        payment_method: "card",
        total_amount: (serverSubtotal - validatedDiscount + shippingCost),
      }).eq("id", order_id);

      return jsonRes({ checkout_url: session.url, session_id: session.id });
    }

    return jsonRes({ error: "Ação inválida" }, 400);
  } catch (error: any) {
    console.error("Stripe error:", error.message);
    return jsonRes({ error: error.message || "Erro ao processar pagamento Stripe" }, 500);
  }
});
