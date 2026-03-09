import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ImageLog {
  sku_id: number;
  variant_id: string;
  product_id: string;
  product_name?: string;
  source_url: string;
  sent_url: string;
  yampi_returned_url: string | null;
  converted: boolean;
  image_source: "variant" | "primary" | "product" | "none";
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
  const res = await fetchWithTimeout(url, opts);
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
 * Y32: Validate URL is accessible before sending to Yampi
 */
async function validateUrlAccessible(url: string): Promise<boolean> {
  try {
    const check = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" }, 10_000);
    return check.status === 200;
  } catch {
    return false;
  }
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
  const jpgPath = `yampi-converted/${productId}/${imageIndex}.jpg`;

  // Limpar cache antigo com extensão .jpg que pode conter bytes WebP corrompidos
  try {
    await supabase.storage.from("product-media").remove([jpgPath]);
  } catch { /* ignore */ }

  // Check if PNG already exists (cache válido)
  const pngPublicUrl = `${supabaseUrl}/storage/v1/object/public/product-media/${pngPath}`;
  try {
    const check = await fetchWithTimeout(pngPublicUrl, { method: "HEAD", redirect: "follow" }, 10_000);
    if (check.status === 200) {
      // Verificar que o content-type é realmente PNG/JPEG
      const ct = check.headers.get("content-type") || "";
      if (ct.includes("png") || ct.includes("jpeg") || ct.includes("jpg")) {
        console.log(`[YAMPI-IMG] PNG cache hit (verified ${ct}): ${pngPath}`);
        return pngPublicUrl;
      }
      console.warn(`[YAMPI-IMG] Cache hit but wrong content-type "${ct}", re-converting`);
      await supabase.storage.from("product-media").remove([pngPath]);
    }
  } catch { /* continue */ }

  // Download original WebP
  const res = await fetchWithTimeout(webpUrl, {}, 25_000);
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
    const uploadedUrl = urlData?.publicUrl || null;
    
    // Y32: Validate uploaded URL is accessible
    if (uploadedUrl && await validateUrlAccessible(uploadedUrl)) {
      return uploadedUrl;
    }
    console.warn(`[YAMPI-IMG] Uploaded URL not accessible: ${uploadedUrl}`);
    return null;
  }

  // Para WebP: conversão real via Supabase Image Transformation (Pro+).
  // Usar format=jpeg explicitamente para garantir conversão real.
  const renderUrl = `${supabaseUrl}/storage/v1/render/image/public/product-media/${relativePath}?width=1200&quality=85&format=jpeg`;
  try {
    const renderRes = await fetchWithTimeout(renderUrl, {
      headers: { Accept: "image/jpeg" },
      redirect: "follow",
    }, 25_000);
    if (renderRes.ok) {
      const renderType = renderRes.headers.get("content-type") || "";
      const renderBytes = new Uint8Array(await renderRes.arrayBuffer());

      // Verificar se a conversão foi REAL — o content-type deve ser JPEG/PNG, não WebP
      const isRealConversion = renderType.includes("jpeg") || renderType.includes("jpg") || renderType.includes("png");
      if (!isRealConversion) {
        console.warn(`[YAMPI-IMG] Render returned content-type "${renderType}" instead of JPEG — conversion not real, skipping to fallback`);
      } else {
        const ext = renderType.includes("png") ? "png" : "jpg";
        const renderPath = `yampi-converted/${productId}/${imageIndex}.${ext}`;
        const { error } = await supabase.storage.from("product-media").upload(renderPath, renderBytes, {
          contentType: renderType,
          upsert: true,
        });
        if (!error) {
          const { data: urlData } = supabase.storage.from("product-media").getPublicUrl(renderPath);
          const uploadedUrl = urlData?.publicUrl || null;
          
          // Y32: Validate uploaded URL is accessible
          if (uploadedUrl && await validateUrlAccessible(uploadedUrl)) {
            console.log(`[YAMPI-IMG] Converted via render (real JPEG): ${uploadedUrl}`);
            return uploadedUrl;
          }
          console.warn(`[YAMPI-IMG] Rendered URL not accessible: ${uploadedUrl}`);
          return null;
        }
        console.error(`[YAMPI-IMG] Upload rendered failed: ${error.message}`);
      }
    } else {
      console.warn(`[YAMPI-IMG] Render returned ${renderRes.status} (Image Transformation pode exigir plano Pro)`);
    }
  } catch (e) {
    console.warn(`[YAMPI-IMG] Render endpoint unavailable: ${(e as Error).message}`);
  }

  // Fallback HONESTO: enviar WebP com content-type e extensão REAIS.
  // Não mentir sobre o formato — a Yampi pode processar WebP ou rejeitar explicitamente.
  const fallbackPath = `yampi-converted/${productId}/${imageIndex}.webp`;
  const { error: fbErr } = await supabase.storage.from("product-media").upload(fallbackPath, originalBytes, {
    contentType: "image/webp",
    upsert: true,
  });
  if (fbErr) {
    console.error(`[YAMPI-IMG] Fallback upload failed: ${fbErr.message}`);
    return null;
  }
  const { data: fbUrl } = supabase.storage.from("product-media").getPublicUrl(fallbackPath);
  const fallbackUrl = fbUrl?.publicUrl || null;
  
  // Y32: Validate fallback URL is accessible
  if (fallbackUrl && await validateUrlAccessible(fallbackUrl)) {
    console.warn(`[YAMPI-IMG] Fallback (webp honest, no conversion): ${fallbackUrl} — Image Transformation (plano Pro) recomendado para conversão real WebP→JPEG`);
    return fallbackUrl;
  }
  console.warn(`[YAMPI-IMG] Fallback URL not accessible: ${fallbackUrl}`);
  return null;
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
      return new Response(JSON.stringify({
        error: "Credenciais Yampi incompletas (alias, user_token, user_secret_key). Preencha em Checkout → Yampi → Configurar.",
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const yampiBase = `https://api.dooki.com.br/v2/${alias}`;
    const yampiHeaders = {
      "User-Token": userToken,
      "User-Secret-Key": userSecretKey,
      "Content-Type": "application/json",
    };

    // Get ALL variants with synced SKUs — iterate per SKU, not per product
    const { data: allVariants } = await supabase
      .from("product_variants")
      .select("id, product_id, yampi_sku_id, products(name)")
      .not("yampi_sku_id", "is", null)
      .eq("is_active", true)
      .order("product_id");

    const skuList = (allVariants || []).map((v: any) => ({
      variant_id: v.id as string,
      product_id: v.product_id as string,
      yampi_sku_id: v.yampi_sku_id as number,
      product_name: v.products?.name || "",
    }));

    const total = skuList.length;
    const batch = skuList.slice(batchOffset, batchOffset + batchLimit);

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
            variant_id: item.variant_id,
            product_id: item.product_id,
            product_name: item.product_name,
            source_url: "",
            sent_url: "",
            yampi_returned_url: null,
            converted: false,
            image_source: "none",
            status: "skipped",
            error: `Já possui ${existing.data.data.length} imagens na Yampi`,
          });
          await delay(500);
          continue;
        }
        await delay(500);
      }

      // 1. Try variant-specific images first
      let imageSource: "variant" | "primary" | "product" | "none" = "none";
      const { data: variantImages } = await supabase
        .from("product_images")
        .select("url")
        .eq("product_variant_id", item.variant_id)
        .order("display_order", { ascending: true })
        .limit(5);

      let images = variantImages && variantImages.length > 0 ? variantImages : null;
      if (images) {
        imageSource = "variant";
        console.log(`[YAMPI-IMG] SKU ${item.yampi_sku_id}: ${images.length} variant-specific images`);
      }

      // 2. Fallback: product images (primary first)
      if (!images) {
        const { data: productImages } = await supabase
          .from("product_images")
          .select("url, is_primary")
          .eq("product_id", item.product_id)
          .is("product_variant_id", null)
          .order("is_primary", { ascending: false })
          .order("display_order", { ascending: true })
          .limit(5);

        if (productImages && productImages.length > 0) {
          images = productImages;
          imageSource = productImages[0]?.is_primary ? "primary" : "product";
          console.log(`[YAMPI-IMG] SKU ${item.yampi_sku_id}: fallback to ${imageSource} images (${images.length})`);
        }
      }

      if (!images || images.length === 0) {
        skipped++;
        logs.push({
          sku_id: item.yampi_sku_id,
          variant_id: item.variant_id,
          product_id: item.product_id,
          product_name: item.product_name,
          source_url: "(sem imagens)",
          sent_url: "",
          yampi_returned_url: null,
          converted: false,
          image_source: "none",
          status: "skipped",
          error: "Variante e produto sem imagens",
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

        // Y32: Validate accessibility
        try {
          const check = await fetchWithTimeout(urlToSend, { method: "HEAD", redirect: "follow" }, 10_000);
          if (check.status === 200) {
            validUrls.push(urlToSend);
          } else {
            console.warn(`[YAMPI-IMG] URL inacessível (${check.status}): ${urlToSend}`);
          }
        } catch (checkErr: unknown) {
          const msg = checkErr instanceof Error ? checkErr.message : "unknown";
          console.warn(`[YAMPI-IMG] URL inacessível (${msg}): ${urlToSend}`);
        }
      }

      if (validUrls.length === 0) {
        skipped++;
        logs.push({
          sku_id: item.yampi_sku_id,
          variant_id: item.variant_id,
          product_id: item.product_id,
          product_name: item.product_name,
          source_url: firstSourceUrl,
          sent_url: "",
          yampi_returned_url: null,
          converted: false,
          image_source: imageSource,
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
          variant_id: item.variant_id,
          product_id: item.product_id,
          product_name: item.product_name,
          source_url: firstSourceUrl,
          sent_url: validUrls[0],
          yampi_returned_url: null,
          converted: didConvert,
          image_source: imageSource,
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
        variant_id: item.variant_id,
        product_id: item.product_id,
        product_name: item.product_name,
        source_url: firstSourceUrl,
        sent_url: validUrls[0],
        yampi_returned_url: yampiReturnedUrl,
        converted: didConvert,
        image_source: imageSource,
        status: "success",
      });
      console.log(`[YAMPI-IMG] ✅ SKU ${item.yampi_sku_id} <- ${validUrls.length} imgs (${imageSource}) ${didConvert ? "(converted)" : ""}`);

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
