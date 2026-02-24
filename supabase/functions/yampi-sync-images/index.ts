import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ImageLog {
  sku_id: number;
  product_id: string;
  product_name?: string;
  source_url: string;
  yampi_returned_url: string | null;
  head_status: number | null;
  status: "success" | "error" | "skipped";
  error?: string;
}

async function yampiRequest(
  yampiBase: string,
  headers: Record<string, string>,
  path: string,
  method: string,
  body?: unknown,
) {
  const url = `${yampiBase}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data: any;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) console.error(`[YAMPI-IMG] ${res.status} ${path}:`, JSON.stringify(data));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Ensure image URL is a stable public URL (not a signed/expiring URL).
 */
function ensurePublicUrl(url: string): string {
  if (!url || !url.startsWith("http")) return url;
  if (/[?&](X-Amz-|token=|Expires=|Signature=)/i.test(url)) {
    try {
      const u = new URL(url);
      const keysToRemove: string[] = [];
      u.searchParams.forEach((_, key) => {
        if (/^(X-Amz-|token|Expires|Signature|AWSAccessKeyId)/i.test(key)) {
          keysToRemove.push(key);
        }
      });
      keysToRemove.forEach((k) => u.searchParams.delete(k));
      let cleaned = u.toString();
      cleaned = cleaned.replace("/storage/v1/object/sign/", "/storage/v1/object/public/");
      return cleaned;
    } catch {
      return url.split("?")[0];
    }
  }
  return url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const batchOffset = Number(body.offset) || 0;
    const batchLimit = Number(body.limit) || 10;

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

    // ---- KEY OPTIMIZATION: Query DISTINCT products that have synced SKUs ----
    // Instead of iterating all 657 variants and skipping most,
    // we get unique product_ids that have yampi_sku_id set
    const { data: distinctProducts, error: dpErr } = await supabase
      .rpc("get_distinct_synced_products", {}) as any;

    // Fallback: if RPC doesn't exist, use raw query approach via variants
    let productList: Array<{ product_id: string; yampi_sku_id: number; product_name: string }>;

    if (dpErr || !distinctProducts) {
      // Fallback: get all variants and deduplicate in JS
      const { data: allVariants } = await supabase
        .from("product_variants")
        .select("product_id, yampi_sku_id, products(name)")
        .not("yampi_sku_id", "is", null)
        .eq("is_active", true)
        .order("product_id");

      const seen = new Map<string, { product_id: string; yampi_sku_id: number; product_name: string }>();
      for (const v of allVariants || []) {
        if (!seen.has(v.product_id)) {
          seen.set(v.product_id, {
            product_id: v.product_id,
            yampi_sku_id: v.yampi_sku_id,
            product_name: (v as any).products?.name || "",
          });
        }
      }
      productList = Array.from(seen.values());
    } else {
      productList = distinctProducts;
    }

    const total = productList.length;
    const batch = productList.slice(batchOffset, batchOffset + batchLimit);

    let uploaded = 0;
    let skipped = 0;
    let errors = 0;
    const logs: ImageLog[] = [];

    for (const item of batch) {
      // Get first image for this product
      const { data: images } = await supabase
        .from("product_images")
        .select("url")
        .eq("product_id", item.product_id)
        .order("display_order", { ascending: true })
        .limit(1);

      let imageUrl = images?.[0]?.url;
      if (!imageUrl || !imageUrl.startsWith("http")) {
        skipped++;
        logs.push({
          sku_id: item.yampi_sku_id,
          product_id: item.product_id,
          product_name: item.product_name,
          source_url: imageUrl || "(sem url)",
          yampi_returned_url: null,
          head_status: null,
          status: "skipped",
          error: "URL inválida ou ausente",
        });
        continue;
      }

      // Ensure public stable URL
      imageUrl = ensurePublicUrl(imageUrl);

      // If WebP, try JPG fallback
      let urlToSend = imageUrl;
      if (urlToSend.match(/\.webp(\?|$)/i)) {
        const jpgUrl = urlToSend.replace(/\.webp/i, ".jpg");
        try {
          const jpgRes = await fetch(jpgUrl, { method: "HEAD", redirect: "follow" });
          if (jpgRes.status === 200) {
            urlToSend = jpgUrl;
            console.log(`[YAMPI-IMG] WebP→JPG fallback: ${jpgUrl}`);
          }
        } catch { /* keep webp */ }
      }

      // POST image to Yampi
      const res = await yampiRequest(
        yampiBase, yampiHeaders,
        `/catalog/skus/${item.yampi_sku_id}/images`, "POST",
        { images: [{ url: urlToSend }], upload_option: "resize" },
      );

      if (!res.ok) {
        errors++;
        const detail = JSON.stringify(res.data).slice(0, 500);
        logs.push({
          sku_id: item.yampi_sku_id,
          product_id: item.product_id,
          product_name: item.product_name,
          source_url: urlToSend,
          yampi_returned_url: null,
          head_status: null,
          status: "error",
          error: `Yampi ${res.status}: ${detail}`,
        });
        await delay(2100);
        continue;
      }

      // Read returned URL from Yampi response
      let yampiReturnedUrl: string | null = null;
      try {
        const rd = res.data?.data;
        if (Array.isArray(rd) && rd.length > 0) {
          yampiReturnedUrl = rd[0]?.url || rd[0]?.image_url || null;
        } else if (rd?.images && Array.isArray(rd.images)) {
          yampiReturnedUrl = rd.images[0]?.url || null;
        } else if (rd?.url) {
          yampiReturnedUrl = rd.url;
        }
      } catch { /* ignore */ }

      uploaded++;
      logs.push({
        sku_id: item.yampi_sku_id,
        product_id: item.product_id,
        product_name: item.product_name,
        source_url: urlToSend,
        yampi_returned_url: yampiReturnedUrl,
        head_status: null,
        status: "success",
      });
      console.log(`[YAMPI-IMG] ✅ SKU ${item.yampi_sku_id} <- ${urlToSend} -> ${yampiReturnedUrl || "(no url returned)"}`);

      // Rate limit: ~2s between requests
      await delay(2100);
    }

    // Log results
    await supabase.from("integrations_checkout_test_logs").insert({
      provider: "yampi-images",
      status: errors > 0 ? "partial" : "success",
      message: `Imagens ${batchOffset}-${batchOffset + batch.length}/${total}: ${uploaded} enviadas, ${skipped} sem imagem, ${errors} erros`,
      payload_preview: { uploaded, skipped, errors, logs: logs.slice(0, 30) },
    });

    const hasMore = batchOffset + batchLimit < total;

    return new Response(
      JSON.stringify({ uploaded, skipped, errors, total, processed: batch.length, has_more: hasMore, logs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[YAMPI-IMG] Fatal:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
