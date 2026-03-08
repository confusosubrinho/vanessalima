

## Yampi Integration — Round 3 Audit: Bugs & Improvements

### Bug 1 (Medium): `checkout-create-session` Yampi SKU sync missing `quantity_managed: true`

In `checkout-create-session/index.ts` lines 248-253, when syncing SKU price/stock to Yampi before creating a payment link, the PUT body doesn't include `quantity_managed: true`. This was fixed in `yampi-sync-sku` and `yampi-catalog-sync` in previous rounds but missed here. Without it, Yampi may ignore the stock value if the SKU was previously set to unmanaged.

**Fix**: Add `quantity_managed: true` to the SKU update payload at line 248.

### Bug 2 (Medium): Webhook approved event has no `order_events` idempotency hash

The shipped, delivered, and cancelled handlers all insert into `order_events` with hash checks to prevent duplicate processing. However, the approved event handler (lines 62-405) — the most critical path — only checks `external_reference` for duplicates, which has a race window if two webhook deliveries arrive simultaneously before the first one writes `external_reference`.

**Fix**: Add an `order_events` hash check at the start of the approved handler (e.g., `approved-{yampiOrderId}-{transactionId}`). Skip if hash already exists.

### Bug 3 (Medium): `yampi-sync-order-status` doesn't update transaction details

The sync function updates `status`, `payment_status`, `tracking_code`, `shipping_method`, `yampi_created_at`, `yampi_order_number` — but never updates `payment_method`, `gateway`, `installments`, `transaction_id`, or `shipping_cost`. When an admin syncs a Yampi order, these fields stay empty even though the Yampi API returns them.

**Fix**: Extract `payment_method`, `gateway`, `installments`, `transaction_id`, and `shipping_cost` from the Yampi API response and include them in the update payload.

### Bug 4 (Low): Batch import helper missing fields

The `importSingleOrder` helper (lines 502-509) creates orders without `payment_status`, `tracking_code`, `shipping_method`, or `yampi_created_at`. The main single-import path sets all these correctly, but the batch helper skips them, causing incomplete records.

**Fix**: Add the missing fields to the batch import insert payload.

### Bug 5 (Low): `checkout-create-session` Yampi redirect URL uses wrong path

Lines 274-275 build `redirectAfterPayment` using `/pedido-confirmado` as fallback path. But `CheckoutReturn` is mounted at `/checkout/obrigado`. If the Yampi payment link respects the `redirect_url`, users would land on a 404 page.

**Fix**: Change the fallback path from `/pedido-confirmado` to `/checkout/obrigado?session_id=${sessionId}`.

### Improvement 1: Show CPF/CNPJ in order details dialog

The order details dialog shows email, provider, payment info, and address — but doesn't display `customer_cpf`, which is collected and stored for Yampi orders. This is useful for invoice generation and customer identification.

**Fix**: Add a CPF/CNPJ field to the order details grid in `Orders.tsx`.

### Files to Modify

1. **`supabase/functions/checkout-create-session/index.ts`** — Add `quantity_managed: true` to SKU sync; fix redirect URL path
2. **`supabase/functions/yampi-webhook/index.ts`** — Add `order_events` hash idempotency for approved events
3. **`supabase/functions/yampi-sync-order-status/index.ts`** — Include transaction detail fields in update
4. **`supabase/functions/yampi-import-order/index.ts`** — Add missing fields to batch import helper
5. **`src/pages/admin/Orders.tsx`** — Show CPF/CNPJ in order details

### Deploy

Redeploy: `checkout-create-session`, `yampi-webhook`, `yampi-sync-order-status`, `yampi-import-order`

