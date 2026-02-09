import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_API_URL = "https://bling.com.br/Api/v3";
const BLING_TOKEN_URL = "https://bling.com.br/Api/v3/oauth/token";

const STANDARD_SIZES = ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44'];

interface SyncLogEntry {
  bling_id: number;
  name: string;
  status: 'imported' | 'updated' | 'skipped' | 'error' | 'grouped';
  message: string;
  variants: number;
}

function createSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function getValidToken(supabase: any): Promise<string> {
  const { data: settings, error } = await supabase
    .from("store_settings")
    .select("id, bling_client_id, bling_client_secret, bling_access_token, bling_refresh_token, bling_token_expires_at")
    .limit(1)
    .maybeSingle();

  if (error || !settings) throw new Error("Configurações não encontradas");
  if (!settings.bling_access_token) throw new Error("Bling não conectado. Autorize primeiro nas Integrações.");

  const expiresAt = settings.bling_token_expires_at ? new Date(settings.bling_token_expires_at) : new Date(0);
  const isExpired = expiresAt.getTime() - 300000 < Date.now();

  if (isExpired && settings.bling_refresh_token) {
    console.log("Refreshing Bling token...");
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
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error("Falha ao renovar token do Bling.");

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

function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeSize(raw: string): string {
  if (!raw) return "Único";
  const trimmed = raw.trim();
  const numMatch = trimmed.match(/^(\d+)/);
  if (numMatch) {
    const num = numMatch[1];
    if (STANDARD_SIZES.includes(num)) return num;
    const parsed = parseInt(num, 10);
    const str = String(parsed);
    if (STANDARD_SIZES.includes(str)) return str;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "único" || lower === "unico" || lower === "u" || lower === "un") return "Único";
  if (["p", "pp", "m", "g", "gg", "xg"].includes(lower)) return trimmed.toUpperCase();
  return trimmed;
}

// Parse variation attributes from name like "Cor:Dourado;Tamanho:35"
function parseVariationAttributes(nome: string): { size: string; color: string | null } {
  if (!nome) return { size: "Único", color: null };
  const parts: Record<string, string> = {};
  nome.split(";").forEach(part => {
    const sepIdx = part.indexOf(":");
    if (sepIdx > 0) {
      const key = part.substring(0, sepIdx).trim().toLowerCase();
      const value = part.substring(sepIdx + 1).trim();
      if (key && value) parts[key] = value;
    }
  });
  const rawSize = parts["tamanho"] || parts["tam"] || parts["size"] || parts["numero"] || parts["num"] || null;
  const color = parts["cor"] || parts["color"] || parts["colour"] || null;
  if (!rawSize && !color) {
    return { size: normalizeSize(nome), color: null };
  }
  return { size: normalizeSize(rawSize || "Único"), color };
}

// Extract parent Bling ID and variation attributes from a product name
// Format: "Product Name (PARENT_ID) Cor:X;Tamanho:Y"
function extractParentInfoFromName(name: string): { parentBlingId: number | null; baseName: string; attributes: string } {
  const match = name.match(/^(.+?)\s*\((\d+)\)\s*(.*)$/);
  if (match) {
    return {
      baseName: match[1].trim(),
      parentBlingId: parseInt(match[2], 10),
      attributes: match[3].trim(),
    };
  }
  return { parentBlingId: null, baseName: name, attributes: "" };
}

// ─── Smart Category Assignment with fuzzy matching ───
async function findOrCreateCategory(supabase: any, categoryName: string): Promise<string | null> {
  if (!categoryName) return null;

  // Exact match
  let { data: cat } = await supabase.from("categories").select("id").eq("name", categoryName).maybeSingle();
  if (cat) return cat.id;

  const normalized = categoryName.toLowerCase().trim();
  const { data: allCats } = await supabase.from("categories").select("id, name");
  if (allCats?.length) {
    // Try exact lowercase match, then contains match
    const match = allCats.find((c: any) => {
      const n = c.name.toLowerCase().trim();
      return n === normalized || n.includes(normalized) || normalized.includes(n);
    });
    if (match) return match.id;

    // Fuzzy: compare words overlap
    const inputWords = normalized.split(/\s+/).filter(w => w.length > 2);
    let bestMatch: any = null;
    let bestScore = 0;
    for (const c of allCats) {
      const catWords = c.name.toLowerCase().trim().split(/\s+/).filter((w: string) => w.length > 2);
      const overlap = inputWords.filter(w => catWords.some((cw: string) => cw.includes(w) || w.includes(cw))).length;
      const score = overlap / Math.max(inputWords.length, catWords.length);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = c;
      }
    }
    if (bestMatch) return bestMatch.id;
  }

  // Create new category
  const catSlug = slugify(categoryName);
  const { data: existingSlug } = await supabase.from("categories").select("id").eq("slug", catSlug).maybeSingle();
  const finalSlug = existingSlug ? `${catSlug}-${Date.now()}` : catSlug;
  const { data: newCat } = await supabase
    .from("categories")
    .insert({ name: categoryName, slug: finalSlug, is_active: true })
    .select("id")
    .single();
  return newCat?.id || null;
}

// ─── Upsert a parent product and all its variants ───
async function upsertParentWithVariants(
  supabase: any,
  headers: any,
  parentDetail: any,
  parentBlingId: number,
  variationItems: Array<{ blingId: number; name: string; attributes: string }>,
  getCategoryId: (name: string) => Promise<string | null>
): Promise<{ imported: boolean; updated: boolean; variantCount: number; error?: string }> {
  const slug = slugify(parentDetail.nome || `produto-${parentBlingId}`);
  const basePrice = parentDetail.preco || 0;
  const salePrice = parentDetail.precoPromocional && parentDetail.precoPromocional < basePrice ? parentDetail.precoPromocional : null;
  const categoryId = await getCategoryId(parentDetail.categoria?.descricao || "");

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("bling_product_id", parentBlingId)
    .maybeSingle();

  const productData: any = {
    name: parentDetail.nome,
    base_price: basePrice,
    sale_price: salePrice,
    sku: parentDetail.codigo || null,
    gtin: parentDetail.gtin || null,
    mpn: parentDetail.codigo || null,
    description: parentDetail.descricaoCurta || parentDetail.descricaoComplementar || parentDetail.observacoes || null,
    weight: parentDetail.pesoBruto || parentDetail.pesoLiquido || null,
    width: parentDetail.larguraProduto || null,
    height: parentDetail.alturaProduto || null,
    depth: parentDetail.profundidadeProduto || null,
    brand: parentDetail.marca?.nome || (typeof parentDetail.marca === "string" ? parentDetail.marca : null),
    material: null,
    condition: parentDetail.condicao === 0 ? "new" : parentDetail.condicao === 1 ? "refurbished" : "used",
    is_active: parentDetail.situacao === "A",
    is_new: parentDetail.lancamento === true || parentDetail.lancamento === "S",
    category_id: categoryId,
    bling_product_id: parentBlingId,
  };

  let productId: string;
  let imported = false;
  let updated = false;

  if (existing) {
    await supabase.from("products").update(productData).eq("id", existing.id);
    productId = existing.id;
    updated = true;
  } else {
    const { data: slugExists } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
    productData.slug = slugExists ? `${slug}-${parentBlingId}` : slug;
    const { data: newProd, error: insertErr } = await supabase
      .from("products")
      .insert(productData)
      .select("id")
      .single();
    if (insertErr) {
      return { imported: false, updated: false, variantCount: 0, error: `Insert error: ${insertErr.message}` };
    }
    productId = newProd.id;
    imported = true;
  }

  // Sync images from parent
  if (parentDetail.midia?.imagens?.internas?.length) {
    await supabase.from("product_images").delete().eq("product_id", productId);
    const images = parentDetail.midia.imagens.internas.map((img: any, idx: number) => ({
      product_id: productId,
      url: img.link,
      is_primary: idx === 0,
      display_order: idx,
      alt_text: parentDetail.nome,
    }));
    await supabase.from("product_images").insert(images);
  }

  // Sync characteristics
  const characteristics: { name: string; value: string }[] = [];
  if (parentDetail.pesoBruto) characteristics.push({ name: "Peso Bruto", value: `${parentDetail.pesoBruto} kg` });
  if (parentDetail.pesoLiquido) characteristics.push({ name: "Peso Líquido", value: `${parentDetail.pesoLiquido} kg` });
  if (parentDetail.larguraProduto) characteristics.push({ name: "Largura", value: `${parentDetail.larguraProduto} cm` });
  if (parentDetail.alturaProduto) characteristics.push({ name: "Altura", value: `${parentDetail.alturaProduto} cm` });
  if (parentDetail.profundidadeProduto) characteristics.push({ name: "Profundidade", value: `${parentDetail.profundidadeProduto} cm` });
  const brandName = parentDetail.marca?.nome || (typeof parentDetail.marca === "string" ? parentDetail.marca : null);
  if (brandName) characteristics.push({ name: "Marca", value: brandName });
  if (parentDetail.gtin) characteristics.push({ name: "GTIN/EAN", value: parentDetail.gtin });
  if (parentDetail.unidade) characteristics.push({ name: "Unidade", value: parentDetail.unidade });

  if (characteristics.length > 0) {
    await supabase.from("product_characteristics").delete().eq("product_id", productId);
    await supabase.from("product_characteristics").insert(
      characteristics.map((c, idx) => ({
        product_id: productId,
        name: c.name,
        value: c.value,
        display_order: idx,
      }))
    );
  }

  // ─── Sync Variants ───
  let variantCount = 0;
  const syncedVariantIds = new Set<string>();

  // Source 1: Variations from the parent detail's `variacoes` array
  if (parentDetail.variacoes?.length) {
    for (const v of parentDetail.variacoes) {
      const parsed = parseVariationAttributes(v.nome || "");
      let varStock = 0;
      let varPrice = basePrice;
      let varSku = v.codigo || null;
      let varActive = true;

      try {
        const varDetailRes = await fetch(`${BLING_API_URL}/produtos/${v.id}`, { headers });
        const varDetailJson = await varDetailRes.json();
        const varDetail = varDetailJson?.data;
        if (varDetail) {
          varStock = varDetail.estoque?.saldoVirtualTotal ?? 0;
          if (varDetail.preco && varDetail.preco > 0) varPrice = varDetail.preco;
          varSku = varDetail.codigo || varSku;
          varActive = varDetail.situacao === "A";

          // Add unique images from variation
          if (varDetail.midia?.imagens?.internas?.length) {
            const existingImages = await supabase
              .from("product_images")
              .select("url")
              .eq("product_id", productId);
            const existingUrls = new Set((existingImages.data || []).map((i: any) => i.url));
            const newImages = varDetail.midia.imagens.internas
              .filter((img: any) => !existingUrls.has(img.link))
              .map((img: any, idx: number) => ({
                product_id: productId,
                url: img.link,
                is_primary: false,
                display_order: 100 + idx,
                alt_text: `${parentDetail.nome} - ${parsed.size}${parsed.color ? ` ${parsed.color}` : ""}`,
              }));
            if (newImages.length) await supabase.from("product_images").insert(newImages);
          }
        }
      } catch (e) {
        console.error(`Error fetching variation detail ${v.id}:`, e);
        try {
          const stockRes = await fetch(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${v.id}`, { headers });
          const stockJson = await stockRes.json();
          varStock = stockJson?.data?.[0]?.saldoVirtualTotal ?? 0;
        } catch (_) { /* ignore */ }
      }

      const priceModifier = varPrice - basePrice;
      const varData: any = {
        product_id: productId,
        size: parsed.size,
        color: parsed.color,
        stock_quantity: varStock,
        sku: varSku,
        is_active: varActive,
        bling_variant_id: v.id,
        price_modifier: priceModifier !== 0 ? priceModifier : 0,
      };

      const { data: existingVar } = await supabase
        .from("product_variants")
        .select("id")
        .eq("bling_variant_id", v.id)
        .maybeSingle();

      if (existingVar) {
        await supabase.from("product_variants").update(varData).eq("id", existingVar.id);
        syncedVariantIds.add(existingVar.id);
      } else {
        const { data: newVar } = await supabase.from("product_variants").insert(varData).select("id").single();
        if (newVar) syncedVariantIds.add(newVar.id);
      }
      variantCount++;
    }
  }

  // Source 2: Variation items discovered from the listing (matched by parent ID in name)
  // These are items with names like "Product (PARENT_ID) Cor:X;Tamanho:Y"
  // Only process if not already handled by variacoes array above
  for (const vi of variationItems) {
    // Check if this variation was already synced via the variacoes array
    const { data: alreadySynced } = await supabase
      .from("product_variants")
      .select("id")
      .eq("bling_variant_id", vi.blingId)
      .maybeSingle();

    if (alreadySynced && syncedVariantIds.has(alreadySynced.id)) continue;

    const parsed = parseVariationAttributes(vi.attributes);
    let varStock = 0;
    let varPrice = basePrice;
    let varSku: string | null = null;
    let varActive = true;

    try {
      const varDetailRes = await fetch(`${BLING_API_URL}/produtos/${vi.blingId}`, { headers });
      const varDetailJson = await varDetailRes.json();
      const varDetail = varDetailJson?.data;
      if (varDetail) {
        varStock = varDetail.estoque?.saldoVirtualTotal ?? 0;
        if (varDetail.preco && varDetail.preco > 0) varPrice = varDetail.preco;
        varSku = varDetail.codigo || null;
        varActive = varDetail.situacao === "A";

        // Add unique images
        if (varDetail.midia?.imagens?.internas?.length) {
          const existingImages = await supabase.from("product_images").select("url").eq("product_id", productId);
          const existingUrls = new Set((existingImages.data || []).map((i: any) => i.url));
          const newImages = varDetail.midia.imagens.internas
            .filter((img: any) => !existingUrls.has(img.link))
            .map((img: any, idx: number) => ({
              product_id: productId,
              url: img.link,
              is_primary: false,
              display_order: 200 + idx,
              alt_text: `${parentDetail.nome} - ${parsed.size}${parsed.color ? ` ${parsed.color}` : ""}`,
            }));
          if (newImages.length) await supabase.from("product_images").insert(newImages);
        }
      }
    } catch (e) {
      console.error(`Error fetching listed variation ${vi.blingId}:`, e);
      try {
        const stockRes = await fetch(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${vi.blingId}`, { headers });
        const stockJson = await stockRes.json();
        varStock = stockJson?.data?.[0]?.saldoVirtualTotal ?? 0;
      } catch (_) { /* ignore */ }
    }

    const priceModifier = varPrice - basePrice;
    const varData: any = {
      product_id: productId,
      size: parsed.size,
      color: parsed.color,
      stock_quantity: varStock,
      sku: varSku,
      is_active: varActive,
      bling_variant_id: vi.blingId,
      price_modifier: priceModifier !== 0 ? priceModifier : 0,
    };

    if (alreadySynced) {
      await supabase.from("product_variants").update(varData).eq("id", alreadySynced.id);
      syncedVariantIds.add(alreadySynced.id);
    } else {
      const { data: newVar } = await supabase.from("product_variants").insert(varData).select("id").single();
      if (newVar) syncedVariantIds.add(newVar.id);
    }
    variantCount++;
  }

  // If no variants at all, create a default "Único"
  if (variantCount === 0) {
    let stockQty = 0;
    try {
      const stockRes = await fetch(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${parentBlingId}`, { headers });
      const stockJson = await stockRes.json();
      stockQty = stockJson?.data?.[0]?.saldoVirtualTotal ?? 0;
    } catch (_) { /* ignore */ }

    const { data: existingDefault } = await supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", productId)
      .eq("size", "Único")
      .maybeSingle();

    if (existingDefault) {
      await supabase.from("product_variants").update({ stock_quantity: stockQty }).eq("id", existingDefault.id);
    } else {
      await supabase.from("product_variants").insert({
        product_id: productId,
        size: "Único",
        stock_quantity: stockQty,
        is_active: true,
      });
    }
    variantCount = 1;
  }

  // Clean up orphaned variants for this product
  const { data: allVars } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .not("bling_variant_id", "is", null);

  for (const v of (allVars || [])) {
    if (!syncedVariantIds.has(v.id)) {
      await supabase.from("product_variants").delete().eq("id", v.id);
    }
  }

  return { imported, updated, variantCount };
}

// ─── Main Sync Products ───
async function syncProducts(supabase: any, token: string) {
  const headers = blingHeaders(token);
  let page = 1;
  let totalImported = 0;
  let totalUpdated = 0;
  let totalVariants = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let hasMore = true;
  const syncLog: SyncLogEntry[] = [];

  const { data: storeSettings } = await supabase
    .from("store_settings")
    .select("bling_store_id")
    .limit(1)
    .maybeSingle();
  const blingStoreId = (storeSettings as any)?.bling_store_id || null;

  const categoryCache = new Map<string, string | null>();
  async function getCategoryId(name: string): Promise<string | null> {
    if (categoryCache.has(name)) return categoryCache.get(name)!;
    const id = await findOrCreateCategory(supabase, name);
    categoryCache.set(name, id);
    return id;
  }

  // ─── PHASE 1: Collect all items from Bling listing ───
  interface ListingItem {
    id: number;
    nome: string;
    formato?: string;
  }
  const allListingItems: ListingItem[] = [];

  while (hasMore) {
    let url = `${BLING_API_URL}/produtos?pagina=${page}&limite=100`;
    if (blingStoreId) {
      url += `&idLoja=${blingStoreId}`;
      if (page === 1) console.log(`Filtering by Bling store ID: ${blingStoreId}`);
    }
    console.log(`Fetching Bling products page ${page}...`);
    const res = await fetch(url, { headers });
    const json = await res.json();

    if (!res.ok) {
      console.error("Bling products error:", JSON.stringify(json));
      throw new Error(`Bling API error [${res.status}]: ${JSON.stringify(json)}`);
    }

    const products = json?.data || [];
    if (products.length === 0) { hasMore = false; break; }
    console.log(`Page ${page}: ${products.length} items`);

    for (const bp of products) {
      allListingItems.push({
        id: bp.id,
        nome: bp.descricao || bp.nome || `ID ${bp.id}`,
        formato: bp.formato,
      });
    }

    page++;
    if (products.length < 100) hasMore = false;
  }

  console.log(`Total listing items: ${allListingItems.length}`);

  // ─── PHASE 2: Classify items into parents and variations ───
  // Group structure: parentBlingId -> { parentItem, variationItems }
  interface ProductGroup {
    parentBlingId: number;
    parentListItem: ListingItem | null; // null if parent not in listing
    variationItems: Array<{ blingId: number; name: string; attributes: string }>;
    isSimple: boolean; // product with no variations
  }

  const groups = new Map<number, ProductGroup>();
  const standaloneItems: ListingItem[] = []; // items that are truly standalone (simple products)

  for (const item of allListingItems) {
    const { parentBlingId, baseName, attributes } = extractParentInfoFromName(item.nome);

    if (parentBlingId) {
      // This item is a variation - it has "(PARENT_ID)" in its name
      if (!groups.has(parentBlingId)) {
        groups.set(parentBlingId, {
          parentBlingId,
          parentListItem: null,
          variationItems: [],
          isSimple: false,
        });
      }
      groups.get(parentBlingId)!.variationItems.push({
        blingId: item.id,
        name: baseName,
        attributes,
      });
    } else {
      // No parent ID in name - could be a parent product or a simple product
      // Check if any other items reference this item's ID as parent
      standaloneItems.push(item);
    }
  }

  // Check standalone items: if other items reference them as parent, add them to groups
  for (const item of standaloneItems) {
    if (groups.has(item.id)) {
      // This standalone item IS a parent - other variations reference it
      groups.get(item.id)!.parentListItem = item;
    } else {
      // Truly standalone simple product
      groups.set(item.id, {
        parentBlingId: item.id,
        parentListItem: item,
        variationItems: [],
        isSimple: true,
      });
    }
  }

  console.log(`Classified into ${groups.size} product groups (${standaloneItems.length} standalone, ${allListingItems.length - standaloneItems.length} variations)`);

  // ─── PHASE 3: Process each group ───
  const processedParentIds = new Set<number>();

  for (const [parentBlingId, group] of groups) {
    if (processedParentIds.has(parentBlingId)) continue;
    processedParentIds.add(parentBlingId);

    try {
      // Fetch parent product detail
      const detailRes = await fetch(`${BLING_API_URL}/produtos/${parentBlingId}`, { headers });
      const detailJson = await detailRes.json();
      let parentDetail = detailJson?.data;

      if (!parentDetail) {
        // Parent not found in API - might have been deleted
        // If we have variation items, try to construct from first variation
        if (group.variationItems.length > 0) {
          const firstVarRes = await fetch(`${BLING_API_URL}/produtos/${group.variationItems[0].blingId}`, { headers });
          const firstVarJson = await firstVarRes.json();
          const firstVarDetail = firstVarJson?.data;

          if (firstVarDetail) {
            // Use first variation as base for parent, but use the clean base name
            parentDetail = {
              ...firstVarDetail,
              nome: group.variationItems[0].name,
              id: parentBlingId,
              variacoes: [], // we'll handle variations via variationItems
            };
          } else {
            syncLog.push({ bling_id: parentBlingId, name: `Parent ${parentBlingId}`, status: 'error', message: 'Produto pai e variações não encontrados na API', variants: 0 });
            totalErrors++;
            continue;
          }
        } else {
          syncLog.push({ bling_id: parentBlingId, name: group.parentListItem?.nome || `ID ${parentBlingId}`, status: 'error', message: 'Detalhes não encontrados na API', variants: 0 });
          totalErrors++;
          continue;
        }
      }

      // If the parent detail itself is a variation (formato=V), find its actual parent
      if (parentDetail.formato === "V") {
        const actualParentId = parentDetail.produtoPai?.id || parentDetail.idProdutoPai;
        if (actualParentId && !processedParentIds.has(actualParentId)) {
          // Redirect: fetch actual parent and process it instead
          const actualRes = await fetch(`${BLING_API_URL}/produtos/${actualParentId}`, { headers });
          const actualJson = await actualRes.json();
          if (actualJson?.data && actualJson.data.formato !== "V") {
            parentDetail = actualJson.data;
            processedParentIds.add(actualParentId);
            // Add current item as variation
            const parsed = extractParentInfoFromName(group.parentListItem?.nome || "");
            if (parsed.attributes) {
              group.variationItems.push({
                blingId: parentBlingId,
                name: parsed.baseName,
                attributes: parsed.attributes,
              });
            }
          } else {
            syncLog.push({ bling_id: parentBlingId, name: parentDetail.nome, status: 'skipped', message: 'Variação sem pai válido', variants: 0 });
            totalSkipped++;
            continue;
          }
        } else {
          syncLog.push({ bling_id: parentBlingId, name: parentDetail.nome, status: 'skipped', message: 'Variação já processada pelo pai', variants: 0 });
          totalSkipped++;
          continue;
        }
      }

      // Log grouped variations
      for (const vi of group.variationItems) {
        syncLog.push({ bling_id: vi.blingId, name: `${vi.name} ${vi.attributes}`, status: 'grouped', message: `Agrupado sob pai ${parentBlingId} (${parentDetail.nome})`, variants: 0 });
      }

      const result = await upsertParentWithVariants(
        supabase, headers, parentDetail, parentDetail.id || parentBlingId,
        group.variationItems, getCategoryId
      );

      if (result.error) {
        syncLog.push({ bling_id: parentBlingId, name: parentDetail.nome, status: 'error', message: result.error, variants: 0 });
        totalErrors++;
      } else if (result.imported) {
        syncLog.push({ bling_id: parentBlingId, name: parentDetail.nome, status: 'imported', message: `Importado com ${result.variantCount} variação(ões)`, variants: result.variantCount });
        totalImported++;
        totalVariants += result.variantCount;
      } else if (result.updated) {
        syncLog.push({ bling_id: parentBlingId, name: parentDetail.nome, status: 'updated', message: `Atualizado com ${result.variantCount} variação(ões)`, variants: result.variantCount });
        totalUpdated++;
        totalVariants += result.variantCount;
      }

    } catch (err: any) {
      console.error(`Error processing group ${parentBlingId}:`, err.message);
      syncLog.push({ bling_id: parentBlingId, name: group.parentListItem?.nome || `ID ${parentBlingId}`, status: 'error', message: err.message, variants: 0 });
      totalErrors++;
    }
  }

  // ─── PHASE 4: Clean up products that are variations imported as standalone ───
  const { data: blingProducts } = await supabase
    .from("products")
    .select("id, bling_product_id, name")
    .not("bling_product_id", "is", null);

  let cleaned = 0;
  if (blingProducts?.length) {
    for (const prod of blingProducts) {
      if (processedParentIds.has(prod.bling_product_id)) continue;
      try {
        const checkRes = await fetch(`${BLING_API_URL}/produtos/${prod.bling_product_id}`, { headers });
        const checkJson = await checkRes.json();
        if (checkJson?.data?.formato === "V") {
          // This is a variation stored as a product - delete it
          await supabase.from("product_images").delete().eq("product_id", prod.id);
          await supabase.from("product_variants").delete().eq("product_id", prod.id);
          await supabase.from("product_characteristics").delete().eq("product_id", prod.id);
          await supabase.from("products").delete().eq("id", prod.id);
          cleaned++;
          syncLog.push({ bling_id: prod.bling_product_id, name: prod.name, status: 'skipped', message: 'Removido (era variação importada como produto)', variants: 0 });
        }
      } catch (_) { /* ignore */ }
    }
  }

  const summary = {
    imported: totalImported,
    updated: totalUpdated,
    variants: totalVariants,
    skipped: totalSkipped,
    errors: totalErrors,
    cleaned,
    totalBlingListItems: allListingItems.length,
    totalProcessed: processedParentIds.size,
    log: syncLog,
  };

  console.log(`Sync complete: ${totalImported} imported, ${totalUpdated} updated, ${totalVariants} variants, ${totalSkipped} skipped, ${totalErrors} errors, ${cleaned} cleaned`);

  return summary;
}

// ─── Sync Stock from Bling ───
async function syncStock(supabase: any, token: string) {
  const headers = blingHeaders(token);

  const { data: products } = await supabase
    .from("products")
    .select("id, bling_product_id")
    .not("bling_product_id", "is", null);

  if (!products?.length) return { updated: 0 };

  let updated = 0;

  for (let i = 0; i < products.length; i += 50) {
    const batch = products.slice(i, i + 50);
    const ids = batch.map((p: any) => p.bling_product_id);
    const idsParam = ids.map((id: number) => `idsProdutos[]=${id}`).join("&");

    const res = await fetch(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
    const json = await res.json();

    if (!res.ok) {
      console.error("Stock sync error:", JSON.stringify(json));
      continue;
    }

    const stockData = json?.data || [];
    for (const stock of stockData) {
      const product = batch.find((p: any) => p.bling_product_id === stock.produto?.id);
      if (!product) continue;

      const qty = stock.saldoVirtualTotal ?? 0;
      await supabase
        .from("product_variants")
        .update({ stock_quantity: qty })
        .eq("product_id", product.id);

      updated++;
    }
  }

  return { updated };
}

// ─── Create Order in Bling ───
async function createOrder(supabase: any, token: string, orderId: string) {
  const headers = blingHeaders(token);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) throw new Error(`Pedido não encontrado: ${orderError?.message || orderId}`);

  const cpfMatch = order.notes?.match(/CPF:\s*([\d.\-]+)/);
  const cpf = cpfMatch ? cpfMatch[1].replace(/\D/g, "") : "";

  const itens = [];
  for (const item of (order.order_items || [])) {
    let codigo = item.product_id?.substring(0, 8) || "PROD";

    if (item.product_id) {
      const { data: prod } = await supabase
        .from("products")
        .select("sku, bling_product_id")
        .eq("id", item.product_id)
        .maybeSingle();
      if (prod?.sku) codigo = prod.sku;
    }

    itens.push({
      descricao: item.product_name,
      quantidade: item.quantity,
      valor: item.unit_price,
      codigo,
    });
  }

  const blingOrder = {
    numero: 0,
    data: new Date(order.created_at).toISOString().split("T")[0],
    dataSaida: new Date().toISOString().split("T")[0],
    contato: {
      nome: order.shipping_name,
      tipoPessoa: "F",
      numeroDocumento: cpf,
      contribuinte: 9,
    },
    itens,
    transporte: {
      fretePorConta: 0,
      frete: order.shipping_cost || 0,
      volumes: [{ servico: "Transportadora" }],
      contato: { nome: order.shipping_name },
      etiqueta: {
        nome: order.shipping_name,
        endereco: order.shipping_address,
        municipio: order.shipping_city,
        uf: order.shipping_state,
        cep: order.shipping_zip?.replace(/\D/g, ""),
      },
    },
    parcelas: [{
      valor: order.total_amount,
      dataVencimento: new Date().toISOString().split("T")[0],
      observacao: "Pagamento online",
    }],
    observacoes: `Pedido ${order.order_number} - Loja Online`,
    observacoesInternas: order.notes || "",
    numeroPedidoCompra: order.order_number,
  };

  console.log("Creating Bling order:", JSON.stringify(blingOrder));
  const response = await fetch(`${BLING_API_URL}/pedidos/vendas`, {
    method: "POST",
    headers,
    body: JSON.stringify(blingOrder),
  });

  const data = await response.json();
  console.log("Bling create order response:", JSON.stringify(data));
  if (!response.ok) throw new Error(`Bling API error [${response.status}]: ${JSON.stringify(data)}`);

  return { bling_order_id: data?.data?.id };
}

// ─── Generate NF-e ───
async function generateNfe(token: string, blingOrderId: number) {
  const headers = blingHeaders(token);
  const response = await fetch(`${BLING_API_URL}/nfe`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tipo: 1, idPedidoVenda: blingOrderId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Bling NF-e error [${response.status}]: ${JSON.stringify(data)}`);

  const nfeId = data?.data?.id;
  if (nfeId) {
    await fetch(`${BLING_API_URL}/nfe/${nfeId}/enviar`, { method: "POST", headers });
  }
  return { nfe_id: nfeId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabase();
    const { action, ...payload } = await req.json();
    const token = await getValidToken(supabase);

    let result: any;

    switch (action) {
      case "list_stores": {
        const storesHeaders = blingHeaders(token);
        const stores: any[] = [];

        try {
          const res = await fetch(`${BLING_API_URL}/canais-de-venda`, { headers: storesHeaders });
          const json = await res.json();
          if (res.ok && json?.data?.length) {
            for (const channel of json.data) {
              stores.push({
                id: channel.id,
                name: channel.descricao || channel.nome || `Canal ${channel.id}`,
                type: channel.tipo || 'loja_virtual',
              });
            }
          }
        } catch (e) {
          console.error("Error fetching canais-de-venda:", e);
        }

        if (stores.length === 0) {
          try {
            const res = await fetch(`${BLING_API_URL}/lojas-virtuais`, { headers: storesHeaders });
            const json = await res.json();
            if (res.ok && json?.data?.length) {
              for (const store of json.data) {
                stores.push({
                  id: store.id,
                  name: store.descricao || store.nome || `Loja ${store.id}`,
                  type: 'loja_virtual',
                });
              }
            }
          } catch (e) {
            console.error("Error fetching lojas-virtuais:", e);
          }
        }

        result = { stores };
        break;
      }

      case "sync_products":
        result = await syncProducts(supabase, token);
        break;

      case "sync_stock":
        result = await syncStock(supabase, token);
        break;

      case "create_order":
        result = await createOrder(supabase, token, payload.order_id);
        break;

      case "generate_nfe":
        if (!payload.bling_order_id) throw new Error("bling_order_id obrigatório");
        result = await generateNfe(token, parseInt(payload.bling_order_id));
        break;

      case "order_to_nfe": {
        const orderResult = await createOrder(supabase, token, payload.order_id);
        const nfeResult = await generateNfe(token, orderResult.bling_order_id);
        result = { ...orderResult, ...nfeResult };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Ação inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Bling sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro na integração com Bling" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
