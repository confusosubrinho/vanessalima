import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_API_URL = "https://bling.com.br/Api/v3";
const BLING_TOKEN_URL = "https://bling.com.br/Api/v3/oauth/token";

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

// ─── Update stock for a single Bling product ID ───
async function updateStockForBlingId(supabase: any, blingProductId: number, newStock?: number, token?: string) {
  // If stock value provided directly, use it
  if (newStock !== undefined) {
    // Update as product
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("bling_product_id", blingProductId)
      .maybeSingle();

    if (product) {
      await supabase
        .from("product_variants")
        .update({ stock_quantity: newStock })
        .eq("product_id", product.id);
      console.log(`[webhook] Stock updated for product bling_id=${blingProductId}: ${newStock}`);
    }

    // Update as variant
    const { data: variant } = await supabase
      .from("product_variants")
      .select("id")
      .eq("bling_variant_id", blingProductId)
      .maybeSingle();

    if (variant) {
      await supabase
        .from("product_variants")
        .update({ stock_quantity: newStock })
        .eq("id", variant.id);
      console.log(`[webhook] Variant stock updated for bling_variant_id=${blingProductId}: ${newStock}`);
    }
    return;
  }

  // If no stock value, fetch from Bling API
  if (!token) return;
  
  try {
    const headers = blingHeaders(token);
    const res = await fetch(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${blingProductId}`, { headers });
    const json = await res.json();
    const stock = json?.data?.[0]?.saldoVirtualTotal ?? null;
    
    if (stock !== null) {
      await updateStockForBlingId(supabase, blingProductId, stock);
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

    // Check if product is a variation (has produtoPai)
    const actualParentId = detail.produtoPai?.id || detail.idProdutoPai;
    const targetBlingId = actualParentId || blingProductId;

    // Find existing product
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("bling_product_id", targetBlingId)
      .maybeSingle();

    if (!existing) {
      console.log(`[webhook] Product ${targetBlingId} not in DB, skipping (will be imported on next full sync)`);
      return;
    }

    // Update basic product info
    const basePrice = detail.preco || 0;
    const salePrice = detail.precoPromocional && detail.precoPromocional < basePrice ? detail.precoPromocional : null;
    
    // Do NOT overwrite name, slug or description — they are editable in the dashboard
    await supabase.from("products").update({
      base_price: basePrice,
      sale_price: salePrice,
      is_active: detail.situacao === "A",
      weight: detail.pesoBruto || detail.pesoLiquido || undefined,
    }).eq("id", existing.id);

    // Update stock for all variants of this product
    if (detail.variacoes?.length) {
      const varIds = detail.variacoes.map((v: any) => v.id);
      // Batch fetch stock
      const idsParam = varIds.map((id: number) => `idsProdutos[]=${id}`).join("&");
      await sleep(300);
      const stockRes = await fetch(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
      const stockJson = await stockRes.json();
      
      for (const s of (stockJson?.data || [])) {
        const varBlingId = s.produto?.id;
        const qty = s.saldoVirtualTotal ?? 0;
        if (varBlingId) {
          const { data: variant } = await supabase
            .from("product_variants")
            .select("id")
            .eq("bling_variant_id", varBlingId)
            .maybeSingle();
          if (variant) {
            await supabase.from("product_variants").update({ stock_quantity: qty }).eq("id", variant.id);
          }
        }
      }
    } else {
      // Simple product - update default variant stock
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

// ─── Batch stock sync (called by cron) ───
async function batchStockSync(supabase: any) {
  let token: string;
  try {
    token = await getValidToken(supabase);
  } catch (err: any) {
    console.error("[cron] Cannot get valid token:", err.message);
    return { error: err.message, updated: 0 };
  }
  
  const headers = blingHeaders(token);

  // Get all products with bling_product_id
  const { data: products } = await supabase
    .from("products")
    .select("id, bling_product_id")
    .not("bling_product_id", "is", null);

  if (!products?.length) return { updated: 0 };

  // Also get all variants with bling_variant_id
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, bling_variant_id, product_id")
    .not("bling_variant_id", "is", null);

  // Collect ALL bling IDs we need stock for (products + variants)
  const allBlingIds: number[] = [];
  const productBlingIds = products.map((p: any) => p.bling_product_id);
  const variantBlingIds = (variants || []).map((v: any) => v.bling_variant_id);
  
  // Deduplicate
  const uniqueIds = new Set([...productBlingIds, ...variantBlingIds]);
  allBlingIds.push(...uniqueIds);

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

        // Update as product (all variants of this product)
        const product = products.find((p: any) => p.bling_product_id === blingId);
        if (product) {
          // Only update variants that DON'T have their own bling_variant_id
          await supabase
            .from("product_variants")
            .update({ stock_quantity: qty })
            .eq("product_id", product.id)
            .is("bling_variant_id", null);
          updated++;
        }

        // Update as specific variant
        const variant = (variants || []).find((v: any) => v.bling_variant_id === blingId);
        if (variant) {
          await supabase
            .from("product_variants")
            .update({ stock_quantity: qty })
            .eq("id", variant.id);
          updated++;
        }
      }
    } catch (err: any) {
      console.error(`[cron] Stock batch fetch error:`, err.message);
    }
  }

  console.log(`[cron] Stock sync complete: ${updated} updates, ${allBlingIds.length} Bling IDs checked`);
  return { updated, totalChecked: allBlingIds.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabase();
    
    // Check if this is a cron-triggered stock sync (via query param or body)
    const url = new URL(req.url);
    const isCronViaParam = url.searchParams.get("action") === "cron_stock_sync";
    
    // Clone request to read body (since body can only be read once)
    const bodyText = await req.text();
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

    console.log("[webhook] Received:", JSON.stringify(payload));

    // Bling V3 webhook/callback payload structure:
    // Callbacks: { retorno: { estoques: [...] } } or { retorno: { produtos: [...] } }
    // OR newer format: { evento: string, dados: { ... } }
    // OR direct array: { data: { ... } }
    
    const evento = payload?.evento || payload?.event;
    const dados = payload?.dados || payload?.data;
    const retorno = payload?.retorno;

    // ─── Handle Bling V3 Callback format (retorno.estoques/produtos) ───
    if (retorno) {
      let token: string | null = null;
      try { token = await getValidToken(supabase); } catch (_) {}

      // Stock callbacks
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

      // Product callbacks
      if (retorno.produtos) {
        const produtos = Array.isArray(retorno.produtos) ? retorno.produtos : [retorno.produtos];
        if (token) {
          for (const prod of produtos) {
            const p = prod.produto || prod;
            const blingId = p.id || p.idProduto;
            if (blingId) {
              await syncSingleProduct(supabase, blingId, token);
            }
          }
          console.log(`[webhook] Processed ${produtos.length} product callback(s)`);
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Handle evento/dados format ───
    if (!evento) {
      return new Response(JSON.stringify({ ok: true, message: "No event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let token: string | null = null;
    try { token = await getValidToken(supabase); } catch (_) {}

    // Handle stock change events
    if (evento === "estoque" || evento.includes("estoque")) {
      const blingProductId = dados?.idProduto || dados?.produto?.id;
      const novoSaldo = dados?.saldoVirtualTotal ?? dados?.quantidade;
      
      if (blingProductId) {
        await updateStockForBlingId(supabase, blingProductId, novoSaldo !== undefined ? novoSaldo : undefined, token || undefined);
      }
    }

    // Handle product update/create events - sync the individual product
    if (evento === "produto.alteracao" || evento === "produto.inclusao" || evento.includes("produto")) {
      const blingProductId = dados?.id || dados?.idProduto || dados?.produto?.id;
      if (blingProductId && token) {
        await syncSingleProduct(supabase, blingProductId, token);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, evento }),
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
