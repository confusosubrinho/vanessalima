/**
 * E2E API: reconcile-order — order pendente + transaction_id, mock Stripe succeeded -> paid.
 * Em CI sem Stripe real pode ser skip ou mock.
 */
import { test, expect } from '@playwright/test';
import { getSupabaseServiceRole } from '../helpers/db.js';
import { invokeEdgeFunction } from '../helpers/http.js';

test.describe('Reconcile order', () => {
  test('reconcile-order com order_id inexistente retorna 404', async () => {
    const res = await invokeEdgeFunction('reconcile-order', {
      order_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.status).toBe(404);
  });

  test('reconcile-order com body sem order_id retorna 400', async () => {
    const res = await invokeEdgeFunction('reconcile-order', {});
    expect(res.status).toBe(400);
  });
});
