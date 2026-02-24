import type { CartItem } from "@/types/database";

export function getCartItemUnitPrice(item: CartItem): number {
  // Single source of truth for cart UI + checkout payloads.
  // Must match server-side validation rules (variant sale/base first, else product price + modifier).
  if (item.variant.sale_price && Number(item.variant.sale_price) > 0) {
    return Number(item.variant.sale_price);
  }
  if (item.variant.base_price && Number(item.variant.base_price) > 0) {
    return Number(item.variant.base_price);
  }
  const productPrice = Number(item.product.sale_price || item.product.base_price);
  return productPrice + Number(item.variant.price_modifier || 0);
}

export function getCartItemTotalPrice(item: CartItem): number {
  return getCartItemUnitPrice(item) * item.quantity;
}

