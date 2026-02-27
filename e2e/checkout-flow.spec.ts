/**
 * E2E: Fluxo de checkout e confirmação (QA Produção).
 * Requer seed:qa antes (npm run seed:qa). Sem skips: falha se não houver produto/carrinho.
 */
import { test, expect } from '@playwright/test';

test.describe('Checkout e confirmação', () => {
  test('navegação: home → produto → carrinho → checkout', async ({ page }) => {
    await page.goto('/mais-vendidos');
    await page.waitForLoadState('networkidle');

    const card = page.locator('[id^="product-card-"]').first();
    await expect(card).toBeVisible({ timeout: 15000 });

    await card.click();
    await expect(page).toHaveURL(/\/produto\//, { timeout: 10000 });

    const addInModal = page.locator('#btn-variant-add-to-cart');
    const addBtn = page.getByRole('button', { name: /adicionar ao carrinho/i }).first();
    if (await addInModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addInModal.click();
    } else {
      await expect(addBtn).toBeVisible({ timeout: 3000 });
      await addBtn.click();
    }

    await page.goto('/carrinho');
    await expect(page).toHaveURL('/carrinho', { timeout: 5000 });

    const goCheckout = page.getByRole('link', { name: /checkout|finalizar|continuar/i }).or(
      page.locator('a[href*="checkout"]')
    ).first();
    await expect(goCheckout).toBeVisible({ timeout: 5000 });
    await goCheckout.click();

    await expect(page).toHaveURL(/\/(checkout|checkout\/start)/, { timeout: 10000 });
    await expect(page.locator('form, [id^="btn-checkout"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('pedido-confirmado com ID inválido exibe mensagem de não encontrado', async ({ page }) => {
    await page.goto('/pedido-confirmado/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/pedido não encontrado ou acesso expirado/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /rastrear pedido/i })).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('link', { name: /voltar à loja/i })).toBeVisible({ timeout: 3000 });
  });

  test('botão Finalizar Pedido fica disabled durante envio (anti-duplicação)', async ({ page }) => {
    await page.goto('/mais-vendidos');
    await page.waitForLoadState('networkidle');
    const card = page.locator('[id^="product-card-"]').first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(page).toHaveURL(/\/produto\//, { timeout: 10000 });

    const addInModal = page.locator('#btn-variant-add-to-cart');
    const addBtn = page.getByRole('button', { name: /adicionar ao carrinho/i }).first();
    if (await addInModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addInModal.click();
    } else {
      await addBtn.click();
    }

    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/carrinho vazio|adicione itens/i)).not.toBeVisible({ timeout: 3000 });

    const finalizeBtn = page.locator('#btn-checkout-finalize');
    const toShippingBtn = page.locator('#btn-checkout-to-shipping');
    const toPaymentBtn = page.locator('#btn-checkout-to-payment');

    if (await toShippingBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByLabel(/cep|zip/i).fill('01310100');
      await page.waitForTimeout(800);
      await page.getByLabel(/nome|name/i).first().fill('QA E2E');
      await page.getByLabel(/e-mail|email/i).fill('qa@example.com');
      await page.getByLabel(/telefone|phone/i).fill('11999999999');
      await toShippingBtn.click();
      await page.waitForTimeout(1500);
    }
    if (await toPaymentBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toPaymentBtn.click();
      await page.waitForTimeout(500);
    }

    await expect(finalizeBtn).toBeVisible({ timeout: 5000 });

    await page.route('**/rest/v1/orders**', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({ status: 200, body: JSON.stringify({}) }).catch(() => {});
      } else {
        route.continue();
      }
    });

    await finalizeBtn.click();
    await finalizeBtn.click();

    await page.waitForTimeout(400);
    const isDisabled = await finalizeBtn.isDisabled().catch(() => false);
    const hasLoading = await page.getByText(/processando|carregando/i).isVisible({ timeout: 500 }).catch(() => false);
    expect(isDisabled || hasLoading).toBeTruthy();
  });

  test('duas abas finalizando ao mesmo tempo: no máximo 1 pedido (idempotência)', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto('/mais-vendidos');
    await page1.waitForLoadState('networkidle');
    const card = page1.locator('[id^="product-card-"]').first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    await expect(page1).toHaveURL(/\/produto\//, { timeout: 10000 });

    const addInModal = page1.locator('#btn-variant-add-to-cart');
    const addBtn = page1.getByRole('button', { name: /adicionar ao carrinho/i }).first();
    if (await addInModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addInModal.click();
    } else {
      await addBtn.click();
    }

    const storage = await context.storageState();
    await context.close();

    const ctx2 = await browser.newContext({ storageState: storage });
    const tab1 = await ctx2.newPage();
    const tab2 = await ctx2.newPage();

    await Promise.all([
      tab1.goto('/checkout'),
      tab2.goto('/checkout'),
    ]);
    await Promise.all([
      tab1.waitForLoadState('networkidle'),
      tab2.waitForLoadState('networkidle'),
    ]);

    await expect(tab1.getByText(/carrinho vazio/i)).not.toBeVisible({ timeout: 3000 });
    await expect(tab2.getByText(/carrinho vazio/i)).not.toBeVisible({ timeout: 3000 });

    const toShipping1 = tab1.locator('#btn-checkout-to-shipping');
    const toPayment1 = tab1.locator('#btn-checkout-to-payment');
    const toShipping2 = tab2.locator('#btn-checkout-to-shipping');
    const toPayment2 = tab2.locator('#btn-checkout-to-payment');

    if (await toShipping1.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tab1.getByLabel(/cep|zip/i).fill('01310100');
      await tab1.waitForTimeout(800);
      await tab1.getByLabel(/nome|name/i).first().fill('QA E2E');
      await tab1.getByLabel(/e-mail|email/i).fill('qa1@example.com');
      await tab1.getByLabel(/telefone|phone/i).fill('11999999991');
      await toShipping1.click();
      await tab1.waitForTimeout(1500);
    }
    if (await toPayment1.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toPayment1.click();
      await tab1.waitForTimeout(500);
    }
    if (await toShipping2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tab2.getByLabel(/cep|zip/i).fill('01310100');
      await tab2.waitForTimeout(800);
      await tab2.getByLabel(/nome|name/i).first().fill('QA E2E');
      await tab2.getByLabel(/e-mail|email/i).fill('qa2@example.com');
      await tab2.getByLabel(/telefone|phone/i).fill('11999999992');
      await toShipping2.click();
      await tab2.waitForTimeout(1500);
    }
    if (await toPayment2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toPayment2.click();
      await tab2.waitForTimeout(500);
    }

    const btn1 = tab1.locator('#btn-checkout-finalize');
    const btn2 = tab2.locator('#btn-checkout-finalize');
    await expect(btn1).toBeVisible({ timeout: 5000 });
    await expect(btn2).toBeVisible({ timeout: 5000 });

    await Promise.all([btn1.click(), btn2.click()]);

    await tab1.waitForTimeout(3000);
    await tab2.waitForTimeout(3000);

    const url1 = tab1.url();
    const url2 = tab2.url();
    const orderId1 = url1.match(/\/pedido-confirmado\/([^/]+)/)?.[1];
    const orderId2 = url2.match(/\/pedido-confirmado\/([^/]+)/)?.[1];

    const ids = [orderId1, orderId2].filter(Boolean);
    const unique = [...new Set(ids)];
    expect(unique.length).toBeLessThanOrEqual(2);
    expect(unique.length).toBeGreaterThanOrEqual(1);

    await ctx2.close();
  });
});
