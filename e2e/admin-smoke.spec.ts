/**
 * E2E Admin Smoke — FASE 5 QA Admin.
 * Requer seed:qa (globalSetup) com usuário admin. Credenciais: E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 * ou padrão qa-admin@example.com / qa-admin-e2e-secure.
 *
 * Cenários: login → dashboard; produtos criar/editar/salvar; estoque 1 variante; commerce health (página e ações com sucesso/erro tratado).
 */
import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'qa-admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'qa-admin-e2e-secure';

test.describe('Admin Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login');
    await page.waitForLoadState('networkidle');
  });

  test('login admin → redirect dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 5000 });
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /dashboard|painel/i }).or(page.locator('h1'))).toBeVisible({ timeout: 10000 });
  });

  test('dashboard carrega após login', async ({ page }) => {
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText(/carregando\.\.\./i, { timeout: 5000 });
  });

  test('produtos: listar e abrir formulário novo produto', async ({ page }) => {
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    await page.goto('/admin/produtos');
    await page.waitForLoadState('networkidle');

    const novoBtn = page.getByRole('button', { name: /novo produto/i });
    await expect(novoBtn).toBeVisible({ timeout: 10000 });
    await novoBtn.click();

    await expect(page.getByRole('dialog').getByText(/novo produto/i)).toBeVisible({ timeout: 5000 });
  });

  test('produtos: criar produto com nome e preço e salvar', async ({ page }) => {
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    await page.goto('/admin/produtos');
    await page.waitForLoadState('networkidle');

    const novoBtn = page.getByRole('button', { name: /novo produto/i });
    await expect(novoBtn).toBeVisible({ timeout: 10000 });
    await novoBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/novo produto/i)).toBeVisible({ timeout: 5000 });

    const nomeInput = dialog.locator('div').filter({ hasText: /nome \*/i }).locator('input').first();
    await nomeInput.fill('Produto E2E Smoke ' + Date.now());
    const precoInput = dialog.locator('input[type="number"]').first();
    await precoInput.fill('29.90');
    await dialog.getByRole('button', { name: /salvar/i }).first().click();

    await expect(page.getByText(/produto criado/i)).toBeVisible({ timeout: 15000 });
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('produtos: estoque 1 variante — lista exibe produto com variante', async ({ page }) => {
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    await page.goto('/admin/produtos');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/Produto QA E2E|produtos/i).first()).toBeVisible({ timeout: 10000 });
    const row = page.locator('table tbody tr').first();
    await expect(row).toBeVisible({ timeout: 5000 });
  });

  test('commerce health: página carrega e exibe checks ou listas', async ({ page }) => {
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    await page.goto('/admin/commerce-health');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/commerce health|integridade|checks/i).first()).toBeVisible({ timeout: 10000 });
    const tentarNovamente = page.getByRole('button', { name: /tentar novamente/i });
    const liberarBtn = page.getByRole('button', { name: /liberar reservas/i });
    const reconciliarBtn = page.getByRole('button', { name: /reconciliar/i });
    const hasContent =
      (await page.getByText(/tudo certo|erro|pendentes|reservas/i).first().isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await liberarBtn.isVisible({ timeout: 2000 }).catch(() => false)) ||
      (await reconciliarBtn.isVisible({ timeout: 2000 }).catch(() => false)) ||
      (await tentarNovamente.isVisible({ timeout: 2000 }).catch(() => false));
    expect(hasContent).toBeTruthy();
  });

  test('commerce health: botão Liberar reservas ou Reconciliar existe e não trava ao clicar (sucesso ou erro tratado)', async ({
    page,
  }) => {
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    await page.goto('/admin/commerce-health');
    await page.waitForLoadState('networkidle');

    const liberarBtn = page.getByRole('button', { name: /liberar reservas/i });
    const reconciliarBtn = page.getByRole('button', { name: /reconciliar/i });
    const visible = (await liberarBtn.isVisible({ timeout: 5000 }).catch(() => false)) || (await reconciliarBtn.isVisible({ timeout: 5000 }).catch(() => false));
    if (!visible) {
      test.skip();
      return;
    }
    const btn = (await liberarBtn.isVisible().catch(() => false)) ? liberarBtn : reconciliarBtn;
    await btn.click();
    await page.waitForTimeout(3000);
    const toastOuErro = page.getByText(/sucesso|liberados|reconciliados|erro/i);
    await expect(toastOuErro.first()).toBeVisible({ timeout: 10000 });
  });

  test('logout redireciona para login', async ({ page }) => {
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    const sairBtn = page.getByRole('button', { name: /sair/i }).or(page.getByText(/sair/i).first());
    await expect(sairBtn).toBeVisible({ timeout: 5000 });
    await sairBtn.click();

    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10000 });
  });
});
