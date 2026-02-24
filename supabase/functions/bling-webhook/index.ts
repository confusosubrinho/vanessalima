import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getConfigAwareUpdateFields, DEFAULT_SYNC_CONFIG } from "../_shared/bling-sync-fields.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import type { BlingSyncConfig } from "../_shared/bling-sync-fields.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BLING_API_URL = "https://api.bling.com.br/Api/v3";
const BLING_TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";

function createSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Webhook logging ───
async function logWebhook(supabase: any, params: {
  event_type: string;
  event_id?: string;
  bling_product_id?: number | null;
  payload_meta?: any;
  result: string;
  reason?: string;
  status_code?: number;
  processing_time_ms?: number;
}) {
  try {
    await supabase.from("bling_webhook_logs").insert({
      event_type: params.event_type,
      event_id: params.event_id || null,
      bling_product_id: params.bling_product_id || null,
      payload_meta: params.payload_meta || {},
      result: params.result,
      reason: params.reason || null,
      status_code: params.status_code || 200,
      processing_time_ms: params.processing_time_ms || null,
    });
  } catch (e) {
    console.error("[webhook] Failed to log webhook:", e);
  }
}

// ─── Load sync config ───
async function getSyncConfig(supabase: any): Promise<BlingSyncConfig> {
  const { data } = await supabase.from("bling_sync_config").select("*").limit(1).maybeSingle();
  if (!data) return { ...DEFAULT_SYNC_CONFIG };
  return {
    sync_stock: data.sync_stock ?? true,
    sync_titles: data.sync_titles ?? false,
    sync_descriptions: data.sync_descriptions ?? false,
    sync_images: data.sync_images ?? false,
    sync_prices: data.sync_prices ?? false,
    sync_dimensions: data.sync_dimensions ?? false,
    sync_sku_gtin: data.sync_sku_gtin ?? false,
    sync_variant_active: data.sync_variant_active ?? false,
    import_new_products: data.import_new_products ?? true,
    merge_by_sku: data.merge_by_sku ?? true,
    first_import_done: data.first_import_done ?? false,
  };
}

async function getValidToken(supabase: any): Promise<string> {
  const { data: settings, error } = await supabase
    .from("store_settings")
    .select("id, bling_client_id, bling_client_secret, bling_access_token, bling_refresh_token, bling_token_expires_at")
    .limit(1)
    .maybeSingle();

  if (error || !settings) throw new Error("Configurações não encontradas");
  if (!settings.bling_access_token) throw new Error("Bling não conectado");

  const expiresAt = settings.bling_token_expires_at ? new Date(settings.bling_token_expires_at) : new Date(0);
  const isExpired = expiresAt.getTime() - 300000 < Date.now();

  if (isExpired && settings.bling_refresh_token) {
    const basicAuth = btoa(`${settings.bling_client_id}:${settings.bling_client_secret}`);
    const tokenResponse = await fetchWithTimeout(BLING_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: settings.bling_refresh_token }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error("Token do Bling expirado");
    }

    await supabase.from("store_settings").update({
      bling_access_token: tokenData.access_token,
      bling_refresh_token: tokenData.refresh_token,
      bling_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString(),
    } as any).eq("id", settings.id);

    return tokenData.access_token;
  }

  return settings.bling_access_token;
}

function blingHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "application/json" };
}

// ─── HMAC Signature Validation ───
async function validateHmacSignature(bodyText: string, signatureHeader: string | null, clientSecret: string): Promise<boolean> {
  if (!signatureHeader || !clientSecret) return false;
  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) return false;
  const providedHash = signatureHeader.slice(expectedPrefix.length);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(clientSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyText));
  const computedHash = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
  return computedHash === providedHash;
}

// ─── Classify Bling V3 event ───
function classifyEvent(event: string): "stock" | "product" | "order" | "invoice" | "unknown" {
  const e = event.toLowerCase();
  if (e.includes("stock") || e.includes("estoque")) return "stock";
  if (e.includes("product") || e.includes("produto")) return "product";
  if (e.includes("order") || e.includes("pedido") || e.includes("venda")) return "order";
  if (e.includes("invoice") || e.includes("nf") || e.includes("consumer_invoice")) return "invoice";
  return "unknown";
}

// ─── Find variant by bling_variant_id OR by SKU fallback ───
async function findVariantByBlingIdOrSku(supabase: any, blingId: number, token?: string): Promise<{ variantId: string; productId: string } | null> {
  const { data: variant } = await supabase.from("product_variants").select("id, product_id").eq("bling_variant_id", blingId).maybeSingle();
  if (variant) return { variantId: variant.id, productId: variant.product_id };

  const { data: product } = await supabase.from("products").select("id").eq("bling_product_id", blingId).maybeSingle();
  if (product) {
    const { data: defaultVar } = await supabase.from("product_variants").select("id").eq("product_id", product.id).limit(1).maybeSingle();
    if (defaultVar) return { variantId: defaultVar.id, productId: product.id };
  }

  // SKU fallback
  if (token) {
    try {
      const res = await fetchWithTimeout(`${BLING_API_URL}/produtos/${blingId}`, { headers: blingHeaders(token) });
      if (res.ok) {
        const json = await res.json();
        const sku = json?.data?.codigo;
        if (sku) {
          const { data: skuVariant } = await supabase.from("product_variants").select("id, product_id").eq("sku", sku).maybeSingle();
          if (skuVariant) {
            await supabase.from("product_variants").update({ bling_variant_id: blingId }).eq("id", skuVariant.id);
            console.log(`[webhook] Linked variant ${skuVariant.id} to bling_id=${blingId} via SKU=${sku}`);
            return { variantId: skuVariant.id, productId: skuVariant.product_id };
          }
        }
      }
    } catch (err) {
      console.error(`[webhook] SKU fallback failed for ${blingId}:`, err);
    }
  }
  return null;
}

// ─── Update stock for a single Bling product ID + update sync status ───
async function updateStockForBlingId(supabase: any, blingProductId: number, newStock?: number, token?: string): Promise<string> {
  if (newStock === undefined && !token) return "no_data";

  if (newStock !== undefined) {
    const match = await findVariantByBlingIdOrSku(supabase, blingProductId, token);
    if (match) {
      // Check if parent product is inactive — skip entirely
      const { data: parentProduct } = await supabase.from("products").select("is_active").eq("id", match.productId).maybeSingle();
      if (parentProduct && parentProduct.is_active === false) {
        console.log(`[webhook] Skipping stock update for inactive product (bling_id=${blingProductId})`);
        return "skipped_inactive";
      }
      await supabase.from("product_variants").update({ stock_quantity: newStock }).eq("id", match.variantId);
      // P0.1 FIX: Always update sync status when stock is updated
      await supabase.from("products").update({
        bling_sync_status: "synced",
        bling_last_synced_at: new Date().toISOString(),
        bling_last_error: null,
      }).eq("id", match.productId);
      console.log(`[webhook] Stock updated: bling_id=${blingProductId} → ${newStock}`);
      return "updated";
    }
    console.log(`[webhook] No match found for bling_id=${blingProductId}`);
    return "not_found";
  }

  // Fetch stock from Bling API
  if (!token) return "no_token";
  try {
    const res = await fetchWithTimeout(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${blingProductId}`, { headers: blingHeaders(token) });
    const json = await res.json();
    const stock = json?.data?.[0]?.saldoVirtualTotal ?? null;
    if (stock !== null) {
      return await updateStockForBlingId(supabase, blingProductId, stock, token);
    }
    return "no_stock_data";
  } catch (err) {
    console.error(`[webhook] Error fetching stock for ${blingProductId}:`, err);
    return "error";
  }
}

// ─── Sync a single product — config-aware, never changes is_active ───
async function syncSingleProduct(supabase: any, blingProductId: number, token: string, config: BlingSyncConfig) {
  const headers = blingHeaders(token);

  try {
    const actualParentId = blingProductId;

    // Check if product exists and is active
    let existing = await supabase.from("products").select("id, is_active").eq("bling_product_id", actualParentId).maybeSingle().then((r: any) => r.data);

    if (!existing) {
      // Try to resolve via parent
      const res = await fetchWithTimeout(`${BLING_API_URL}/produtos/${blingProductId}`, { headers });
      if (!res.ok) { console.error(`[webhook] Product detail fetch failed for ${blingProductId}: ${res.status}`); return; }
      const json = await res.json();
      const detail = json?.data;
      if (!detail) return;

      const resolvedParentId = detail.produtoPai?.id || detail.idProdutoPai || blingProductId;
      const { data: parentExisting } = await supabase.from("products").select("id, is_active").eq("bling_product_id", resolvedParentId).maybeSingle();

      if (!parentExisting) { console.log(`[webhook] Product ${resolvedParentId} not in DB, skipping`); return; }
      if (parentExisting.is_active === false) { console.log(`[webhook] Product ${resolvedParentId} is inactive, skipping sync`); return; }

      // Config-aware update for resolved parent
      await syncProductFields(supabase, headers, parentExisting.id, resolvedParentId, detail, config);
      return;
    }

    // CRITICAL: Skip inactive products entirely
    if (existing.is_active === false) {
      console.log(`[webhook] Product ${actualParentId} is inactive, skipping sync`);
      return;
    }

    // Fetch detail
    const res = await fetchWithTimeout(`${BLING_API_URL}/produtos/${blingProductId}`, { headers });
    if (!res.ok) { console.error(`[webhook] Product detail fetch failed for ${blingProductId}: ${res.status}`); return; }
    const json = await res.json();
    const detail = json?.data;
    if (!detail) return;

    // Config-aware sync
    await syncProductFields(supabase, headers, existing.id, actualParentId, detail, config);
    console.log(`[webhook] Product ${actualParentId} synced successfully (config-aware)`);
  } catch (err: any) {
    console.error(`[webhook] Error syncing product ${blingProductId}:`, err.message);
  }
}

// ─── Sync product fields + stock based on config ───
async function syncProductFields(supabase: any, headers: any, productId: string, blingProductId: number, detail: any, config: BlingSyncConfig) {
  // Update config-enabled fields (NEVER touch is_active)
  const updateData = getConfigAwareUpdateFields(detail, config);
  await supabase.from("products").update({
    ...updateData,
    bling_last_synced_at: new Date().toISOString(),
    bling_sync_status: "synced",
    bling_last_error: null,
  }).eq("id", productId);

  // Sync images only if toggle is on
  if (config.sync_images && detail.midia?.imagens?.internas?.length) {
    await supabase.from("product_images").delete().eq("product_id", productId);
    const images = detail.midia.imagens.internas.map((img: any, idx: number) => ({
      product_id: productId, url: img.link, is_primary: idx === 0, display_order: idx, alt_text: detail.nome,
    }));
    await supabase.from("product_images").insert(images);
  }

  // Sync stock (always if sync_stock is on)
  if (config.sync_stock) {
    await syncStockOnly(supabase, headers, productId, blingProductId, detail);
  }
}

// ─── Sync ONLY stock for an existing product ───
async function syncStockOnly(supabase: any, headers: any, productId: string, blingProductId: number, detail: any) {
  if (detail.variacoes?.length) {
    const varIds = detail.variacoes.map((v: any) => v.id);
    const idsParam = varIds.map((id: number) => `idsProdutos[]=${id}`).join("&");
    await sleep(300);
    const stockRes = await fetchWithTimeout(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
    const stockJson = await stockRes.json();
    for (const s of (stockJson?.data || [])) {
      const varBlingId = s.produto?.id;
      const qty = s.saldoVirtualTotal ?? 0;
      if (varBlingId) {
        // Direct variant update (skip full updateStockForBlingId to avoid redundant product status update)
        const match = await findVariantByBlingIdOrSku(supabase, varBlingId);
        if (match) {
          await supabase.from("product_variants").update({ stock_quantity: qty }).eq("id", match.variantId);
        }
      }
    }
  } else {
    await sleep(300);
    const stockRes = await fetchWithTimeout(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${blingProductId}`, { headers });
    const stockJson = await stockRes.json();
    const qty = stockJson?.data?.[0]?.saldoVirtualTotal ?? 0;
    await supabase.from("product_variants").update({ stock_quantity: qty }).eq("product_id", productId);
  }
}

// ─── Batch stock sync (cron) — only active products, updates sync status ───
async function batchStockSync(supabase: any) {
  const runStarted = new Date().toISOString();
  
  // Check if sync_stock is enabled
  const config = await getSyncConfig(supabase);
  if (!config.sync_stock) {
    console.log("[cron] sync_stock is disabled, skipping batch sync");
    await supabase.from("bling_sync_runs").insert({
      started_at: runStarted, finished_at: new Date().toISOString(),
      trigger_type: "cron", processed_count: 0, updated_count: 0, errors_count: 0,
      error_details: [{ reason: "sync_stock disabled" }],
    });
    return { updated: 0, message: "sync_stock disabled" };
  }

  let token: string;
  try { token = await getValidToken(supabase); } catch (err: any) {
    console.error("[cron] Cannot get valid token:", err.message);
    await supabase.from("bling_sync_runs").insert({
      started_at: runStarted, finished_at: new Date().toISOString(),
      trigger_type: "cron", processed_count: 0, updated_count: 0, errors_count: 1,
      error_details: [{ reason: `Token error: ${err.message}` }],
    });
    return { error: err.message, updated: 0 };
  }
  const headers = blingHeaders(token);

  const { data: allVariants } = await supabase.from("product_variants").select("id, bling_variant_id, product_id, sku");
  const { data: products } = await supabase.from("products").select("id, bling_product_id, is_active").not("bling_product_id", "is", null);

  const activeProductIds = new Set<string>();
  const productBlingMap = new Map<string, number>();
  for (const p of (products || [])) {
    if (p.is_active === false) continue; // Skip inactive
    activeProductIds.add(p.id);
    productBlingMap.set(p.id, p.bling_product_id);
  }

  const blingIdToVariants = new Map<number, string[]>();
  // Track which product_id each bling_id belongs to for sync status update
  const blingIdToProductId = new Map<number, string>();
  
  for (const v of (allVariants || [])) {
    if (!activeProductIds.has(v.product_id)) continue;
    if (v.bling_variant_id) {
      if (!blingIdToVariants.has(v.bling_variant_id)) blingIdToVariants.set(v.bling_variant_id, []);
      blingIdToVariants.get(v.bling_variant_id)!.push(v.id);
      blingIdToProductId.set(v.bling_variant_id, v.product_id);
    } else {
      const parentBlingId = productBlingMap.get(v.product_id);
      if (parentBlingId) {
        if (!blingIdToVariants.has(parentBlingId)) blingIdToVariants.set(parentBlingId, []);
        blingIdToVariants.get(parentBlingId)!.push(v.id);
        blingIdToProductId.set(parentBlingId, v.product_id);
      }
    }
  }

  const allBlingIds = [...blingIdToVariants.keys()];
  if (allBlingIds.length === 0) {
    await supabase.from("bling_sync_runs").insert({
      started_at: runStarted, finished_at: new Date().toISOString(),
      trigger_type: "cron", processed_count: 0, updated_count: 0, errors_count: 0,
    });
    return { updated: 0 };
  }

  let updated = 0;
  let errorsCount = 0;
  const errorDetails: any[] = [];
  const updatedProductIds = new Set<string>();
  
  for (let i = 0; i < allBlingIds.length; i += 50) {
    const batch = allBlingIds.slice(i, i + 50);
    const idsParam = batch.map(id => `idsProdutos[]=${id}`).join("&");
    try {
      if (i > 0) await sleep(350);
      const res = await fetchWithTimeout(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
      const json = await res.json();
      if (!res.ok) {
        console.error(`[cron] Stock batch error:`, JSON.stringify(json));
        errorsCount++;
        errorDetails.push({ batch_start: i, error: JSON.stringify(json).substring(0, 200) });
        continue;
      }
      for (const stock of (json?.data || [])) {
        const blingId = stock.produto?.id;
        const qty = stock.saldoVirtualTotal ?? 0;
        if (!blingId) continue;
        const variantIds = blingIdToVariants.get(blingId);
        if (variantIds) {
          for (const vid of variantIds) {
            await supabase.from("product_variants").update({ stock_quantity: qty }).eq("id", vid);
          }
          updated += variantIds.length;
          // Track product for sync status update
          const pid = blingIdToProductId.get(blingId);
          if (pid) updatedProductIds.add(pid);
        }
      }
    } catch (err: any) {
      console.error(`[cron] Stock batch fetch error:`, err.message);
      errorsCount++;
      errorDetails.push({ batch_start: i, error: err.message });
    }
  }

  // P0.1/P0.2 FIX: Update sync status for ALL products that had stock updated
  const now = new Date().toISOString();
  const productIdsArr = [...updatedProductIds];
  for (let i = 0; i < productIdsArr.length; i += 100) {
    const batch = productIdsArr.slice(i, i + 100);
    await supabase.from("products").update({
      bling_sync_status: "synced",
      bling_last_synced_at: now,
      bling_last_error: null,
    }).in("id", batch);
  }

  // Log the run
  await supabase.from("bling_sync_runs").insert({
    started_at: runStarted,
    finished_at: now,
    trigger_type: "cron",
    processed_count: allBlingIds.length,
    updated_count: updated,
    errors_count: errorsCount,
    error_details: errorDetails,
  });

  console.log(`[cron] Stock sync complete: ${updated} updates, ${allBlingIds.length} Bling IDs checked, ${updatedProductIds.size} products marked synced (inactive skipped)`);
  return { updated, totalChecked: allBlingIds.length, productsSynced: updatedProductIds.size };
}

// ─── Idempotency ───
async function checkAndStoreEvent(supabase: any, eventId: string, eventType: string, blingProductId: number | null, payload: any): Promise<boolean> {
  if (!eventId) return true;
  const { error } = await supabase.from("bling_webhook_events").insert({
    event_id: eventId, event_type: eventType, bling_product_id: blingProductId, payload, status: "processing",
  });
  if (error) {
    if (error.code === "23505") { console.log(`[webhook] Duplicate event ${eventId}, skipping`); return false; }
    console.error(`[webhook] Error storing event:`, error.message);
  }
  return true;
}

async function markEventProcessed(supabase: any, eventId: string, error?: string) {
  if (!eventId) return;
  await supabase.from("bling_webhook_events").update({
    processed_at: new Date().toISOString(),
    status: error ? "failed" : "processed",
    last_error: error || null,
  }).eq("event_id", eventId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createSupabase();
    const url = new URL(req.url);
    const bodyText = await req.text();

    const isCronViaParam = url.searchParams.get("action") === "cron_stock_sync";
    let payload: any = {};
    try { payload = JSON.parse(bodyText); } catch (_) {}
    const isCronViaBody = payload?.action === "cron_stock_sync";

    if (isCronViaParam || isCronViaBody) {
      const cronSecret = Deno.env.get("BLING_CRON_SECRET");
      if (cronSecret) {
        const providedSecret = url.searchParams.get("secret") ?? payload?.secret ?? "";
        if (providedSecret !== cronSecret) {
          console.warn("[cron] Unauthorized: missing or invalid secret");
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      console.log("[cron] Starting periodic stock sync...");
      const result = await batchStockSync(supabase);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── HMAC Signature Validation ───
    const signatureHeader = req.headers.get("X-Bling-Signature-256") || req.headers.get("x-bling-signature-256");
    if (signatureHeader) {
      const { data: settings } = await supabase.from("store_settings").select("bling_client_secret").limit(1).maybeSingle();
      if (settings?.bling_client_secret) {
        const isValid = await validateHmacSignature(bodyText, signatureHeader, settings.bling_client_secret);
        if (!isValid) {
          console.error("[webhook] Invalid HMAC signature - rejecting");
          await logWebhook(supabase, {
            event_type: "signature_invalid",
            result: "error",
            reason: "Invalid HMAC signature",
            status_code: 401,
            processing_time_ms: Date.now() - startTime,
          });
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.log("[webhook] HMAC signature valid ✓");
      }
    }

    console.log("[webhook] Received:", JSON.stringify(payload).substring(0, 500));

    // Load sync config once for this request
    const config = await getSyncConfig(supabase);

    const evento = payload?.event || payload?.evento;
    const dados = payload?.data || payload?.dados;
    const eventId = payload?.eventId;
    const retorno = payload?.retorno;

    // ─── Handle legacy callback format ───
    if (retorno) {
      let token: string | null = null;
      try { token = await getValidToken(supabase); } catch (_) {}

      if (retorno.estoques && config.sync_stock) {
        const estoques = Array.isArray(retorno.estoques) ? retorno.estoques : [retorno.estoques];
        let updatedCount = 0;
        let skippedCount = 0;
        for (const estoque of estoques) {
          const est = estoque.estoque || estoque;
          const blingId = est.idProduto || est.produto?.id;
          const saldo = est.saldoVirtualTotal ?? est.quantidade ?? est.saldo;
          if (blingId) {
            const result = await updateStockForBlingId(supabase, blingId, saldo !== undefined ? saldo : undefined, token || undefined);
            if (result === "updated") updatedCount++;
            else skippedCount++;
          }
        }
        console.log(`[webhook] Processed ${estoques.length} stock callback(s): ${updatedCount} updated, ${skippedCount} skipped`);
        await logWebhook(supabase, {
          event_type: "legacy_stock",
          payload_meta: { count: estoques.length, updated: updatedCount, skipped: skippedCount },
          result: updatedCount > 0 ? "updated" : "skipped",
          reason: `${updatedCount} updated, ${skippedCount} skipped`,
          processing_time_ms: Date.now() - startTime,
        });
      } else if (retorno.estoques && !config.sync_stock) {
        console.log("[webhook] sync_stock disabled, ignoring stock callback");
        await logWebhook(supabase, {
          event_type: "legacy_stock",
          result: "skipped",
          reason: "sync_stock disabled",
          processing_time_ms: Date.now() - startTime,
        });
      }

      if (retorno.produtos && token) {
        const produtos = Array.isArray(retorno.produtos) ? retorno.produtos : [retorno.produtos];
        for (const prod of produtos) {
          const p = prod.produto || prod;
          const blingId = p.id || p.idProduto;
          if (blingId) await syncSingleProduct(supabase, blingId, token, config);
        }
        console.log(`[webhook] Processed ${produtos.length} product callback(s)`);
        await logWebhook(supabase, {
          event_type: "legacy_product",
          payload_meta: { count: produtos.length },
          result: "updated",
          processing_time_ms: Date.now() - startTime,
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Handle V3 event format ───
    if (!evento) {
      await logWebhook(supabase, {
        event_type: "no_event",
        result: "skipped",
        reason: "No event in payload",
        processing_time_ms: Date.now() - startTime,
      });
      return new Response(JSON.stringify({ ok: true, message: "No event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventType = classifyEvent(evento);
    console.log(`[webhook] Event: ${evento} → classified as: ${eventType}`);

    const blingProductId = dados?.produto?.id || dados?.id || dados?.idProduto || null;
    const shouldProcess = await checkAndStoreEvent(supabase, eventId, evento, blingProductId, payload);
    if (!shouldProcess) {
      await logWebhook(supabase, {
        event_type: evento,
        event_id: eventId,
        bling_product_id: blingProductId,
        result: "duplicate",
        reason: "Duplicate event ID",
        processing_time_ms: Date.now() - startTime,
      });
      return new Response(JSON.stringify({ ok: true, message: "Duplicate event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let token: string | null = null;
    try { token = await getValidToken(supabase); } catch (_) {}
    let processingError: string | undefined;
    let webhookResult = "processed";
    let webhookReason = "";

    try {
      switch (eventType) {
        case "stock": {
          if (!config.sync_stock) {
            console.log("[webhook] sync_stock disabled, ignoring stock event");
            webhookResult = "skipped";
            webhookReason = "sync_stock disabled";
            break;
          }
          const stockBlingId = dados?.produto?.id || dados?.idProduto;
          const saldoVirtual = dados?.saldoVirtualTotal;
          if (stockBlingId) {
            console.log(`[webhook] Stock event for bling_id=${stockBlingId}, saldoVirtual=${saldoVirtual}`);
            const result = await updateStockForBlingId(supabase, stockBlingId, saldoVirtual !== undefined ? saldoVirtual : undefined, token || undefined);
            webhookResult = result;
            webhookReason = `Stock ${result} for bling_id=${stockBlingId}`;
          } else {
            webhookResult = "skipped";
            webhookReason = "No bling product ID in stock event";
          }
          break;
        }

        case "product": {
          const prodBlingId = dados?.id || dados?.idProduto || dados?.produto?.id;
          const eventAction = (evento || "").toLowerCase();

          if (prodBlingId) {
            // Handle product deletion — this is the ONLY case where we touch is_active
            if (eventAction.includes('deleted') || eventAction.includes('excluido') || eventAction.includes('removido')) {
              console.log(`[webhook] Product DELETED event for bling_id=${prodBlingId}`);
              const { data: delProduct } = await supabase.from("products").select("id").eq("bling_product_id", prodBlingId).maybeSingle();
              if (delProduct) {
                await supabase.from("products").update({ is_active: false }).eq("id", delProduct.id);
                await supabase.from("product_variants").update({ is_active: false }).eq("product_id", delProduct.id);
                console.log(`[webhook] Product ${prodBlingId} deactivated (deleted in Bling)`);
                webhookResult = "updated";
                webhookReason = `Product deactivated (deleted in Bling)`;
              } else {
                webhookResult = "not_found";
                webhookReason = `Product bling_id=${prodBlingId} not in DB`;
              }
            } else if (token) {
              // Creation/update — config-aware, never changes is_active
              console.log(`[webhook] Product event for bling_id=${prodBlingId}`);
              await syncSingleProduct(supabase, prodBlingId, token, config);
              webhookResult = "updated";
              webhookReason = `Product synced`;
            }
          } else {
            webhookResult = "skipped";
            webhookReason = "No product ID in payload";
          }
          break;
        }

        case "order":
        case "invoice":
          console.log(`[webhook] ${eventType} event acknowledged: ${evento}`);
          webhookResult = "skipped";
          webhookReason = `${eventType} event acknowledged (not processed)`;
          break;

        default:
          console.log(`[webhook] Unknown event type: ${evento}`);
          webhookResult = "skipped";
          webhookReason = `Unknown event type: ${evento}`;
      }
    } catch (err: any) {
      processingError = err.message;
      webhookResult = "error";
      webhookReason = err.message;
      console.error(`[webhook] Processing error for ${eventId}:`, err.message);
    }

    await markEventProcessed(supabase, eventId, processingError);
    
    // Log to bling_webhook_logs
    await logWebhook(supabase, {
      event_type: evento,
      event_id: eventId,
      bling_product_id: blingProductId,
      payload_meta: { event: evento, type: eventType, product_id: blingProductId },
      result: webhookResult,
      reason: webhookReason,
      status_code: processingError ? 500 : 200,
      processing_time_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ ok: true, evento, eventType, result: webhookResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[webhook] Error:", error);
    // Try to log the fatal error
    try {
      const supabase = createSupabase();
      await logWebhook(supabase, {
        event_type: "fatal_error",
        result: "error",
        reason: error.message,
        status_code: 500,
        processing_time_ms: Date.now() - startTime,
      });
    } catch (_) {}
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
