

## Order Import & Status Sync — Audit & Fix Plan

### Bug 1 (Critical): `yampi-sync-order-status` missing from `config.toml`

The function is not listed in `supabase/config.toml`, so it defaults to `verify_jwt = true` via Supabase's gateway. The function does its own JWT auth internally, but the gateway rejects the request before the code even runs if the token format doesn't pass Supabase's built-in check. This can cause intermittent 401 errors.

**Fix**: Add `[functions.yampi-sync-order-status]` with `verify_jwt = false` to `config.toml`.

### Bug 2 (Medium): Webhook cancelled payment record uses raw event name as status

Line 500 of `yampi-webhook` inserts a payment record with `status: event` (e.g. `"payment.cancelled"`, `"payment.refused"`). Every other code path uses normalized values like `"approved"`, `"failed"`, `"refunded"`. This makes the `commerce_health` RPC and admin UI show inconsistent data.

**Fix**: Normalize the cancelled payment status to `"cancelled"`, `"refused"`, or `"failed"` instead of the raw event string.

### Bug 3 (Medium): `yampi-sync-order-status` doesn't restore stock on cancellation

When sync detects the Yampi order changed to `cancelled`, it updates the local order status but does NOT restore stock. The `cancel_order_return_stock` RPC handles this correctly for manual cancellations, but sync bypasses it.

**Fix**: When sync detects status changed to `cancelled`, call `cancel_order_return_stock` RPC instead of a plain update.

### Bug 4 (Medium): Import doesn't check `checkout_session_id` for duplicates

If an order was pre-created by `checkout-router` (stored in `checkout_session_id`), importing the same Yampi order by ID would create a duplicate since it only checks `external_reference`.

**Fix**: Also check if an order with `checkout_session_id` matching the Yampi session exists before importing.

### Bug 5 (Low): Order search doesn't include `customer_email`

The admin Orders page only searches by `order_number` and `shipping_name`. Searching by email is a common need.

**Fix**: Add `customer_email` to the search filter in `Orders.tsx`.

### Improvement 1: Add `yampi_order_number` and `external_reference` to search

Allow searching orders by their Yampi order number or external reference, making it easier to cross-reference with the Yampi dashboard.

### Improvement 2: Show tracking code input on order details

Currently tracking code is read-only in the details dialog. Add an inline edit field so admins can manually add/update tracking codes without needing to sync.

### Files to Modify

1. **`supabase/config.toml`** — Add `yampi-sync-order-status` entry (cannot edit directly, but need to deploy)
2. **`supabase/functions/yampi-webhook/index.ts`** — Normalize cancelled payment status
3. **`supabase/functions/yampi-sync-order-status/index.ts`** — Use `cancel_order_return_stock` RPC for cancellation; add payment record creation for newly-approved orders
4. **`supabase/functions/yampi-import-order/index.ts`** — Add `checkout_session_id` duplicate check
5. **`src/pages/admin/Orders.tsx`** — Expand search to include `customer_email`, `yampi_order_number`, `external_reference`; add inline tracking code edit

### Deploy

Redeploy: `yampi-sync-order-status`, `yampi-webhook`, `yampi-import-order`

