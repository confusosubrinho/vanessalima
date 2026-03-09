

# Fix: Product name showing "Produto" + Add WhatsApp button in orders panel

## Problem 1: Product name still "Produto"

The Yampi payload sends `item.name = "Produto"` (a generic placeholder), and the code picks it up as a truthy string before checking better sources like `skuData.title` or the local database product name.

**In `yampi-sync-order-status/index.ts` (line 399):**
```typescript
// CURRENT (wrong priority):
let productName = (item.name as string) || (skuData.title as string) || ...
// item.name = "Produto" → truthy → never checks skuData.title
```

**In `yampi-webhook/index.ts` (line 500):**
```typescript
const itemName = item?.name || item?.product_name || "Produto";
// Same issue — item.name = "Produto" → used as-is
```

**In `yampi-import-order/index.ts` (line 331):**
```typescript
const itemName = (yampiItem.name as string) || ...
```

### Fix
In all three files, deprioritize generic "Produto" names. After initial extraction, check if name is a generic placeholder and prefer `localProductName` or `skuData.title`:

1. **`yampi-sync-order-status/index.ts`**: Reorder priority to `localProductName > skuData.title > item.name`, and treat `"Produto"` / `"Produto Yampi"` as falsy.
2. **`yampi-webhook/index.ts`**: Same logic — after local product lookup, only keep `itemName` if it's not generic.
3. **`yampi-import-order/index.ts`**: Same fix.

## Problem 2: WhatsApp button in order detail

Add a WhatsApp contact button in `OrderDetailContent.tsx` in the customer/address section. When `order.shipping_phone` or `customer_phone` is available, show a green WhatsApp button that opens `wa.me/{number}` with a pre-filled message like "Olá! Referente ao pedido #{order_number}".

### Changes in `OrderDetailContent.tsx`:
- Import `MessageCircle` (or use a WhatsApp-style icon) from lucide-react
- Import `getWhatsAppNumber` from `@/hooks/useStoreContact`
- Next to the phone display in the address section (line 230), add a clickable WhatsApp link button
- Button opens `https://wa.me/{formatted_number}?text=...` in a new tab

## Files modified
- `supabase/functions/yampi-sync-order-status/index.ts` — fix product name priority
- `supabase/functions/yampi-webhook/index.ts` — fix product name priority  
- `supabase/functions/yampi-import-order/index.ts` — fix product name priority
- `src/components/admin/OrderDetailContent.tsx` — add WhatsApp button

