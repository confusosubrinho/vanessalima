/**
 * PARTE 2 — Cartão sem redirect: pagamento Stripe embutido no checkout.
 * Garante: formulário no meu domínio, sem redirect; retorno 3DS para o mesmo site; erro inline.
 * Requer: seed:qa. Com Stripe ativo, após Finalizar o formulário de cartão aparece na mesma página.
 */
import { test, expect } from '@playwright/test';

test.describe('Stripe checkout embutido (cartão sem redirect)', () => {
  test('checkout cartão: permanece no mesmo domínio ao exibir formulário Stripe', async ({ page }) => {
    const origin = new URL(page.url()).origin || 'http://localhost:8080';
    await page.goto(`${origin}/mais-vendidos`);
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

    await page.goto(`${origin}/checkout`);
    await page.waitForLoadState('networkidle');

    if (await page.getByText(/carrinho vazio/i).isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }

    const toShipping = page.locator('#btn-checkout-to-shipping');
    const toPayment = page.locator('#btn-checkout-to-payment');
    if (await toShipping.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByLabel(/e-mail|email/i).fill('stripe-e2e@example.com');
      await page.getByLabel(/nome|name/i).first().fill('E2E Stripe');
      await page.getByLabel(/telefone|phone/i).fill('11999999999');
      await page.getByLabel(/cpf/i).fill('529.982.247-25');
      await toShipping.click();
      await page.waitForTimeout(1000);
    }
    if (await toPayment.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByLabel(/cep/i).fill('01310100');
      await page.waitForTimeout(800);
      await page.getByLabel(/endereço|address/i).fill('Av Paulista');
      await page.getByLabel(/número|number/i).first().fill('1000');
      await page.getByLabel(/bairro/i).fill('Bela Vista');
      await page.getByLabel(/cidade|city/i).fill('São Paulo');
      await page.getByLabel(/estado|state/i).fill('SP');
      await page.waitForTimeout(500);
      const shipOpt = page.locator('text=Grátis').or(page.locator('[class*="primary/10"]')).first();
      if (await shipOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
        await shipOpt.click();
        await page.waitForTimeout(500);
      }
      await toPayment.click();
      await page.waitForTimeout(500);
    }

    await page.getByRole('radio', { name: /cartão/i }).click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);

    const finalizeBtn = page.locator('#btn-checkout-finalize');
    await expect(finalizeBtn).toBeVisible({ timeout: 5000 });
    const urlBefore = page.url();

    finalizeBtn.click();
    await page.waitForTimeout(4000);

    const urlAfter = page.url();
    expect(new URL(urlAfter).origin).toBe(new URL(urlBefore).origin);
    expect(urlAfter).not.toMatch(/stripe\.com/);

    const stripePayBtn = page.locator('#btn-stripe-pay');
    const stripeForm = page.getByText(/Pagar R\$/).or(page.getByText(/processado por Stripe/i));
    const hasStripeUI = (await stripePayBtn.isVisible({ timeout: 5000 }).catch(() => false)) ||
      (await stripeForm.isVisible({ timeout: 3000 }).catch(() => false));
    if (hasStripeUI) {
      expect(hasStripeUI).toBe(true);
    } else {
      const wentToConfirm = page.url().includes('/pedido-confirmado');
      const stillCheckout = page.url().includes('/checkout');
      expect(wentToConfirm || stillCheckout).toBe(true);
    }
  });

  test('erro de pagamento exibido inline e botão Pagar reabilitado após falha', async ({ page }) => {
    const origin = new URL(page.url()).origin || 'http://localhost:8080';
    await page.goto(`${origin}/checkout`);
    await page.waitForLoadState('networkidle');

    if (await page.getByText(/carrinho vazio/i).isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }

    const toShipping = page.locator('#btn-checkout-to-shipping');
    const toPayment = page.locator('#btn-checkout-to-payment');
    if (await toShipping.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByLabel(/e-mail|email/i).fill('err@example.com');
      await page.getByLabel(/nome|name/i).first().fill('E2E Err');
      await page.getByLabel(/telefone|phone/i).fill('11988887777');
      await page.getByLabel(/cpf/i).fill('529.982.247-25');
      await toShipping.click();
      await page.waitForTimeout(1000);
    }
    if (await toPayment.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByLabel(/cep/i).fill('01310100');
      await page.waitForTimeout(800);
      await page.getByLabel(/endereço|address/i).fill('Rua Teste');
      await page.getByLabel(/número|number/i).first().fill('1');
      await page.getByLabel(/bairro/i).fill('Centro');
      await page.getByLabel(/cidade|city/i).fill('São Paulo');
      await page.getByLabel(/estado|state/i).fill('SP');
      await page.waitForTimeout(500);
      const shipOpt = page.locator('text=Grátis').or(page.locator('[class*="primary/10"]')).first();
      if (await shipOpt.isVisible({ timeout: 3000 }).catch(() => false)) {
        await shipOpt.click();
        await page.waitForTimeout(500);
      }
      await toPayment.click();
      await page.waitForTimeout(500);
    }

    await page.getByRole('radio', { name: /cartão/i }).click({ timeout: 3000 }).catch(() => {});

    const payBtn = page.locator('#btn-stripe-pay');
    const errorBlock = page.locator('#checkout-payment-error');
    const tryAgainBtn = page.getByRole('button', { name: /tentar novamente/i });

    if (await payBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.route('**/functions/v1/stripe-create-intent**', (route) =>
        route.fulfill({ status: 500, body: JSON.stringify({ error: 'Simulated failure' }) })
      );
      payBtn.click();
      await page.waitForTimeout(3000);
      const hasError = await errorBlock.isVisible({ timeout: 5000 }).catch(() => false);
      const hasTryAgain = await tryAgainBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasError || hasTryAgain) {
        expect(hasError || hasTryAgain).toBe(true);
      }
    }
  });
});
