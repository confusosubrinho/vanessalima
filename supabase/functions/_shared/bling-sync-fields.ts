/**
 * Shared Bling sync field definitions.
 * Used by both bling-sync and bling-webhook to ensure consistency.
 * 
 * STRATEGY: After the first import, ONLY stock is synced by default.
 * All other fields are controlled by bling_sync_config toggles.
 */

export interface BlingSyncConfig {
  sync_stock: boolean;
  sync_titles: boolean;
  sync_descriptions: boolean;
  sync_images: boolean;
  sync_prices: boolean;
  sync_dimensions: boolean;
  sync_sku_gtin: boolean;
  sync_variant_active: boolean;
  import_new_products: boolean;
  merge_by_sku: boolean;
  first_import_done: boolean;
}

export const DEFAULT_SYNC_CONFIG: BlingSyncConfig = {
  sync_stock: true,
  sync_titles: false,
  sync_descriptions: false,
  sync_images: false,
  sync_prices: false,
  sync_dimensions: false,
  sync_sku_gtin: false,
  sync_variant_active: false,
  import_new_products: true,
  merge_by_sku: true,
  first_import_done: false,
};

/**
 * Build the update payload for EXISTING products based on sync config.
 * Only includes fields whose corresponding toggle is enabled.
 * NEVER includes is_active — that is always manual.
 */
export function getConfigAwareUpdateFields(detail: any, config: BlingSyncConfig): Record<string, any> {
  const fields: Record<string, any> = {};

  if (config.sync_titles) {
    fields.name = detail.nome;
  }

  if (config.sync_descriptions) {
    fields.description = detail.descricaoCurta || detail.descricaoComplementar || detail.observacoes || null;
  }

  if (config.sync_prices) {
    const basePrice = detail.preco || 0;
    fields.base_price = basePrice;
    fields.sale_price = detail.precoPromocional && detail.precoPromocional < basePrice
      ? detail.precoPromocional
      : null;
  }

  if (config.sync_dimensions) {
    fields.weight = detail.pesoBruto || detail.pesoLiquido || null;
    fields.width = detail.larguraProduto || null;
    fields.height = detail.alturaProduto || null;
    fields.depth = detail.profundidadeProduto || null;
  }

  if (config.sync_sku_gtin) {
    fields.sku = detail.codigo || null;
    fields.gtin = detail.gtin || null;
  }

  return fields;
}

/**
 * Fields set ONLY on first import (full data for new products).
 * Includes everything: price, brand, condition, name, description, etc.
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
    sku: detail.codigo || null,
    gtin: detail.gtin || null,
    weight: detail.pesoBruto || detail.pesoLiquido || null,
    width: detail.larguraProduto || null,
    height: detail.alturaProduto || null,
    depth: detail.profundidadeProduto || null,
  };
}

/** @deprecated Use getFirstImportFields instead */
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

/** @deprecated Use getFirstImportFields instead */
export function getInsertOnlyFields(detail: any) {
  return {
    name: detail.nome,
    description: detail.descricaoCurta || detail.descricaoComplementar || detail.observacoes || null,
  };
}

/**
 * Shared getSyncConfig — loads bling_sync_config from DB, with defaults.
 * Used by both bling-sync and bling-webhook to avoid duplication.
 */
export async function getSyncConfig(supabase: any): Promise<BlingSyncConfig> {
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
