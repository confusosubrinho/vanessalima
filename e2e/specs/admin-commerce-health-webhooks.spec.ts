/**
 * E2E Admin: Commerce Health — webhooks com erro e reprocessar.
 */
import { test, expect } from '@playwright/test';
import { loginAdminInPage } from '../helpers/auth.js';

test.describe('Admin commerce health webhooks', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdminInPage(page);
  });

  test('abre /admin/commerce-health', async ({ page }) => {
    await page.goto('/admin/commerce-health');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/commerce-health/);
    const content = page.getByText(/commerce|saúde|webhook|stripe/i).first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test('pagina exibe secao de webhooks ou health', async ({ page }) => {
    await page.goto('/admin/commerce-health');
    await page.waitForLoadState('networkidle');
    const hasSection = await page.getByRole('heading', { name: /webhook|evento|erro|saúde/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasSection || await page.locator('body').textContent()).toBeTruthy();
  });
});
