/**
 * E2E: Clique no card de produto e categorias.
 * Requer seed:qa antes (npm run seed:qa). Sem skips.
 */
import { test, expect } from '@playwright/test';

test.describe('Clique no card de produto', () => {
  test('na página Mais vendidos: clique no card abre a página do produto', async ({ page }) => {
    await page.goto('/mais-vendidos');
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('[id^="product-card-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    const cardId = await firstCard.getAttribute('id');
    const slug = cardId?.replace('product-card-', '') ?? '';
    await firstCard.click();

    await expect(page).toHaveURL(new RegExp(`/produto/${slug}`), { timeout: 10000 });
  });

  test('na página Promoções: clique no card abre a página do produto', async ({ page }) => {
    await page.goto('/promocoes');
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('[id^="product-card-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    const cardId = await firstCard.getAttribute('id');
    const slug = cardId?.replace('product-card-', '') ?? '';
    await firstCard.click();

    await expect(page).toHaveURL(new RegExp(`/produto/${slug}`), { timeout: 10000 });
  });

  test('na home: clique no card do grid abre a página do produto', async ({ page }) => {
    await page.goto('/mais-vendidos');
    await page.waitForLoadState('networkidle');

    const card = page.locator('[id^="product-card-"]').first();
    await expect(card).toBeVisible({ timeout: 15000 });

    const cardId = await card.getAttribute('id');
    const slug = cardId?.replace('product-card-', '') ?? '';
    await card.click();

    await expect(page).toHaveURL(new RegExp(`/produto/${slug}`), { timeout: 10000 });
  });
});

test.describe('Clique em categorias', () => {
  test('na home: clique em categoria abre a página da categoria', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const categoryLink = page.locator('a[href^="/categoria/"]').first();
    await expect(categoryLink).toBeVisible({ timeout: 15000 });

    const href = await categoryLink.getAttribute('href');
    await categoryLink.click();

    await expect(page).toHaveURL(/\/categoria\/[^/]+/, { timeout: 10000 });
  });
});
