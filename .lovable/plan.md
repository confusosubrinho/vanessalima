

## Bling Integration — Audit: Bugs & Improvements

### Bug 1 (Critical): `bling-sync` has no authentication

The main `bling-sync` function (line 861-1047) parses the request body and executes any action (`sync_products`, `create_order`, `generate_nfe`, etc.) without verifying the caller is an admin. Anyone with the function URL can trigger a full catalog sync, create orders in Bling, or generate NF-e. Meanwhile, `bling-sync-single-stock` correctly validates admin role.

**Fix**: Add admin auth check at the start of the `bling-sync` serve handler, similar to `bling-sync-single-stock`.

### Bug 2 (Medium): `bling-sync-single-stock` SKU search uses `product.sku` even after finding variant SKU

At lines 111-132, when `product.sku` is null, the code finds a variant SKU (line 121) but then falls through without using it. At line 140, it searches Bling using `product.sku` which is still null/undefined, causing the API call to fail silently.

**Fix**: After finding `firstSku` from variants, assign it to a `searchSku` variable and use that for the Bling API search at line 140-141.

### Bug 3 (Medium): Token refresh race condition across functions

Three functions (`bling-sync`, `bling-webhook`, `bling-sync-single-stock`) all independently refresh the Bling token and save it to `store_settings`. If two requests arrive simultaneously with an expired token, both refresh it, but the second one overwrites the first's new refresh token with a now-invalidated one (Bling invalidates refresh tokens after use).

**Fix**: Add a simple optimistic locking mechanism — before updating, check that `bling_refresh_token` still matches the one used for the refresh. If it doesn't, re-read the token (another function already refreshed it).

### Bug 4 (Medium): Webhook image sync deletes all images then re-inserts without re-uploading

In `bling-webhook` `syncProductFields` (lines 340-346), when `sync_images` is enabled, images are inserted with the raw Bling URL (`img.link`). These are signed URLs that expire. The main `bling-sync` function correctly downloads and re-uploads to storage, but the webhook path skips this step.

**Fix**: Reuse the `downloadAndReuploadImage` pattern in the webhook's `syncProductFields`, or at minimum strip query params from Bling URLs.

### Bug 5 (Low): `bling-webhook` `findVariantByBlingIdOrSku` passes token but `syncStockOnly` doesn't

In `syncStockOnly` (line 368), `findVariantByBlingIdOrSku` is called without `token`, so the SKU fallback (which requires fetching from Bling API) never executes. The function has the headers but not the raw token.

**Fix**: Extract the token from the headers or pass it through so the SKU fallback works.

### Bug 6 (Low): `createOrder` doesn't save `bling_order_id` back to the order

After successfully creating an order in Bling (line 848), the response returns `bling_order_id` but it's never saved to the local `orders` table. This means there's no way to track which orders were already sent to Bling, risking duplicates.

**Fix**: Update the order with `bling_order_id` after successful creation. Add a duplicate check at the start.

### Improvement 1: Webhook should log rate limit hits

When the webhook gets rate-limited by Bling API (429 responses), there's no logging or backoff in `syncStockOnly` and `syncSingleProduct`. The `fetchWithRateLimit` function exists in `bling-sync` but isn't shared with `bling-webhook`.

**Fix**: Import `fetchWithRateLimit` from a shared module, or add basic retry logic to the webhook's Bling API calls.

### Improvement 2: Batch cron sync doesn't update `bling_sync_status` for products with no stock changes

Products whose stock didn't change are never marked as "synced" during the cron run. If a product was previously in "error" state, it stays there even though the cron successfully checked it.

**Fix**: Track all checked product IDs (not just updated ones) and mark them as synced.

### Files to Modify

1. **`supabase/functions/bling-sync/index.ts`** — Add admin auth check; save `bling_order_id` to orders table; add duplicate order check
2. **`supabase/functions/bling-webhook/index.ts`** — Re-upload images to storage instead of using raw Bling URLs; pass token to `findVariantByBlingIdOrSku`; mark all checked products as synced in cron
3. **`supabase/functions/bling-sync-single-stock/index.ts`** — Fix SKU search variable bug
4. **`supabase/functions/_shared/fetchWithTimeout.ts`** or new shared module — Extract `fetchWithRateLimit` for reuse
5. All three token-refreshing functions — Add optimistic lock on refresh token update

### Deploy

Redeploy: `bling-sync`, `bling-webhook`, `bling-sync-single-stock`

