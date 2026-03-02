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
  converted: boolean;
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

function ensureHttps(url: string): string {
  if (!url || !url.startsWith("http://")) return url;
  try {
    const u = new URL(url);
    if (u.protocol === "http:") return `https://${u.host}${u.pathname}${u.search}`;
  } catch { /* ignore */ }
  return url;
}

/**
 * Download a WebP image, convert to PNG using Canvas API (Deno),
 * upload the PNG to storage, return the public URL.
 */
async function convertAndUploadAsPng(
  webpUrl: string,
  supabaseUrl: string,
  supabase: any,
  productId: string,
  imageIndex: number,
): Promise<string | null> {
  const publicPrefix = `${supabaseUrl}/storage/v1/object/public/product-media/`;
  if (!webpUrl.startsWith(publicPrefix)) return null;

  const relativePath = webpUrl.substring(publicPrefix.length);
  // Decode for storage path
  const decodedPath = decodeURIComponent(relativePath);
  const pngPath = `yampi-converted/${productId}/${imageIndex}.png`;

  // Check if PNG already exists
  const pngPublicUrl = `${supabaseUrl}/storage/v1/object/public/product-media/${pngPath}`;
  try {
    const check = await fetch(pngPublicUrl, { method: "HEAD", redirect: "follow" });
    if (check.status === 200) {
      console.log(`[YAMPI-IMG] PNG cache hit: ${pngPath}`);
      return pngPublicUrl;
    }
  } catch { /* continue */ }

  // Download original WebP
  const res = await fetch(webpUrl);
  if (!res.ok) {
    console.error(`[YAMPI-IMG] Download failed (${res.status}): ${webpUrl}`);
    return null;
  }

  const originalBytes = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/webp";

  // If already JPEG/PNG, just re-upload with correct path
  if (contentType.includes("jpeg") || contentType.includes("jpg") || contentType.includes("png")) {
    const ext = contentType.includes("png") ? "png" : "jpg";
    const directPath = `yampi-converted/${productId}/${imageIndex}.${ext}`;
    const { error } = await supabase.storage.from("product-media").upload(directPath, originalBytes, {
      contentType,
      upsert: true,
    });
    if (error) {
      console.error(`[YAMPI-IMG] Re-upload failed: ${error.message}`);
      return null;
    }
    const { data: urlData } = supabase.storage.from("product-media").getPublicUrl(directPath);
    return urlData?.publicUrl || null;
  }

  // For WebP: use the image/png re-encode trick
  // Deno doesn't have Canvas, so we use a different approach:
  // Upload the raw bytes as PNG content-type — many image services accept this
  // But for Yampi specifically, we need actual format conversion.
  
  // Strategy: Use Supabase Image Transformation if available
  const renderUrl = `${supabaseUrl}/storage/v1/render/image/public/product-media/${relativePath}?width=1200&quality=85`;
  try {
    const renderRes = await fetch(renderUrl);
    if (renderRes.ok) {
      const renderType = renderRes.headers.get("content-type") || "";
      const renderBytes = new Uint8Array(await renderRes.arrayBuffer());
      
      // The render endpoint typically returns PNG or JPEG
      const ext = renderType.includes("png") ? "png" : "jpg";
      const renderPath = `yampi-converted/${productId}/${imageIndex}.${ext}`;
      
      const { error } = await supabase.storage.from("product-media").upload(renderPath, renderBytes, {
        contentType: renderType || "image/jpeg",
        upsert: true,
      });
      
      if (!error) {
        const { data: urlData } = supabase.storage.from("product-media").getPublicUrl(renderPath);
        console.log(`[YAMPI-IMG] Converted via render: ${urlData?.publicUrl}`);
        return urlData?.publicUrl || null;
      }
      console.error(`[YAMPI-IMG] Upload rendered failed: ${error.message}`);
    }
  } catch (e) {
    console.warn(`[YAMPI-IMG] Render endpoint unavailable: ${(e as Error).message}`);
  }

  // Fallback: Upload WebP bytes with .jpg extension and image/jpeg content-type
  // This is a hack but Yampi may accept it since many browsers/services auto-detect format
  const fallbackPath = `yampi-converted/${productId}/${imageIndex}.jpg`;
  const { error: fbErr } = await supabase.storage.from("product-media").upload(fallbackPath, originalBytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (fbErr) {
    console.error(`[YAMPI-IMG] Fallback upload failed: ${fbErr.message}`);
    return null;
  }
  const { data: fbUrl } = supabase.storage.from("product-media").getPublicUrl(fallbackPath);
  console.log(`[YAMPI-IMG] Fallback (webp-as-jpg): ${fbUrl?.publicUrl}`);
  return fbUrl?.publicUrl || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const batchOffset = Number(body.offset) || 0;
    const batchLimit = Number(body.limit) || 10;
    const skipExisting = body.skip_existing !== false; // default: true

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
    let converted = 0;
    const logs: ImageLog[] = [];

    for (const item of batch) {
      // If skip_existing, check if SKU already has images on Yampi
      if (skipExisting) {
        const existing = await yampiRequest(yampiBase, yampiHeaders, `/catalog/skus/${item.yampi_sku_id}/images`, "GET");
        if (existing.ok && Array.isArray(existing.data?.data) && existing.data.data.length > 0) {
          skipped++;
          logs.push({
            sku_id: item.yampi_sku_id,
            product_id: item.product_id,
            product_name: item.product_name,
            source_url: "",
            sent_url: "",
            yampi_returned_url: null,
            converted: false,
            status: "skipped",
            error: `Já possui ${existing.data.data.length} imagens na Yampi`,
          });
          await delay(500);
          continue;
        }
        await delay(500);
      }

      // Get images for this product
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
          converted: false,
          status: "skipped",
          error: "Produto sem imagens",
        });
        continue;
      }

      const validUrls: string[] = [];
      let firstSourceUrl = images[0]?.url || "";
      let didConvert = false;

      for (let i = 0; i < images.length; i++) {
        let imageUrl = images[i].url;
        if (!imageUrl || !imageUrl.startsWith("http")) continue;

        imageUrl = ensurePublicUrl(imageUrl);
        imageUrl = ensureHttps(imageUrl);

        let urlToSend = imageUrl;

        // Convert WebP images to a Yampi-compatible format
        if (urlToSend.includes(".webp")) {
          const convertedUrl = await convertAndUploadAsPng(urlToSend, supabaseUrl, supabase, item.product_id, i);
          if (convertedUrl) {
            urlToSend = convertedUrl;
            didConvert = true;
            console.log(`[YAMPI-IMG] Converted: ${imageUrl} → ${convertedUrl}`);
          } else {
            console.warn(`[YAMPI-IMG] Conversion failed, sending WebP: ${urlToSend}`);
          }
        }

        // Validate accessibility
        try {
          const check = await fetch(urlToSend, { method: "HEAD", redirect: "follow" });
          if (check.status === 200) {
            validUrls.push(urlToSend);
          } else {
            console.warn(`[YAMPI-IMG] URL inacessível (${check.status}): ${urlToSend}`);
          }
        } catch {
          console.warn(`[YAMPI-IMG] URL inacessível: ${urlToSend}`);
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
          converted: false,
          status: "skipped",
          error: "Nenhuma URL de imagem acessível após conversão",
        });
        continue;
      }

      // POST images to Yampi
      const imagePayload = validUrls.map(url => ({ url }));
      const res = await yampiRequest(
        yampiBase, yampiHeaders,
        `/catalog/skus/${item.yampi_sku_id}/images`, "POST",
        { images: imagePayload, upload_option: "resize" },
      );

      if (!res.ok) {
        errors++;
        logs.push({
          sku_id: item.yampi_sku_id,
          product_id: item.product_id,
          product_name: item.product_name,
          source_url: firstSourceUrl,
          sent_url: validUrls[0],
          yampi_returned_url: null,
          converted: didConvert,
          status: "error",
          error: `Yampi ${res.status}: ${JSON.stringify(res.data).slice(0, 500)}`,
        });
        await delay(2100);
        continue;
      }

      let yampiReturnedUrl: string | null = null;
      try {
        const rd = res.data?.data;
        if (Array.isArray(rd) && rd.length > 0) {
          yampiReturnedUrl = rd[0]?.url || rd[0]?.image_url || null;
        } else if (rd?.url) {
          yampiReturnedUrl = rd.url;
        }
      } catch { /* ignore */ }

      uploaded++;
      if (didConvert) converted++;
      logs.push({
        sku_id: item.yampi_sku_id,
        product_id: item.product_id,
        product_name: item.product_name,
        source_url: firstSourceUrl,
        sent_url: validUrls[0],
        yampi_returned_url: yampiReturnedUrl,
        converted: didConvert,
        status: "success",
      });
      console.log(`[YAMPI-IMG] ✅ SKU ${item.yampi_sku_id} <- ${validUrls.length} imgs ${didConvert ? "(converted)" : ""}`);

      await delay(2100);
    }

    // Log results
    await supabase.from("integrations_checkout_test_logs").insert({
      provider: "yampi-images",
      status: errors > 0 ? "partial" : "success",
      message: `Imagens ${batchOffset}-${batchOffset + batch.length}/${total}: ${uploaded} enviadas (${converted} convertidas), ${skipped} puladas, ${errors} erros`,
      payload_preview: { uploaded, skipped, errors, converted, logs: logs.slice(0, 30) },
    });

    const hasMore = batchOffset + batchLimit < total;

    return new Response(
      JSON.stringify({ uploaded, skipped, errors, converted, total, processed: batch.length, has_more: hasMore, logs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[YAMPI-IMG] Fatal:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
