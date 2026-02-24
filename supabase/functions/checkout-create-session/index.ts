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
    const { items, attribution } = body as {
      items: { variant_id: string; quantity: number }[];
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

    // 6. Calculate subtotal
    let subtotal = 0;
    const cartDetails: Array<{
      variant_id: string;
      product_id: string;
      product_name: string;
      variant_info: string;
      quantity: number;
      unit_price: number;
    }> = [];

    for (const item of items) {
      const variant = variants.find((v) => v.id === item.variant_id)!;
      const product = productMap.get(variant.product_id);
      if (!product) continue;

      const unitPrice = variant.sale_price ?? variant.base_price ?? product.sale_price ?? product.base_price;
      subtotal += unitPrice * item.quantity;

      cartDetails.push({
        variant_id: variant.id,
        product_id: product.id,
        product_name: product.name,
        variant_info: [variant.size, variant.color].filter(Boolean).join(" / "),
        quantity: item.quantity,
        unit_price: unitPrice,
      });
    }

    // 7. Register abandoned cart (NO order creation)
    const sessionId = crypto.randomUUID();

    await supabase.from("abandoned_carts").insert({
      session_id: sessionId,
      user_id: userId,
      subtotal,
      cart_data: cartDetails,
      page_url: attribution?.landing_page || null,
      utm_source: attribution?.utm_source || null,
      utm_medium: attribution?.utm_medium || null,
      utm_campaign: attribution?.utm_campaign || null,
      utm_term: attribution?.utm_term || null,
      utm_content: attribution?.utm_content || null,
    });

    // 8. Provider-specific: Yampi
    if (provider === "yampi") {
      try {
        const alias = config.alias as string;
        const userToken = config.user_token as string;
        const userSecretKey = config.user_secret_key as string;

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

        // Create payment link with session_id in metadata
        const linkSkus = items.map((item) => {
          const variant = variants.find((v) => v.id === item.variant_id)!;
          return { id: variant.yampi_sku_id, quantity: item.quantity };
        });

        const checkoutName = `Checkout ${sessionId.substring(0, 8)}`;

        const attempts = [
          {
            url: `${yampiBase}/checkout/payment-link`,
            body: {
              name: checkoutName,
              active: true,
              skus: linkSkus,
              metadata: { session_id: sessionId },
            },
          },
          {
            url: `${yampiBase}/payments/links`,
            body: {
              name: checkoutName,
              items: linkSkus.map((sku) => ({ sku_id: sku.id, quantity: sku.quantity })),
              metadata: { session_id: sessionId },
            },
          },
        ];

        let linkData: Record<string, unknown> | null = null;
        let lastError = "Erro ao criar link Yampi";

        for (const attempt of attempts) {
          const linkRes = await fetch(attempt.url, {
            method: "POST",
            headers: yampiHeaders,
            body: JSON.stringify(attempt.body),
          });

          const parsed = await linkRes.json().catch(() => ({}));

          if (linkRes.ok) {
            linkData = parsed as Record<string, unknown>;
            break;
          }

          lastError = (parsed as Record<string, unknown>)?.message as string || `Erro Yampi (${linkRes.status})`;
          if (linkRes.status !== 404) break;
        }

        if (!linkData) {
          throw new Error(lastError);
        }

        const redirectUrl = (linkData?.data as Record<string, unknown> | undefined)?.link_url
          || linkData?.link_url
          || (linkData?.data as Record<string, unknown> | undefined)?.checkout_url
          || (linkData?.data as Record<string, unknown> | undefined)?.url
          || linkData?.checkout_url
          || linkData?.url
          || "";

        return new Response(JSON.stringify({ session_id: sessionId, redirect_url: redirectUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (yampiErr: unknown) {
        const msg = yampiErr instanceof Error ? yampiErr.message : "Erro Yampi";
        
        await supabase.from("integrations_checkout_test_logs").insert({
          provider: "yampi",
          status: "error",
          message: msg,
          payload_preview: { session_id: sessionId },
        });

        if (checkoutConfig.fallback_to_native) {
          return new Response(JSON.stringify({ redirect_url: "/checkout", fallback: true, error: msg }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Default: native checkout
    return new Response(JSON.stringify({ redirect_url: "/checkout" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
