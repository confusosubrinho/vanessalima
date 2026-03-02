/**
 * E2E: Refresh e resume — /checkout e /checkout/obrigado resistem a F5 sem travar/duplicar.
 */
import { test, expect } from '@playwright/test';
import { ensureCartWithOneItem, goToCheckoutStart } from '../helpers/cart.js';
import { setStripeInternal } from '../helpers/settings.js';

test.describe('Refresh resume', () => {
  test.beforeEach(async () => {
    await setStripeInternal();
  });

  test('Stripe internal: refresh em /checkout retoma tela', async ({ page }) => {
    await page.route('**/functions/v1/checkout-router**', async (route) => {
      const body = route.request().postDataJSON() || {};
      if (body.route === 'start') {
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
    await goToCheckoutStart(page);
    await page.waitForURL(/\/checkout(?!\/start)/, { timeout: 10000 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/\/checkout/);
  });

  test('Stripe external: refresh em /checkout/obrigado não trava', async ({ page }) => {
    await page.goto(`${process.env.APP_BASE_URL || 'http://localhost:8080'}/checkout/obrigado?session_id=e2e_refresh_test`);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(0);
  });
});
