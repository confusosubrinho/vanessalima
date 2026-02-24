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
  console.log(`[YAMPI] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 800) : "");
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

async function uploadImagesToSku(
  yampiBase: string,
  yampiHeaders: Record<string, string>,
  skuId: number,
  imageUrls: string[]
) {
  for (const url of imageUrls.slice(0, 10)) {
    await yampiRequest(yampiBase, yampiHeaders, `/catalog/skus/${skuId}/images`, "POST", {
      url,
      upload_option: "resize",
    });
    await delay(800);
  }
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

    // ─── Resolve brand_id ───
    let brandId = defaultBrandId;
    if (!brandId) {
      // Try fetching all brands and use the first one
      const brandsRes = await yampiRequest(yampiBase, yampiHeaders, "/catalog/brands?limit=50", "GET");
      if (brandsRes.ok && brandsRes.data?.data) {
        const brands = brandsRes.data.data as Array<Record<string, unknown>>;
        if (brands.length > 0) {
          brandId = Number(brands[0].id);
          console.log(`[YAMPI] Using existing brand id=${brandId} name=${brands[0].name}`);
        }
      }
      if (!brandId) {
        // Try creating; if 422 (already exists), re-fetch
        const createBrand = await yampiRequest(yampiBase, yampiHeaders, "/catalog/brands", "POST", {
          name: "Minha Marca", active: true, featured: false,
        });
        if (createBrand.ok) {
          const bd = createBrand.data?.data;
          brandId = Array.isArray(bd) ? Number((bd[0] as Record<string, unknown>)?.id) : Number((bd as Record<string, unknown>)?.id);
        } else if (createBrand.status === 422) {
          // Brand exists but GET didn't return it — retry GET
          await delay(1000);
          const retry = await yampiRequest(yampiBase, yampiHeaders, "/catalog/brands?limit=50", "GET");
          if (retry.ok && retry.data?.data) {
            const brands = retry.data.data as Array<Record<string, unknown>>;
            if (brands.length > 0) brandId = Number(brands[0].id);
          }
        }
        if (!brandId) {
          console.error("[YAMPI] Could not resolve brand. Proceeding with brandId=null, products may fail.");
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
    console.log(`[YAMPI] Loaded ${Object.keys(valueMap).length} variation value mappings`);

    // ─── Derive variation group IDs from mappings ───
    const variationGroupIds = new Set<number>();
    for (const m of Object.values(valueMap)) {
      if (m.yampi_variation_id) variationGroupIds.add(m.yampi_variation_id);
    }

    // ─── Create sync run ───
    const { data: syncRun } = await supabase
      .from("catalog_sync_runs")
      .insert({ status: "running" })
      .select("id")
      .single();

    const counters: SyncCounters = {
      created_products: 0, created_skus: 0, updated_skus: 0,
      skipped_inactive: 0, errors_count: 0, errors: [],
    };

    // ─── Fetch products with category ───
    let productsQuery = supabase
      .from("products")
      .select(`
        id, name, slug, description, base_price, sale_price, sku,
        is_active, yampi_product_id, weight, height, width, depth,
        seo_title, seo_description, seo_keywords, brand, cost,
        category_id, categories!products_category_id_fkey ( name, slug, yampi_category_id )
      `)
      .order("created_at", { ascending: true });

    if (onlyActive) productsQuery = productsQuery.eq("is_active", true);

    const { data: products, error: prodError } = await productsQuery;
    if (prodError) throw new Error(`Erro ao buscar produtos: ${prodError.message}`);

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

        // ─── Get variants ───
        let variantsQuery = supabase
          .from("product_variants")
          .select("id, sku, size, color, color_hex, stock_quantity, base_price, sale_price, is_active, yampi_sku_id, price_modifier")
          .eq("product_id", product.id);
        if (onlyActive) variantsQuery = variantsQuery.eq("is_active", true);

        const { data: variants } = await variantsQuery;
        const activeVariants = variants || [];

        if (onlyActive) {
          const { count: inactiveVarCount } = await supabase
            .from("product_variants")
            .select("id", { count: "exact", head: true })
            .eq("product_id", product.id)
            .eq("is_active", false);
          counters.skipped_inactive += inactiveVarCount || 0;
        }

        // ─── Get product images ───
        const { data: images } = await supabase
          .from("product_images")
          .select("url, alt_text")
          .eq("product_id", product.id)
          .order("display_order", { ascending: true })
          .limit(10);

        const imageUrls = (images || [])
          .filter((img) => img.url && img.url.startsWith("http"))
          .map((img) => img.url);

        // ─── Category from Yampi mapping ───
        const category = product.categories as Record<string, unknown> | null;
        const yampiCategoryId = category?.yampi_category_id as number | null;

        // ─── Determine variation groups needed ───
        const hasSize = activeVariants.some((v) => v.size?.trim());
        const hasColor = activeVariants.some((v) => v.color?.trim());
        const hasVariations = activeVariants.length > 1 || hasSize || hasColor;

        // Collect unique variation group IDs from mapped values
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

          // Category
          if (yampiCategoryId) {
            createPayload.category_id = yampiCategoryId;
            createPayload.categories_ids = [yampiCategoryId];
          }

          // Variation groups
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
            continue;
          }

          yampiProductId = (res.data?.data as Record<string, unknown>)?.id as number || res.data?.id as number;
          if (!yampiProductId) {
            counters.errors.push({ product_id: product.id, message: "Resposta sem ID do produto criado", response_body: res.data });
            counters.errors_count++;
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
              const yampiSkuId = skusList[0].id as number;
              await supabase.from("product_variants").update({ yampi_sku_id: yampiSkuId }).eq("id", activeVariants[0].id);
              counters.created_skus++;

              await uploadImagesToSku(yampiBase, yampiHeaders, yampiSkuId, imageUrls);

              if (activeVariants[0].stock_quantity > 0) {
                await yampiRequest(yampiBase, yampiHeaders, `/catalog/products/${yampiProductId}/stocks/sync`, "POST", {
                  data: [{ id: yampiSkuId, sku: activeVariants[0].sku, total_in_stock: activeVariants[0].stock_quantity, blocked_sale: false }],
                });
              }
            }
          }

          await delay(2200);
        }

        // ─── STEP 2: Create/Update SKUs ───
        for (const variant of activeVariants) {
          try {
            const unitPrice = Number(variant.sale_price ?? variant.base_price ?? productPrice) || 0;
            const unitCost = Number(variant.base_price ?? productCost) || 0;
            const variantSku = variant.sku || `${product.sku || product.id.slice(0, 8)}-${variant.size || "U"}-${variant.color || "U"}`.replace(/\s+/g, "-").slice(0, 64);

            // Build variations_values_ids using mapped Yampi IDs
            const variationsValuesIds: number[] = [];
            let missingMapping = false;

            if (variant.size?.trim()) {
              const mapping = valueMap[`size:${variant.size.trim()}`];
              if (mapping?.yampi_value_id) {
                variationsValuesIds.push(mapping.yampi_value_id);
              } else {
                // Fallback: send string name (Yampi docs show it accepts strings too)
                console.log(`[YAMPI] No mapping for size "${variant.size}", using string fallback`);
              }
            }
            if (variant.color?.trim()) {
              const mapping = valueMap[`color:${variant.color.trim()}`];
              if (mapping?.yampi_value_id) {
                variationsValuesIds.push(mapping.yampi_value_id);
              } else {
                console.log(`[YAMPI] No mapping for color "${variant.color}", using string fallback`);
              }
            }

            // Build string fallback if no numeric IDs
            const variationsStrings: string[] = [];
            if (variationsValuesIds.length === 0) {
              if (variant.size?.trim()) variationsStrings.push(variant.size.trim());
              if (variant.color?.trim()) variationsStrings.push(variant.color.trim());
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
              } else if (variationsStrings.length > 0) {
                skuPayload.variations_values_ids = variationsStrings;
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
                await supabase.from("product_variants").update({ yampi_sku_id: yampiSkuId }).eq("id", variant.id);
                await uploadImagesToSku(yampiBase, yampiHeaders, yampiSkuId, imageUrls);

                if (variant.stock_quantity > 0) {
                  await yampiRequest(yampiBase, yampiHeaders, `/catalog/products/${yampiProductId}/stocks/sync`, "POST", {
                    data: [{ id: yampiSkuId, sku: variantSku, total_in_stock: variant.stock_quantity, blocked_sale: false }],
                  });
                }
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
              } else if (variationsStrings.length > 0) {
                updatePayload.variations_values_ids = variationsStrings;
              }

              const res = await yampiRequest(yampiBase, yampiHeaders, `/catalog/skus/${variant.yampi_sku_id}`, "PUT", updatePayload);

              if (!res.ok) {
                counters.errors.push({
                  product_id: product.id, variant_id: variant.id,
                  message: `Update SKU: ${res.status}`,
                  response_body: res.data,
                  sent_payload: sanitizePayloadForLog(updatePayload),
                });
                counters.errors_count++;
                continue;
              }

              await uploadImagesToSku(yampiBase, yampiHeaders, variant.yampi_sku_id, imageUrls);

              await yampiRequest(yampiBase, yampiHeaders, `/catalog/products/${yampiProductId}/stocks/sync`, "POST", {
                data: [{ id: variant.yampi_sku_id, sku: variantSku, total_in_stock: variant.stock_quantity, blocked_sale: false }],
              });

              counters.updated_skus++;
            }

            await delay(2200);
          } catch (varErr: unknown) {
            counters.errors.push({
              product_id: product.id, variant_id: variant.id,
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

    // ─── Update sync run ───
    if (syncRun?.id) {
      await supabase.from("catalog_sync_runs").update({
        status: counters.errors_count > 0 ? "completed_with_errors" : "success",
        created_products: counters.created_products,
        created_skus: counters.created_skus,
        updated_skus: counters.updated_skus,
        skipped_inactive: counters.skipped_inactive,
        errors_count: counters.errors_count,
        error_details: counters.errors.slice(0, 50),
        finished_at: new Date().toISOString(),
      }).eq("id", syncRun.id);
    }

    await supabase.from("integrations_checkout_test_logs").insert({
      provider: "yampi",
      status: counters.errors_count > 0 ? "partial" : "success",
      message: `Sync: ${counters.created_products} produtos, ${counters.created_skus} SKUs criados, ${counters.updated_skus} atualizados, ${counters.skipped_inactive} inativos, ${counters.errors_count} erros`,
      payload_preview: sanitizePayloadForLog({ ...counters, errors: counters.errors.slice(0, 10) }),
    });

    return new Response(JSON.stringify(counters), {
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
