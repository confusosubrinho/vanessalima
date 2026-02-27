/**
 * PARTE 1 — Parcelamento com juros: total exibido e enviado ao backend.
 * Garante que: 1x = total normal; Nx com juros = total atualizado; trocar parcela = total sempre sincronizado.
 */
import { describe, it, expect } from 'vitest';
import {
  getInstallmentOptions,
  calculateInstallments,
  type PricingConfig,
} from '@/lib/pricingEngine';

const configWithInterest: PricingConfig = {
  id: 'test',
  is_active: true,
  max_installments: 6,
  interest_free_installments: 2,
  interest_free_installments_sale: null,
  card_cash_rate: 0,
  pix_discount: 0,
  cash_discount: 0,
  pix_discount_applies_to_sale_products: true,
  interest_mode: 'fixed',
  monthly_rate_fixed: 1.99,
  monthly_rate_by_installment: {},
  min_installment_value: 25,
  rounding_mode: 'adjust_last',
  transparent_checkout_fee_enabled: false,
  transparent_checkout_fee_percent: 0,
  gateway_fee_1x_percent: 0,
  gateway_fee_additional_per_installment_percent: 0,
  gateway_fee_starts_at_installment: 2,
  gateway_fee_mode: 'linear_per_installment',
};

describe('Checkout parcelamento com juros', () => {
  const total = 1000; // subtotal + frete - desconto

  it('1x sem juros: total igual ao valor base', () => {
    const options = getInstallmentOptions(total, configWithInterest, false);
    const one = options.find(o => o.n === 1)!;
    expect(one.hasInterest).toBe(false);
    expect(one.total).toBe(total);
  });

  it('3x com juros: total atualizado corretamente (maior que base)', () => {
    const options = getInstallmentOptions(total, configWithInterest, false);
    const three = options.find(o => o.n === 3)!;
    expect(three.hasInterest).toBe(true);
    expect(three.total).toBeGreaterThan(total);
    const byCalc = calculateInstallments(total, configWithInterest, 'card', 3);
    expect(three.total).toBe(byCalc.total);
  });

  it('trocar parcela várias vezes: total sempre sincronizado com a opção selecionada', () => {
    const options = getInstallmentOptions(total, configWithInterest, false);
    const selectedValues = [1, 2, 3, 4, 2, 1];
    for (const n of selectedValues) {
      const opt = options.find(o => o.n === n);
      expect(opt).toBeDefined();
      const fromEngine = calculateInstallments(total, configWithInterest, 'card', n);
      expect(opt!.total).toBe(fromEngine.total);
    }
  });

  it('displayTotal lógico: cartão 1x = total base; cartão 3x com juros = opção.total', () => {
    const options = getInstallmentOptions(total, configWithInterest, false);
    const effectiveInterestFree = configWithInterest.interest_free_installments; // 2

    const for1x = options.find(o => o.n === 1)!;
    const displayTotal1x = 1 > effectiveInterestFree && for1x?.hasInterest ? for1x.total : total;
    expect(displayTotal1x).toBe(total);

    const for3x = options.find(o => o.n === 3)!;
    const displayTotal3x = 3 > effectiveInterestFree && for3x?.hasInterest ? for3x.total : total;
    expect(displayTotal3x).toBe(for3x.total);
    expect(displayTotal3x).toBeGreaterThan(total);
  });
});
