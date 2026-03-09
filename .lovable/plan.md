

# Fix: Product name showing variant title instead of parent product name

## Root Cause

The name priority logic (lines 409-413) runs **before** the local product lookup (lines 436-479). By the time `localProductName` is available, `productName` is already set to `skuData.title` (e.g., "Conjunto colar aramado e brinco gota Único Dourado") which passes `isGenericName()` since it's not literally "Produto".

The Yampi `sku.data.title` is the **variant title**, not the product name. It concatenates the base product name + variation values.

## Fix

Restructure the priority so `localProductName` (from the `products` table) is **always preferred** when available, since it's the clean parent product name:

### In `yampi-sync-order-status/index.ts` (line 479)
Change the condition from:
```typescript
if (localProductName && (isGenericName(productName) || !productName)) productName = localProductName;
```
To:
```typescript
if (localProductName) productName = localProductName;
```

This ensures whenever we find the product in the local database, we use its clean name regardless of what Yampi sent.

### Same fix in `yampi-webhook/index.ts` and `yampi-import-order/index.ts`
Apply the same pattern: after the local product lookup, always prefer the local name over the Yampi SKU title.

## Files modified
- `supabase/functions/yampi-sync-order-status/index.ts` — always prefer local product name
- `supabase/functions/yampi-webhook/index.ts` — same fix
- `supabase/functions/yampi-import-order/index.ts` — same fix

