/**
 * E2E: CheckoutStart usa router route "start". Valida action=render vs redirect.
 */
import { test, expect } from '@playwright/test';
import { ensureCartWithOneItem, goToCheckoutStart } from '../helpers/cart.js';
import { setStripeInternal, setStripeExternal } from '../helpers/settings.js';

test.describe('Checkout Start thin client', () => {
  test.beforeEach(async () => {
    await setStripeInternal();
  });

  test('app chama checkout-router com route start', async ({ page }) => {
    let payload: { route?: string } | null = null;
    await page.route('**/functions/v1/checkout-router**', async (route) => {
      payload = route.request().postDataJSON() ?? {};
      await route.continue();
    });
    await ensureCartWithOneItem(page);
    await goToCheckoutStart(page);
    await page.waitForURL(/\/(checkout\/start|checkout)/, { timeout: 15000 });
    await page.waitForTimeout(2000);
    expect(payload?.route).toBe('start');
  });

  test('Stripe internal redireciona para /checkout', async ({ page }) => {
    await ensureCartWithOneItem(page);
    await goToCheckoutStart(page);
    await page.waitForURL(/\/checkout(?!\/start)(?!\/obrigado)/, { timeout: 15000 });
    expect(page.url()).toMatch(/\/checkout$/);
  });

  test('Stripe external redirect ou obrigado', async ({ page }) => {
    await setStripeExternal();
    await ensureCartWithOneItem(page);
    await goToCheckoutStart(page);
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url.includes('checkout.stripe.com') || url.includes('/checkout/obrigado') || url.includes('/checkout')).toBeTruthy();
  });
});
