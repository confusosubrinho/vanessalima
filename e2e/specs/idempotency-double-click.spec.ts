/**
 * E2E: Idempotência — duplo clique em Iniciar checkout; router chamado 1 ou 2x (não infinito).
 */
import { test, expect } from '@playwright/test';
import { ensureCartWithOneItem } from '../helpers/cart.js';
import { setStripeInternal } from '../helpers/settings.js';

test.describe('Idempotência double-click', () => {
  test.beforeEach(async () => {
    await setStripeInternal();
  });

  test('duplo clique em Finalizar Compra nao dispara muitas chamadas', async ({ page }) => {
    let callCount = 0;
    await page.route('**/functions/v1/checkout-router**', async (route) => {
      const body = route.request().postDataJSON() || {};
      if (body.route === 'start') {
        callCount += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            action: 'render',
            order_id: '00000000-0000-0000-0000-000000000001',
            provider: 'stripe',
            order_access_token: 'e2e-token',
            client_secret: 'pi_e2e_secret',
          }),
        });
        return;
      }
      await route.continue();
    });

    await ensureCartWithOneItem(page);
    await page.goto('/carrinho');
    const link = page.getByRole('link', { name: /finalizar compra|checkout|continuar/i }).or(page.locator('a[href*="checkout"]')).first();
    await link.click();
    await link.click();
    await page.waitForTimeout(2000);

    expect(callCount).toBeLessThanOrEqual(2);
  });
});
