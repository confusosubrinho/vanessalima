import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSyncableFields } from "../_shared/bling-sync-fields.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_API_URL = "https://api.bling.com.br/Api/v3";
const BLING_TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";

function createSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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
    const tokenResponse = await fetch(BLING_TOKEN_URL, {
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
  
  // Format: "sha256=<hex>"
  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) return false;
  const providedHash = signatureHeader.slice(expectedPrefix.length);
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyText));
  const computedHash = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  
  return computedHash === providedHash;
}

// ─── Classify Bling V3 event into action type ───
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
  // Try bling_variant_id first (fastest)
  const { data: variant } = await supabase
    .from("product_variants")
    .select("id, product_id")
    .eq("bling_variant_id", blingId)
    .maybeSingle();

  if (variant) return { variantId: variant.id, productId: variant.product_id };

  // Try as parent product (for simple products)
  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("bling_product_id", blingId)
    .maybeSingle();

  if (product) {
    // Get default variant for this product
    const { data: defaultVar } = await supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", product.id)
      .limit(1)
      .maybeSingle();

    if (defaultVar) return { variantId: defaultVar.id, productId: product.id };
  }

  // SKU fallback: fetch product from Bling API to get SKU, then match locally
  if (token) {
    try {
      const headers = blingHeaders(token);
      const res = await fetch(`${BLING_API_URL}/produtos/${blingId}`, { headers });
      if (res.ok) {
        const json = await res.json();
        const detail = json?.data;
        const sku = detail?.codigo;
        
        if (sku) {
          const { data: skuVariant } = await supabase
            .from("product_variants")
            .select("id, product_id")
            .eq("sku", sku)
            .maybeSingle();

          if (skuVariant) {
            // Link the variant for future lookups
            await supabase
              .from("product_variants")
              .update({ bling_variant_id: blingId })
              .eq("id", skuVariant.id);
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

// ─── Update stock for a single Bling product ID ───
async function updateStockForBlingId(supabase: any, blingProductId: number, newStock?: number, token?: string) {
  if (newStock === undefined && !token) return;

  if (newStock !== undefined) {
    const match = await findVariantByBlingIdOrSku(supabase, blingProductId, token);
    
    if (match) {
      await supabase
        .from("product_variants")
        .update({ stock_quantity: newStock })
        .eq("id", match.variantId);
      console.log(`[webhook] Stock updated: bling_id=${blingProductId} → ${newStock}`);
      
      // Auto-activate parent if stock > 0
      if (newStock > 0) {
        await supabase.from("products").update({ is_active: true }).eq("id", match.productId);
      }
      return;
    }

    console.log(`[webhook] No match found for bling_id=${blingProductId}`);
    return;
  }

  // If no stock value provided, fetch from Bling API
  if (!token) return;
  
  try {
    const headers = blingHeaders(token);
    const res = await fetch(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${blingProductId}`, { headers });
    const json = await res.json();
    const stock = json?.data?.[0]?.saldoVirtualTotal ?? null;
    
    if (stock !== null) {
      await updateStockForBlingId(supabase, blingProductId, stock, token);
    }
  } catch (err) {
    console.error(`[webhook] Error fetching stock for ${blingProductId}:`, err);
  }
}

// ─── Sync a single product from Bling (lightweight, for webhook) ───
async function syncSingleProduct(supabase: any, blingProductId: number, token: string) {
  const headers = blingHeaders(token);
  
  try {
    const res = await fetch(`${BLING_API_URL}/produtos/${blingProductId}`, { headers });
    if (!res.ok) {
      console.error(`[webhook] Product detail fetch failed for ${blingProductId}: ${res.status}`);
      return;
    }
    const json = await res.json();
    const detail = json?.data;
    if (!detail) return;

    const actualParentId = detail.produtoPai?.id || detail.idProdutoPai;
    const targetBlingId = actualParentId || blingProductId;

    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("bling_product_id", targetBlingId)
      .maybeSingle();

    if (!existing) {
      console.log(`[webhook] Product ${targetBlingId} not in DB, skipping`);
      return;
    }

    // Update ONLY syncable fields (shared definition — preserves name, description, images)
    await supabase.from("products").update(getSyncableFields(detail)).eq("id", existing.id);

    // Update stock for all variants of this product
    if (detail.variacoes?.length) {
      const varIds = detail.variacoes.map((v: any) => v.id);
      const idsParam = varIds.map((id: number) => `idsProdutos[]=${id}`).join("&");
      await sleep(300);
      const stockRes = await fetch(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
      const stockJson = await stockRes.json();
      
      for (const s of (stockJson?.data || [])) {
        const varBlingId = s.produto?.id;
        const qty = s.saldoVirtualTotal ?? 0;
        if (varBlingId) {
          await updateStockForBlingId(supabase, varBlingId, qty, token);
        }
      }
    } else {
      await sleep(300);
      const stockRes = await fetch(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${targetBlingId}`, { headers });
      const stockJson = await stockRes.json();
      const qty = stockJson?.data?.[0]?.saldoVirtualTotal ?? 0;
      await supabase.from("product_variants").update({ stock_quantity: qty }).eq("product_id", existing.id);
    }

    // Auto-activate product if any active variant has stock > 0
    const { data: stockedVariants } = await supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", existing.id)
      .eq("is_active", true)
      .gt("stock_quantity", 0)
      .limit(1);

    if (stockedVariants && stockedVariants.length > 0) {
      await supabase.from("products").update({ is_active: true }).eq("id", existing.id);
    }

    console.log(`[webhook] Product ${targetBlingId} synced successfully`);
  } catch (err: any) {
    console.error(`[webhook] Error syncing product ${blingProductId}:`, err.message);
  }
}

// ─── Batch stock sync (called by cron every 5 min) ───
async function batchStockSync(supabase: any) {
  let token: string;
  try {
    token = await getValidToken(supabase);
  } catch (err: any) {
    console.error("[cron] Cannot get valid token:", err.message);
    return { error: err.message, updated: 0 };
  }
  
  const headers = blingHeaders(token);

  // Get ALL variants (both with and without bling_variant_id)
  const { data: allVariants } = await supabase
    .from("product_variants")
    .select("id, bling_variant_id, product_id, sku");

  // Get all products with bling_product_id
  const { data: products } = await supabase
    .from("products")
    .select("id, bling_product_id")
    .not("bling_product_id", "is", null);

  // Build a map: product_id -> bling_product_id
  const productBlingMap = new Map<string, number>();
  for (const p of (products || [])) {
    productBlingMap.set(p.id, p.bling_product_id);
  }

  // Collect Bling IDs to query stock for
  const blingIdToVariants = new Map<number, string[]>(); // blingId -> [variantId1, variantId2]
  
  for (const v of (allVariants || [])) {
    if (v.bling_variant_id) {
      // Variant has its own Bling ID
      if (!blingIdToVariants.has(v.bling_variant_id)) {
        blingIdToVariants.set(v.bling_variant_id, []);
      }
      blingIdToVariants.get(v.bling_variant_id)!.push(v.id);
    } else {
      // Variant without bling_variant_id - use parent product's bling_product_id
      const parentBlingId = productBlingMap.get(v.product_id);
      if (parentBlingId) {
        if (!blingIdToVariants.has(parentBlingId)) {
          blingIdToVariants.set(parentBlingId, []);
        }
        blingIdToVariants.get(parentBlingId)!.push(v.id);
      }
    }
  }

  const allBlingIds = [...blingIdToVariants.keys()];
  if (allBlingIds.length === 0) return { updated: 0 };

  let updated = 0;

  // Fetch stock in batches of 50
  for (let i = 0; i < allBlingIds.length; i += 50) {
    const batch = allBlingIds.slice(i, i + 50);
    const idsParam = batch.map(id => `idsProdutos[]=${id}`).join("&");

    try {
      if (i > 0) await sleep(350);
      const res = await fetch(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
      const json = await res.json();

      if (!res.ok) {
        console.error(`[cron] Stock batch error:`, JSON.stringify(json));
        continue;
      }

      for (const stock of (json?.data || [])) {
        const blingId = stock.produto?.id;
        const qty = stock.saldoVirtualTotal ?? 0;
        if (!blingId) continue;

        const variantIds = blingIdToVariants.get(blingId);
        if (variantIds) {
          for (const vid of variantIds) {
            await supabase
              .from("product_variants")
              .update({ stock_quantity: qty })
              .eq("id", vid);
          }
          updated += variantIds.length;
        }
      }
    } catch (err: any) {
      console.error(`[cron] Stock batch fetch error:`, err.message);
    }
  }

  console.log(`[cron] Stock sync complete: ${updated} updates, ${allBlingIds.length} Bling IDs checked`);
  return { updated, totalChecked: allBlingIds.length };
}

// ─── Idempotency check ───
async function checkAndStoreEvent(supabase: any, eventId: string, eventType: string, blingProductId: number | null, payload: any): Promise<boolean> {
  if (!eventId) return true; // No event ID = allow processing (legacy format)
  
  // Try to insert (unique constraint on event_id will prevent duplicates)
  const { error } = await supabase
    .from("bling_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      bling_product_id: blingProductId,
      payload,
      status: "processing",
    });

  if (error) {
    if (error.code === "23505") { // unique_violation
      console.log(`[webhook] Duplicate event ${eventId}, skipping`);
      return false;
    }
    console.error(`[webhook] Error storing event:`, error.message);
    // Allow processing even if storage fails
  }
  
  return true;
}

async function markEventProcessed(supabase: any, eventId: string, error?: string) {
  if (!eventId) return;
  
  await supabase
    .from("bling_webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      status: error ? "failed" : "processed",
      last_error: error || null,
    })
    .eq("event_id", eventId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabase();
    const url = new URL(req.url);
    
    // Read body as text first (needed for HMAC validation)
    const bodyText = await req.text();
    
    const isCronViaParam = url.searchParams.get("action") === "cron_stock_sync";
    
    let payload: any = {};
    try { payload = JSON.parse(bodyText); } catch (_) {}
    
    const isCronViaBody = payload?.action === "cron_stock_sync";
    
    if (isCronViaParam || isCronViaBody) {
      console.log("[cron] Starting periodic stock sync...");
      const result = await batchStockSync(supabase);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── HMAC Signature Validation ───
    const signatureHeader = req.headers.get("X-Bling-Signature-256") || req.headers.get("x-bling-signature-256");
    if (signatureHeader) {
      const { data: settings } = await supabase
        .from("store_settings")
        .select("bling_client_secret")
        .limit(1)
        .maybeSingle();
      
      if (settings?.bling_client_secret) {
        const isValid = await validateHmacSignature(bodyText, signatureHeader, settings.bling_client_secret);
        if (!isValid) {
          console.error("[webhook] Invalid HMAC signature - rejecting");
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.log("[webhook] HMAC signature valid ✓");
      }
    }

    console.log("[webhook] Received:", JSON.stringify(payload).substring(0, 500));

    const evento = payload?.event || payload?.evento;
    const dados = payload?.data || payload?.dados;
    const eventId = payload?.eventId;
    const retorno = payload?.retorno;

    // ─── Handle legacy callback format ───
    if (retorno) {
      let token: string | null = null;
      try { token = await getValidToken(supabase); } catch (_) {}

      if (retorno.estoques) {
        const estoques = Array.isArray(retorno.estoques) ? retorno.estoques : [retorno.estoques];
        for (const estoque of estoques) {
          const est = estoque.estoque || estoque;
          const blingId = est.idProduto || est.produto?.id;
          const saldo = est.saldoVirtualTotal ?? est.quantidade ?? est.saldo;
          if (blingId) {
            await updateStockForBlingId(supabase, blingId, saldo !== undefined ? saldo : undefined, token || undefined);
          }
        }
        console.log(`[webhook] Processed ${estoques.length} stock callback(s)`);
      }

      if (retorno.produtos) {
        const produtos = Array.isArray(retorno.produtos) ? retorno.produtos : [retorno.produtos];
        if (token) {
          for (const prod of produtos) {
            const p = prod.produto || prod;
            const blingId = p.id || p.idProduto;
            if (blingId) await syncSingleProduct(supabase, blingId, token);
          }
          console.log(`[webhook] Processed ${produtos.length} product callback(s)`);
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Handle V3 event format ───
    if (!evento) {
      return new Response(JSON.stringify({ ok: true, message: "No event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventType = classifyEvent(evento);
    console.log(`[webhook] Event: ${evento} → classified as: ${eventType}`);

    // ─── Idempotency check ───
    const blingProductId = dados?.produto?.id || dados?.id || dados?.idProduto || null;
    const shouldProcess = await checkAndStoreEvent(supabase, eventId, evento, blingProductId, payload);
    if (!shouldProcess) {
      return new Response(JSON.stringify({ ok: true, message: "Duplicate event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let token: string | null = null;
    try { token = await getValidToken(supabase); } catch (_) {}
    let processingError: string | undefined;

    try {
      switch (eventType) {
        case "stock": {
          const stockBlingId = dados?.produto?.id || dados?.idProduto;
          const saldoVirtual = dados?.saldoVirtualTotal;
          
          if (stockBlingId) {
            console.log(`[webhook] Stock event for bling_id=${stockBlingId}, saldoVirtual=${saldoVirtual}`);
            await updateStockForBlingId(
              supabase, 
              stockBlingId, 
              saldoVirtual !== undefined ? saldoVirtual : undefined, 
              token || undefined
            );
          }
          break;
        }

        case "product": {
          const prodBlingId = dados?.id || dados?.idProduto || dados?.produto?.id;
          const eventAction = (evento || "").toLowerCase();
          
          if (prodBlingId) {
            // Handle product deletion events
            if (eventAction.includes('deleted') || eventAction.includes('excluido') || eventAction.includes('removido')) {
              console.log(`[webhook] Product DELETED event for bling_id=${prodBlingId}`);
              
              // Deactivate product instead of deleting (preserves order history)
              const { data: delProduct } = await supabase
                .from("products")
                .select("id")
                .eq("bling_product_id", prodBlingId)
                .maybeSingle();
              
              if (delProduct) {
                await supabase.from("products").update({ is_active: false }).eq("id", delProduct.id);
                await supabase.from("product_variants").update({ is_active: false }).eq("product_id", delProduct.id);
                console.log(`[webhook] Product ${prodBlingId} deactivated (deleted in Bling)`);
              }
            } else if (token) {
              // Creation/update events
              console.log(`[webhook] Product event for bling_id=${prodBlingId}`);
              await syncSingleProduct(supabase, prodBlingId, token);
            }
          }
          break;
        }

        case "order":
        case "invoice":
          console.log(`[webhook] ${eventType} event acknowledged: ${evento}`);
          break;

        default:
          console.log(`[webhook] Unknown event type: ${evento}`);
      }
    } catch (err: any) {
      processingError = err.message;
      console.error(`[webhook] Processing error for ${eventId}:`, err.message);
    }

    // Mark event as processed
    await markEventProcessed(supabase, eventId, processingError);

    return new Response(
      JSON.stringify({ ok: true, evento, eventType }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
