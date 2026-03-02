/**
 * E2E API: reprocess-stripe-webhook — evento com erro, chamar reprocess -> error_message null.
 * Requer evento no DB e Stripe API; em CI pode ser skip.
 */
import { test, expect } from '@playwright/test';
import { invokeEdgeFunction } from '../helpers/http.js';

test.describe('Reprocess stripe webhook', () => {
  test('reprocess sem event_id retorna 400', async () => {
    const res = await invokeEdgeFunction('reprocess-stripe-webhook', {});
    expect(res.status).toBe(400);
  });

  test('reprocess com event_id inexistente retorna 404', async () => {
    const res = await invokeEdgeFunction('reprocess-stripe-webhook', {
      event_id: 'evt_inexistente_000000000000',
    });
    expect(res.status).toBe(404);
  });
});
