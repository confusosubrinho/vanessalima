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
  total_products: number;
  processed: number;
  offset: number;
  limit: number;
  has_more: boolean;
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
  console.log(`[YAMPI] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 400) : "");
  const res = await fetch(url, opts);
  let data: unknown;
  try { data = await res.json(); } catch { data = { raw_text: await res.text().catch(() => "") }; }
  if (!res.ok) console.error(`[YAMPI] ERROR ${res.status} ${path}:`, JSON.stringify(data));
  return { ok: res.ok, status: res.status, data: data as Record<string, unknown> };
}

function sanitizePayloadForLog(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const clean = { ...(payload as Record<string, unknown>) };
  delete clean["User-Token"];
  delete clean["User-Secret-Key"];
  return clean;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Images are now handled separately via yampi-sync-images function
// DO NOT upload images during catalog sync to avoid errors

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const onlyActive = body.only_active !== false;
    const batchOffset = Number(body.offset) || 0;
    const batchLimit = Number(body.limit) || 10; // Process 10 products per batch

    // ─── Load Yampi config ───
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
    const defaultBrandId = config.default_brand_id ? Number(config.default_brand_id) : null;

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

    // ─── Resolve brand_id (only on first batch) ───
    let brandId = defaultBrandId;
    if (!brandId) {
      const brandsRes = await yampiRequest(yampiBase, yampiHeaders, "/catalog/brands?limit=50", "GET");
      if (brandsRes.ok && brandsRes.data?.data) {
        const brands = brandsRes.data.data as Array<Record<string, unknown>>;
        if (brands.length > 0) {
          brandId = Number(brands[0].id);
          console.log(`[YAMPI] Using existing brand id=${brandId}`);
        }
      }
      if (!brandId) {
        const createBrand = await yampiRequest(yampiBase, yampiHeaders, "/catalog/brands", "POST", {
          name: "Minha Marca", active: true, featured: false,
        });
        if (createBrand.ok) {
          const bd = createBrand.data?.data;
          brandId = Array.isArray(bd) ? Number((bd[0] as Record<string, unknown>)?.id) : Number((bd as Record<string, unknown>)?.id);
        } else if (createBrand.status === 422) {
          await delay(1000);
          const retry = await yampiRequest(yampiBase, yampiHeaders, "/catalog/brands?limit=50", "GET");
          if (retry.ok && retry.data?.data) {
            const brands = retry.data.data as Array<Record<string, unknown>>;
            if (brands.length > 0) brandId = Number(brands[0].id);
          }
        }
        if (!brandId) {
          console.error("[YAMPI] Could not resolve brand. Products may fail.");
        }
      }
    }

    // ─── Load variation value mappings ───
    const { data: variationMaps } = await supabase
      .from("variation_value_map")
      .select("type, value, yampi_variation_id, yampi_value_id");

    const valueMap: Record<string, { yampi_variation_id: number; yampi_value_id: number }> = {};
    for (const m of variationMaps || []) {
      if (m.yampi_value_id) {
        valueMap[`${m.type}:${m.value}`] = {
          yampi_variation_id: m.yampi_variation_id,
          yampi_value_id: m.yampi_value_id,
        };
      }
    }
    console.log(`[YAMPI] Loaded ${Object.keys(valueMap).length} variation mappings`);

    // ─── Count total products ───
    let countQuery = supabase.from("products").select("id", { count: "exact", head: true });
    if (onlyActive) countQuery = countQuery.eq("is_active", true);
    const { count: totalProducts } = await countQuery;

    // ─── Create sync run only on first batch ───
    let syncRunId: string | null = body.sync_run_id || null;
    if (!syncRunId && batchOffset === 0) {
      const { data: syncRun } = await supabase
        .from("catalog_sync_runs")
        .insert({ status: "running" })
        .select("id")
        .single();
      syncRunId = syncRun?.id || null;
    }

    const counters: SyncCounters = {
      created_products: 0, created_skus: 0, updated_skus: 0,
      skipped_inactive: 0, errors_count: 0, errors: [],
      total_products: totalProducts || 0,
      processed: 0,
      offset: batchOffset,
      limit: batchLimit,
      has_more: false,
    };

    // ─── Fetch products for this batch ───
    let productsQuery = supabase
      .from("products")
      .select(`
        id, name, slug, description, base_price, sale_price, sku,
        is_active, yampi_product_id, weight, height, width, depth,
        seo_title, seo_description, seo_keywords, brand, cost,
        category_id, categories!products_category_id_fkey ( name, slug, yampi_category_id )
      `)
      .order("created_at", { ascending: true })
      .range(batchOffset, batchOffset + batchLimit - 1);

    if (onlyActive) productsQuery = productsQuery.eq("is_active", true);

    const { data: products, error: prodError } = await productsQuery;
    if (prodError) throw new Error(`Erro ao buscar produtos: ${prodError.message}`);

    const productList = products || [];
    counters.has_more = productList.length === batchLimit;
    console.log(`[YAMPI] Processing batch: offset=${batchOffset}, got ${productList.length} products, total=${totalProducts}`);

    for (const product of productList) {
      try {
        let yampiProductId = product.yampi_product_id;

        // ─── Get variants ───
        let variantsQuery = supabase
          .from("product_variants")
          .select("id, sku, size, color, color_hex, stock_quantity, base_price, sale_price, is_active, yampi_sku_id, price_modifier")
          .eq("product_id", product.id);
        if (onlyActive) variantsQuery = variantsQuery.eq("is_active", true);

        const { data: variants } = await variantsQuery;
        const activeVariants = variants || [];

        // Images are handled separately via yampi-sync-images function

        // ─── Category from Yampi mapping ───
        const category = product.categories as Record<string, unknown> | null;
        const yampiCategoryId = category?.yampi_category_id as number | null;

        // ─── Determine variation groups needed ───
        const hasSize = activeVariants.some((v) => v.size?.trim());
        const hasColor = activeVariants.some((v) => v.color?.trim());
        const hasVariations = activeVariants.length > 1 || hasSize || hasColor;

        const productVariationGroupIds = new Set<number>();
        for (const v of activeVariants) {
          if (v.size?.trim()) {
            const mapping = valueMap[`size:${v.size.trim()}`];
            if (mapping?.yampi_variation_id) productVariationGroupIds.add(mapping.yampi_variation_id);
          }
          if (v.color?.trim()) {
            const mapping = valueMap[`color:${v.color.trim()}`];
            if (mapping?.yampi_variation_id) productVariationGroupIds.add(mapping.yampi_variation_id);
          }
        }

        const productPrice = Number(product.sale_price ?? product.base_price) || 0;
        const productCost = Number(product.cost ?? product.base_price) || 0;

        // ─── STEP 1: Create product if not exists ───
        if (!yampiProductId) {
          const createPayload: Record<string, unknown> = {
            name: product.name || "Produto sem nome",
            slug: product.slug || product.name?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `produto-${product.id.slice(0, 8)}`,
            active: true,
            simple: !hasVariations,
            brand_id: brandId,
            searchable: true,
            description: product.description || product.name || "",
            priority: 1,
          };

          if (product.seo_title) createPayload.seo_title = product.seo_title;
          if (product.seo_description) createPayload.seo_description = product.seo_description;
          if (product.seo_keywords) createPayload.seo_keywords = product.seo_keywords;

          if (yampiCategoryId) {
            createPayload.category_id = yampiCategoryId;
            createPayload.categories_ids = [yampiCategoryId];
          }

          if (productVariationGroupIds.size > 0) {
            createPayload.variations_ids = Array.from(productVariationGroupIds);
          }

          // Inline SKU for simple products
          if (!hasVariations && activeVariants.length > 0) {
            const v = activeVariants[0];
            const unitPrice = Number(v.sale_price ?? v.base_price ?? productPrice) || 0;
            const unitCost = Number(v.base_price ?? productCost) || 0;
            const variantSku = v.sku || `${product.sku || product.id.slice(0, 8)}-${v.size || "U"}`.replace(/\s+/g, "-").slice(0, 64);

            createPayload.skus = [{
              sku: variantSku,
              price_cost: unitCost,
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
            }];
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
            counters.processed++;
            continue;
          }

          yampiProductId = (res.data?.data as Record<string, unknown>)?.id as number || res.data?.id as number;
          if (!yampiProductId) {
            counters.errors.push({ product_id: product.id, message: "Resposta sem ID do produto criado", response_body: res.data });
            counters.errors_count++;
            counters.processed++;
            continue;
          }

          await supabase.from("products").update({ yampi_product_id: yampiProductId }).eq("id", product.id);
          counters.created_products++;

          // Extract inline SKU ID for simple products
          if (!hasVariations && activeVariants.length > 0) {
            const productData = res.data?.data as Record<string, unknown>;
            const skusData = productData?.skus as Record<string, unknown>;
            const skusList = (skusData?.data || []) as Array<Record<string, unknown>>;
              if (skusList.length > 0) {
                const yampiSkuId = Number(skusList[0].id);
                await supabase.from("product_variants").update({ yampi_sku_id: yampiSkuId }).eq("id", activeVariants[0].id);
                counters.created_skus++;
              }
          }

          await delay(350);
        }

        // ─── STEP 2: Create/Update SKUs for products with variations ───
        if (hasVariations) {
          for (const variant of activeVariants) {
            try {
              const unitPrice = Number(variant.sale_price ?? variant.base_price ?? productPrice) || 0;
              const unitCost = Number(variant.base_price ?? productCost) || 0;
              const variantSku = variant.sku || `${product.sku || product.id.slice(0, 8)}-${variant.size || "U"}-${variant.color || "U"}`.replace(/\s+/g, "-").slice(0, 64);

              const variationsValuesIds: number[] = [];

              if (variant.size?.trim()) {
                const mapping = valueMap[`size:${variant.size.trim()}`];
                if (mapping?.yampi_value_id) variationsValuesIds.push(mapping.yampi_value_id);
              }
              if (variant.color?.trim()) {
                const mapping = valueMap[`color:${variant.color.trim()}`];
                if (mapping?.yampi_value_id) variationsValuesIds.push(mapping.yampi_value_id);
              }

              if (!variant.yampi_sku_id) {
                // ── CREATE SKU ──
                const skuPayload: Record<string, unknown> = {
                  product_id: yampiProductId,
                  sku: variantSku,
                  price_cost: unitCost,
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

                if (variationsValuesIds.length > 0) {
                  skuPayload.variations_values_ids = variationsValuesIds;
                }

                const res = await yampiRequest(yampiBase, yampiHeaders, "/catalog/skus", "POST", skuPayload);

                if (!res.ok) {
                  counters.errors.push({
                    product_id: product.id, variant_id: variant.id,
                    message: `Criar SKU: ${res.status}`,
                    response_body: res.data,
                    sent_payload: sanitizePayloadForLog(skuPayload),
                  });
                  counters.errors_count++;
                  continue;
                }

                const yampiSkuId = (res.data?.data as Record<string, unknown>)?.id as number || res.data?.id as number;
                if (yampiSkuId) {
                  await supabase.from("product_variants").update({ yampi_sku_id: Number(yampiSkuId) }).eq("id", variant.id);
                }
                counters.created_skus++;
              } else {
                // ── UPDATE existing SKU ──
                const updatePayload: Record<string, unknown> = {
                  sku: variantSku,
                  price_cost: unitCost,
                  price_sale: unitPrice,
                  blocked_sale: false,
                  quantity_managed: true,
                  weight: Number(product.weight) || 0.3,
                  height: Number(product.height) || 5,
                  width: Number(product.width) || 15,
                  length: Number(product.depth) || 20,
                };

                if (variationsValuesIds.length > 0) {
                  updatePayload.variations_values_ids = variationsValuesIds;
                }

                const res = await yampiRequest(yampiBase, yampiHeaders, `/catalog/skus/${variant.yampi_sku_id}`, "PUT", updatePayload);

                if (!res.ok) {
                  counters.errors.push({
                    product_id: product.id, variant_id: variant.id,
                    message: `Update SKU: ${res.status}`,
                    response_body: res.data,
                  });
                  counters.errors_count++;
                  continue;
                }

                counters.updated_skus++;
              }

              await delay(350);
            } catch (varErr: unknown) {
              counters.errors.push({
                product_id: product.id, variant_id: variant.id,
                message: varErr instanceof Error ? varErr.message : "Erro desconhecido na variante",
              });
              counters.errors_count++;
            }
          }
        }

        counters.processed++;
      } catch (prodErr: unknown) {
        counters.errors.push({
          product_id: product.id,
          message: prodErr instanceof Error ? prodErr.message : "Erro desconhecido no produto",
        });
        counters.errors_count++;
        counters.processed++;
      }
    }

    // ─── Update sync run on last batch ───
    if (syncRunId && !counters.has_more) {
      await supabase.from("catalog_sync_runs").update({
        status: counters.errors_count > 0 ? "completed_with_errors" : "success",
        created_products: counters.created_products,
        created_skus: counters.created_skus,
        updated_skus: counters.updated_skus,
        skipped_inactive: counters.skipped_inactive,
        errors_count: counters.errors_count,
        error_details: counters.errors.slice(0, 50),
        finished_at: new Date().toISOString(),
      }).eq("id", syncRunId);
    }

    // Log only on last batch or first batch
    if (batchOffset === 0 || !counters.has_more) {
      await supabase.from("integrations_checkout_test_logs").insert({
        provider: "yampi",
        status: counters.errors_count > 0 ? "partial" : "success",
        message: `Batch ${batchOffset}-${batchOffset + productList.length}: ${counters.created_products} produtos, ${counters.created_skus} SKUs criados, ${counters.updated_skus} atualizados, ${counters.errors_count} erros`,
        payload_preview: sanitizePayloadForLog({ ...counters, errors: counters.errors.slice(0, 10) }),
      });
    }

    return new Response(JSON.stringify({ ...counters, sync_run_id: syncRunId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[YAMPI-SYNC] Fatal:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
