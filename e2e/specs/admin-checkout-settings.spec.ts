/**
 * E2E Admin: Checkout settings — alternar Stripe internal/external, Yampi external.
 */
import { test, expect } from '@playwright/test';
import { loginAdminInPage } from '../helpers/auth.js';
import { setStripeInternal, setStripeExternal, setYampiExternal } from '../helpers/settings.js';

test.describe('Admin checkout settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdminInPage(page);
  });

  test('abre /admin/checkout-transparente', async ({ page }) => {
    await page.goto('/admin/checkout-transparente');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/checkout-transparente/);
    const heading = page.getByRole('heading', { name: /checkout|pagamento|transparente/i }).or(page.locator('h1, h2').first());
    await expect(heading.first()).toBeVisible({ timeout: 10000 });
  });

  test('update-checkout-settings Stripe internal foi chamado ao configurar', async ({ page }) => {
    const { ok } = await setStripeInternal();
    expect(ok).toBe(true);
  });

  test('update-checkout-settings Stripe external', async () => {
    const { ok } = await setStripeExternal();
    expect(ok).toBe(true);
  });

  test('update-checkout-settings Yampi external', async () => {
    const { ok } = await setYampiExternal();
    expect(ok).toBe(true);
  });
});
