import { test, expect } from '@playwright/test';
import { loginAdminInPage } from '../helpers/auth.js';

test.describe('Admin orders pagination', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdminInPage(page);
  });

  test('abre /admin/pedidos e carrega lista', async ({ page }) => {
    await page.goto('/admin/pedidos');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/admin\/pedidos/);
    const tableOrEmpty = page.locator('table').or(page.getByText(/nenhum pedido|nenhum resultado/i));
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10000 });
  });

  test('lista mostra no maximo 50 itens ou paginacao', async ({ page }) => {
    await page.goto('/admin/pedidos');
    await page.waitForLoadState('networkidle');
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeLessThanOrEqual(51);
  });
});
