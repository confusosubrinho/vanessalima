

## Yampi Purchase Flow Audit — Bugs & Improvements

### Bug 1 (Critical): CheckoutReturn can't find Yampi orders

**Problem**: `CheckoutReturn.tsx` (line 50-56) searches for orders by `external_reference = sessionId`, where `sessionId` comes from the URL param `session_id`. But for Yampi orders, `external_reference` is set to the **Yampi order ID** (by the webhook), not the session UUID. The session UUID is stored in `checkout_session_id` column instead.

**Result**: After returning from Yampi, user sees "Obrigado pela sua compra!" generic message, order lookup fails, and cart clears without showing order details.

**Fix**: Update `CheckoutReturn.tsx` to also search by `checkout_session_id` when `external_reference` doesn't match.

### Bug 2 (Critical): Success URL uses Stripe placeholder

**Problem**: `CheckoutStart.tsx` (line 46) builds `success_url` with `{CHECKOUT_SESSION_ID}` — a Stripe-specific placeholder. Yampi doesn't replace this, so the user returns to `/checkout/obrigado?session_id={CHECKOUT_SESSION_ID}` literally, which breaks order lookup entirely.

**Fix**: In `checkout-router`, when provider is Yampi, replace `{CHECKOUT_SESSION_ID}` in success_url with the actual `checkout_session_id` (from checkout-create-session response) before redirecting.

### Bug 3 (Medium): Webhook shipped/delivered events don't use effectiveEvent

**Problem**: `yampi-webhook` lines 395 and 417 check raw `event` for shipped/delivered, but `order.status.updated` with status `shipped` or `delivered` would have been normalized to `effectiveEvent` only for approved/cancelled. Shipped/delivered aren't covered.

**Fix**: Extend `order.status.updated` normalization to also map `shipped`/`sent` and `delivered` statuses, and use `effectiveEvent` for shipped/delivered event checks.

### Bug 4 (Medium): checkout-create-session Yampi SKU sync missing product_id

**Problem**: Per project memory, Yampi PUT requests for SKUs require `product_id`. The sync in `checkout-create-session` (line 246-254) sends PUT to update SKU price/stock but doesn't include `product_id`.

**Fix**: Fetch product's `yampi_product_id` and include it in the PUT body.

### Bug 5 (Low): Webhook doesn't update order status to "paid"

**Problem**: The webhook sets order status to `"processing"` for approved events, which is correct for business flow. However, the `CheckoutReturn` status display doesn't map `processing` well — it shows "Em processamento" instead of confirming payment was successful. This is minor UX but consistent with current design.

**No code change needed** — current behavior is acceptable.

### Improvement 1: Yampi webhook idempotency for payment records

**Problem**: If the same webhook fires twice for the same session (race condition), two payment records could be inserted. The payment insert has no duplicate check.

**Fix**: Add a check before inserting payment: skip if a payment with the same `transaction_id` already exists for the order.

### Files to Modify

1. **`src/pages/CheckoutReturn.tsx`** — Search by `checkout_session_id` as fallback
2. **`supabase/functions/checkout-router/index.ts`** — Replace `{CHECKOUT_SESSION_ID}` with actual session ID for Yampi redirect
3. **`supabase/functions/yampi-webhook/index.ts`** — Extend status normalization for shipped/delivered; add payment idempotency
4. **`supabase/functions/checkout-create-session/index.ts`** — Add `product_id` to Yampi SKU sync PUT

### Deploy

Redeploy: `checkout-router`, `yampi-webhook`, `checkout-create-session`

