/**
 * E2E API: checkout-router route "start" — payload inválido 400, válido 200.
 */
import { test, expect } from '@playwright/test';
import { invokeEdgeFunction } from '../helpers/http.js';
import { getSupabaseServiceRole } from '../helpers/db.js';
import { e2eRequestId } from '../helpers/db.js';

test.describe('Router start validation', () => {
  test('payload invalido (unit_price no item) retorna 400', async () => {
    const res = await invokeEdgeFunction('checkout-router', {
      route: 'start',
      cart_id: 'e2e_cart_' + Date.now(),
      items: [{ variant_id: '00000000-0000-0000-0000-000000000001', quantity: 1, unit_price: 100 }],
    });
    const data = await res.json().catch(() => ({}));
    expect(res.status).toBe(400);
    expect((data as { error?: string }).error).toBeDefined();
  });

  test('payload valido retorna 200 com provider/channel/action', async () => {
    const supabase = getSupabaseServiceRole();
    const { data: row } = await supabase.from('product_variants').select('id').limit(1).single();
    const variantId = row?.id;
    test.skip(!variantId, 'Seed necessario: product_variants');

    const res = await invokeEdgeFunction('checkout-router', {
      route: 'start',
      request_id: e2eRequestId(),
      cart_id: 'e2e_cart_' + Date.now(),
      items: [{ variant_id: variantId, quantity: 1 }],
      discount_amount: 0,
      shipping_cost: 0,
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; action?: string; provider?: string };
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.action === 'render' || data.action === 'redirect').toBeTruthy();
  });
});
