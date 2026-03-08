import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFirstImportFields, getConfigAwareUpdateFields, DEFAULT_SYNC_CONFIG, getSyncConfig } from "../_shared/bling-sync-fields.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { fetchWithRateLimit } from "../_shared/blingFetchWithRateLimit.ts";
import { getValidTokenSafe } from "../_shared/blingTokenRefresh.ts";
import { hasRecentLocalMovements } from "../_shared/blingStockPush.ts";
import type { BlingSyncConfig } from "../_shared/bling-sync-fields.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BLING_API_URL = "https://api.bling.com.br/Api/v3";
const BLING_RATE_LIMIT_MS = 340;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// fetchWithRateLimit is now imported from _shared/blingFetchWithRateLimit.ts

const STANDARD_SIZES = ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44'];

const COLOR_MAP: Record<string, string> = {
  'preto': '#000000', 'branco': '#FFFFFF', 'vermelho': '#EF4444', 'azul': '#3B82F6',
  'rosa': '#EC4899', 'nude': '#D4A574', 'caramelo': '#C68642', 'marrom': '#8B4513',
  'dourado': '#FFD700', 'prata': '#C0C0C0', 'verde': '#22C55E', 'bege': '#F5F5DC',
  'amarelo': '#EAB308', 'laranja': '#F97316', 'cinza': '#6B7280', 'vinho': '#722F37',
  'bordo': '#800020', 'coral': '#FF7F50', 'lilas': '#C8A2C8', 'roxo': '#7C3AED',
  'creme': '#FFFDD0', 'camel': '#C19A6B', 'off white': '#FAF9F6', 'off-white': '#FAF9F6',
  'animal print': '#C68642', 'onca': '#C68642', 'oncinha': '#C68642', 'leopardo': '#C68642',
  'zebra': '#000000', 'snake': '#8B8682', 'croco': '#556B2F', 'jeans': '#4169E1',
  'mostarda': '#FFDB58', 'terracota': '#E2725B', 'areia': '#C2B280', 'petroleo': '#1B3A4B',
  'oliva': '#808000', 'chocolate': '#7B3F00', 'cafe': '#6F4E37', 'cappuccino': '#A78B71',
  'cobre': '#B87333', 'bronze': '#CD7F32', 'ouro': '#FFD700', 'rose': '#FF007F',
  'rosê': '#FF007F', 'rose gold': '#B76E79', 'champagne': '#F7E7CE', 'perola': '#F0EAD6',
  'pérola': '#F0EAD6', 'turquesa': '#40E0D0', 'marsala': '#986868', 'goiaba': '#E85D75',
  'salmao': '#FA8072', 'salmão': '#FA8072', 'fuchsia': '#FF00FF', 'magenta': '#FF00FF',
  'grafite': '#474A51', 'caqui': '#C3B091', 'mel': '#EB9605', 'natural': '#F5F5DC',
  'transparente': '#FFFFFF', 'multicolor': '#FF69B4', 'colorido': '#FF69B4',
};
const COLOR_KEYWORDS = Object.keys(COLOR_MAP);

interface SyncLogEntry {
  bling_id: number;
  name: string;
  status: 'imported' | 'updated' | 'skipped' | 'error' | 'grouped' | 'linked_sku' | 'ignored_inactive';
  message: string;
  variants: number;
}

function createSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// getSyncConfig is now imported from _shared/bling-sync-fields.ts

// getValidToken is now imported as getValidTokenSafe from _shared/blingTokenRefresh.ts
async function getValidToken(supabase: any): Promise<string> {
  return getValidTokenSafe(supabase);
}

function blingHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function generateHexFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const clamp = (v: number) => Math.min(220, Math.max(40, Math.abs(v) & 0xFF));
  return `#${clamp(hash >> 0).toString(16).padStart(2, '0')}${clamp(hash >> 8).toString(16).padStart(2, '0')}${clamp(hash >> 16).toString(16).padStart(2, '0')}`;
}

function normalizeSize(raw: string): string {
  if (!raw) return "Único";
  const trimmed = raw.trim();
  const numMatch = trimmed.match(/^(\d+)/);
  if (numMatch) {
    const num = numMatch[1];
    if (STANDARD_SIZES.includes(num)) return num;
    const str = String(parseInt(num, 10));
    if (STANDARD_SIZES.includes(str)) return str;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "único" || lower === "unico" || lower === "u" || lower === "un") return "Único";
  if (["p", "pp", "m", "g", "gg", "xg"].includes(lower)) return trimmed.toUpperCase();
  return trimmed;
}

function extractColorFromName(name: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const sorted = [...COLOR_KEYWORDS].sort((a, b) => b.length - a.length);
  for (const keyword of sorted) {
    const nk = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (lower.includes(nk)) return keyword.charAt(0).toUpperCase() + keyword.slice(1);
  }
  return null;
}

function extractSizeFromName(name: string): string | null {
  if (!name) return null;
  const m1 = name.match(/tamanho\s*[:=]\s*(\d+)/i); if (m1) return m1[1];
  const m2 = name.match(/tam\.?\s*(\d+)/i); if (m2) return m2[1];
  const m3 = name.match(/n[uú]mero?\s*[:=]\s*(\d+)/i); if (m3) return m3[1];
  const sn = name.match(/\b(3[3-9]|4[0-4])\b/g);
  if (sn && sn.length === 1) return sn[0];
  const cm = name.match(/\b(PP|GG|XG|EXG|EXGG)\b/i) || name.match(/\b([PMGU])\b/i);
  if (cm) return cm[1].toUpperCase();
  return null;
}

function parseVariationAttributes(nome: string): { size: string; color: string | null; colorHex: string | null } {
  if (!nome) return { size: "Único", color: null, colorHex: null };
  const parts: Record<string, string> = {};
  nome.replace(/\|/g, ";").split(";").forEach(part => {
    const idx = part.indexOf(":");
    if (idx > 0) { const k = part.substring(0, idx).trim().toLowerCase(); const v = part.substring(idx + 1).trim(); if (k && v) parts[k] = v; }
  });
  let rawSize = parts["tamanho"] || parts["tam"] || parts["size"] || parts["numero"] || parts["num"] || null;
  let color = parts["cor"] || parts["color"] || parts["colour"] || null;
  if (!rawSize) rawSize = extractSizeFromName(nome);
  if (!color) color = extractColorFromName(nome);
  let colorHex: string | null = null;
  if (color) {
    const nc = color.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    colorHex = COLOR_MAP[nc] || COLOR_MAP[color.toLowerCase()] || generateHexFromString(nc);
  }
  return { size: normalizeSize(rawSize || "Único"), color, colorHex };
}

function extractAttributesFromBlingVariation(varDetail: any, listingName: string, listingAttributes: string): { size: string; color: string | null; colorHex: string | null; sku: string | null } {
  let parsed = { size: "Único", color: null as string | null, colorHex: null as string | null };
  if (varDetail?.atributos?.length) {
    for (const attr of varDetail.atributos) {
      const an = (attr.nome || attr.name || "").toLowerCase().trim();
      const av = (attr.valor || attr.value || "").trim();
      if (!av) continue;
      if (["tamanho", "tam", "size", "numero"].includes(an)) parsed.size = normalizeSize(av);
      else if (["cor", "color", "colour"].includes(an)) {
        parsed.color = av.charAt(0).toUpperCase() + av.slice(1);
        const nc = av.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        parsed.colorHex = COLOR_MAP[nc] || COLOR_MAP[av.toLowerCase()] || generateHexFromString(nc);
      }
    }
    if (parsed.size !== "Único" || parsed.color) return { ...parsed, sku: varDetail?.codigo || null };
  }
  if (varDetail?.variacao?.nome) parsed = parseVariationAttributes(varDetail.variacao.nome);
  if (parsed.size === "Único" && !parsed.color && varDetail?.nome) parsed = parseVariationAttributes(varDetail.nome);
  if (parsed.size === "Único" && !parsed.color && listingAttributes) {
    const fa = parseVariationAttributes(listingAttributes);
    if (fa.size !== "Único") parsed.size = fa.size;
    if (fa.color) { parsed.color = fa.color; parsed.colorHex = fa.colorHex; }
  }
  const fullName = varDetail?.nome || listingName || "";
  if (parsed.size === "Único") { const s = extractSizeFromName(fullName); if (s) parsed.size = normalizeSize(s); }
  if (!parsed.color) {
    const c = extractColorFromName(fullName);
    if (c) { parsed.color = c; const nc = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); parsed.colorHex = COLOR_MAP[nc] || COLOR_MAP[c.toLowerCase()] || generateHexFromString(nc); }
  }
  return { ...parsed, sku: varDetail?.codigo || null };
}

function extractParentInfoFromName(name: string): { parentBlingId: number | null; baseName: string; attributes: string; hasAttributes: boolean } {
  const match = name.match(/^(.+?)\s*\((\d+)\)\s*(.*)$/);
  if (match) return { baseName: match[1].trim(), parentBlingId: parseInt(match[2], 10), attributes: match[3].trim(), hasAttributes: !!match[3].trim() };
  const attrMatch = name.match(/^(.+?)\s+((?:Cor|Tamanho|cor|tamanho)\s*:.+)$/i);
  if (attrMatch) return { baseName: attrMatch[1].trim(), parentBlingId: null, attributes: attrMatch[2].trim(), hasAttributes: true };
  return { parentBlingId: null, baseName: name, attributes: "", hasAttributes: false };
}

async function findOrCreateCategory(supabase: any, categoryName: string): Promise<string | null> {
  if (!categoryName) return null;
  let { data: cat } = await supabase.from("categories").select("id").eq("name", categoryName).maybeSingle();
  if (cat) return cat.id;
  const normalized = categoryName.toLowerCase().trim();
  const { data: allCats } = await supabase.from("categories").select("id, name");
  if (allCats?.length) {
    const match = allCats.find((c: any) => { const n = c.name.toLowerCase().trim(); return n === normalized || n.includes(normalized) || normalized.includes(n); });
    if (match) return match.id;
    const inputWords = normalized.split(/\s+/).filter(w => w.length > 2);
    let bestMatch: any = null, bestScore = 0;
    for (const c of allCats) {
      const catWords = c.name.toLowerCase().trim().split(/\s+/).filter((w: string) => w.length > 2);
      const overlap = inputWords.filter(w => catWords.some((cw: string) => cw.includes(w) || w.includes(cw))).length;
      const score = overlap / Math.max(inputWords.length, catWords.length);
      if (score > bestScore && score >= 0.5) { bestScore = score; bestMatch = c; }
    }
    if (bestMatch) return bestMatch.id;
  }
  const catSlug = slugify(categoryName);
  const { data: existingSlug } = await supabase.from("categories").select("id").eq("slug", catSlug).maybeSingle();
  const finalSlug = existingSlug ? `${catSlug}-${Date.now()}` : catSlug;
  const { data: newCat } = await supabase.from("categories").insert({ name: categoryName, slug: finalSlug, is_active: true }).select("id").single();
  return newCat?.id || null;
}

// ─── Download image from external URL and re-upload to Supabase Storage ───
async function downloadAndReuploadImage(supabase: any, imageUrl: string, productId: string, index: number): Promise<string> {
  try {
    // If already a Supabase public URL, return as-is
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    if (imageUrl.includes(supabaseUrl) && !imageUrl.includes("Expires=")) {
      return imageUrl;
    }

    // Download image
    const response = await fetchWithTimeout(imageUrl);
    if (!response.ok) {
      console.warn(`[sync] Failed to download image: ${response.status} - ${imageUrl.substring(0, 100)}`);
      // Return URL without signature as fallback (will be broken but at least clean)
      return imageUrl.split("?")[0];
    }

    const blob = await response.blob();
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const fileName = `bling/${productId}/${index}-${Date.now()}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("product-media")
      .upload(fileName, blob, { contentType, upsert: true });

    if (uploadError) {
      console.warn(`[sync] Failed to upload image to storage: ${uploadError.message}`);
      return imageUrl.split("?")[0];
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("product-media")
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (err: any) {
    console.warn(`[sync] Image re-upload error: ${err.message}`);
    return imageUrl.split("?")[0];
  }
}

// ─── Upsert a parent product and all its variants (config-aware) ───
async function upsertParentWithVariants(
  supabase: any, headers: any, parentDetail: any, parentBlingId: number,
  variationItems: Array<{ blingId: number; name: string; attributes: string }>,
  getCategoryId: (name: string) => Promise<string | null>,
  resolveBlingCategory: (blingCatId: number | null) => Promise<string>,
  config: BlingSyncConfig
): Promise<{ imported: boolean; updated: boolean; linkedBySku: boolean; variantCount: number; error?: string }> {
  const slug = slugify(parentDetail.nome || `produto-${parentBlingId}`);
  const basePrice = parentDetail.preco || 0;
  const blingCatId = parentDetail.categoria?.id || null;
  const categoryName = await resolveBlingCategory(blingCatId);
  const categoryId = await getCategoryId(categoryName);

  // Check if product exists by bling_product_id
  let existing = await supabase.from("products").select("id, is_active").eq("bling_product_id", parentBlingId).maybeSingle().then((r: any) => r.data);

  // SKU merge: try finding by SKU if not found by bling_id
  let linkedBySku = false;
  if (!existing && config.merge_by_sku && parentDetail.codigo) {
    // Try matching product by SKU via variants
    const { data: skuVar } = await supabase.from("product_variants").select("id, product_id").eq("sku", parentDetail.codigo).maybeSingle();
    if (skuVar) {
      // Link the product to this bling_product_id
      await supabase.from("products").update({ bling_product_id: parentBlingId }).eq("id", skuVar.product_id);
      existing = await supabase.from("products").select("id, is_active").eq("id", skuVar.product_id).maybeSingle().then((r: any) => r.data);
      linkedBySku = true;
      console.log(`[sync] Linked product ${skuVar.product_id} to bling_id=${parentBlingId} via SKU=${parentDetail.codigo}`);
    }
  }

  let productId: string;
  let imported = false;
  let updated = false;

  if (existing) {
    // CRITICAL: Skip inactive products entirely
    if (existing.is_active === false) {
      return { imported: false, updated: false, linkedBySku, variantCount: 0, error: "Produto inativo — ignorado" };
    }

    // Update only config-enabled fields (NEVER touch is_active, slug, category_id)
    const updateData = getConfigAwareUpdateFields(parentDetail, config);
    updateData.bling_product_id = parentBlingId;
    
    if (Object.keys(updateData).length > 1) { // more than just bling_product_id
      await supabase.from("products").update(updateData).eq("id", existing.id);
    }
    productId = existing.id;
    updated = true;
  } else {
    if (!config.import_new_products) {
      return { imported: false, updated: false, linkedBySku: false, variantCount: 0, error: "Importação de novos desabilitada" };
    }
    // Full import for new products
    const insertData: any = {
      ...getFirstImportFields(parentDetail),
      bling_product_id: parentBlingId,
      mpn: parentDetail.codigo || null,
      material: null,
      is_new: parentDetail.lancamento === true || parentDetail.lancamento === "S",
      category_id: categoryId,
    };
    const { data: slugExists } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
    insertData.slug = slugExists ? `${slug}-${parentBlingId}` : slug;
    const { data: newProd, error: insertErr } = await supabase.from("products").insert(insertData).select("id").single();
    if (insertErr) return { imported: false, updated: false, linkedBySku: false, variantCount: 0, error: `Insert error: ${insertErr.message}` };
    productId = newProd.id;
    imported = true;
  }

  // Sync images: only on first import OR if sync_images is enabled
  // IMPORTANT: Download from Bling and re-upload to Supabase Storage to avoid signed URL expiration
  if ((imported && parentDetail.midia?.imagens?.internas?.length) ||
      (updated && config.sync_images && parentDetail.midia?.imagens?.internas?.length)) {
    await supabase.from("product_images").delete().eq("product_id", productId);
    const images: any[] = [];
    for (let idx = 0; idx < parentDetail.midia.imagens.internas.length; idx++) {
      const img = parentDetail.midia.imagens.internas[idx];
      const publicUrl = await downloadAndReuploadImage(supabase, img.link, productId, idx);
      images.push({
        product_id: productId,
        url: publicUrl,
        is_primary: idx === 0,
        display_order: idx,
        alt_text: parentDetail.nome,
      });
    }
    if (images.length > 0) {
      await supabase.from("product_images").insert(images);
    }
  }

  // Sync characteristics only on first import
  if (imported) {
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
      await supabase.from("product_characteristics").insert(characteristics.map((c, idx) => ({ product_id: productId, name: c.name, value: c.value, display_order: idx })));
    }
  }

  // ─── Sync Variants ───
  let variantCount = 0;
  const syncedVariantIds = new Set<string>();

  if (parentDetail.variacoes?.length) {
    const varIds = parentDetail.variacoes.map((v: any) => v.id);
    const varStockMap = new Map<number, number>();
    if (config.sync_stock || imported) {
      for (let i = 0; i < varIds.length; i += 50) {
        const batch = varIds.slice(i, i + 50);
        const idsParam = batch.map((id: number) => `idsProdutos[]=${id}`).join("&");
        try { await sleep(BLING_RATE_LIMIT_MS); const stockRes = await fetchWithRateLimit(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers }); const stockJson = await stockRes.json(); for (const s of (stockJson?.data || [])) varStockMap.set(s.produto?.id, s.saldoVirtualTotal ?? 0); } catch (_) {}
      }
    }

    for (const v of parentDetail.variacoes) {
      const varStock = varStockMap.get(v.id) ?? 0;
      const varPrice = (v.preco && v.preco > 0) ? v.preco : basePrice;
      const extracted = extractAttributesFromBlingVariation(v, v.nome || "", "");
      const priceModifier = varPrice - basePrice;

      // Check existing variant by bling_variant_id
      let existingVar = await supabase.from("product_variants").select("id").eq("bling_variant_id", v.id).maybeSingle().then((r: any) => r.data);

      // SKU merge for variants
      if (!existingVar && config.merge_by_sku && (extracted.sku || v.codigo)) {
        const sku = extracted.sku || v.codigo;
        const { data: skuMatch } = await supabase.from("product_variants").select("id").eq("product_id", productId).eq("sku", sku).maybeSingle();
        if (skuMatch) {
          await supabase.from("product_variants").update({ bling_variant_id: v.id }).eq("id", skuMatch.id);
          existingVar = skuMatch;
          console.log(`[sync] Linked variant ${skuMatch.id} to bling_variant_id=${v.id} via SKU=${sku}`);
        }
      }

      if (existingVar) {
        // Update existing variant: stock always if enabled, other fields per config
        const varUpdate: any = {};
        if (config.sync_stock || imported) {
          // Check for recent local movements before overwriting stock
          const hasRecent = await hasRecentLocalMovements(supabase, existingVar.id, 10);
          if (!hasRecent) {
            varUpdate.stock_quantity = varStock;
          } else {
            console.log(`[sync] Skipping stock overwrite for variant ${existingVar.id} — recent local movements`);
          }
        }
        if (config.sync_variant_active) varUpdate.is_active = v.situacao !== "I";
        // NEVER update is_active unless toggle is on
        if (Object.keys(varUpdate).length > 0) {
          await supabase.from("product_variants").update(varUpdate).eq("id", existingVar.id);
        }
        syncedVariantIds.add(existingVar.id);
      } else {
        // New variant — full data
        const varData: any = {
          product_id: productId, size: extracted.size, color: extracted.color, color_hex: extracted.colorHex,
          stock_quantity: varStock, sku: extracted.sku || v.codigo || null,
          is_active: v.situacao !== "I", bling_variant_id: v.id,
          price_modifier: priceModifier !== 0 ? priceModifier : 0,
        };
        const { data: newVar } = await supabase.from("product_variants").insert(varData).select("id").single();
        if (newVar) syncedVariantIds.add(newVar.id);
      }
      variantCount++;
    }
  }

  // Variation items from listing
  if (variationItems.length > 0) {
    const varStockMap = new Map<number, number>();
    if (config.sync_stock || imported) {
      for (let i = 0; i < variationItems.length; i += 50) {
        const batch = variationItems.slice(i, i + 50);
        const idsParam = batch.map(v => `idsProdutos[]=${v.blingId}`).join("&");
        try { await sleep(BLING_RATE_LIMIT_MS); const stockRes = await fetchWithRateLimit(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers }); const stockJson = await stockRes.json(); for (const s of (stockJson?.data || [])) varStockMap.set(s.produto?.id, s.saldoVirtualTotal ?? 0); } catch (_) {}
      }
    }

    for (const vi of variationItems) {
      const { data: alreadySynced } = await supabase.from("product_variants").select("id").eq("bling_variant_id", vi.blingId).maybeSingle();
      if (alreadySynced && syncedVariantIds.has(alreadySynced.id)) continue;
      const extracted = parseVariationAttributes(vi.attributes || vi.name);
      const varStock = varStockMap.get(vi.blingId) ?? 0;
      const varData: any = {
        product_id: productId, size: extracted.size, color: extracted.color, color_hex: extracted.colorHex,
        stock_quantity: varStock, sku: null, is_active: true, bling_variant_id: vi.blingId, price_modifier: 0,
      };
      if (alreadySynced) {
        const varUpdate: any = {};
        if (config.sync_stock || imported) {
          const hasRecent = await hasRecentLocalMovements(supabase, alreadySynced.id, 10);
          if (!hasRecent) {
            varUpdate.stock_quantity = varStock;
          } else {
            console.log(`[sync] Skipping stock overwrite for variationItem variant ${alreadySynced.id} — recent local movements`);
          }
        }
        if (Object.keys(varUpdate).length > 0) await supabase.from("product_variants").update(varUpdate).eq("id", alreadySynced.id);
        syncedVariantIds.add(alreadySynced.id);
      } else {
        const { data: newVar } = await supabase.from("product_variants").insert(varData).select("id").single();
        if (newVar) syncedVariantIds.add(newVar.id);
      }
      variantCount++;
    }
  }

  // Default "Único" variant if none
  if (variantCount === 0) {
    let stockQty = 0;
    if (config.sync_stock || imported) {
      try { const stockRes = await fetchWithRateLimit(`${BLING_API_URL}/estoques/saldos?idsProdutos[]=${parentBlingId}`, { headers }); const stockJson = await stockRes.json(); stockQty = stockJson?.data?.[0]?.saldoVirtualTotal ?? 0; } catch (_) {}
    }
    const { data: existingDefault } = await supabase.from("product_variants").select("id").eq("product_id", productId).eq("size", "Único").maybeSingle();
    if (existingDefault) {
      if (config.sync_stock || imported) await supabase.from("product_variants").update({ stock_quantity: stockQty }).eq("id", existingDefault.id);
    } else {
      await supabase.from("product_variants").insert({ product_id: productId, size: "Único", stock_quantity: stockQty, is_active: true });
    }
    variantCount = 1;
  }

  // Clean up orphaned variants — deactivate instead of delete if referenced in order_items
  const { data: allVars } = await supabase.from("product_variants").select("id").eq("product_id", productId).not("bling_variant_id", "is", null);
  for (const v of (allVars || [])) {
    if (!syncedVariantIds.has(v.id)) {
      // Check if variant is referenced in order_items before deleting
      const { data: orderRef } = await supabase.from("order_items").select("id").eq("product_variant_id", v.id).limit(1);
      if (orderRef?.length) {
        // Deactivate instead of deleting to preserve order history
        await supabase.from("product_variants").update({ is_active: false }).eq("id", v.id);
        console.log(`[sync] Deactivated orphaned variant ${v.id} (referenced in orders)`);
      } else {
        await supabase.from("product_variants").delete().eq("id", v.id);
      }
    }
  }

  return { imported, updated, linkedBySku, variantCount };
}

// ─── Main Sync Products ───
async function syncProducts(supabase: any, token: string, config: BlingSyncConfig, batchLimit: number = 0, batchOffset: number = 0, isFirstImport: boolean = false, newOnly: boolean = false) {
  const headers = blingHeaders(token);
  const syncLog: SyncLogEntry[] = [];
  let totalImported = 0, totalUpdated = 0, totalVariants = 0, totalSkipped = 0, totalErrors = 0, totalLinkedBySku = 0;

  const { data: storeSettings } = await supabase.from("store_settings").select("bling_store_id").limit(1).maybeSingle();
  const blingStoreId = (storeSettings as any)?.bling_store_id || null;

  const categoryCache = new Map<string, string | null>();
  async function getCategoryId(name: string): Promise<string | null> {
    if (categoryCache.has(name)) return categoryCache.get(name)!;
    const id = await findOrCreateCategory(supabase, name);
    categoryCache.set(name, id);
    return id;
  }

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
      return name;
    } catch (e) { blingCategoryCache.set(blingCatId, ""); return ""; }
  }

  // PHASE 1: Collect all items from Bling listing
  interface ListingItem { id: number; nome: string; formato?: string; }
  const allListingItems: ListingItem[] = [];
  let page = 1, hasMore = true;

  while (hasMore) {
    let url = `${BLING_API_URL}/produtos?pagina=${page}&limite=100`;
    if (blingStoreId) url += `&idLoja=${blingStoreId}`;
    await sleep(BLING_RATE_LIMIT_MS);
    const res = await fetchWithRateLimit(url, { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(`Bling API error [${res.status}]: ${JSON.stringify(json)}`);
    const products = json?.data || [];
    if (products.length === 0) { hasMore = false; break; }
    for (const bp of products) allListingItems.push({ id: bp.id, nome: bp.descricao || bp.nome || `ID ${bp.id}`, formato: bp.formato });
    page++;
    if (products.length < 100) hasMore = false;
  }

  // PHASE 2: Classify items
  interface ProductGroup { parentBlingId: number; parentListItem: ListingItem | null; variationItems: Array<{ blingId: number; name: string; attributes: string }>; isSimple: boolean; }
  const groups = new Map<number, ProductGroup>();
  const standaloneItems: ListingItem[] = [];
  const variationBlingIds = new Set<number>();
  const baseNameGroups = new Map<string, ListingItem[]>();

  for (const item of allListingItems) {
    const { parentBlingId, baseName, attributes, hasAttributes } = extractParentInfoFromName(item.nome);
    if (parentBlingId) {
      variationBlingIds.add(item.id);
      if (!groups.has(parentBlingId)) groups.set(parentBlingId, { parentBlingId, parentListItem: null, variationItems: [], isSimple: false });
      groups.get(parentBlingId)!.variationItems.push({ blingId: item.id, name: baseName, attributes });
    } else if (hasAttributes) {
      const key = baseName.toLowerCase().trim();
      if (!baseNameGroups.has(key)) baseNameGroups.set(key, []);
      baseNameGroups.get(key)!.push(item);
      variationBlingIds.add(item.id);
    } else {
      standaloneItems.push(item);
    }
  }

  for (const item of standaloneItems) {
    const key = item.nome.toLowerCase().trim();
    if (baseNameGroups.has(key)) {
      const childItems = baseNameGroups.get(key)!;
      groups.set(item.id, { parentBlingId: item.id, parentListItem: item, variationItems: childItems.map(child => { const p = extractParentInfoFromName(child.nome); return { blingId: child.id, name: p.baseName, attributes: p.attributes }; }), isSimple: false });
      baseNameGroups.delete(key);
    } else if (groups.has(item.id)) {
      groups.get(item.id)!.parentListItem = item;
    } else {
      groups.set(item.id, { parentBlingId: item.id, parentListItem: item, variationItems: [], isSimple: true });
    }
  }

  for (const [, childItems] of baseNameGroups) {
    if (childItems.length > 0) {
      const firstChild = childItems[0];
      groups.set(firstChild.id, { parentBlingId: firstChild.id, parentListItem: null, variationItems: childItems.map(child => { const p = extractParentInfoFromName(child.nome); return { blingId: child.id, name: p.baseName, attributes: p.attributes }; }), isSimple: false });
    }
  }

  // PHASE 3: Process groups
  const { data: existingProducts } = await supabase.from("products").select("id, bling_product_id, is_active").not("bling_product_id", "is", null);
  const existingBlingIds = new Set((existingProducts || []).map((p: any) => p.bling_product_id));
  // Build inactive set
  const inactiveBlingIds = new Set((existingProducts || []).filter((p: any) => p.is_active === false).map((p: any) => p.bling_product_id));

  const sortedGroups = [...groups.entries()].sort((a, b) => {
    const aExists = existingBlingIds.has(a[0]); const bExists = existingBlingIds.has(b[0]);
    if (!aExists && bExists) return -1; if (aExists && !bExists) return 1; return 0;
  });

  // Modo "só produtos novos": processar apenas grupos que ainda não existem no site
  const groupsToProcess = newOnly
    ? sortedGroups.filter(([parentBlingId]) => !existingBlingIds.has(parentBlingId))
    : sortedGroups;

  let processableGroups = groupsToProcess;
  if (batchOffset > 0) processableGroups = processableGroups.slice(batchOffset);
  if (batchLimit > 0) processableGroups = processableGroups.slice(0, batchLimit);

  const processedParentIds = new Set<number>();

  for (const [parentBlingId, group] of processableGroups) {
    if (processedParentIds.has(parentBlingId)) continue;
    processedParentIds.add(parentBlingId);

    // CRITICAL: Skip inactive products — never sync with Bling
    if (inactiveBlingIds.has(parentBlingId)) {
      totalSkipped++;
      syncLog.push({ bling_id: parentBlingId, name: group.parentListItem?.nome || `ID ${parentBlingId}`, status: 'ignored_inactive', message: 'Produto inativo no site — ignorado completamente', variants: 0 });
      continue;
    }

    // For non-first-import: skip existing simple products (stock via webhook/cron)
    if (!isFirstImport && existingBlingIds.has(parentBlingId)) {
      if (group.isSimple) {
        totalSkipped++;
        syncLog.push({ bling_id: parentBlingId, name: group.parentListItem?.nome || `ID ${parentBlingId}`, status: 'skipped', message: 'Produto simples já existe (estoque via webhook)', variants: 0 });
        continue;
      }
    }

    try {
      await sleep(BLING_RATE_LIMIT_MS);
      const detailRes = await fetchWithRateLimit(`${BLING_API_URL}/produtos/${parentBlingId}`, { headers });
      if (!detailRes.ok) {
        syncLog.push({ bling_id: parentBlingId, name: group.parentListItem?.nome || `ID ${parentBlingId}`, status: 'error', message: `API retornou ${detailRes.status}`, variants: 0 });
        totalErrors++; continue;
      }
      const detailJson = await detailRes.json();
      let parentDetail = detailJson?.data;

      if (!parentDetail) {
        if (group.variationItems.length > 0) {
          await sleep(BLING_RATE_LIMIT_MS);
          const firstVarRes = await fetchWithRateLimit(`${BLING_API_URL}/produtos/${group.variationItems[0].blingId}`, { headers });
          const firstVarJson = await firstVarRes.json();
          if (firstVarJson?.data) parentDetail = { ...firstVarJson.data, nome: group.variationItems[0].name, id: parentBlingId, variacoes: [] };
          else { syncLog.push({ bling_id: parentBlingId, name: `Parent ${parentBlingId}`, status: 'error', message: 'Produto não encontrado na API', variants: 0 }); totalErrors++; continue; }
        } else { syncLog.push({ bling_id: parentBlingId, name: group.parentListItem?.nome || `ID ${parentBlingId}`, status: 'error', message: 'Detalhes não encontrados', variants: 0 }); totalErrors++; continue; }
      }

      // Resolve child → parent redirect
      if (parentDetail.formato === "V") {
        const actualParentId = parentDetail.produtoPai?.id || parentDetail.idProdutoPai;
        if (actualParentId) {
          if (processedParentIds.has(actualParentId)) { totalSkipped++; continue; }
          // Check inactive
          if (inactiveBlingIds.has(actualParentId)) { totalSkipped++; syncLog.push({ bling_id: parentBlingId, name: parentDetail.nome, status: 'ignored_inactive', message: 'Pai inativo — ignorado', variants: 0 }); continue; }
          await sleep(BLING_RATE_LIMIT_MS);
          const actualRes = await fetchWithRateLimit(`${BLING_API_URL}/produtos/${actualParentId}`, { headers });
          const actualJson = await actualRes.json();
          if (actualJson?.data) {
            parentDetail = actualJson.data;
            processedParentIds.add(actualParentId);
            const parsed = extractParentInfoFromName(group.parentListItem?.nome || "");
            if (parsed.hasAttributes) group.variationItems.push({ blingId: parentBlingId, name: parsed.baseName, attributes: parsed.attributes });
          } else { totalSkipped++; continue; }
        }
      }

      for (const vi of group.variationItems) {
        syncLog.push({ bling_id: vi.blingId, name: `${vi.name} ${vi.attributes}`, status: 'grouped', message: `Agrupado sob pai ${parentBlingId}`, variants: 0 });
      }

      const result = await upsertParentWithVariants(supabase, headers, parentDetail, parentDetail.id || parentBlingId, group.variationItems, getCategoryId, resolveBlingCategory, config);

      if (result.error) {
        if (result.error.includes("inativo")) {
          syncLog.push({ bling_id: parentBlingId, name: parentDetail.nome, status: 'ignored_inactive', message: result.error, variants: 0 });
          totalSkipped++;
        } else {
          syncLog.push({ bling_id: parentBlingId, name: parentDetail.nome, status: 'error', message: result.error, variants: 0 });
          totalErrors++;
        }
      } else if (result.linkedBySku) {
        syncLog.push({ bling_id: parentBlingId, name: parentDetail.nome, status: 'linked_sku', message: `Vinculado por SKU com ${result.variantCount} variação(ões)`, variants: result.variantCount });
        totalLinkedBySku++;
        totalVariants += result.variantCount;
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
      syncLog.push({ bling_id: parentBlingId, name: group.parentListItem?.nome || `ID ${parentBlingId}`, status: 'error', message: err.message, variants: 0 });
      totalErrors++;
    }
  }

  // PHASE 4: Clean up variations imported as standalone (skip when new_only — we didn't reclassify)
  let cleaned = 0;
  if (!newOnly) {
    const { data: blingProducts } = await supabase.from("products").select("id, bling_product_id, name").not("bling_product_id", "is", null);
    if (blingProducts?.length) {
      for (const prod of blingProducts) {
        if (variationBlingIds.has(prod.bling_product_id)) {
          // Check if any variant of this product is referenced in order_items
          const { data: variantsWithOrders } = await supabase
            .from("product_variants")
            .select("id")
            .eq("product_id", prod.id);
          let hasOrderRefs = false;
          for (const v of (variantsWithOrders || [])) {
            const { data: orderRef } = await supabase.from("order_items").select("id").eq("product_variant_id", v.id).limit(1);
            if (orderRef?.length) { hasOrderRefs = true; break; }
          }
          if (hasOrderRefs) {
            // Deactivate instead of deleting to preserve order history
            await supabase.from("product_variants").update({ is_active: false }).eq("product_id", prod.id);
            await supabase.from("products").update({ is_active: false }).eq("id", prod.id);
            console.log(`[sync] Deactivated standalone variation product ${prod.id} (referenced in orders)`);
          } else {
            await supabase.from("product_images").delete().eq("product_id", prod.id);
            await supabase.from("product_variants").delete().eq("product_id", prod.id);
            await supabase.from("product_characteristics").delete().eq("product_id", prod.id);
            await supabase.from("products").delete().eq("id", prod.id);
          }
          cleaned++;
        }
      }
    }
  }

  // If this was first import, mark it and reset config to stock-only
  if (isFirstImport) {
    await supabase.from("bling_sync_config").update({
      first_import_done: true,
      sync_titles: false, sync_descriptions: false, sync_images: false,
      sync_prices: false, sync_dimensions: false, sync_sku_gtin: false,
      sync_variant_active: false,
    }).not("id", "is", null);
    console.log("[sync] First import done — config reset to stock-only");
  }

  return {
    imported: totalImported, updated: totalUpdated, variants: totalVariants, skipped: totalSkipped,
    errors: totalErrors, cleaned, linked_by_sku: totalLinkedBySku,
    totalBlingListItems: allListingItems.length, totalGroups: sortedGroups.length,
    totalNewOnly: newOnly ? groupsToProcess.length : undefined,
    totalProcessed: processedParentIds.size,
    batchOffset, batchLimit: batchLimit || groupsToProcess.length,
    hasMore: batchLimit > 0 && (batchOffset + batchLimit) < groupsToProcess.length,
    nextOffset: batchLimit > 0 ? batchOffset + batchLimit : 0,
    log: syncLog,
  };
}

// ─── Sync Stock Only (for manual "sync stock" action — active products only) ───
async function syncStock(supabase: any, token: string) {
  const headers = blingHeaders(token);
  const { data: allVariants } = await supabase.from("product_variants").select("id, bling_variant_id, product_id, sku");
  const { data: products } = await supabase.from("products").select("id, bling_product_id, is_active").not("bling_product_id", "is", null);
  if (!products?.length && !allVariants?.length) return { updated: 0 };

  // Only active products
  const activeProductIds = new Set<string>();
  const productBlingMap = new Map<string, number>();
  for (const p of (products || [])) {
    if (p.is_active === false) continue;
    activeProductIds.add(p.id);
    productBlingMap.set(p.id, p.bling_product_id);
  }

  const blingIdToVariants = new Map<number, string[]>();
  for (const v of (allVariants || [])) {
    if (!activeProductIds.has(v.product_id)) continue;
    if (v.bling_variant_id) {
      if (!blingIdToVariants.has(v.bling_variant_id)) blingIdToVariants.set(v.bling_variant_id, []);
      blingIdToVariants.get(v.bling_variant_id)!.push(v.id);
    } else {
      const pbid = productBlingMap.get(v.product_id);
      if (pbid) { if (!blingIdToVariants.has(pbid)) blingIdToVariants.set(pbid, []); blingIdToVariants.get(pbid)!.push(v.id); }
    }
  }

  const allBlingIds = [...blingIdToVariants.keys()];
  if (allBlingIds.length === 0) return { updated: 0 };

  let updated = 0;
  for (let i = 0; i < allBlingIds.length; i += 50) {
    const batch = allBlingIds.slice(i, i + 50);
    const idsParam = batch.map(id => `idsProdutos[]=${id}`).join("&");
    if (i > 0) await sleep(BLING_RATE_LIMIT_MS);
    const res = await fetchWithRateLimit(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers });
    const json = await res.json();
    if (!res.ok) { console.error("Stock sync error:", JSON.stringify(json)); continue; }
    for (const stock of (json?.data || [])) {
      const blingId = stock.produto?.id; const qty = stock.saldoVirtualTotal ?? 0;
      if (!blingId) continue;
      const variantIds = blingIdToVariants.get(blingId);
      if (variantIds) {
        for (const vid of variantIds) {
          const hasRecent = await hasRecentLocalMovements(supabase, vid, 10);
          if (hasRecent) { console.log(`[syncStock] Skipping variant ${vid} — recent local movements`); continue; }
          // Get current stock for audit trail
          const { data: currentVar } = await supabase.from("product_variants").select("stock_quantity").eq("id", vid).maybeSingle();
          const oldStock = currentVar?.stock_quantity ?? 0;
          await supabase.from("product_variants").update({ stock_quantity: qty }).eq("id", vid);
          // Record inventory movement for audit
          if (qty !== oldStock) {
            await supabase.from("inventory_movements").insert({
              variant_id: vid, quantity: qty - oldStock, type: "bling_sync",
            }).then(() => {}).catch(() => {});
          }
          updated++;
        }
      }
    }
  }

  console.log(`Stock sync complete: ${updated} updates from ${allBlingIds.length} Bling IDs (inactive skipped)`);
  return { updated, totalChecked: allBlingIds.length };
}

// ─── Create Order in Bling ───
async function createOrder(supabase: any, token: string, orderId: string) {
  const headers = blingHeaders(token);
  const { data: order, error: orderError } = await supabase.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle();
  if (orderError || !order) throw new Error(`Pedido não encontrado: ${orderError?.message || orderId}`);
  // Use customer_cpf column as primary source, fallback to regex in notes
  const cpfRaw = order.customer_cpf || order.notes?.match(/CPF:\s*([\d.\-]+)/)?.[1] || "";
  const cpf = cpfRaw.replace(/\D/g, "");
  const itens = [];
  for (const item of (order.order_items || [])) {
    let codigo = item.product_id?.substring(0, 8) || "PROD";
    // Priority: variant SKU > product SKU > fallback
    if (item.product_variant_id) {
      const { data: variant } = await supabase.from("product_variants").select("sku").eq("id", item.product_variant_id).maybeSingle();
      if (variant?.sku) codigo = variant.sku;
      else if (item.product_id) { const { data: prod } = await supabase.from("products").select("sku").eq("id", item.product_id).maybeSingle(); if (prod?.sku) codigo = prod.sku; }
    } else if (item.product_id) { const { data: prod } = await supabase.from("products").select("sku, bling_product_id").eq("id", item.product_id).maybeSingle(); if (prod?.sku) codigo = prod.sku; }
    itens.push({ descricao: item.product_name, quantidade: item.quantity, valor: item.unit_price, codigo });
  }
  const blingOrder = {
    numero: 0, data: new Date(order.created_at).toISOString().split("T")[0],
    dataSaida: new Date().toISOString().split("T")[0],
    contato: { nome: order.shipping_name, tipoPessoa: "F", numeroDocumento: cpf, contribuinte: 9 },
    itens,
    transporte: {
      fretePorConta: 0, frete: order.shipping_cost || 0, volumes: [{ servico: "Transportadora" }],
      contato: { nome: order.shipping_name },
      etiqueta: { nome: order.shipping_name, endereco: order.shipping_address, municipio: order.shipping_city, uf: order.shipping_state, cep: order.shipping_zip?.replace(/\D/g, "") },
    },
    parcelas: [{ valor: order.total_amount, dataVencimento: new Date().toISOString().split("T")[0], observacao: "Pagamento online" }],
    observacoes: `Pedido ${order.order_number} - Loja Online`, observacoesInternas: order.notes || "", numeroPedidoCompra: order.order_number,
  };
  const response = await fetchWithTimeout(`${BLING_API_URL}/pedidos/vendas`, { method: "POST", headers, body: JSON.stringify(blingOrder) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Bling API error [${response.status}]: ${JSON.stringify(data)}`);
  return { bling_order_id: data?.data?.id };
}

async function generateNfe(token: string, blingOrderId: number) {
  const headers = blingHeaders(token);
  const response = await fetchWithTimeout(`${BLING_API_URL}/nfe`, { method: "POST", headers, body: JSON.stringify({ tipo: 1, idPedidoVenda: blingOrderId }) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Bling NF-e error [${response.status}]: ${JSON.stringify(data)}`);
  const nfeId = data?.data?.id;
  if (nfeId) await fetchWithTimeout(`${BLING_API_URL}/nfe/${nfeId}/enviar`, { method: "POST", headers });
  return { nfe_id: nfeId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ─── Bug 1 Fix: Add admin authentication ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createSupabase();

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      // Also check admin_members
      const { data: memberData } = await supabase
        .from("admin_members")
        .select("role, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!memberData) {
        return new Response(JSON.stringify({ error: "Acesso negado: apenas administradores" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { action, ...payload } = await req.json();
    const token = await getValidToken(supabase);
    const config = await getSyncConfig(supabase);
    let result: any;

    switch (action) {
      case "list_stores": {
        const storesHeaders = blingHeaders(token);
        const stores: any[] = [];
        try {
          const res = await fetchWithTimeout(`${BLING_API_URL}/canais-de-venda`, { headers: storesHeaders });
          const json = await res.json();
          if (res.ok && json?.data?.length) for (const ch of json.data) stores.push({ id: ch.id, name: ch.descricao || ch.nome || `Canal ${ch.id}`, type: ch.tipo || 'loja_virtual' });
        } catch (_) {}
        if (stores.length === 0) {
          try {
            const res = await fetchWithTimeout(`${BLING_API_URL}/lojas-virtuais`, { headers: storesHeaders });
            const json = await res.json();
            if (res.ok && json?.data?.length) for (const s of json.data) stores.push({ id: s.id, name: s.descricao || s.nome || `Loja ${s.id}`, type: 'loja_virtual' });
          } catch (_) {}
        }
        result = { stores };
        break;
      }

      case "sync_products":
        result = await syncProducts(supabase, token, config, payload.limit || 0, payload.offset || 0, false, !!payload.new_only);
        break;

      case "first_import":
        result = await syncProducts(supabase, token, { ...config, import_new_products: true, merge_by_sku: true }, payload.limit || 0, payload.offset || 0, true);
        break;

      case "sync_stock":
        result = await syncStock(supabase, token);
        break;

      case "get_sync_config":
        result = config;
        break;

      case "debug_product": {
        if (!payload.search) throw new Error("Informe o campo 'search'");
        const headers = blingHeaders(token);
        const searchUrl = `${BLING_API_URL}/produtos?pesquisa=${encodeURIComponent(payload.search)}&limite=5`;
        const searchRes = await fetchWithRateLimit(searchUrl, { headers });
        const searchJson = await searchRes.json();
        const listings = searchJson?.data || [];
        const debugInfo: any = { listings: listings.map((p: any) => ({ id: p.id, nome: p.descricao || p.nome, formato: p.formato })) };
        if (listings.length > 0) {
          await sleep(BLING_RATE_LIMIT_MS);
          const detailRes = await fetchWithRateLimit(`${BLING_API_URL}/produtos/${listings[0].id}`, { headers });
          const detailJson = await detailRes.json();
          const bp = detailJson?.data;
          debugInfo.detail = { id: bp?.id, nome: bp?.nome, formato: bp?.formato, situacao: bp?.situacao, codigo: bp?.codigo, preco: bp?.preco, categoria: bp?.categoria, produtoPai: bp?.produtoPai || bp?.idProdutoPai, variacoesCount: bp?.variacoes?.length || 0 };
        }
        result = debugInfo;
        break;
      }

      case "relink_variants": {
        const relinkLimit = payload.limit || 30;
        const relinkOffset = payload.offset || 0;
        const { data: unlinkedVariants } = await supabase.from("product_variants").select("id, sku, product_id").is("bling_variant_id", null).not("sku", "is", null);
        const { data: linkedProducts } = await supabase.from("products").select("id, bling_product_id, is_active").not("bling_product_id", "is", null);
        const prodBlingMap = new Map<string, number>();
        const activeProductIds = new Set<string>();
        for (const p of (linkedProducts || [])) {
          if (p.is_active === false) continue; // Skip inactive
          prodBlingMap.set(p.id, p.bling_product_id);
          activeProductIds.add(p.id);
        }
        let linked = 0, stockUpdated = 0;
        const relinkHeaders = blingHeaders(token);
        const processedParents = new Set<number>();
        const relinkLog: Array<{ sku: string; bling_variant_id: number | null; stock: number | null; status: string }> = [];
        const varsByProduct = new Map<string, Array<{ id: string; sku: string }>>();
        for (const v of (unlinkedVariants || [])) {
          if (!v.sku || !activeProductIds.has(v.product_id)) continue; // Skip inactive
          if (!varsByProduct.has(v.product_id)) varsByProduct.set(v.product_id, []);
          varsByProduct.get(v.product_id)!.push({ id: v.id, sku: v.sku });
        }
        const productEntries = [...varsByProduct.entries()];
        const batchEntries = productEntries.slice(relinkOffset, relinkOffset + relinkLimit);
        for (const [productId, variants] of batchEntries) {
          const parentBlingId = prodBlingMap.get(productId);
          if (!parentBlingId || processedParents.has(parentBlingId)) continue;
          processedParents.add(parentBlingId);
          try {
            await sleep(BLING_RATE_LIMIT_MS);
            const detailRes = await fetchWithRateLimit(`${BLING_API_URL}/produtos/${parentBlingId}`, { headers: relinkHeaders });
            if (!detailRes.ok) continue;
            const detailJson = await detailRes.json();
            const detail = detailJson?.data;
            if (!detail?.variacoes?.length) continue;
            const skuToBlingId = new Map<string, number>();
            for (const v of detail.variacoes) if (v.codigo) skuToBlingId.set(v.codigo, v.id);
            for (const localVar of variants) {
              const blingVarId = skuToBlingId.get(localVar.sku);
              if (blingVarId) { await supabase.from("product_variants").update({ bling_variant_id: blingVarId }).eq("id", localVar.id); linked++; relinkLog.push({ sku: localVar.sku, bling_variant_id: blingVarId, stock: null, status: "linked" }); }
              else relinkLog.push({ sku: localVar.sku, bling_variant_id: null, stock: null, status: "no_match" });
            }
            const varIds = detail.variacoes.map((v: any) => v.id);
            const idsParam = varIds.map((id: number) => `idsProdutos[]=${id}`).join("&");
            await sleep(BLING_RATE_LIMIT_MS);
            const stockRes = await fetchWithRateLimit(`${BLING_API_URL}/estoques/saldos?${idsParam}`, { headers: relinkHeaders });
            const stockJson = await stockRes.json();
            for (const s of (stockJson?.data || [])) {
              const bId = s.produto?.id; const qty = s.saldoVirtualTotal ?? 0;
              if (bId) {
                const { data: lv } = await supabase.from("product_variants").select("id").eq("bling_variant_id", bId).maybeSingle();
                if (lv) {
                  // Check for recent local movements before overwriting stock
                  const hasRecent = await hasRecentLocalMovements(supabase, lv.id, 10);
                  if (hasRecent) {
                    console.log(`[relink] Skipping stock overwrite for variant ${lv.id} — recent local movements`);
                  } else {
                    await supabase.from("product_variants").update({ stock_quantity: qty }).eq("id", lv.id);
                    stockUpdated++;
                  }
                }
              }
            }
          } catch (err: any) { console.error(`[relink] Error for parent ${parentBlingId}:`, err.message); }
        }
        result = { linked, stockUpdated, totalUnlinked: unlinkedVariants?.length || 0, totalProductGroups: productEntries.length, hasMore: (relinkOffset + relinkLimit) < productEntries.length, nextOffset: (relinkOffset + relinkLimit) < productEntries.length ? relinkOffset + relinkLimit : 0, log: relinkLog.slice(0, 50) };
        break;
      }

      case "cleanup_variations": {
        const { data: variationProducts } = await supabase.from("products").select("id, name, bling_product_id").or("name.like.%Cor:%,name.like.%Tamanho:%");
        let cleanedCount = 0;

        if (variationProducts && variationProducts.length > 0) {
          const productIdsToDelete: string[] = [];
          const CHUNK_SIZE = 100;

          // Phase 1: Identify which products have a corresponding variant
          for (let i = 0; i < variationProducts.length; i += CHUNK_SIZE) {
            const chunk = variationProducts.slice(i, i + CHUNK_SIZE);
            const blingIds = chunk.map(p => p.bling_product_id).filter(Boolean);

            if (blingIds.length > 0) {
              const { data: existingVariants } = await supabase
                .from("product_variants")
                .select("bling_variant_id")
                .in("bling_variant_id", blingIds);

              const existingBlingIds = new Set((existingVariants || []).map((v: any) => v.bling_variant_id));

              const chunkIdsToDelete = chunk
                .filter(p => p.bling_product_id && existingBlingIds.has(p.bling_product_id))
                .map(p => p.id);

              if (chunkIdsToDelete.length > 0) {
                productIdsToDelete.push(...chunkIdsToDelete);
              }
            }
          }

          // Phase 2: Batch delete the identified products and their related records
          if (productIdsToDelete.length > 0) {
            for (let i = 0; i < productIdsToDelete.length; i += CHUNK_SIZE) {
              const chunkIds = productIdsToDelete.slice(i, i + CHUNK_SIZE);

              // Check for order_items references before deleting variants
              const safeToDeleteProductIds: string[] = [];
              const deactivateProductIds: string[] = [];
              for (const pid of chunkIds) {
                const { data: prodVariants } = await supabase
                  .from("product_variants")
                  .select("id")
                  .eq("product_id", pid);
                const varIds = (prodVariants || []).map((v: any) => v.id);
                let hasOrderRef = false;
                if (varIds.length > 0) {
                  const { data: orderRefs } = await supabase
                    .from("order_items")
                    .select("id")
                    .in("product_variant_id", varIds)
                    .limit(1);
                  hasOrderRef = (orderRefs?.length || 0) > 0;
                }
                if (hasOrderRef) {
                  deactivateProductIds.push(pid);
                } else {
                  safeToDeleteProductIds.push(pid);
                }
              }
              // Deactivate products with order references
              if (deactivateProductIds.length > 0) {
                await supabase.from("product_variants").update({ is_active: false }).in("product_id", deactivateProductIds);
                await supabase.from("products").update({ is_active: false }).in("id", deactivateProductIds);
                console.log(`[cleanup_variations] Deactivated ${deactivateProductIds.length} products (referenced in orders)`);
              }
              // Delete products without order references
              if (safeToDeleteProductIds.length > 0) {
                await Promise.all([
                  supabase.from("product_images").delete().in("product_id", safeToDeleteProductIds),
                  supabase.from("product_variants").delete().in("product_id", safeToDeleteProductIds),
                  supabase.from("product_characteristics").delete().in("product_id", safeToDeleteProductIds),
                  supabase.from("buy_together_products").delete().or(`product_id.in.(${safeToDeleteProductIds.join(',')}),related_product_id.in.(${safeToDeleteProductIds.join(',')})`),
                ]);
                await supabase.from("products").delete().in("id", safeToDeleteProductIds);
              }

              cleanedCount += chunkIds.length;
            }
          }
        }

        result = { cleaned: cleanedCount };
        break;
      }

      case "create_order": {
        // Bug 6 Fix: Check for duplicate and save bling_order_id
        const { data: existingOrder } = await supabase.from("orders").select("id, notes").eq("id", payload.order_id).maybeSingle();
        if (existingOrder?.notes?.includes("bling_order_id:")) {
          result = { bling_order_id: existingOrder.notes.match(/bling_order_id:(\d+)/)?.[1], duplicate: true };
        } else {
          const orderResult = await createOrder(supabase, token, payload.order_id);
          // Save bling_order_id back to order
          if (orderResult.bling_order_id) {
            const existingNotes = existingOrder?.notes || "";
            await supabase.from("orders").update({
              notes: `${existingNotes} | bling_order_id:${orderResult.bling_order_id}`.trim(),
            }).eq("id", payload.order_id);
          }
          result = orderResult;
        }
        break;
      }
      case "generate_nfe": result = await generateNfe(token, parseInt(payload.bling_order_id)); break;
      case "order_to_nfe": {
        // Check for existing bling_order_id to avoid duplicates
        const { data: nfeOrder } = await supabase.from("orders").select("id, notes").eq("id", payload.order_id).maybeSingle();
        let orderResult;
        if (nfeOrder?.notes?.includes("bling_order_id:")) {
          const existingBlingId = nfeOrder.notes.match(/bling_order_id:(\d+)/)?.[1];
          orderResult = { bling_order_id: parseInt(existingBlingId || "0"), duplicate: true };
        } else {
          orderResult = await createOrder(supabase, token, payload.order_id);
          if (orderResult.bling_order_id) {
            const existingNotes = nfeOrder?.notes || "";
            await supabase.from("orders").update({
              notes: `${existingNotes} | bling_order_id:${orderResult.bling_order_id}`.trim(),
            }).eq("id", payload.order_id);
          }
        }
        const nf = await generateNfe(token, orderResult.bling_order_id);
        result = { ...orderResult, ...nf };
        break;
      }
      default: return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Bling sync error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro na integração com Bling" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
