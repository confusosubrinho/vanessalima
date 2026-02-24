import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { items, customer, attribution } = body as {
      items: { variant_id: string; quantity: number }[];
      customer?: { name?: string; email?: string; phone?: string; cpf?: string };
      attribution?: { utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_term?: string; utm_content?: string; referrer?: string; landing_page?: string };
    };

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "Nenhum item no carrinho" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1. Read checkout config
    const { data: checkoutConfig } = await supabase.from("integrations_checkout").select("*").limit(1).single();
    if (!checkoutConfig?.enabled) {
      return new Response(JSON.stringify({ redirect_url: "/checkout", fallback: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const provider = checkoutConfig.provider;

    // 2. Get provider config
    const { data: providerConfig } = await supabase
      .from("integrations_checkout_providers")
      .select("*")
      .eq("provider", provider)
      .eq("is_active", true)
      .single();

    if (!providerConfig) {
      if (checkoutConfig.fallback_to_native) {
        return new Response(JSON.stringify({ redirect_url: "/checkout", fallback: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Provider não configurado" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const config = providerConfig.config as Record<string, unknown>;
    const stockMode = (config.stock_mode as string) || "reserve";

    // 3. Fetch variant + product data
    const variantIds = items.map((i) => i.variant_id);
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, product_id, size, color, stock_quantity, base_price, sale_price, price_modifier, sku, yampi_sku_id")
      .in("id", variantIds);

    if (!variants?.length) {
      return new Response(JSON.stringify({ error: "Variantes não encontradas" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const productIds = [...new Set(variants.map((v) => v.product_id))];
    const { data: products } = await supabase
      .from("products")
      .select("id, name, slug, base_price, sale_price, yampi_product_id")
      .in("id", productIds);

    const productMap = new Map((products || []).map((p) => [p.id, p]));

    // 4. Validate stock
    for (const item of items) {
      const variant = variants.find((v) => v.id === item.variant_id);
      if (!variant || variant.stock_quantity < item.quantity) {
        return new Response(JSON.stringify({ error: `Estoque insuficiente para variante ${item.variant_id}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // 5. Get auth user if present
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = user?.id || null;
    }

    // 6. Calculate totals
    let subtotal = 0;
    const orderItems: Array<{
      product_id: string;
      product_variant_id: string;
      product_name: string;
      variant_info: string;
      quantity: number;
      unit_price: number;
      total_price: number;
      title_snapshot: string;
      image_snapshot: string | null;
    }> = [];

    for (const item of items) {
      const variant = variants.find((v) => v.id === item.variant_id)!;
      const product = productMap.get(variant.product_id);
      if (!product) continue;

      const unitPrice = variant.sale_price ?? variant.base_price ?? product.sale_price ?? product.base_price;
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      // Get primary image
      const { data: imgData } = await supabase
        .from("product_images")
        .select("url")
        .eq("product_id", product.id)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();

      orderItems.push({
        product_id: product.id,
        product_variant_id: variant.id,
        product_name: product.name,
        variant_info: [variant.size, variant.color].filter(Boolean).join(" / "),
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        title_snapshot: product.name,
        image_snapshot: imgData?.url || null,
      });
    }

    // 7. Create local order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: "TEMP",
        subtotal,
        total_amount: subtotal,
        shipping_cost: 0,
        shipping_name: customer?.name || "Checkout Transparente",
        shipping_address: "",
        shipping_city: "",
        shipping_state: "",
        shipping_zip: "",
        shipping_phone: customer?.phone || null,
        customer_email: customer?.email || null,
        customer_cpf: customer?.cpf || null,
        user_id: userId,
        provider,
        status: "pending",
        utm_source: attribution?.utm_source || null,
        utm_medium: attribution?.utm_medium || null,
        utm_campaign: attribution?.utm_campaign || null,
        utm_term: attribution?.utm_term || null,
        utm_content: attribution?.utm_content || null,
        referrer: attribution?.referrer || null,
        landing_page: attribution?.landing_page || null,
      } as Record<string, unknown>)
      .select("id, order_number")
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Erro ao criar pedido", details: orderError?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 8. Insert order items
    await supabase.from("order_items").insert(
      orderItems.map((oi) => ({ ...oi, order_id: order.id }))
    );

    // 9. Apply stock rule
    for (const item of items) {
      const movementType = stockMode === "reserve" ? "reserve" : "debit";
      await supabase.from("inventory_movements").insert({
        variant_id: item.variant_id,
        order_id: order.id,
        type: movementType,
        quantity: item.quantity,
      });

      if (stockMode === "debit_immediate") {
        await supabase.rpc("decrement_stock", { p_variant_id: item.variant_id, p_quantity: item.quantity });
      }
    }

    // 10. Provider-specific: Yampi
    if (provider === "yampi") {
      try {
        const alias = config.alias as string;
        const userToken = config.user_token as string;
        const userSecretKey = config.user_secret_key as string;
        const successUrl = (config.success_url as string) || `/pedido-confirmado/${order.id}`;
        const cancelUrl = (config.cancel_url as string) || "/carrinho";

        if (!alias || !userToken || !userSecretKey) {
          throw new Error("Credenciais Yampi não configuradas");
        }

        const yampiBase = `https://api.dooki.com.br/v2/${alias}`;
        const yampiHeaders = {
          "User-Token": userToken,
          "User-Secret-Key": userSecretKey,
          "Content-Type": "application/json",
        };

        // Sync SKUs if enabled
        if (config.sync_enabled) {
          for (const item of items) {
            const variant = variants.find((v) => v.id === item.variant_id)!;
            const product = productMap.get(variant.product_id)!;

            if (variant.yampi_sku_id) {
              const unitPrice = variant.sale_price ?? variant.base_price ?? product.sale_price ?? product.base_price;
              await fetch(`${yampiBase}/catalog/skus/${variant.yampi_sku_id}`, {
                method: "PUT",
                headers: yampiHeaders,
                body: JSON.stringify({
                  price_cost: unitPrice,
                  price_sale: unitPrice,
                  quantity: variant.stock_quantity,
                }),
              });
            }
          }
        }

        // Create payment link
        const linkSkus = items.map((item) => {
          const variant = variants.find((v) => v.id === item.variant_id)!;
          return { id: variant.yampi_sku_id, quantity: item.quantity };
        });

        const linkRes = await fetch(`${yampiBase}/checkout/payment-link`, {
          method: "POST",
          headers: yampiHeaders,
          body: JSON.stringify({
            name: (config.checkout_name_template as string || "Pedido #{order_number}").replace("{order_number}", order.order_number),
            active: true,
            skus: linkSkus,
          }),
        });

        const linkData = await linkRes.json();

        if (!linkRes.ok) {
          throw new Error(linkData?.message || "Erro ao criar link Yampi");
        }

        const externalRef = linkData?.data?.id?.toString() || linkData?.id?.toString() || "";
        const redirectUrl = linkData?.data?.link_url || linkData?.link_url || linkData?.data?.url || "";

        await supabase
          .from("orders")
          .update({ external_reference: externalRef } as Record<string, unknown>)
          .eq("id", order.id);

        return new Response(JSON.stringify({ order_id: order.id, redirect_url: redirectUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (yampiErr: unknown) {
        const msg = yampiErr instanceof Error ? yampiErr.message : "Erro Yampi";
        
        // Log error
        await supabase.from("integrations_checkout_test_logs").insert({
          provider: "yampi",
          status: "error",
          message: msg,
          payload_preview: { order_id: order.id },
        });

        // Fallback
        if (checkoutConfig.fallback_to_native) {
          return new Response(JSON.stringify({ order_id: order.id, redirect_url: "/checkout", fallback: true, error: msg }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Default: native
    return new Response(JSON.stringify({ order_id: order.id, redirect_url: "/checkout" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
