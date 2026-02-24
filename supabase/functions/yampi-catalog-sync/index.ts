import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SyncCounters {
  created_products: number;
  created_skus: number;
  updated_skus: number;
  skipped_inactive: number;
  errors_count: number;
  errors: Array<{ product_id: string; variant_id?: string; message: string }>;
}

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
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const onlyActive = body.only_active !== false; // default true

    // Load Yampi config
    const { data: providerConfig } = await supabase
      .from("integrations_checkout_providers")
      .select("config")
      .eq("provider", "yampi")
      .single();

    if (!providerConfig?.config) {
      return new Response(JSON.stringify({ error: "Provider Yampi não configurado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = providerConfig.config as Record<string, unknown>;
    const alias = config.alias as string;
    const userToken = config.user_token as string;
    const userSecretKey = config.user_secret_key as string;

    if (!alias || !userToken || !userSecretKey) {
      return new Response(JSON.stringify({ error: "Credenciais Yampi incompletas" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const yampiBase = `https://api.dooki.com.br/v2/${alias}`;
    const yampiHeaders = {
      "User-Token": userToken,
      "User-Secret-Key": userSecretKey,
      "Content-Type": "application/json",
    };

    // Create sync run
    const { data: syncRun } = await supabase
      .from("catalog_sync_runs")
      .insert({ status: "running" })
      .select("id")
      .single();

    const counters: SyncCounters = {
      created_products: 0,
      created_skus: 0,
      updated_skus: 0,
      skipped_inactive: 0,
      errors_count: 0,
      errors: [],
    };

    // Fetch products
    let productsQuery = supabase
      .from("products")
      .select("id, name, slug, description, base_price, sale_price, sku, is_active, yampi_product_id, weight, height, width, depth, seo_title, seo_description, seo_keywords")
      .order("created_at", { ascending: true });

    if (onlyActive) {
      productsQuery = productsQuery.eq("is_active", true);
    }

    const { data: products, error: prodError } = await productsQuery;
    if (prodError) throw new Error(`Erro ao buscar produtos: ${prodError.message}`);

    // Also count inactive for stats
    if (onlyActive) {
      const { count } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("is_active", false);
      counters.skipped_inactive = count || 0;
    }

    for (const product of products || []) {
      try {
        let yampiProductId = product.yampi_product_id;

        // STEP 1: Create product on Yampi if it doesn't exist
        if (!yampiProductId) {
          const createPayload: Record<string, unknown> = {
            name: product.name,
            slug: product.slug,
            active: product.is_active,
            searchable: true,
            description: product.description || "",
          };
          if (product.seo_title) createPayload.seo_title = product.seo_title;
          if (product.seo_description) createPayload.seo_description = product.seo_description;
          if (product.seo_keywords) createPayload.seo_keywords = product.seo_keywords;

          const res = await yampiRequest(yampiBase, yampiHeaders, "/catalog/products", "POST", createPayload);

          if (!res.ok) {
            const msg = res.data?.message || res.data?.errors || JSON.stringify(res.data);
            counters.errors.push({ product_id: product.id, message: `Criar produto: ${res.status} - ${typeof msg === 'string' ? msg : JSON.stringify(msg)}` });
            counters.errors_count++;
            continue;
          }

          yampiProductId = res.data?.data?.id || res.data?.id;
          if (!yampiProductId) {
            counters.errors.push({ product_id: product.id, message: "Resposta sem ID do produto criado" });
            counters.errors_count++;
            continue;
          }

          // Save yampi_product_id locally
          await supabase
            .from("products")
            .update({ yampi_product_id: yampiProductId })
            .eq("id", product.id);

          counters.created_products++;
        }

        // STEP 2: Get variants for this product
        let variantsQuery = supabase
          .from("product_variants")
          .select("id, sku, size, color, stock_quantity, base_price, sale_price, is_active, yampi_sku_id")
          .eq("product_id", product.id);

        if (onlyActive) {
          variantsQuery = variantsQuery.eq("is_active", true);
        }

        const { data: variants } = await variantsQuery;

        // Also count inactive variants
        if (onlyActive) {
          const { count: inactiveVarCount } = await supabase
            .from("product_variants")
            .select("id", { count: "exact", head: true })
            .eq("product_id", product.id)
            .eq("is_active", false);
          counters.skipped_inactive += inactiveVarCount || 0;
        }

        // Get product images
        const { data: images } = await supabase
          .from("product_images")
          .select("url")
          .eq("product_id", product.id)
          .order("display_order", { ascending: true })
          .limit(10);

        const imageUrls = (images || []).map((img) => ({ url: img.url }));

        for (const variant of variants || []) {
          try {
            const unitPrice = variant.sale_price ?? variant.base_price ?? product.sale_price ?? product.base_price;
            const variantSku = variant.sku || `${product.sku || product.id}-${variant.size}-${variant.color || ""}`.replace(/\s+/g, "-");
            const title = `${product.name} - ${variant.size}${variant.color ? ` ${variant.color}` : ""}`;

            if (!variant.yampi_sku_id) {
              // CREATE SKU on Yampi
              const skuPayload: Record<string, unknown> = {
                product_id: yampiProductId,
                sku: variantSku,
                price_cost: unitPrice,
                price_sale: unitPrice,
                blocked_sale: false,
                quantity_managed: true,
                weight: product.weight || 0.3,
                height: product.height || 5,
                width: product.width || 15,
                length: product.depth || 20,
              };

              // Include images in SKU creation
              if (imageUrls.length > 0) {
                skuPayload.images = imageUrls;
              }

              const res = await yampiRequest(yampiBase, yampiHeaders, "/catalog/skus", "POST", skuPayload);

              if (!res.ok) {
                const msg = res.data?.message || res.data?.errors || JSON.stringify(res.data);
                counters.errors.push({
                  product_id: product.id,
                  variant_id: variant.id,
                  message: `Criar SKU: ${res.status} - ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`,
                });
                counters.errors_count++;
                continue;
              }

              const yampiSkuId = res.data?.data?.id || res.data?.id;
              if (yampiSkuId) {
                await supabase
                  .from("product_variants")
                  .update({ yampi_sku_id: yampiSkuId })
                  .eq("id", variant.id);
              }

              counters.created_skus++;

              // Update stock via separate endpoint if needed
              if (variant.stock_quantity > 0 && yampiSkuId) {
                await yampiRequest(
                  yampiBase,
                  yampiHeaders,
                  `/catalog/products/${yampiProductId}/stocks/sync`,
                  "POST",
                  {
                    data: [{
                      id: yampiSkuId,
                      sku: variantSku,
                      total_in_stock: variant.stock_quantity,
                      blocked_sale: false,
                    }],
                  }
                );
              }
            } else {
              // UPDATE existing SKU on Yampi
              const updatePayload: Record<string, unknown> = {
                sku: variantSku,
                price_cost: unitPrice,
                price_sale: unitPrice,
                blocked_sale: false,
                quantity_managed: true,
              };

              const res = await yampiRequest(
                yampiBase,
                yampiHeaders,
                `/catalog/skus/${variant.yampi_sku_id}`,
                "PUT",
                updatePayload
              );

              if (!res.ok) {
                const msg = res.data?.message || res.data?.errors || JSON.stringify(res.data);
                counters.errors.push({
                  product_id: product.id,
                  variant_id: variant.id,
                  message: `Update SKU: ${res.status} - ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`,
                });
                counters.errors_count++;
                continue;
              }

              // Sync stock
              await yampiRequest(
                yampiBase,
                yampiHeaders,
                `/catalog/products/${yampiProductId}/stocks/sync`,
                "POST",
                {
                  data: [{
                    id: variant.yampi_sku_id,
                    sku: variantSku,
                    total_in_stock: variant.stock_quantity,
                    blocked_sale: false,
                  }],
                }
              );

              // Update images
              if (imageUrls.length > 0) {
                await yampiRequest(
                  yampiBase,
                  yampiHeaders,
                  `/catalog/skus/${variant.yampi_sku_id}/images`,
                  "POST",
                  { images: imageUrls, upload_option: "resize" }
                );
              }

              counters.updated_skus++;
            }

            // Small delay to respect rate limits (30 req/min for catalog)
            await new Promise((r) => setTimeout(r, 2200));
          } catch (varErr: unknown) {
            counters.errors.push({
              product_id: product.id,
              variant_id: variant.id,
              message: varErr instanceof Error ? varErr.message : "Erro desconhecido na variante",
            });
            counters.errors_count++;
          }
        }
      } catch (prodErr: unknown) {
        counters.errors.push({
          product_id: product.id,
          message: prodErr instanceof Error ? prodErr.message : "Erro desconhecido no produto",
        });
        counters.errors_count++;
      }
    }

    // Update sync run
    if (syncRun?.id) {
      await supabase
        .from("catalog_sync_runs")
        .update({
          status: counters.errors_count > 0 ? "completed_with_errors" : "success",
          created_products: counters.created_products,
          created_skus: counters.created_skus,
          updated_skus: counters.updated_skus,
          skipped_inactive: counters.skipped_inactive,
          errors_count: counters.errors_count,
          error_details: counters.errors,
          finished_at: new Date().toISOString(),
        })
        .eq("id", syncRun.id);
    }

    // Log to integrations_checkout_test_logs
    await supabase.from("integrations_checkout_test_logs").insert({
      provider: "yampi",
      status: counters.errors_count > 0 ? "error" : "success",
      message: `Sync catálogo: ${counters.created_products} produtos criados, ${counters.created_skus} SKUs criados, ${counters.updated_skus} SKUs atualizados, ${counters.skipped_inactive} inativos ignorados, ${counters.errors_count} erros`,
      payload_preview: {
        created_products: counters.created_products,
        created_skus: counters.created_skus,
        updated_skus: counters.updated_skus,
        skipped_inactive: counters.skipped_inactive,
        errors_count: counters.errors_count,
        first_errors: counters.errors.slice(0, 5),
      },
    });

    const result = {
      created_products: counters.created_products,
      created_skus: counters.created_skus,
      updated_skus: counters.updated_skus,
      skipped_inactive: counters.skipped_inactive,
      errors_count: counters.errors_count,
      errors: counters.errors.slice(0, 20),
      sync_run_id: syncRun?.id,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
