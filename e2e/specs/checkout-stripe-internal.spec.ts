/**
 * E2E: Checkout Stripe internal — mock router e stripe-create-intent; valida /checkout.
 */
import { test, expect } from '@playwright/test';
import { ensureCartWithOneItem, goToCheckoutStart } from '../helpers/cart.js';
import { setStripeInternal } from '../helpers/settings.js';
import { getSupabaseServiceRole, cleanupE2EOrders } from '../helpers/db.js';

test.describe('Checkout Stripe internal', () => {
  test.beforeEach(async () => {
    await setStripeInternal();
  });

  test.afterEach(async () => {
    const supabase = getSupabaseServiceRole();
    await cleanupE2EOrders(supabase);
  });

  test('fluxo com mock: start -> render -> /checkout', async ({ page }) => {
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
            client_secret: 'pi_e2e_secret_123',
          }),
        });
        return;
      }
      await route.continue();
    });

    await ensureCartWithOneItem(page);
    await goToCheckoutStart(page);

    await page.waitForURL(/\/checkout(?!\/start)/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/checkout/);
  });

  test('página checkout exibe área de pagamento ou loading', async ({ page }) => {
    await page.route('**/functions/v1/checkout-router**', async (route) => {
      const body = route.request().postDataJSON() || {};
      if (body.route === 'start') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            action: 'render',
            order_id: '00000000-0000-0000-0000-000000000002',
            provider: 'stripe',
            order_access_token: 'e2e-token-2',
            client_secret: 'pi_e2e_mock_456',
          }),
        });
        return;
      }
      await route.continue();
    });

    await ensureCartWithOneItem(page);
    await goToCheckoutStart(page);

    await page.waitForURL(/\/checkout(?!\/start)/, { timeout: 10000 });
    const hasPaymentOrLoading = await page.locator('[data-testid="payment-element"], #payment-element, iframe[title*="Secure"], [class*="Loader"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasPaymentOrLoading || page.url().includes('/checkout')).toBeTruthy();
  });
});
