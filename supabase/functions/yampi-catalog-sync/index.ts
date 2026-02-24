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
  errors: Array<{ product_id: string; variant_id?: string; message: string; response_body?: unknown; sent_payload?: unknown }>;
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

  console.log(`[YAMPI] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 500) : "");

  const res = await fetch(url, opts);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = { raw_text: await res.text().catch(() => "unable to read") };
  }

  if (!res.ok) {
    console.error(`[YAMPI] ERROR ${res.status} ${path}:`, JSON.stringify(data));
  }

  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> };
}

function sanitizePayloadForLog(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const clean = { ...(payload as Record<string, unknown>) };
  // Remove secrets from logs
  delete clean["User-Token"];
  delete clean["User-Secret-Key"];
  return clean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const onlyActive = body.only_active !== false;

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
    const defaultBrandId = config.default_brand_id ? Number(config.default_brand_id) : null;

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

    // If no brand_id configured, try to get or create one
    let brandId = defaultBrandId;
    if (!brandId) {
      console.log("[YAMPI] No brand_id configured, fetching existing brands...");
      const brandsRes = await yampiRequest(yampiBase, yampiHeaders, "/catalog/brands?limit=1", "GET");
      if (brandsRes.ok && brandsRes.data?.data) {
        const brands = brandsRes.data.data as Array<Record<string, unknown>>;
        if (brands.length > 0) {
          brandId = brands[0].id as number;
          console.log(`[YAMPI] Using existing brand_id: ${brandId}`);
        }
      }
      if (!brandId) {
        console.log("[YAMPI] No brands found, creating default brand...");
        const createBrand = await yampiRequest(yampiBase, yampiHeaders, "/catalog/brands", "POST", {
          name: "Minha Marca",
          active: true,
        });
        if (createBrand.ok) {
          brandId = (createBrand.data?.data as Record<string, unknown>)?.id as number || (createBrand.data?.id as number);
          console.log(`[YAMPI] Created brand_id: ${brandId}`);
        } else {
          return new Response(JSON.stringify({
            error: "Não foi possível obter/criar marca na Yampi. Configure default_brand_id manualmente.",
            yampi_response: createBrand.data,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

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
      .select("id, name, slug, description, base_price, sale_price, sku, is_active, yampi_product_id, weight, height, width, depth, seo_title, seo_description, seo_keywords, brand")
      .order("created_at", { ascending: true });

    if (onlyActive) {
      productsQuery = productsQuery.eq("is_active", true);
    }

    const { data: products, error: prodError } = await productsQuery;
    if (prodError) throw new Error(`Erro ao buscar produtos: ${prodError.message}`);

    // Count inactive for stats
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

        // Get variants for this product
        let variantsQuery = supabase
          .from("product_variants")
          .select("id, sku, size, color, stock_quantity, base_price, sale_price, is_active, yampi_sku_id, price_modifier")
          .eq("product_id", product.id);

        if (onlyActive) {
          variantsQuery = variantsQuery.eq("is_active", true);
        }

        const { data: variants } = await variantsQuery;
        const activeVariants = variants || [];

        // Count inactive variants
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

        const imageUrls = (images || [])
          .filter((img) => img.url && img.url.startsWith("http"))
          .map((img) => ({ url: img.url }));

        // STEP 1: Create product on Yampi if it doesn't exist
        if (!yampiProductId) {
          const hasVariations = activeVariants.length > 1;

          // Build inline SKUs for product creation
          const inlineSkus = activeVariants.map((v) => {
            const unitPrice = Number(v.sale_price ?? v.base_price ?? product.sale_price ?? product.base_price) || 0;
            const variantSku = v.sku || `${product.sku || product.id.slice(0, 8)}-${v.size}-${(v.color || "U")}`.replace(/\s+/g, "-").slice(0, 64);

            const skuObj: Record<string, unknown> = {
              sku: variantSku,
              price_cost: unitPrice,
              price_sale: unitPrice,
              price_discount: 0,
              weight: Number(product.weight) || 0.3,
              height: Number(product.height) || 5,
              width: Number(product.width) || 15,
              length: Number(product.depth) || 20,
              quantity_managed: true,
              availability: 0,
              availability_soldout: 0,
              blocked_sale: false,
            };

            if (imageUrls.length > 0) {
              skuObj.images = imageUrls;
            }

            return skuObj;
          });

          const createPayload: Record<string, unknown> = {
            name: product.name || "Produto sem nome",
            slug: product.slug || product.name?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `produto-${product.id.slice(0, 8)}`,
            active: true,
            simple: !hasVariations,
            brand_id: brandId,
            searchable: true,
            description: product.description || "",
            priority: 1,
          };

          if (product.seo_title) createPayload.seo_title = product.seo_title;
          if (product.seo_description) createPayload.seo_description = product.seo_description;
          if (product.seo_keywords) createPayload.seo_keywords = product.seo_keywords;

          // Include inline SKUs only for simple products (1 variant)
          if (!hasVariations && inlineSkus.length > 0) {
            createPayload.skus = inlineSkus;
          }

          const res = await yampiRequest(yampiBase, yampiHeaders, "/catalog/products", "POST", createPayload);

          if (!res.ok) {
            counters.errors.push({
              product_id: product.id,
              message: `Criar produto: ${res.status}`,
              response_body: res.data,
              sent_payload: sanitizePayloadForLog(createPayload),
            });
            counters.errors_count++;
            continue;
          }

          yampiProductId = (res.data?.data as Record<string, unknown>)?.id as number || res.data?.id as number;
          if (!yampiProductId) {
            counters.errors.push({ product_id: product.id, message: "Resposta sem ID do produto criado", response_body: res.data });
            counters.errors_count++;
            continue;
          }

          // Save yampi_product_id locally
          await supabase
            .from("products")
            .update({ yampi_product_id: yampiProductId })
            .eq("id", product.id);

          counters.created_products++;

          // If simple product with inline SKU, try to extract SKU ID from response
          if (!hasVariations && inlineSkus.length > 0) {
            const productData = res.data?.data as Record<string, unknown>;
            const skusData = productData?.skus as Record<string, unknown>;
            const skusList = (skusData?.data || []) as Array<Record<string, unknown>>;
            if (skusList.length > 0 && activeVariants.length > 0) {
              const yampiSkuId = skusList[0].id as number;
              await supabase
                .from("product_variants")
                .update({ yampi_sku_id: yampiSkuId })
                .eq("id", activeVariants[0].id);
              counters.created_skus++;

              // Sync stock
              if (activeVariants[0].stock_quantity > 0) {
                await yampiRequest(yampiBase, yampiHeaders, `/catalog/products/${yampiProductId}/stocks/sync`, "POST", {
                  data: [{
                    id: yampiSkuId,
                    sku: inlineSkus[0].sku,
                    total_in_stock: activeVariants[0].stock_quantity,
                    blocked_sale: false,
                  }],
                });
              }
            }
          }

          // Rate limit delay
          await new Promise((r) => setTimeout(r, 2200));
        }

        // STEP 2: Create/update SKUs separately for multi-variant products or products already created
        for (const variant of activeVariants) {
          try {
            const unitPrice = Number(variant.sale_price ?? variant.base_price ?? product.sale_price ?? product.base_price) || 0;
            const variantSku = variant.sku || `${product.sku || product.id.slice(0, 8)}-${variant.size}-${(variant.color || "U")}`.replace(/\s+/g, "-").slice(0, 64);

            if (!variant.yampi_sku_id) {
              // CREATE SKU on Yampi
              const skuPayload: Record<string, unknown> = {
                product_id: yampiProductId,
                sku: variantSku,
                price_cost: unitPrice,
                price_sale: unitPrice,
                price_discount: 0,
                weight: Number(product.weight) || 0.3,
                height: Number(product.height) || 5,
                width: Number(product.width) || 15,
                length: Number(product.depth) || 20,
                quantity_managed: true,
                availability: 0,
                availability_soldout: 0,
                blocked_sale: false,
                // Pass variation values as strings
                variations_values_ids: [
                  variant.size,
                  ...(variant.color ? [variant.color] : []),
                ].filter(Boolean),
              };

              if (imageUrls.length > 0) {
                skuPayload.images = imageUrls;
              }

              const res = await yampiRequest(yampiBase, yampiHeaders, "/catalog/skus", "POST", skuPayload);

              if (!res.ok) {
                counters.errors.push({
                  product_id: product.id,
                  variant_id: variant.id,
                  message: `Criar SKU: ${res.status}`,
                  response_body: res.data,
                  sent_payload: sanitizePayloadForLog(skuPayload),
                });
                counters.errors_count++;
                continue;
              }

              const yampiSkuId = (res.data?.data as Record<string, unknown>)?.id as number || res.data?.id as number;
              if (yampiSkuId) {
                await supabase
                  .from("product_variants")
                  .update({ yampi_sku_id: yampiSkuId })
                  .eq("id", variant.id);
              }

              counters.created_skus++;

              // Sync stock
              if (variant.stock_quantity > 0 && yampiSkuId) {
                await yampiRequest(yampiBase, yampiHeaders, `/catalog/products/${yampiProductId}/stocks/sync`, "POST", {
                  data: [{
                    id: yampiSkuId,
                    sku: variantSku,
                    total_in_stock: variant.stock_quantity,
                    blocked_sale: false,
                  }],
                });
              }
            } else {
              // UPDATE existing SKU on Yampi
              const updatePayload: Record<string, unknown> = {
                sku: variantSku,
                price_cost: unitPrice,
                price_sale: unitPrice,
                blocked_sale: false,
                quantity_managed: true,
                weight: Number(product.weight) || 0.3,
                height: Number(product.height) || 5,
                width: Number(product.width) || 15,
                length: Number(product.depth) || 20,
              };

              const res = await yampiRequest(yampiBase, yampiHeaders, `/catalog/skus/${variant.yampi_sku_id}`, "PUT", updatePayload);

              if (!res.ok) {
                counters.errors.push({
                  product_id: product.id,
                  variant_id: variant.id,
                  message: `Update SKU: ${res.status}`,
                  response_body: res.data,
                  sent_payload: sanitizePayloadForLog(updatePayload),
                });
                counters.errors_count++;
                continue;
              }

              // Sync stock
              await yampiRequest(yampiBase, yampiHeaders, `/catalog/products/${yampiProductId}/stocks/sync`, "POST", {
                data: [{
                  id: variant.yampi_sku_id,
                  sku: variantSku,
                  total_in_stock: variant.stock_quantity,
                  blocked_sale: false,
                }],
              });

              counters.updated_skus++;
            }

            // Rate limit delay
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
          error_details: counters.errors.slice(0, 50),
          finished_at: new Date().toISOString(),
        })
        .eq("id", syncRun.id);
    }

    // Log to integrations_checkout_test_logs
    await supabase.from("integrations_checkout_test_logs").insert({
      provider: "yampi",
      status: counters.errors_count > 0 ? "error" : "success",
      message: `Sync catálogo: ${counters.created_products} produtos, ${counters.created_skus} SKUs criados, ${counters.updated_skus} atualizados, ${counters.skipped_inactive} inativos, ${counters.errors_count} erros`,
      payload_preview: {
        created_products: counters.created_products,
        created_skus: counters.created_skus,
        updated_skus: counters.updated_skus,
        skipped_inactive: counters.skipped_inactive,
        errors_count: counters.errors_count,
        brand_id_used: brandId,
        first_errors: counters.errors.slice(0, 10),
      },
    });

    return new Response(JSON.stringify({
      created_products: counters.created_products,
      created_skus: counters.created_skus,
      updated_skus: counters.updated_skus,
      skipped_inactive: counters.skipped_inactive,
      errors_count: counters.errors_count,
      errors: counters.errors.slice(0, 20),
      sync_run_id: syncRun?.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[YAMPI-CATALOG-SYNC] Fatal error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
