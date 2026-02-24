import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function yampiRequest(
  yampiBase: string,
  yampiHeaders: Record<string, string>,
  path: string,
  method: string,
  body?: unknown
) {
  const url = `${yampiBase}${path}`;
  const opts: RequestInit = { method, headers: yampiHeaders };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) console.error(`[YAMPI-IMG] ERROR ${res.status} ${path}:`, JSON.stringify(data));
  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const batchOffset = Number(body.offset) || 0;
    const batchLimit = Number(body.limit) || 5;

    // Load Yampi config
    const { data: providerConfig } = await supabase
      .from("integrations_checkout_providers")
      .select("config")
      .eq("provider", "yampi")
      .single();

    if (!providerConfig?.config) {
      return new Response(JSON.stringify({ error: "Provider Yampi não configurado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = providerConfig.config as Record<string, unknown>;
    const alias = config.alias as string;
    const userToken = config.user_token as string;
    const userSecretKey = config.user_secret_key as string;

    if (!alias || !userToken || !userSecretKey) {
      return new Response(JSON.stringify({ error: "Credenciais Yampi incompletas" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const yampiBase = `https://api.dooki.com.br/v2/${alias}`;
    const yampiHeaders = {
      "User-Token": userToken,
      "User-Secret-Key": userSecretKey,
      "Content-Type": "application/json",
    };

    // Get variants that have yampi_sku_id (already synced)
    const { data: variants, error: vErr } = await supabase
      .from("product_variants")
      .select("id, yampi_sku_id, product_id")
      .not("yampi_sku_id", "is", null)
      .eq("is_active", true)
      .order("product_id")
      .range(batchOffset, batchOffset + batchLimit - 1);

    if (vErr) throw vErr;

    // Count total
    const { count: totalCount } = await supabase
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .not("yampi_sku_id", "is", null)
      .eq("is_active", true);

    const total = totalCount || 0;
    let uploaded = 0;
    let skipped = 0;
    let errors = 0;
    const processedProductIds = new Set<string>();

    for (const variant of (variants || [])) {
      // Only upload 1 image per product (first SKU)
      if (processedProductIds.has(variant.product_id)) {
        skipped++;
        continue;
      }
      processedProductIds.add(variant.product_id);

      // Get first image for this product
      const { data: images } = await supabase
        .from("product_images")
        .select("url")
        .eq("product_id", variant.product_id)
        .order("display_order", { ascending: true })
        .limit(1);

      const imageUrl = images?.[0]?.url;
      if (!imageUrl || !imageUrl.startsWith("http")) {
        skipped++;
        continue;
      }

      const res = await yampiRequest(yampiBase, yampiHeaders, `/catalog/skus/${variant.yampi_sku_id}/images`, "POST", {
        url: imageUrl,
        upload_option: "resize",
      });

      if (res.ok) {
        uploaded++;
        console.log(`[YAMPI-IMG] Uploaded image for SKU ${variant.yampi_sku_id} (product ${variant.product_id})`);
      } else {
        errors++;
        console.log(`[YAMPI-IMG] Failed SKU ${variant.yampi_sku_id}: ${res.status}`);
      }

      await delay(400);
    }

    const hasMore = batchOffset + batchLimit < total;

    return new Response(JSON.stringify({
      uploaded,
      skipped,
      errors,
      total,
      processed: (variants || []).length,
      has_more: hasMore,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[YAMPI-IMG] Fatal:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
