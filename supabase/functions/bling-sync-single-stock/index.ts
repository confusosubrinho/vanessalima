import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BLING_API_URL = "https://api.bling.com.br/Api/v3";
const BLING_TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";

function createSupabase(authHeader?: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getValidToken(supabase: any): Promise<string> {
  const { data: settings, error } = await supabase
    .from("store_settings")
    .select("id, bling_client_id, bling_client_secret, bling_access_token, bling_refresh_token, bling_token_expires_at")
    .limit(1).maybeSingle();
  if (error || !settings) throw new Error("Configurações não encontradas");
  if (!settings.bling_access_token) throw new Error("Bling não conectado. Autorize primeiro nas Integrações.");

  const expiresAt = settings.bling_token_expires_at ? new Date(settings.bling_token_expires_at) : new Date(0);
  if (expiresAt.getTime() - 300000 < Date.now() && settings.bling_refresh_token) {
    const basicAuth = btoa(`${settings.bling_client_id}:${settings.bling_client_secret}`);
    const tokenResponse = await fetch(BLING_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicAuth}`, Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: settings.bling_refresh_token }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error("Token do Bling expirado. Reconecte o Bling.");
    await supabase.from("store_settings").update({
      bling_access_token: tokenData.access_token,
      bling_refresh_token: tokenData.refresh_token,
      bling_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 21600) * 1000).toISOString(),
    } as any).eq("id", settings.id);
    return tokenData.access_token;
  }
  return settings.bling_access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Não autorizado");

    const supabase = createSupabase();

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) throw new Error("Acesso negado: apenas administradores");

    const { product_id } = await req.json();
    if (!product_id) throw new Error("product_id é obrigatório");

    // 1. Fetch product with variants
    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("id, name, sku, is_active, bling_product_id, bling_sync_status")
      .eq("id", product_id)
      .maybeSingle();
    if (prodErr || !product) throw new Error("Produto não encontrado");

    // 2. Validate: must be active
    if (!product.is_active) {
      return new Response(JSON.stringify({
        success: false, error: "produto_inativo",
        message: "Produto inativo não pode ser sincronizado com o Bling",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Check bling_sync_config
    const { data: syncConfig } = await supabase
      .from("bling_sync_config")
      .select("sync_stock")
      .limit(1)
      .maybeSingle();
    if (syncConfig && !syncConfig.sync_stock) {
      return new Response(JSON.stringify({
        success: false, error: "sync_disabled",
        message: "Sincronização de estoque está desabilitada nas configurações",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. Resolve bling_product_id (or find by SKU)
    let blingProductId = product.bling_product_id;

    if (!blingProductId) {
      // Try to find by SKU in Bling
      if (!product.sku) {
        // Also check variant SKUs
        const { data: variants } = await supabase
          .from("product_variants")
          .select("sku")
          .eq("product_id", product_id)
          .not("sku", "is", null);
        
        const firstSku = variants?.[0]?.sku;
        if (!firstSku) {
          await supabase.from("products").update({
            bling_sync_status: "error",
            bling_last_error: "Produto sem bling_product_id e sem SKU para buscar no Bling",
          }).eq("id", product_id);
          return new Response(JSON.stringify({
            success: false, error: "no_bling_id",
            message: "Produto sem vínculo com o Bling e sem SKU para busca",
          }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    const token = await getValidToken(supabase);
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "application/json" };

    // If no bling_product_id, search by SKU
    if (!blingProductId) {
      const searchSku = product.sku;
      const searchRes = await fetch(`${BLING_API_URL}/produtos?codigo=${encodeURIComponent(searchSku)}`, { headers });
      const searchJson = await searchRes.json();
      const found = searchJson?.data?.[0];
      if (!found) {
        await supabase.from("products").update({
          bling_sync_status: "error",
          bling_last_error: `Produto com SKU "${searchSku}" não encontrado no Bling`,
        }).eq("id", product_id);
        return new Response(JSON.stringify({
          success: false, error: "not_found_in_bling",
          message: `SKU "${searchSku}" não encontrado no Bling`,
        }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      blingProductId = found.id;
      // Link the bling_product_id for future syncs
      await supabase.from("products").update({ bling_product_id: blingProductId }).eq("id", product_id);
    }

    // 5. Fetch product detail from Bling to get variations
    const detailRes = await fetch(`${BLING_API_URL}/produtos/${blingProductId}`, { headers });
    const detailJson = await detailRes.json();
    const detail = detailJson?.data;
    if (!detail) throw new Error("Não foi possível obter detalhes do produto no Bling");

    // 6. Fetch stock from Bling
    const { data: localVariants } = await supabase
      .from("product_variants")
      .select("id, sku, bling_variant_id, stock_quantity")
      .eq("product_id", product_id);

    let updatedVariants = 0;

    // Collect all bling IDs to fetch stock in batch
    const blingIds: number[] = [];
    
    // Map: bling_variant_id -> local variant
    const variantByBlingId = new Map<number, any>();
    const variantBySku = new Map<string, any>();
    
    for (const v of (localVariants || [])) {
      if (v.bling_variant_id) {
        variantByBlingId.set(v.bling_variant_id, v);
        blingIds.push(v.bling_variant_id);
      }
      if (v.sku) variantBySku.set(v.sku, v);
    }

    // Also add parent product ID for stock query
    blingIds.push(blingProductId);

    // Add variation IDs from Bling detail
    if (detail.variacoes?.length) {
      for (const bv of detail.variacoes) {
        if (!variantByBlingId.has(bv.id)) blingIds.push(bv.id);
      }
    }

    // Fetch stock balances
    const uniqueIds = [...new Set(blingIds)];
    const stockMap = new Map<number, number>();
    
    for (let i = 0; i < uniqueIds.length; i += 50) {
      const batch = uniqueIds.slice(i, i + 50);
      const idsParam = batch.map(id => `idsProdutos[]=${id}`).join("&");
      try {
        const stockRes = await fetch(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
        const stockJson = await stockRes.json();
        for (const s of (stockJson?.data || [])) {
          stockMap.set(s.produto?.id, s.saldoVirtualTotal ?? 0);
        }
      } catch (_) { /* ignore stock fetch errors for individual batches */ }
    }

    // 7. Update local variants with Bling stock
    if (detail.variacoes?.length) {
      for (const bv of detail.variacoes) {
        const stock = stockMap.get(bv.id) ?? 0;
        const localVar = variantByBlingId.get(bv.id);
        
        if (localVar) {
          if (localVar.stock_quantity !== stock) {
            await supabase.from("product_variants").update({ stock_quantity: stock }).eq("id", localVar.id);
            updatedVariants++;
          }
        } else {
          // Try SKU match
          const sku = bv.codigo || null;
          if (sku) {
            const skuVar = variantBySku.get(sku);
            if (skuVar) {
              const updates: any = { stock_quantity: stock, bling_variant_id: bv.id };
              await supabase.from("product_variants").update(updates).eq("id", skuVar.id);
              updatedVariants++;
            }
          }
        }
      }
    } else {
      // Simple product (no variations) - update default variant
      const parentStock = stockMap.get(blingProductId) ?? 0;
      if (localVariants?.length) {
        for (const lv of localVariants) {
          if (lv.stock_quantity !== parentStock) {
            await supabase.from("product_variants").update({ stock_quantity: parentStock }).eq("id", lv.id);
            updatedVariants++;
          }
        }
      }
    }

    // 8. Update sync status
    const now = new Date().toISOString();
    await supabase.from("products").update({
      bling_sync_status: "synced",
      bling_last_synced_at: now,
      bling_last_error: null,
    }).eq("id", product_id);

    // 9. Log the sync action
    await supabase.from("product_change_log").insert({
      product_id,
      changed_by: user.id,
      change_type: "bling_stock_sync",
      fields_changed: ["stock_quantity"],
      notes: `Sincronização manual de estoque via Bling. ${updatedVariants} variante(s) atualizada(s).`,
      after_data: { updated_variants: updatedVariants, synced_at: now },
    });

    return new Response(JSON.stringify({
      success: true,
      updated_variants: updatedVariants,
      synced_at: now,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("[bling-sync-single-stock] Error:", err.message);
    return new Response(JSON.stringify({
      success: false,
      error: "sync_error",
      message: err.message,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
