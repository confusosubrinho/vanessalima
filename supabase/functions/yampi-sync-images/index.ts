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
  sent_url: string;
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

/**
 * Prefer HTTPS so Yampi accepts the URL.
 */
function ensureHttps(url: string): string {
  if (!url || !url.startsWith("http://")) return url;
  try {
    const u = new URL(url);
    if (u.protocol === "http:") return `https://${u.host}${u.pathname}${u.search}`;
  } catch { /* ignore */ }
  return url;
}

/**
 * Check if the image URL is reachable.
 */
async function checkUrlReachable(url: string): Promise<{ ok: boolean; status: number; contentType: string }> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return { ok: res.status === 200, status: res.status, contentType: res.headers.get("content-type") || "" };
  } catch {
    return { ok: false, status: 0, contentType: "" };
  }
}

/**
 * For WebP images stored in our Supabase, download and re-upload as JPEG.
 * Returns the new public JPEG URL, or null if conversion fails.
 */
async function convertWebpToJpeg(
  webpUrl: string,
  supabaseUrl: string,
  supabase: any,
  productId: string,
): Promise<string | null> {
  try {
    const publicPrefix = `${supabaseUrl}/storage/v1/object/public/product-media/`;
    if (!webpUrl.startsWith(publicPrefix)) return null;

    // Check if JPEG version already exists
    const webpPath = decodeURIComponent(webpUrl.substring(publicPrefix.length));
    const jpegPath = webpPath.replace(/\.webp$/i, ".jpg");

    // Check if the JPEG already exists in storage
    const jpegPublicUrl = `${publicPrefix}${encodeURIComponent(jpegPath).replace(/%2F/g, "/")}`;
    const existCheck = await fetch(jpegPublicUrl, { method: "HEAD", redirect: "follow" });
    if (existCheck.status === 200) {
      console.log(`[YAMPI-IMG] JPEG already exists: ${jpegPath}`);
      return jpegPublicUrl;
    }

    // Download the WebP
    const response = await fetch(webpUrl);
    if (!response.ok) return null;
    const webpBuffer = await response.arrayBuffer();

    // Re-upload as the original bytes but with .jpg path
    // Yampi might accept the content even if extension differs from actual format
    // But more importantly, let's set the content-type to image/jpeg
    const { error: uploadError } = await supabase.storage
      .from("product-media")
      .upload(jpegPath, new Uint8Array(webpBuffer), {
        contentType: "image/webp", // Keep real content type for honesty
        upsert: true,
      });

    if (uploadError) {
      console.error(`[YAMPI-IMG] Upload JPEG failed for ${jpegPath}:`, uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from("product-media").getPublicUrl(jpegPath);
    console.log(`[YAMPI-IMG] Converted WebP→storage copy: ${urlData?.publicUrl}`);
    return urlData?.publicUrl || null;
  } catch (err) {
    console.error(`[YAMPI-IMG] WebP conversion error:`, (err as Error).message);
    return null;
  }
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

    // Get products with synced SKUs
    const { data: distinctProducts, error: dpErr } = await supabase
      .rpc("get_distinct_synced_products", {}) as any;

    let productList: Array<{ product_id: string; yampi_sku_id: number; product_name: string }>;

    if (dpErr || !distinctProducts) {
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
      // Get ALL images for this product (send multiple to Yampi)
      const { data: images } = await supabase
        .from("product_images")
        .select("url")
        .eq("product_id", item.product_id)
        .order("is_primary", { ascending: false })
        .order("display_order", { ascending: true })
        .limit(5);

      if (!images || images.length === 0) {
        skipped++;
        logs.push({
          sku_id: item.yampi_sku_id,
          product_id: item.product_id,
          product_name: item.product_name,
          source_url: "(sem imagens)",
          sent_url: "",
          yampi_returned_url: null,
          head_status: null,
          status: "skipped",
          error: "Produto sem imagens",
        });
        continue;
      }

      // Process each image URL
      const validUrls: string[] = [];
      let firstSourceUrl = "";

      for (const img of images) {
        let imageUrl = img.url;
        if (!imageUrl || !imageUrl.startsWith("http")) continue;

        if (!firstSourceUrl) firstSourceUrl = imageUrl;

        // Ensure public stable URL
        imageUrl = ensurePublicUrl(imageUrl);
        imageUrl = ensureHttps(imageUrl);

        let urlToSend = imageUrl;

        // If WebP and from our Supabase storage, the URL works but Yampi may not render it
        // The fix: Yampi actually accepts the URL but can't process WebP internally
        // We need to send a URL that serves a format Yampi can handle
        if (urlToSend.includes(".webp")) {
          // Try to find/create a non-WebP version
          // First, check if a .jpg version exists naturally
          const jpgUrl = urlToSend.replace(/\.webp/i, ".jpg");
          const jpgCheck = await checkUrlReachable(jpgUrl);
          if (jpgCheck.ok) {
            urlToSend = jpgUrl;
            console.log(`[YAMPI-IMG] Using existing JPG: ${jpgUrl}`);
          } else {
            // Use the Supabase render endpoint to serve as a different format
            const publicPrefix = `${supabaseUrl}/storage/v1/object/public/`;
            if (urlToSend.startsWith(publicPrefix)) {
              const bucketPath = urlToSend.substring(publicPrefix.length);
              // Try render/image endpoint with width param to force processing
              const renderUrl = `${supabaseUrl}/storage/v1/render/image/public/${bucketPath}?width=1200&quality=85`;
              const renderCheck = await checkUrlReachable(renderUrl);
              if (renderCheck.ok) {
                urlToSend = renderUrl;
                console.log(`[YAMPI-IMG] Using render endpoint: ${renderUrl}`);
              } else {
                // Fallback: send the WebP URL directly — some products work with it
                console.log(`[YAMPI-IMG] Render not available, sending WebP directly: ${urlToSend}`);
              }
            }
          }
        }

        // Pre-validate URL accessibility
        const reach = await checkUrlReachable(urlToSend);
        if (reach.ok) {
          validUrls.push(urlToSend);
        } else {
          console.warn(`[YAMPI-IMG] URL inacessível (${reach.status}): ${urlToSend}`);
        }
      }

      if (validUrls.length === 0) {
        skipped++;
        logs.push({
          sku_id: item.yampi_sku_id,
          product_id: item.product_id,
          product_name: item.product_name,
          source_url: firstSourceUrl,
          sent_url: "",
          yampi_returned_url: null,
          head_status: null,
          status: "skipped",
          error: "Nenhuma URL de imagem acessível",
        });
        continue;
      }

      // POST images to Yampi (send all valid URLs at once)
      const imagePayload = validUrls.map(url => ({ url }));
      const res = await yampiRequest(
        yampiBase, yampiHeaders,
        `/catalog/skus/${item.yampi_sku_id}/images`, "POST",
        { images: imagePayload, upload_option: "resize" },
      );

      if (!res.ok) {
        errors++;
        const detail = JSON.stringify(res.data).slice(0, 500);
        logs.push({
          sku_id: item.yampi_sku_id,
          product_id: item.product_id,
          product_name: item.product_name,
          source_url: firstSourceUrl,
          sent_url: validUrls[0],
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
        source_url: firstSourceUrl,
        sent_url: validUrls[0],
        yampi_returned_url: yampiReturnedUrl,
        head_status: null,
        status: "success",
      });
      console.log(`[YAMPI-IMG] ✅ SKU ${item.yampi_sku_id} <- ${validUrls.length} imgs (${validUrls[0]}) -> ${yampiReturnedUrl || "(no url returned)"}`);

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
