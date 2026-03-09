

# Fix: Runtime crash on `.slice()` of undefined + missing shipping method

## Root Cause

Lines 201, 202, 204 in `yampi-sync-order-status/index.ts` call:
```typescript
JSON.stringify(yampiOrder.shipments).slice(0, 500)
```
When `yampiOrder.shipments` is `undefined`, `JSON.stringify(undefined)` returns `undefined` (the value, not a string), and `.slice()` crashes with `TypeError: Cannot read properties of undefined (reading 'slice')`.

## Additionally: Shipping Method Not Extracted

The Yampi payload has `shipment_service` (a direct string field) but the code only looks for `shipments.data[0].service_name` and `shipping_option.name` — neither exists. Need to add `yampiOrder.shipment_service` as a fallback.

## Fix in `yampi-sync-order-status/index.ts`

### 1. Fix debug logs (lines 201-204)
Wrap each `JSON.stringify()` result with `String(...)` or use `|| ""` before `.slice()`:
```typescript
console.log("[yampi-sync] transactions raw:", (JSON.stringify(yampiOrder.transactions) || "").slice(0, 800));
console.log("[yampi-sync] items raw:", (JSON.stringify(yampiOrder.items) || "").slice(0, 800));
console.log("[yampi-sync] shipping_option:", JSON.stringify(yampiOrder.shipping_option));
console.log("[yampi-sync] shipment_service:", yampiOrder.shipment_service);
```

### 2. Add `shipment_service` to shipping method extraction (line 218-224)
Add `yampiOrder.shipment_service` as a high-priority fallback since it's present in the payload.

## File modified
- `supabase/functions/yampi-sync-order-status/index.ts`

