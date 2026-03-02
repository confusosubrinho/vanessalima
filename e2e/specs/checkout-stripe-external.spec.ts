/**
 * E2E: Checkout Stripe external — redirect e retorno /checkout/obrigado.
 */
import { test, expect } from '@playwright/test';
import { ensureCartWithOneItem, goToCheckoutStart } from '../helpers/cart.js';
import { setStripeExternal } from '../helpers/settings.js';

test.describe('Checkout Stripe external', () => {
  test.beforeEach(async () => {
    await setStripeExternal();
  });

  test('action=redirect retorna redirect_url', async ({ page }) => {
    await page.route('**/functions/v1/checkout-router**', async (route) => {
      const body = route.request().postDataJSON() || {};
      if (body.route === 'start') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            action: 'redirect',
            redirect_url: 'http://localhost:8080/checkout/obrigado?session_id=e2e_fake_123',
          }),
        });
        return;
      }
      await route.continue();
    });

    await ensureCartWithOneItem(page);
    await goToCheckoutStart(page);

    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toMatch(/checkout\.stripe\.com|checkout\/obrigado/);
  });

  test('retorno /checkout/obrigado exibe mensagem de confirmação', async ({ page }) => {
    await page.route('**/functions/v1/checkout-router**', async (route) => {
      const body = route.request().postDataJSON() || {};
      if (body.route === 'start') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            action: 'redirect',
            redirect_url: `${process.env.APP_BASE_URL || 'http://localhost:8080'}/checkout/obrigado?session_id=e2e_456`,
          }),
        });
        return;
      }
      await route.continue();
    });

    await ensureCartWithOneItem(page);
    await goToCheckoutStart(page);

    await page.waitForURL(/\/checkout\/obrigado/, { timeout: 10000 });
    const hasMessage = await page.getByText(/obrigado|pedido|confirmado|processando/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasMessage).toBeTruthy();
  });
});
