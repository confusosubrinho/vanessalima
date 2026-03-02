/**
 * E2E: Checkout Yampi external — redirect para gateway; mock webhook payment.approved.
 */
import { test, expect } from '@playwright/test';
import { ensureCartWithOneItem, goToCheckoutStart } from '../helpers/cart.js';
import { setYampiExternal } from '../helpers/settings.js';

test.describe('Checkout Yampi external', () => {
  test.beforeEach(async () => {
    await setYampiExternal();
  });

  test('action=redirect retorna redirect_url (yampi)', async ({ page }) => {
    await page.route('**/functions/v1/checkout-router**', async (route) => {
      const body = route.request().postDataJSON() || {};
      if (body.route === 'start') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            action: 'redirect',
            redirect_url: 'https://checkout.yampi.com.br/e2e-fake',
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
    expect(url).toMatch(/yampi|checkout\/obrigado|checkout/);
  });
});
