

## Stripe Checkout Flow Audit — Plan

### Critical Bug Found

**Checkout.tsx ignores navigation state from CheckoutStart.** When the checkout-router returns `action: "render"` with `clientSecret` and `orderId` for internal Stripe, CheckoutStart navigates to `/checkout` with state. However, `Checkout.tsx` never reads `location.state`, so:

1. User arrives at `/checkout` but the clientSecret/orderId from the router are lost
2. User fills form and clicks submit → `handleSubmit` finds the existing order (same `cart_id`) via idempotency check → redirects to confirmation page for an **unpaid** order
3. Payment is never collected

This means the internal Stripe flow via CheckoutStart is completely broken.

### Secondary Issues

1. **Double stock decrement risk**: checkout-router already calls `stripe-create-intent` (which decrements stock), but if `handleSubmit` in Checkout.tsx somehow creates a new PaymentIntent, stock gets decremented again.

2. **PIX regeneration orphans**: "Gerar novo PIX" clears state but doesn't cancel the old PaymentIntent. Next `handleSubmit` hits the idempotency check and redirects to unpaid confirmation.

3. **Provider fallback**: Line 432 in Checkout.tsx uses `isStripeActive ? 'stripe' : 'appmax'` — doesn't handle Yampi as provider.

4. **Checkout.tsx creates orders client-side**: The transparent checkout page creates orders directly via `supabase.from('orders').insert(...)` from the browser. This works but bypasses the server-side price validation that checkout-router performs. When Stripe internal mode is active via CheckoutStart, the order is already created server-side with validated prices.

### Fix Plan

#### 1. Checkout.tsx: Read and use location.state from CheckoutStart

Add `useLocation()` and on mount, check if `state.orderId` + `state.clientSecret` are present. If so:
- Store them in `stripeOrderId` / `stripeClientSecret`
- Skip directly to the payment step (or allow user to fill identification/shipping first, then show Stripe Elements without creating a new order)
- The `handleSubmit` function should detect that an order already exists from state and skip order creation

#### 2. Fix handleSubmit idempotency flow

When `handleSubmit` finds an existing order with the same `cart_id`:
- If it's a `pending` order, **reuse it** for payment instead of redirecting to confirmation
- Set `stripeOrderId` to the existing order and proceed to call `stripe-create-intent`
- Only redirect to confirmation if the order is already `paid`

#### 3. Fix PIX regeneration

When "Gerar novo PIX" is clicked:
- Clear existing state
- Allow `handleSubmit` to reuse the same order (the idempotency key on the PaymentIntent `pi_{order_id}` will return the existing PI from Stripe)

#### 4. Deploy updated functions

Redeploy `checkout-router` and `checkout-stripe-create-intent` after any edge function changes.

### Files to Modify

- **`src/pages/Checkout.tsx`** — Main fix: consume `location.state`, reuse existing orders instead of redirecting, handle provider correctly
- **`supabase/functions/checkout-stripe-create-intent/index.ts`** — Minor: ensure idempotent PaymentIntent creation handles reuse gracefully (already uses `idempotencyKey: pi_{order_id}`)

### Implementation Priority

The core fix is in `Checkout.tsx` — making it properly consume the router state and reuse existing orders for payment. This alone resolves the broken internal Stripe flow.

