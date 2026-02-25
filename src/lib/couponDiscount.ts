import type { CartItem, Coupon } from "@/types/database";
import { getCartItemUnitPrice } from "./cartPricing";

/**
 * Returns the subtotal that is eligible for the coupon (items that match category or product restriction).
 */
export function getApplicableSubtotal(coupon: Coupon | null, items: CartItem[]): number {
  if (!coupon || !items.length) return 0;

  const productIds = coupon.applicable_product_ids?.filter(Boolean);
  const categoryId = coupon.applicable_category_id;

  if (productIds?.length) {
    const set = new Set(productIds);
    return items
      .filter((item) => set.has(item.product.id))
      .reduce((sum, item) => sum + getCartItemUnitPrice(item) * item.quantity, 0);
  }

  if (categoryId) {
    return items
      .filter((item) => item.product.category_id === categoryId)
      .reduce((sum, item) => sum + getCartItemUnitPrice(item) * item.quantity, 0);
  }

  return items.reduce((sum, item) => sum + getCartItemUnitPrice(item) * item.quantity, 0);
}

/**
 * Returns whether the cart has at least one item eligible for the coupon.
 */
export function hasEligibleItems(coupon: Coupon | null, items: CartItem[]): boolean {
  if (!coupon || !items.length) return false;

  const productIds = coupon.applicable_product_ids?.filter(Boolean);
  const categoryId = coupon.applicable_category_id;

  if (productIds?.length) {
    const set = new Set(productIds);
    return items.some((item) => set.has(item.product.id));
  }

  if (categoryId) {
    return items.some((item) => item.product.category_id === categoryId);
  }

  return true;
}

/**
 * Computes discount amount for a coupon applied to the given items.
 * - Min purchase is checked against full subtotal (caller responsibility).
 * - Discount is applied only to eligible (category/product) subtotal; capped at that amount.
 */
export function computeCouponDiscount(
  coupon: Coupon | null,
  items: CartItem[],
  fullSubtotal: number
): number {
  if (!coupon) return 0;

  const applicableSubtotal = getApplicableSubtotal(coupon, items);
  if (applicableSubtotal <= 0) return 0;

  const minPurchase = coupon.min_purchase_amount ?? 0;
  if (minPurchase > 0 && fullSubtotal < minPurchase) return 0;

  const raw =
    coupon.discount_type === "percentage"
      ? (applicableSubtotal * coupon.discount_value) / 100
      : coupon.discount_value;

  return Math.min(applicableSubtotal, Math.max(0, raw));
}

/**
 * Returns whether the coupon is valid for the given shipping state and zip.
 * If the coupon has no location restriction, returns true.
 */
export function isCouponValidForLocation(
  coupon: Coupon | null,
  shippingState: string,
  shippingZip: string
): boolean {
  if (!coupon) return true;

  const states = coupon.applicable_states?.filter(Boolean) ?? [];
  const zipPrefixes = coupon.applicable_zip_prefixes?.filter(Boolean) ?? [];

  if (states.length > 0) {
    const stateNorm = (shippingState || "").trim().toUpperCase().slice(0, 2);
    if (!stateNorm || !states.some((s) => (s || "").trim().toUpperCase().slice(0, 2) === stateNorm)) {
      return false;
    }
  }

  if (zipPrefixes.length > 0) {
    const zipDigits = (shippingZip || "").replace(/\D/g, "").slice(0, 5);
    if (!zipDigits || !zipPrefixes.some((p) => (p || "").replace(/\D/g, "").slice(0, 5) === zipDigits)) {
      return false;
    }
  }

  return true;
}
