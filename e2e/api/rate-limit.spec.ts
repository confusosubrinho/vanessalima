/**
 * E2E API: rate limit — 31 chamadas start com mesmo cart_id|ip -> 429.
 */
import { test, expect } from '@playwright/test';
import { getSupabaseServiceRole } from '../helpers/db.js';
import { invokeEdgeFunction } from '../helpers/http.js';

test.describe('Rate limit', () => {
  test('31 requests start com mesmo cart_id retornam 429 no excesso', async () => {
    const supabase = getSupabaseServiceRole();
    const { data: row } = await supabase.from('product_variants').select('id').limit(1).single();
    const variantId = row?.id;
    test.skip(!variantId, 'Seed necessario');

    const cartId = 'e2e_ratelimit_' + Date.now();
    const body = {
      route: 'start',
      cart_id: cartId,
      items: [{ variant_id: variantId, quantity: 1 }],
      discount_amount: 0,
      shipping_cost: 0,
    };

    const requestId = 'e2e_rl_' + Date.now();
    const promises: Promise<Response>[] = [];
    for (let i = 0; i < 31; i++) {
      promises.push(invokeEdgeFunction('checkout-router', { ...body, request_id: requestId + '_' + i }, requestId + '_' + i));
    }
    const results = await Promise.all(promises);
    const statuses = results.map((r) => r.status);
    const has429 = statuses.some((s) => s === 429);
    expect(has429).toBe(true);
  });
});
