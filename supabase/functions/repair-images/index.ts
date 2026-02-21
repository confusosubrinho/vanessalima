import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Repair broken Bling images by re-fetching from Bling API and re-uploading to Supabase Storage.
 * 
 * POST body: { "dry_run": true/false, "limit": 50 }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run ?? false;
    const limit = Math.min(body.limit || 50, 200);

    // Find all product_images with signed/expired Bling URLs
    const { data: brokenImages, error: queryErr } = await supabase
      .from("product_images")
      .select("id, product_id, url, display_order, is_primary, alt_text")
      .or("url.ilike.%X-Amz-%,url.ilike.%Expires=%,url.ilike.%Signature=%")
      .limit(limit);

    if (queryErr) {
      return new Response(
        JSON.stringify({ error: queryErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!brokenImages || brokenImages.length === 0) {
      return new Response(
        JSON.stringify({ message: "No broken images found", fixed: 0, total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by product_id to re-fetch from Bling API
    const productIds = [...new Set(brokenImages.map((img: any) => img.product_id))];
    
    // Get Bling token
    const { data: settings } = await supabase
      .from("store_settings")
      .select("bling_access_token, bling_client_id, bling_client_secret, bling_refresh_token, bling_token_expires_at")
      .limit(1)
      .maybeSingle();

    let blingToken = settings?.bling_access_token;
    const hasBling = !!blingToken;

    // If Bling connected, try to refresh token if needed
    if (hasBling && settings?.bling_token_expires_at) {
      const expiresAt = new Date(settings.bling_token_expires_at);
      if (expiresAt.getTime() - 300000 < Date.now() && settings.bling_refresh_token) {
        const basicAuth = btoa(`${settings.bling_client_id}:${settings.bling_client_secret}`);
        const tokenRes = await fetch("https://api.bling.com.br/Api/v3/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${basicAuth}`,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: settings.bling_refresh_token,
          }),
        });
        const tokenData = await tokenRes.json();
        if (tokenRes.ok && tokenData.access_token) {
          blingToken = tokenData.access_token;
          await supabase.from("store_settings").update({
            bling_access_token: tokenData.access_token,
            bling_refresh_token: tokenData.refresh_token,
            bling_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString(),
          } as any).limit(1);
        }
      }
    }

    const results: any[] = [];
    let fixed = 0;
    let failed = 0;

    for (const productId of productIds) {
      // Get bling_product_id for this product
      const { data: product } = await supabase
        .from("products")
        .select("id, bling_product_id, name")
        .eq("id", productId)
        .maybeSingle();

      if (!product?.bling_product_id) {
        // No Bling ID - just strip the querystring as best effort
        const productImages = brokenImages.filter((img: any) => img.product_id === productId);
        for (const img of productImages) {
          const cleanUrl = img.url.split("?")[0];
          if (!dryRun) {
            await supabase.from("product_images").update({ url: cleanUrl }).eq("id", img.id);
          }
          results.push({ id: img.id, product: product?.name, action: "stripped_querystring", url: cleanUrl });
          fixed++;
        }
        continue;
      }

      // Fetch fresh images from Bling API
      if (!hasBling || !blingToken) {
        results.push({ product_id: productId, product: product?.name, action: "skipped_no_bling_token" });
        failed++;
        continue;
      }

      try {
        // Rate limit
        await new Promise(r => setTimeout(r, 400));

        const blingRes = await fetch(
          `https://api.bling.com.br/Api/v3/produtos/${product.bling_product_id}`,
          {
            headers: {
              Authorization: `Bearer ${blingToken}`,
              Accept: "application/json",
            },
          }
        );

        if (!blingRes.ok) {
          results.push({ product_id: productId, product: product?.name, action: "bling_fetch_failed", status: blingRes.status });
          failed++;
          continue;
        }

        const blingData = await blingRes.json();
        const blingImages = blingData?.data?.midia?.imagens?.internas || [];

        if (blingImages.length === 0) {
          results.push({ product_id: productId, product: product?.name, action: "no_bling_images" });
          failed++;
          continue;
        }

        if (dryRun) {
          results.push({ product_id: productId, product: product?.name, action: "would_fix", image_count: blingImages.length });
          fixed += blingImages.length;
          continue;
        }

        // Download and re-upload each image
        await supabase.from("product_images").delete().eq("product_id", productId);
        const newImages: any[] = [];

        for (let idx = 0; idx < blingImages.length; idx++) {
          const imgUrl = blingImages[idx].link;
          try {
            const imgRes = await fetch(imgUrl);
            if (!imgRes.ok) {
              console.warn(`Failed to download: ${imgUrl.substring(0, 80)}`);
              continue;
            }

            const blob = await imgRes.blob();
            const contentType = imgRes.headers.get("content-type") || "image/jpeg";
            const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
            const fileName = `bling/${productId}/${idx}-${Date.now()}.${ext}`;

            const { error: uploadErr } = await supabase.storage
              .from("product-media")
              .upload(fileName, blob, { contentType, upsert: true });

            if (uploadErr) {
              console.warn(`Upload error: ${uploadErr.message}`);
              continue;
            }

            const { data: { publicUrl } } = supabase.storage
              .from("product-media")
              .getPublicUrl(fileName);

            newImages.push({
              product_id: productId,
              url: publicUrl,
              is_primary: idx === 0,
              display_order: idx,
              alt_text: product.name,
            });
          } catch (dlErr: any) {
            console.warn(`Image download error: ${dlErr.message}`);
          }
        }

        if (newImages.length > 0) {
          await supabase.from("product_images").insert(newImages);
          fixed += newImages.length;
          results.push({ product_id: productId, product: product?.name, action: "fixed", images_uploaded: newImages.length });
        } else {
          failed++;
          results.push({ product_id: productId, product: product?.name, action: "all_downloads_failed" });
        }
      } catch (err: any) {
        results.push({ product_id: productId, product: product?.name, action: "error", message: err.message });
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        dry_run: dryRun,
        total_broken: brokenImages.length,
        products_affected: productIds.length,
        fixed,
        failed,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
