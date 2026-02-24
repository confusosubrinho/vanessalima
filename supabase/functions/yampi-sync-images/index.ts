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
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok)
    console.error(`[YAMPI-IMG] ${res.status} ${path}:`, JSON.stringify(data));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Ensure image URL is a stable public URL (not a signed/expiring URL).
 * If it's a Supabase Storage signed URL, convert to the public URL.
 */
function ensurePublicUrl(url: string, supabaseUrl: string): string {
  if (!url || !url.startsWith("http")) return url;

  // Strip AWS signature params from any URL
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
      // Convert /storage/v1/object/sign/ to /storage/v1/object/public/
      let cleaned = u.toString();
      cleaned = cleaned.replace(
        "/storage/v1/object/sign/",
        "/storage/v1/object/public/",
      );
      return cleaned;
    } catch {
      return url.split("?")[0];
    }
  }

  return url;
}

/**
 * HEAD check with up to 2 retries. Returns HTTP status.
 */
async function headCheck(
  url: string,
  retries = 2,
): Promise<number> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow" });
      if (res.status === 200) return 200;
      if (i < retries) await delay(1500);
      else return res.status;
    } catch {
      if (i >= retries) return 0;
      await delay(1500);
    }
  }
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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
      return new Response(
        JSON.stringify({ error: "Provider Yampi não configurado" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const config = providerConfig.config as Record<string, unknown>;
    const alias = config.alias as string;
    const userToken = config.user_token as string;
    const userSecretKey = config.user_secret_key as string;

    if (!alias || !userToken || !userSecretKey) {
      return new Response(
        JSON.stringify({ error: "Credenciais Yampi incompletas" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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
      .select("id, yampi_sku_id, product_id, products(name)")
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
    const logs: ImageLog[] = [];
    const processedProductIds = new Set<string>();

    for (const variant of variants || []) {
      const productName = (variant as any).products?.name || "";

      // Only upload 1 image per product (first SKU encountered)
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

      let imageUrl = images?.[0]?.url;
      if (!imageUrl || !imageUrl.startsWith("http")) {
        skipped++;
        logs.push({
          sku_id: variant.yampi_sku_id,
          product_id: variant.product_id,
          product_name: productName,
          source_url: imageUrl || "(sem url)",
          yampi_returned_url: null,
          head_status: null,
          status: "skipped",
          error: "URL inválida ou ausente",
        });
        continue;
      }

      // 1. Ensure public stable URL (not signed/expiring)
      imageUrl = ensurePublicUrl(imageUrl, supabaseUrl);

      // 2. HEAD-check the source to make sure it's accessible
      const sourceHead = await headCheck(imageUrl, 1);
      if (sourceHead !== 200) {
        errors++;
        logs.push({
          sku_id: variant.yampi_sku_id,
          product_id: variant.product_id,
          product_name: productName,
          source_url: imageUrl,
          yampi_returned_url: null,
          head_status: sourceHead,
          status: "error",
          error: `Imagem de origem inacessível (HEAD ${sourceHead})`,
        });
        continue;
      }

      // 3. If WebP, try to use a JPG fallback (some CDNs serve both)
      let urlToSend = imageUrl;
      if (urlToSend.match(/\.webp(\?|$)/i)) {
        // Try .jpg version
        const jpgUrl = urlToSend.replace(/\.webp/i, ".jpg");
        const jpgHead = await headCheck(jpgUrl, 0);
        if (jpgHead === 200) {
          urlToSend = jpgUrl;
          console.log(`[YAMPI-IMG] WebP→JPG fallback: ${jpgUrl}`);
        }
        // If no jpg available, send webp anyway — Yampi may still accept it
      }

      // 4. POST image to Yampi SKU images endpoint
      const res = await yampiRequest(
        yampiBase,
        yampiHeaders,
        `/catalog/skus/${variant.yampi_sku_id}/images`,
        "POST",
        { images: [{ url: urlToSend }], upload_option: "resize" },
      );

      if (!res.ok) {
        errors++;
        const detail = JSON.stringify(res.data).slice(0, 500);
        logs.push({
          sku_id: variant.yampi_sku_id,
          product_id: variant.product_id,
          product_name: productName,
          source_url: urlToSend,
          yampi_returned_url: null,
          head_status: sourceHead,
          status: "error",
          error: `Yampi ${res.status}: ${detail}`,
        });
        await delay(2100);
        continue;
      }

      // 5. Read the returned image URL from Yampi response — never build manually
      let yampiReturnedUrl: string | null = null;
      try {
        // Yampi response: { data: [{ id, url, ... }] } or { data: { images: [...] } }
        const responseData = res.data?.data;
        if (Array.isArray(responseData) && responseData.length > 0) {
          yampiReturnedUrl = responseData[0]?.url || responseData[0]?.image_url || null;
        } else if (responseData?.images && Array.isArray(responseData.images)) {
          yampiReturnedUrl = responseData.images[0]?.url || null;
        } else if (responseData?.url) {
          yampiReturnedUrl = responseData.url;
        }
      } catch {
        // Could not parse returned URL
      }

      // 6. HEAD-validate the returned Yampi URL (with retries)
      let returnedHeadStatus: number | null = null;
      if (yampiReturnedUrl) {
        // Wait a moment for Yampi to process the image
        await delay(3000);
        returnedHeadStatus = await headCheck(yampiReturnedUrl, 2);
        if (returnedHeadStatus !== 200) {
          console.warn(
            `[YAMPI-IMG] ⚠️ Yampi returned URL not yet accessible (HEAD ${returnedHeadStatus}): ${yampiReturnedUrl}`,
          );
        }
      }

      uploaded++;
      logs.push({
        sku_id: variant.yampi_sku_id,
        product_id: variant.product_id,
        product_name: productName,
        source_url: urlToSend,
        yampi_returned_url: yampiReturnedUrl,
        head_status: returnedHeadStatus,
        status: "success",
      });
      console.log(
        `[YAMPI-IMG] ✅ SKU ${variant.yampi_sku_id} <- ${urlToSend} -> ${yampiReturnedUrl || "(no url returned)"}`,
      );

      // Rate limit: ~2s between requests
      await delay(2100);
    }

    // Log results to integrations_checkout_test_logs
    await supabase.from("integrations_checkout_test_logs").insert({
      provider: "yampi-images",
      status: errors > 0 ? "partial" : "success",
      message: `Imagens batch ${batchOffset}: ${uploaded} enviadas, ${skipped} ignoradas, ${errors} erros`,
      payload_preview: { uploaded, skipped, errors, logs: logs.slice(0, 30) },
    });

    const hasMore = batchOffset + batchLimit < total;

    return new Response(
      JSON.stringify({
        uploaded,
        skipped,
        errors,
        total,
        processed: (variants || []).length,
        has_more: hasMore,
        logs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[YAMPI-IMG] Fatal:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
