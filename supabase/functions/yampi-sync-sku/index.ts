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

    const { product_id, variant_id } = await req.json();

    const { data: providerConfig } = await supabase
      .from("integrations_checkout_providers")
      .select("config")
      .eq("provider", "yampi")
      .single();

    if (!providerConfig?.config) {
      return new Response(JSON.stringify({ error: "Provider Yampi não configurado" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const config = providerConfig.config as Record<string, unknown>;
    const alias = config.alias as string;
    const userToken = config.user_token as string;
    const userSecretKey = config.user_secret_key as string;
    const yampiBase = `https://api.dooki.com.br/v2/${alias}`;
    const yampiHeaders = {
      "User-Token": userToken,
      "User-Secret-Key": userSecretKey,
      "Content-Type": "application/json",
    };

    const results: Array<{ variant_id: string; status: string; message: string }> = [];

    // If specific variant
    if (variant_id) {
      const { data: variant } = await supabase
        .from("product_variants")
        .select("*, products(name, base_price, sale_price, yampi_product_id)")
        .eq("id", variant_id)
        .single();

      if (!variant?.yampi_sku_id) {
        return new Response(JSON.stringify({ error: "Variante sem yampi_sku_id mapeado" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const product = (variant as any).products;
      const unitPrice = variant.sale_price ?? variant.base_price ?? product?.sale_price ?? product?.base_price;

      const res = await fetch(`${yampiBase}/catalog/skus/${variant.yampi_sku_id}`, {
        method: "PUT",
        headers: yampiHeaders,
        body: JSON.stringify({
          price_cost: unitPrice,
          price_sale: unitPrice,
          quantity: variant.stock_quantity,
        }),
      });

      const data = await res.json();
      results.push({
        variant_id: variant.id,
        status: res.ok ? "success" : "error",
        message: res.ok ? "Sincronizado" : (data?.message || "Erro"),
      });
    }

    // If product_id, sync all variants
    if (product_id && !variant_id) {
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, yampi_sku_id, stock_quantity, base_price, sale_price")
        .eq("product_id", product_id)
        .not("yampi_sku_id", "is", null);

      const { data: product } = await supabase
        .from("products")
        .select("base_price, sale_price")
        .eq("id", product_id)
        .single();

      for (const variant of variants || []) {
        const unitPrice = variant.sale_price ?? variant.base_price ?? product?.sale_price ?? product?.base_price;
        const res = await fetch(`${yampiBase}/catalog/skus/${variant.yampi_sku_id}`, {
          method: "PUT",
          headers: yampiHeaders,
          body: JSON.stringify({
            price_cost: unitPrice,
            price_sale: unitPrice,
            quantity: variant.stock_quantity,
          }),
        });

        const data = await res.json();
        results.push({
          variant_id: variant.id,
          status: res.ok ? "success" : "error",
          message: res.ok ? "Sincronizado" : (data?.message || "Erro"),
        });
      }
    }

    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
