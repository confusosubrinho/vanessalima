/**
 * Shared Bling sync field definitions.
 * Used by both bling-sync and bling-webhook to ensure consistency
 * in which fields are synced vs preserved (manual edits).
 */

/** Fields that are ALWAYS synced from Bling (technical/pricing data) */
export function getSyncableFields(detail: any) {
  const basePrice = detail.preco || 0;
  return {
    base_price: basePrice,
    sale_price: detail.precoPromocional && detail.precoPromocional < basePrice ? detail.precoPromocional : null,
    sku: detail.codigo || null,
    gtin: detail.gtin || null,
    weight: detail.pesoBruto || detail.pesoLiquido || null,
    width: detail.larguraProduto || null,
    height: detail.alturaProduto || null,
    depth: detail.profundidadeProduto || null,
    brand: detail.marca?.nome || (typeof detail.marca === "string" ? detail.marca : null),
    condition: detail.condicao === 0 ? "new" : detail.condicao === 1 ? "refurbished" : "used",
    is_active: detail.situacao === "A",
  };
}

/** Fields set ONLY on first import (editable in dashboard after that) */
export function getInsertOnlyFields(detail: any) {
  return {
    name: detail.nome,
    description: detail.descricaoCurta || detail.descricaoComplementar || detail.observacoes || null,
  };
}
