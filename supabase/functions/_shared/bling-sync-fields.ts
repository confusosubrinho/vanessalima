/**
 * Shared Bling sync field definitions.
 * Used by both bling-sync and bling-webhook to ensure consistency
 * in which fields are synced vs preserved (manual edits).
 * 
 * STRATEGY: After the first import, ONLY stock is synced periodically.
 * Price, photos, slug, category, is_active, characteristics, etc.
 * are set once on import and then managed manually in the dashboard.
 */

/**
 * Fields that are ALWAYS synced from Bling (technical dimensions only).
 * These are the only fields updated on EXISTING products during sync/webhook.
 */
export function getSyncableFields(detail: any) {
  return {
    sku: detail.codigo || null,
    gtin: detail.gtin || null,
    weight: detail.pesoBruto || detail.pesoLiquido || null,
    width: detail.larguraProduto || null,
    height: detail.alturaProduto || null,
    depth: detail.profundidadeProduto || null,
  };
}

/**
 * Fields set ONLY on first import (editable in dashboard after that).
 * Includes price, brand, condition, is_active, name, description.
 */
export function getFirstImportFields(detail: any) {
  const basePrice = detail.preco || 0;
  return {
    name: detail.nome,
    description: detail.descricaoCurta || detail.descricaoComplementar || detail.observacoes || null,
    base_price: basePrice,
    sale_price: detail.precoPromocional && detail.precoPromocional < basePrice ? detail.precoPromocional : null,
    brand: detail.marca?.nome || (typeof detail.marca === "string" ? detail.marca : null),
    condition: detail.condicao === 0 ? "new" : detail.condicao === 1 ? "refurbished" : "used",
    is_active: detail.situacao === "A",
  };
}

/** @deprecated Use getFirstImportFields instead */
export function getInsertOnlyFields(detail: any) {
  return {
    name: detail.nome,
    description: detail.descricaoCurta || detail.descricaoComplementar || detail.observacoes || null,
  };
}
