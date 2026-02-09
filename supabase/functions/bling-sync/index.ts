import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_API_URL = "https://bling.com.br/Api/v3";
const BLING_TOKEN_URL = "https://bling.com.br/Api/v3/oauth/token";
const BLING_RATE_LIMIT_MS = 400; // 400ms between requests = ~2.5 req/s (limit is 3/s)

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRateLimit(url: string, options: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const waitMs = (attempt + 1) * 1500; // 1.5s, 3s, 4.5s
      console.log(`Rate limited, waiting ${waitMs}ms before retry...`);
      await sleep(waitMs);
      continue;
    }
    return res;
  }
  return fetch(url, options); // final attempt
}

const STANDARD_SIZES = ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44'];

// ─── Color Map (same as COMMON_COLORS in ProductVariantsManager) ───
const COLOR_MAP: Record<string, string> = {
  'preto': '#000000',
  'branco': '#FFFFFF',
  'vermelho': '#EF4444',
  'azul': '#3B82F6',
  'rosa': '#EC4899',
  'nude': '#D4A574',
  'caramelo': '#C68642',
  'marrom': '#8B4513',
  'dourado': '#FFD700',
  'prata': '#C0C0C0',
  'verde': '#22C55E',
  'bege': '#F5F5DC',
  'amarelo': '#EAB308',
  'laranja': '#F97316',
  'cinza': '#6B7280',
  'vinho': '#722F37',
  'bordo': '#800020',
  'coral': '#FF7F50',
  'lilas': '#C8A2C8',
  'roxo': '#7C3AED',
  'creme': '#FFFDD0',
  'camel': '#C19A6B',
  'off white': '#FAF9F6',
  'off-white': '#FAF9F6',
  'animal print': '#C68642',
  'onca': '#C68642',
  'oncinha': '#C68642',
  'leopardo': '#C68642',
  'zebra': '#000000',
  'snake': '#8B8682',
  'croco': '#556B2F',
  'jeans': '#4169E1',
  'mostarda': '#FFDB58',
  'terracota': '#E2725B',
  'areia': '#C2B280',
  'petroleo': '#1B3A4B',
  'oliva': '#808000',
  'chocolate': '#7B3F00',
  'cafe': '#6F4E37',
  'cappuccino': '#A78B71',
  'cobre': '#B87333',
  'bronze': '#CD7F32',
  'ouro': '#FFD700',
  'rose': '#FF007F',
  'rosê': '#FF007F',
  'rose gold': '#B76E79',
  'champagne': '#F7E7CE',
  'perola': '#F0EAD6',
  'pérola': '#F0EAD6',
  'turquesa': '#40E0D0',
  'marsala': '#986868',
  'goiaba': '#E85D75',
  'salmao': '#FA8072',
  'salmão': '#FA8072',
  'fuchsia': '#FF00FF',
  'magenta': '#FF00FF',
  'grafite': '#474A51',
  'caqui': '#C3B091',
  'mel': '#EB9605',
  'natural': '#F5F5DC',
  'transparente': '#FFFFFF',
  'multicolor': '#FF69B4',
  'colorido': '#FF69B4',
};

const COLOR_KEYWORDS = Object.keys(COLOR_MAP);

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

// Generate a deterministic hex color from a string (for unknown color names)
function generateHexFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const r = Math.abs((hash >> 0) & 0xFF);
  const g = Math.abs((hash >> 8) & 0xFF);
  const b = Math.abs((hash >> 16) & 0xFF);
  // Ensure colors aren't too dark or too light
  const clamp = (v: number) => Math.min(220, Math.max(40, v));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
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

// Extract color from a product name by searching for known color keywords
function extractColorFromName(name: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Sort keywords by length descending so longer matches take priority (e.g. "off white" before "branco")
  const sorted = [...COLOR_KEYWORDS].sort((a, b) => b.length - a.length);
  for (const keyword of sorted) {
    const normalizedKeyword = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (lower.includes(normalizedKeyword)) {
      // Return the properly capitalized version
      return keyword.charAt(0).toUpperCase() + keyword.slice(1);
    }
  }
  return null;
}

// Extract size number from a string (looks for shoe sizes 33-44 or clothing sizes)
function extractSizeFromName(name: string): string | null {
  if (!name) return null;
  // Try structured format first: "tamanho:35" or "Tamanho: 35"
  const structuredMatch = name.match(/tamanho\s*[:=]\s*(\d+)/i);
  if (structuredMatch) return structuredMatch[1];
  // Try "Tam. 35" or "Tam 35"
  const tamMatch = name.match(/tam\.?\s*(\d+)/i);
  if (tamMatch) return tamMatch[1];
  // Try "numero:35" or "num:35"
  const numMatch = name.match(/n[uú]mero?\s*[:=]\s*(\d+)/i);
  if (numMatch) return numMatch[1];
  // Try to find a shoe size number (33-44) as standalone number
  const sizeNumbers = name.match(/\b(3[3-9]|4[0-4])\b/g);
  if (sizeNumbers && sizeNumbers.length === 1) return sizeNumbers[0];
  // Try clothing sizes
  const clothingMatch = name.match(/\b(PP|GG|XG|EXG|EXGG)\b/i) || name.match(/\b([PMGU])\b/i);
  if (clothingMatch) return clothingMatch[1].toUpperCase();
  return null;
}

// Parse variation attributes from structured string like "Cor:Dourado;Tamanho:35"
// Also handles Bling V3 pipe format: "Cor:Dourado | Tamanho:35"
// Also handles full product names with embedded attributes
function parseVariationAttributes(nome: string): { size: string; color: string | null; colorHex: string | null } {
  if (!nome) return { size: "Único", color: null, colorHex: null };
  
  // Try structured key:value format - split by BOTH ";" and "|" (Bling V3 uses pipes)
  const parts: Record<string, string> = {};
  // First normalize: replace "|" with ";" so we can split uniformly
  const normalized = nome.replace(/\|/g, ";");
  normalized.split(";").forEach(part => {
    const sepIdx = part.indexOf(":");
    if (sepIdx > 0) {
      const key = part.substring(0, sepIdx).trim().toLowerCase();
      const value = part.substring(sepIdx + 1).trim();
      if (key && value) parts[key] = value;
    }
  });
  
  let rawSize = parts["tamanho"] || parts["tam"] || parts["size"] || parts["numero"] || parts["num"] || null;
  let color = parts["cor"] || parts["color"] || parts["colour"] || null;
  
  // If no structured size found, try extracting from full name
  if (!rawSize) {
    rawSize = extractSizeFromName(nome);
  }
  
  // If no structured color found, try extracting from full name
  if (!color) {
    color = extractColorFromName(nome);
  }
  
  // Resolve color hex - generate deterministic hex for unknown colors
  let colorHex: string | null = null;
  if (color) {
    const normalizedColor = color.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    colorHex = COLOR_MAP[normalizedColor] || COLOR_MAP[color.toLowerCase()] || null;
    if (!colorHex) {
      // Generate a deterministic hex from the color name so it's consistent
      colorHex = generateHexFromString(normalizedColor);
    }
  }
  
  return { 
    size: normalizeSize(rawSize || "Único"), 
    color, 
    colorHex 
  };
}

// Enhanced extraction: uses Bling variation detail object + product name
function extractAttributesFromBlingVariation(
  varDetail: any, 
  listingName: string, 
  listingAttributes: string
): { size: string; color: string | null; colorHex: string | null; sku: string | null } {
  let parsed = { size: "Único", color: null as string | null, colorHex: null as string | null };
  
  // Priority 0: Check Bling V3 `atributos` array (most reliable)
  // Structure: [{ id, nome: "Cor", valor: "Azul" }, { id, nome: "Tamanho", valor: "35" }]
  if (varDetail?.atributos?.length) {
    for (const attr of varDetail.atributos) {
      const attrName = (attr.nome || attr.name || "").toLowerCase().trim();
      const attrValue = (attr.valor || attr.value || "").trim();
      if (!attrValue) continue;
      if (attrName === "tamanho" || attrName === "tam" || attrName === "size" || attrName === "numero") {
        parsed.size = normalizeSize(attrValue);
      } else if (attrName === "cor" || attrName === "color" || attrName === "colour") {
        parsed.color = attrValue.charAt(0).toUpperCase() + attrValue.slice(1);
        const normalizedColor = attrValue.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        parsed.colorHex = COLOR_MAP[normalizedColor] || COLOR_MAP[attrValue.toLowerCase()] || generateHexFromString(normalizedColor);
      }
    }
    // If we got at least something from atributos, use it
    if (parsed.size !== "Único" || parsed.color) {
      const sku = varDetail?.codigo || null;
      return { size: parsed.size, color: parsed.color, colorHex: parsed.colorHex, sku };
    }
  }
  
  // Priority 1: Check variacoes[].variacao or variacao.nome structures
  if (varDetail?.variacao?.nome) {
    parsed = parseVariationAttributes(varDetail.variacao.nome);
  }
  
  // Priority 1b: Try the variation's own nome (Bling V3: "ProdutoBase Cor:X | Tamanho:Y")
  if (parsed.size === "Único" && !parsed.color && varDetail?.nome) {
    parsed = parseVariationAttributes(varDetail.nome);
  }
  
  // Priority 2: Use listing attributes string (from parent name parsing)
  if (parsed.size === "Único" && !parsed.color && listingAttributes) {
    const fromAttrs = parseVariationAttributes(listingAttributes);
    if (fromAttrs.size !== "Único") parsed.size = fromAttrs.size;
    if (fromAttrs.color) { parsed.color = fromAttrs.color; parsed.colorHex = fromAttrs.colorHex; }
  }
  
  // Priority 3: Try the full product name
  const fullName = varDetail?.nome || listingName || "";
  if (parsed.size === "Único") {
    const sizeFromName = extractSizeFromName(fullName);
    if (sizeFromName) parsed.size = normalizeSize(sizeFromName);
  }
  if (!parsed.color) {
    const colorFromName = extractColorFromName(fullName);
    if (colorFromName) {
      parsed.color = colorFromName;
      const normalizedColor = colorFromName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      parsed.colorHex = COLOR_MAP[normalizedColor] || COLOR_MAP[colorFromName.toLowerCase()] || generateHexFromString(normalizedColor);
    }
  }
  
  // SKU: prefer variation's codigo
  const sku = varDetail?.codigo || null;
  
  return { 
    size: parsed.size, 
    color: parsed.color, 
    colorHex: parsed.colorHex, 
    sku 
  };
}

// Extract parent Bling ID and variation attributes from a product name
// Pattern 1: "Product Name (PARENT_ID) Cor:X;Tamanho:Y"
// Pattern 2: "Product Name Cor:X;Tamanho:Y" (no parent ID, common in Bling V3)
function extractParentInfoFromName(name: string): { parentBlingId: number | null; baseName: string; attributes: string; hasAttributes: boolean } {
  // Pattern 1: Has explicit parent ID in parentheses
  const match = name.match(/^(.+?)\s*\((\d+)\)\s*(.*)$/);
  if (match) {
    return {
      baseName: match[1].trim(),
      parentBlingId: parseInt(match[2], 10),
      attributes: match[3].trim(),
      hasAttributes: !!match[3].trim(),
    };
  }
  
  // Pattern 2: Detect "Cor:X;Tamanho:Y" or "Cor:X" or "Tamanho:Y" suffix
  // This is the standard Bling V3 variation naming format
  const attrMatch = name.match(/^(.+?)\s+((?:Cor|Tamanho|cor|tamanho)\s*:.+)$/i);
  if (attrMatch) {
    return {
      baseName: attrMatch[1].trim(),
      parentBlingId: null,
      attributes: attrMatch[2].trim(),
      hasAttributes: true,
    };
  }
  
  return { parentBlingId: null, baseName: name, attributes: "", hasAttributes: false };
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
  getCategoryId: (name: string) => Promise<string | null>,
  resolveBlingCategory: (blingCatId: number | null) => Promise<string>
): Promise<{ imported: boolean; updated: boolean; variantCount: number; error?: string }> {
  const slug = slugify(parentDetail.nome || `produto-${parentBlingId}`);
  const basePrice = parentDetail.preco || 0;
  const salePrice = parentDetail.precoPromocional && parentDetail.precoPromocional < basePrice ? parentDetail.precoPromocional : null;
  
  // Resolve Bling category ID to name, then find/create in our DB
  const blingCatId = parentDetail.categoria?.id || null;
  const categoryName = await resolveBlingCategory(blingCatId);
  const categoryId = await getCategoryId(categoryName);

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
    // Batch fetch stock for ALL variations at once (instead of individual API calls)
    const varIds = parentDetail.variacoes.map((v: any) => v.id);
    const varStockMap = new Map<number, number>();
    for (let i = 0; i < varIds.length; i += 50) {
      const batch = varIds.slice(i, i + 50);
      const idsParam = batch.map((id: number) => `idsProdutos[]=${id}`).join("&");
      try {
        await sleep(BLING_RATE_LIMIT_MS);
        const stockRes = await fetchWithRateLimit(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
        const stockJson = await stockRes.json();
        for (const s of (stockJson?.data || [])) {
          varStockMap.set(s.produto?.id, s.saldoVirtualTotal ?? 0);
        }
      } catch (_) { /* ignore stock errors */ }
    }

    for (const v of parentDetail.variacoes) {
      const varStock = varStockMap.get(v.id) ?? 0;
      const varPrice = (v.preco && v.preco > 0) ? v.preco : basePrice;
      const varActive = v.situacao !== "I"; // default active unless explicitly inactive

      // Extract attributes directly from the variacoes array data (no extra API call needed)
      // The variacoes array already contains nome, codigo, atributos
      const extracted = extractAttributesFromBlingVariation(v, v.nome || "", "");
      const priceModifier = varPrice - basePrice;
      const varData: any = {
        product_id: productId,
        size: extracted.size,
        color: extracted.color,
        color_hex: extracted.colorHex,
        stock_quantity: varStock,
        sku: extracted.sku || v.codigo || null,
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

  // Source 2: Variation items discovered from the listing (matched by name pattern)
  // OPTIMIZED: Don't make individual API calls - extract attributes from listing name
  // Stock will be batch-updated later via sync_stock
  if (variationItems.length > 0) {
    // Batch fetch stock for all variation items at once (max 50 per request)
    const varStockMap = new Map<number, number>();
    for (let i = 0; i < variationItems.length; i += 50) {
      const batch = variationItems.slice(i, i + 50);
      const idsParam = batch.map(v => `idsProdutos[]=${v.blingId}`).join("&");
      try {
        await sleep(BLING_RATE_LIMIT_MS);
        const stockRes = await fetchWithRateLimit(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
        const stockJson = await stockRes.json();
        for (const s of (stockJson?.data || [])) {
          varStockMap.set(s.produto?.id, s.saldoVirtualTotal ?? 0);
        }
      } catch (_) { /* ignore stock errors */ }
    }

    for (const vi of variationItems) {
      const { data: alreadySynced } = await supabase
        .from("product_variants")
        .select("id")
        .eq("bling_variant_id", vi.blingId)
        .maybeSingle();

      if (alreadySynced && syncedVariantIds.has(alreadySynced.id)) continue;

      // Extract attributes directly from the listing name - NO individual API call needed
      const extracted = parseVariationAttributes(vi.attributes || vi.name);
      const varStock = varStockMap.get(vi.blingId) ?? 0;
      
      const varData: any = {
        product_id: productId,
        size: extracted.size,
        color: extracted.color,
        color_hex: extracted.colorHex,
        stock_quantity: varStock,
        sku: null, // SKU will come from Bling detail if needed later
        is_active: true,
        bling_variant_id: vi.blingId,
        price_modifier: 0,
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
  }

  // If no variants at all, create a default "Único"
  if (variantCount === 0) {
    let stockQty = 0;
    try {
      const stockRes = await fetchWithRateLimit(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${parentBlingId}`, { headers });
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
async function syncProducts(supabase: any, token: string, batchLimit: number = 0, batchOffset: number = 0, newOnly: boolean = false) {
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

  // Bling category ID → name resolver (caches results)
  const blingCategoryCache = new Map<number, string>();
  async function resolveBlingCategory(blingCatId: number | null): Promise<string> {
    if (!blingCatId) return "";
    if (blingCategoryCache.has(blingCatId)) return blingCategoryCache.get(blingCatId)!;
    try {
      await sleep(BLING_RATE_LIMIT_MS);
      const res = await fetchWithRateLimit(`${BLING_API_URL}/categorias/produtos/${blingCatId}`, { headers });
      const json = await res.json();
      const name = json?.data?.descricao || json?.data?.nome || "";
      blingCategoryCache.set(blingCatId, name);
      console.log(`Bling category ${blingCatId} → "${name}"`);
      return name;
    } catch (e) {
      console.error(`Error fetching Bling category ${blingCatId}:`, e);
      blingCategoryCache.set(blingCatId, "");
      return "";
    }
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
    await sleep(BLING_RATE_LIMIT_MS);
    const res = await fetchWithRateLimit(url, { headers });
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
  const variationBlingIds = new Set<number>(); // Track all variation Bling IDs for cleanup
  
  // NEW: Group variations by base name when they don't have (PARENT_ID) pattern
  const baseNameGroups = new Map<string, ListingItem[]>();
  let patternOneCount = 0;
  let patternTwoCount = 0;

  for (const item of allListingItems) {
    const { parentBlingId, baseName, attributes, hasAttributes } = extractParentInfoFromName(item.nome);

    if (parentBlingId) {
      // Pattern 1: Has explicit parent ID "(PARENT_ID)" in name
      variationBlingIds.add(item.id);
      patternOneCount++;
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
    } else if (hasAttributes) {
      // Pattern 2: Has "Cor:X;Tamanho:Y" suffix but no parent ID
      // This is a variation in Bling V3 format - group by base name
      const key = baseName.toLowerCase().trim();
      if (!baseNameGroups.has(key)) {
        baseNameGroups.set(key, []);
      }
      baseNameGroups.get(key)!.push(item);
      variationBlingIds.add(item.id);
      patternTwoCount++;
    } else {
      // No attributes, no parent ID → could be parent or simple product
      standaloneItems.push(item);
    }
  }

  // Match standalone items to their role: parent of a group, or truly simple
  for (const item of standaloneItems) {
    const key = item.nome.toLowerCase().trim();
    
    // Check if this standalone item is the parent for a baseName group (Pattern 2)
    if (baseNameGroups.has(key)) {
      const childItems = baseNameGroups.get(key)!;
      groups.set(item.id, {
        parentBlingId: item.id,
        parentListItem: item,
        variationItems: childItems.map(child => {
          const parsed = extractParentInfoFromName(child.nome);
          return {
            blingId: child.id,
            name: parsed.baseName,
            attributes: parsed.attributes,
          };
        }),
        isSimple: false,
      });
      baseNameGroups.delete(key); // matched!
    } else if (groups.has(item.id)) {
      // Referenced as parent by Pattern 1 items
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

  // Handle remaining baseNameGroups that had no matching parent in the listing
  // These are variations whose parent might be inactive or not in the listing
  // Use the first child to fetch detail and find the actual parent via produtoPai
  for (const [key, childItems] of baseNameGroups) {
    if (childItems.length > 0) {
      const firstChild = childItems[0];
      const parsed = extractParentInfoFromName(firstChild.nome);
      groups.set(firstChild.id, {
        parentBlingId: firstChild.id,
        parentListItem: null,
        variationItems: childItems.map(child => {
          const p = extractParentInfoFromName(child.nome);
          return {
            blingId: child.id,
            name: p.baseName,
            attributes: p.attributes,
          };
        }),
        isSimple: false,
      });
    }
  }

  console.log(`Classified into ${groups.size} product groups (${standaloneItems.length} standalone, ${patternOneCount} pattern1-variations, ${patternTwoCount} pattern2-variations)`);

  // ─── PHASE 3: Process each group ───
  // OPTIMIZATION: Process groups with variations FIRST, then simple products
  // Skip simple products that already exist in DB to avoid API timeout
  const processedParentIds = new Set<number>();
  
  // Collect all existing products by bling_product_id for quick lookup
  const { data: existingProducts } = await supabase
    .from("products")
    .select("id, bling_product_id")
    .not("bling_product_id", "is", null);
  const existingBlingIds = new Set((existingProducts || []).map((p: any) => p.bling_product_id));

  // Sort: process groups WITH variations first, then simple products
  const sortedGroups = [...groups.entries()].sort((a, b) => {
    const aHasVars = !a[1].isSimple && a[1].variationItems.length > 0;
    const bHasVars = !b[1].isSimple && b[1].variationItems.length > 0;
    if (aHasVars && !bHasVars) return -1;
    if (!aHasVars && bHasVars) return 1;
    return 0;
  });

  // Apply batch offset/limit if specified
  let processableGroups = sortedGroups;
  if (batchOffset > 0) {
    processableGroups = processableGroups.slice(batchOffset);
  }
  if (batchLimit > 0) {
    processableGroups = processableGroups.slice(0, batchLimit);
  }
  console.log(`Processing ${processableGroups.length} groups (offset=${batchOffset}, limit=${batchLimit || 'all'}, total=${sortedGroups.length})`);

  for (const [parentBlingId, group] of processableGroups) {
    if (processedParentIds.has(parentBlingId)) continue;
    processedParentIds.add(parentBlingId);

    // Skip products that already exist in our DB
    // In new_only mode: skip ALL existing. In normal mode: skip only simple (variations still update).
    if (existingBlingIds.has(parentBlingId)) {
      if (newOnly || group.isSimple) {
        totalSkipped++;
        syncLog.push({ bling_id: parentBlingId, name: group.parentListItem?.nome || `ID ${parentBlingId}`, status: 'skipped', message: 'Produto já existe no banco', variants: 0 });
        continue;
      }
    }

    try {
      await sleep(BLING_RATE_LIMIT_MS);
      const detailRes = await fetchWithRateLimit(`${BLING_API_URL}/produtos/${parentBlingId}`, { headers });
      
      if (!detailRes.ok) {
        const errBody = await detailRes.text();
        syncLog.push({ bling_id: parentBlingId, name: group.parentListItem?.nome || `ID ${parentBlingId}`, status: 'error', message: `API retornou ${detailRes.status}: ${errBody.substring(0, 200)}`, variants: 0 });
        totalErrors++;
        continue;
      }
      
      const detailJson = await detailRes.json();
      let parentDetail = detailJson?.data;

      if (!parentDetail) {
        // Parent not found in API - might have been deleted
        // If we have variation items, try to construct from first variation
        if (group.variationItems.length > 0) {
          await sleep(BLING_RATE_LIMIT_MS);
          const firstVarRes = await fetchWithRateLimit(`${BLING_API_URL}/produtos/${group.variationItems[0].blingId}`, { headers });
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

      // If the fetched detail itself is a child variation, find its actual parent
      // In Bling V3: formato "V" means "com variações" - used for BOTH parents and children
      // Parents have variacoes[] array, children have produtoPai field
      if (parentDetail.formato === "V") {
        const actualParentId = parentDetail.produtoPai?.id || parentDetail.idProdutoPai;
        
        if (actualParentId) {
          // This IS a child variation pointing to an actual parent
          if (processedParentIds.has(actualParentId)) {
            syncLog.push({ bling_id: parentBlingId, name: parentDetail.nome, status: 'skipped', message: 'Variação já processada pelo pai', variants: 0 });
            totalSkipped++;
            continue;
          }
          // Redirect: fetch actual parent and process it instead
          await sleep(BLING_RATE_LIMIT_MS);
          const actualRes = await fetchWithRateLimit(`${BLING_API_URL}/produtos/${actualParentId}`, { headers });
          const actualJson = await actualRes.json();
          if (actualJson?.data) {
            parentDetail = actualJson.data;
            processedParentIds.add(actualParentId);
            // Add current item as variation if it has attributes
            const parsed = extractParentInfoFromName(group.parentListItem?.nome || "");
            if (parsed.hasAttributes) {
              group.variationItems.push({
                blingId: parentBlingId,
                name: parsed.baseName,
                attributes: parsed.attributes,
              });
            }
          } else {
            syncLog.push({ bling_id: parentBlingId, name: parentDetail.nome, status: 'skipped', message: 'Pai real não encontrado na API', variants: 0 });
            totalSkipped++;
            continue;
          }
        }
        // If no actualParentId → this IS the parent (has variacoes[] or our variationItems)
        // Continue processing normally below
      }

      // Log grouped variations
      for (const vi of group.variationItems) {
        syncLog.push({ bling_id: vi.blingId, name: `${vi.name} ${vi.attributes}`, status: 'grouped', message: `Agrupado sob pai ${parentBlingId} (${parentDetail.nome})`, variants: 0 });
      }

      const result = await upsertParentWithVariants(
        supabase, headers, parentDetail, parentDetail.id || parentBlingId,
        group.variationItems, getCategoryId, resolveBlingCategory
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
  // Use the variationBlingIds set (collected from listing) - NO extra API calls needed
  const { data: blingProducts } = await supabase
    .from("products")
    .select("id, bling_product_id, name")
    .not("bling_product_id", "is", null);

  let cleaned = 0;
  if (blingProducts?.length) {
    for (const prod of blingProducts) {
      // If this product's bling_product_id is in our variation set, it shouldn't be a standalone product
      if (variationBlingIds.has(prod.bling_product_id)) {
        // Delete it - it's a variation that was incorrectly imported as a product
        await supabase.from("product_images").delete().eq("product_id", prod.id);
        await supabase.from("product_variants").delete().eq("product_id", prod.id);
        await supabase.from("product_characteristics").delete().eq("product_id", prod.id);
        await supabase.from("products").delete().eq("id", prod.id);
        cleaned++;
        syncLog.push({ bling_id: prod.bling_product_id, name: prod.name, status: 'skipped', message: 'Removido (era variação importada como produto)', variants: 0 });
      }
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
    totalGroups: sortedGroups.length,
    totalProcessed: processedParentIds.size,
    batchOffset: batchOffset,
    batchLimit: batchLimit || sortedGroups.length,
    hasMore: batchLimit > 0 && (batchOffset + batchLimit) < sortedGroups.length,
    nextOffset: batchLimit > 0 ? batchOffset + batchLimit : 0,
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

    await sleep(BLING_RATE_LIMIT_MS);
    const res = await fetchWithRateLimit(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
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
        result = await syncProducts(supabase, token, payload.limit || 0, payload.offset || 0, payload.new_only === true);
        break;

      case "debug_product": {
        if (!payload.search) throw new Error("Informe o campo 'search' com nome ou ID do produto");
        const headers = blingHeaders(token);
        
        // Search by name in Bling
        let blingProduct: any = null;
        const searchUrl = `${BLING_API_URL}/produtos?pesquisa=${encodeURIComponent(payload.search)}&limite=5`;
        const searchRes = await fetchWithRateLimit(searchUrl, { headers });
        const searchJson = await searchRes.json();
        
        const listings = searchJson?.data || [];
        const debugInfo: any = { listings: listings.map((p: any) => ({ id: p.id, nome: p.descricao || p.nome, formato: p.formato })) };
        
        if (listings.length > 0) {
          // Fetch detail of first match
          const firstId = listings[0].id;
          await sleep(BLING_RATE_LIMIT_MS);
          const detailRes = await fetchWithRateLimit(`${BLING_API_URL}/produtos/${firstId}`, { headers });
          const detailJson = await detailRes.json();
          blingProduct = detailJson?.data;
          
          debugInfo.detail = {
            id: blingProduct?.id,
            nome: blingProduct?.nome,
            formato: blingProduct?.formato,
            situacao: blingProduct?.situacao,
            codigo: blingProduct?.codigo,
            preco: blingProduct?.preco,
            categoria: blingProduct?.categoria,
            produtoPai: blingProduct?.produtoPai || blingProduct?.idProdutoPai,
            atributos: blingProduct?.atributos,
            variacoes: blingProduct?.variacoes?.map((v: any) => ({
              id: v.id,
              nome: v.nome,
              codigo: v.codigo,
              preco: v.preco,
              atributos: v.atributos,
            })),
            variacoesCount: blingProduct?.variacoes?.length || 0,
          };
          
          // If it has variations, fetch detail of first variation
          if (blingProduct?.variacoes?.length > 0) {
            const firstVarId = blingProduct.variacoes[0].id;
            await sleep(BLING_RATE_LIMIT_MS);
            const varRes = await fetchWithRateLimit(`${BLING_API_URL}/produtos/${firstVarId}`, { headers });
            const varJson = await varRes.json();
            const varDetail = varJson?.data;
            debugInfo.firstVariationDetail = {
              id: varDetail?.id,
              nome: varDetail?.nome,
              codigo: varDetail?.codigo,
              formato: varDetail?.formato,
              produtoPai: varDetail?.produtoPai || varDetail?.idProdutoPai,
              atributos: varDetail?.atributos,
              variacao: varDetail?.variacao,
              estoque: varDetail?.estoque,
            };
            
            // Test our attribute extraction
            const extracted = extractAttributesFromBlingVariation(varDetail, blingProduct.variacoes[0].nome || "", "");
            debugInfo.extractedAttributes = extracted;
          }
          
          // Also test name parsing
          debugInfo.nameParseTest = extractParentInfoFromName(listings[0].descricao || listings[0].nome || "");
        }
        
        result = debugInfo;
        break;
      }

      case "sync_stock":
        result = await syncStock(supabase, token);
        break;

      case "cleanup_variations": {
        // Remove products that are actually variations (have Cor:X;Tamanho:Y in name)
        // These should be variants under their parent, not standalone products
        const { data: variationProducts } = await supabase
          .from("products")
          .select("id, name, bling_product_id")
          .or("name.like.%Cor:%,name.like.%Tamanho:%");
        
        let cleanedCount = 0;
        const cleanedNames: string[] = [];
        for (const prod of (variationProducts || [])) {
          // Verify this product's bling_product_id exists as a variant under another product
          const { data: existsAsVariant } = await supabase
            .from("product_variants")
            .select("id")
            .eq("bling_variant_id", prod.bling_product_id)
            .maybeSingle();
          
          if (existsAsVariant) {
            // Safe to delete - it exists as a variant under its parent
            await supabase.from("product_images").delete().eq("product_id", prod.id);
            await supabase.from("product_variants").delete().eq("product_id", prod.id);
            await supabase.from("product_characteristics").delete().eq("product_id", prod.id);
            await supabase.from("buy_together_products").delete().eq("product_id", prod.id);
            await supabase.from("buy_together_products").delete().eq("related_product_id", prod.id);
            await supabase.from("products").delete().eq("id", prod.id);
            cleanedCount++;
            cleanedNames.push(prod.name);
          }
        }
        
        result = { cleaned: cleanedCount, names: cleanedNames.slice(0, 20) };
        break;
      }

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
