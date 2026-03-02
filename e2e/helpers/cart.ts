/**
 * E2E helper: fluxo de carrinho no browser (produto → carrinho → pronto para checkout).
 * O carrinho é client-side (localStorage); este helper usa a UI.
 */
import type { Page } from '@playwright/test';

export async function ensureCartWithOneItem(page: Page, productListPath: string = '/mais-vendidos'): Promise<void> {
  await page.goto(productListPath);
  await page.waitForLoadState('networkidle');
  const card = page.locator('[id^="product-card-"]').first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  await card.click();
  await page.waitForURL(/\/produto\//, { timeout: 10000 });
  const addInModal = page.locator('#btn-variant-add-to-cart');
  const addBtn = page.getByRole('button', { name: /adicionar ao carrinho/i }).first();
  if (await addInModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    await addInModal.click();
  } else {
    await addBtn.click();
  }
  await page.goto('/carrinho');
  await page.waitForURL('/carrinho', { timeout: 5000 });
}

export async function goToCheckoutStart(page: Page): Promise<void> {
  const goCheckout = page
    .getByRole('link', { name: /finalizar compra|checkout|continuar/i })
    .or(page.locator('a[href*="checkout"]'))
    .first();
  await goCheckout.waitFor({ state: 'visible', timeout: 5000 });
  await goCheckout.click();
  await page.waitForURL(/\/(checkout\/start|checkout)/, { timeout: 10000 });
}
