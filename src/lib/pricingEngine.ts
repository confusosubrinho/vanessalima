import { supabase } from '@/integrations/supabase/client';

export interface PricingConfig {
  id: string;
  is_active: boolean;
  max_installments: number;
  interest_free_installments: number;
  card_cash_rate: number;
  pix_discount: number;
  cash_discount: number;
  /** When false, PIX discount is not applied to products that already have sale_price < base_price. */
  pix_discount_applies_to_sale_products: boolean;
  interest_mode: 'fixed' | 'by_installment';
  monthly_rate_fixed: number;
  monthly_rate_by_installment: Record<string, number>;
  min_installment_value: number;
  rounding_mode: 'adjust_last' | 'truncate';
  transparent_checkout_fee_enabled: boolean;
  transparent_checkout_fee_percent: number;
  // Gateway internal cost fields
  gateway_fee_1x_percent: number;
  gateway_fee_additional_per_installment_percent: number;
  gateway_fee_starts_at_installment: number;
  gateway_fee_mode: 'linear_per_installment' | 'price_table';
}

export interface InstallmentOption {
  n: number;
  installmentValue: number;
  lastInstallmentValue: number;
  total: number;
  hasInterest: boolean;
  monthlyRate: number;
  label: string;
}

// Cache
let _cachedConfig: PricingConfig | null = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

const DEFAULT_CONFIG: PricingConfig = {
  id: '',
  is_active: true,
  max_installments: 6,
  interest_free_installments: 3,
  card_cash_rate: 0,
  pix_discount: 5,
  cash_discount: 5,
  pix_discount_applies_to_sale_products: true,
  interest_mode: 'fixed',
  monthly_rate_fixed: 0,
  monthly_rate_by_installment: {},
  min_installment_value: 25,
  rounding_mode: 'adjust_last',
  transparent_checkout_fee_enabled: false,
  transparent_checkout_fee_percent: 0,
  gateway_fee_1x_percent: 4.99,
  gateway_fee_additional_per_installment_percent: 2.49,
  gateway_fee_starts_at_installment: 2,
  gateway_fee_mode: 'linear_per_installment',
};

/**
 * Single source of truth — returns active financial config.
 */
export async function getActivePricingConfig(): Promise<PricingConfig> {
  if (_cachedConfig && Date.now() - _cacheTime < CACHE_TTL) {
    return _cachedConfig;
  }

  const { data, error } = await supabase
    .from('payment_pricing_config' as any)
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { ...DEFAULT_CONFIG };
  }

  const d = data as any;
  const config: PricingConfig = {
    id: d.id,
    is_active: d.is_active,
    max_installments: d.max_installments,
    interest_free_installments: d.interest_free_installments,
    card_cash_rate: Number(d.card_cash_rate) || 0,
    pix_discount: Number(d.pix_discount) || 0,
    cash_discount: Number(d.cash_discount) || 0,
    pix_discount_applies_to_sale_products: d.pix_discount_applies_to_sale_products !== false,
    interest_mode: d.interest_mode || 'fixed',
    monthly_rate_fixed: Number(d.monthly_rate_fixed) || 0,
    monthly_rate_by_installment: d.monthly_rate_by_installment || {},
    min_installment_value: Number(d.min_installment_value) || 25,
    rounding_mode: d.rounding_mode || 'adjust_last',
    transparent_checkout_fee_enabled: d.transparent_checkout_fee_enabled ?? false,
    transparent_checkout_fee_percent: Number(d.transparent_checkout_fee_percent) || 0,
    gateway_fee_1x_percent: Number(d.gateway_fee_1x_percent) ?? 4.99,
    gateway_fee_additional_per_installment_percent: Number(d.gateway_fee_additional_per_installment_percent) ?? 2.49,
    gateway_fee_starts_at_installment: Number(d.gateway_fee_starts_at_installment) || 2,
    gateway_fee_mode: d.gateway_fee_mode || 'linear_per_installment',
  };

  _cachedConfig = config;
  _cacheTime = Date.now();
  return config;
}

/** Alias for getActivePricingConfig */
export const getFinancialConfig = getActivePricingConfig;

export function invalidatePricingCache() {
  _cachedConfig = null;
  _cacheTime = 0;
}

/**
 * Get monthly interest rate for a given installment number.
 */
function getMonthlyRate(config: PricingConfig, n: number): number {
  if (n <= config.interest_free_installments) return 0;
  if (config.interest_mode === 'by_installment') {
    const rate = config.monthly_rate_by_installment[String(n)];
    if (rate !== undefined) return Number(rate) / 100;
  }
  return Number(config.monthly_rate_fixed) / 100;
}

/**
 * Calculate installment value using Price (annuity) formula.
 */
function calcInstallmentRaw(price: number, monthlyRate: number, n: number): number {
  if (n === 1 || monthlyRate <= 0) return price;
  const i = monthlyRate;
  const factor = (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  return price * factor;
}

/**
 * Apply rounding_mode = adjust_last
 */
function applyRounding(
  rawInstallment: number,
  n: number,
  totalExact: number,
  mode: string
): { installmentValue: number; lastInstallmentValue: number; total: number } {
  if (n === 1) {
    const v = Math.round(rawInstallment * 100) / 100;
    return { installmentValue: v, lastInstallmentValue: v, total: v };
  }

  const installmentValue = Math.floor(rawInstallment * 100) / 100;
  const totalRounded = Math.round(totalExact * 100) / 100;

  if (mode === 'adjust_last') {
    const sumFirstN = Math.round(installmentValue * (n - 1) * 100) / 100;
    const lastInstallmentValue = Math.round((totalRounded - sumFirstN) * 100) / 100;
    return { installmentValue, lastInstallmentValue, total: totalRounded };
  }

  return { installmentValue, lastInstallmentValue: installmentValue, total: Math.round(installmentValue * n * 100) / 100 };
}

/**
 * Core installment calculation — used by front and back.
 * This calculates what the CUSTOMER sees/pays.
 */
export function calculateInstallments(
  price: number,
  config: PricingConfig,
  paymentMethod: 'card' | 'pix' = 'card',
  requestedInstallments?: number
): { installmentValue: number; lastInstallmentValue: number; total: number; hasInterest: boolean; monthlyRate: number } {
  if (paymentMethod === 'pix') {
    const pixTotal = getPixPrice(price, config);
    return { installmentValue: pixTotal, lastInstallmentValue: pixTotal, total: pixTotal, hasInterest: false, monthlyRate: 0 };
  }

  const n = requestedInstallments || 1;

  let basePrice = price;
  if (n === 1 && config.card_cash_rate > 0) {
    basePrice = price * (1 + config.card_cash_rate / 100);
  }

  const monthlyRate = getMonthlyRate(config, n);
  const hasInterest = monthlyRate > 0;

  if (!hasInterest) {
    const raw = basePrice / n;
    const totalExact = basePrice;
    const { installmentValue, lastInstallmentValue, total } = applyRounding(raw, n, totalExact, config.rounding_mode);
    return { installmentValue, lastInstallmentValue, total, hasInterest: false, monthlyRate: 0 };
  }

  const rawInstallment = calcInstallmentRaw(price, monthlyRate, n);
  const totalExact = rawInstallment * n;
  const { installmentValue, lastInstallmentValue, total } = applyRounding(rawInstallment, n, totalExact, config.rounding_mode);
  return { installmentValue, lastInstallmentValue, total, hasInterest: true, monthlyRate };
}

/**
 * Get customer-facing installment options.
 * "sem juros" is purely visual for the customer — the gateway cost is separate.
 */
export function getCustomerInstallments(price: number, config: PricingConfig): InstallmentOption[] {
  return getInstallmentOptions(price, config);
}

/**
 * Get all installment options for a given price.
 */
export function getInstallmentOptions(price: number, config: PricingConfig): InstallmentOption[] {
  const options: InstallmentOption[] = [];

  for (let n = 1; n <= config.max_installments; n++) {
    const result = calculateInstallments(price, config, 'card', n);

    if (n > 1 && result.installmentValue < config.min_installment_value) break;

    const suffix = result.hasInterest ? ` (total ${formatCurrency(result.total)})` : ' sem juros';

    options.push({
      n,
      installmentValue: result.installmentValue,
      lastInstallmentValue: result.lastInstallmentValue,
      total: result.total,
      hasInterest: result.hasInterest,
      monthlyRate: result.monthlyRate,
      label: `${n}x de ${formatCurrency(result.installmentValue)}${suffix}`,
    });
  }

  return options;
}

/**
 * Installment display result — single source of truth for the entire site.
 */
export interface InstallmentDisplay {
  primaryText: string;
  secondaryText: string | null;
  bestInterestFreeInstallments: number | null;
  maxInstallments: number;
  bestInterestFreeInstallmentAmount: number | null;
}

/**
 * Get the unified installment display for a given price.
 * This is the ONLY function for installment text across the entire site.
 */
export function getInstallmentDisplay(price: number, config: PricingConfig): InstallmentDisplay {
  // Always use the configured interest_free_installments, ignoring min_installment_value.
  // This ensures "6x sem juros" is always displayed when config says 6, regardless of product price.
  const bestN = config.interest_free_installments;
  const maxN = config.max_installments;

  if (bestN >= 2 && price > 0) {
    const installmentAmount = Math.floor((price / bestN) * 100) / 100;
    const primaryText = `ou ${bestN}x de ${formatCurrency(installmentAmount)} sem juros`;
    const secondaryText = maxN > bestN ? `até ${maxN}x no cartão` : null;

    return {
      primaryText,
      secondaryText,
      bestInterestFreeInstallments: bestN,
      maxInstallments: maxN,
      bestInterestFreeInstallmentAmount: installmentAmount,
    };
  }

  const primaryText = maxN > 1 ? `até ${maxN}x no cartão` : formatCurrency(price);

  return {
    primaryText,
    secondaryText: null,
    bestInterestFreeInstallments: null,
    maxInstallments: maxN,
    bestInterestFreeInstallmentAmount: null,
  };
}

/**
 * @deprecated Use getInstallmentDisplay() instead.
 */
export function getBestHighlight(price: number, config: PricingConfig): string {
  const display = getInstallmentDisplay(price, config);
  return display.primaryText;
}

/**
 * Get PIX price with discount.
 */
export function getPixPrice(price: number, config: PricingConfig): number {
  return Math.round(price * (1 - config.pix_discount / 100) * 100) / 100;
}

/**
 * Whether PIX discount should be applied for this product (considering "no PIX on sale" setting).
 */
export function shouldApplyPixDiscount(config: PricingConfig, hasProductSaleDiscount: boolean): boolean {
  if (hasProductSaleDiscount && config.pix_discount_applies_to_sale_products === false) return false;
  return true;
}

/**
 * PIX price for display: applies discount only when config allows (e.g. not for products already on sale).
 */
export function getPixPriceForDisplay(price: number, config: PricingConfig, hasProductSaleDiscount: boolean): number {
  if (!shouldApplyPixDiscount(config, hasProductSaleDiscount)) return price;
  return getPixPrice(price, config);
}

/**
 * PIX discount amount in BRL for a given price (0 when discount is not applied).
 */
export function getPixDiscountAmount(price: number, config: PricingConfig, hasProductSaleDiscount: boolean): number {
  if (!shouldApplyPixDiscount(config, hasProductSaleDiscount)) return 0;
  return Math.round(price * (config.pix_discount / 100) * 100) / 100;
}

/**
 * Calculate transparent checkout fee (internal cost, not shown to customer).
 */
export function getTransparentCheckoutFee(orderTotal: number, config: PricingConfig): number {
  if (!config.transparent_checkout_fee_enabled || config.transparent_checkout_fee_percent <= 0) return 0;
  return Math.round(orderTotal * (config.transparent_checkout_fee_percent / 100) * 100) / 100;
}

// ─── GATEWAY INTERNAL COST ───────────────────────────────────────────

export interface GatewayCostResult {
  /** Effective fee percentage for this installment count */
  gateway_fee_percent_effective: number;
  /** Fee amount in BRL */
  gateway_fee_amount: number;
}

/**
 * Calculate the internal gateway (MDR) cost for a given sale.
 * This is NOT shown to the customer — it's the merchant's cost.
 *
 * Linear model:
 *   1x  → fee = fee_1x
 *   n≥2 → fee = fee_1x + fee_additional * (n - 1)
 */
export function getGatewayCost(
  price: number,
  installments: number,
  config: PricingConfig
): GatewayCostResult {
  const n = Math.max(1, installments);
  let feePercent: number;

  if (config.gateway_fee_mode === 'linear_per_installment') {
    if (n < config.gateway_fee_starts_at_installment) {
      feePercent = config.gateway_fee_1x_percent;
    } else {
      feePercent =
        config.gateway_fee_1x_percent +
        config.gateway_fee_additional_per_installment_percent * (n - 1);
    }
  } else {
    // Fallback / price_table: use the old monthly_rate approach for internal cost
    feePercent = config.gateway_fee_1x_percent;
  }

  const feeAmount = Math.round(price * (feePercent / 100) * 100) / 100;

  return {
    gateway_fee_percent_effective: Math.round(feePercent * 100) / 100,
    gateway_fee_amount: feeAmount,
  };
}

/**
 * Calculate net profit for an order considering cost, gateway fees and checkout fee.
 * Uses the new per-installment gateway cost model.
 */
export function calculateNetProfit(
  revenue: number,
  cost: number,
  config: PricingConfig,
  paymentMethod: 'pix' | 'card' = 'card',
  installments: number = 1
): {
  netProfit: number;
  marginPercent: number;
  checkoutFee: number;
  gatewayFee: number;
  gatewayFeePercent: number;
  totalFees: number;
} {
  const checkoutFee = getTransparentCheckoutFee(revenue, config);

  let gatewayFee = 0;
  let gatewayFeePercent = 0;

  if (paymentMethod === 'card') {
    const gw = getGatewayCost(revenue, installments, config);
    gatewayFee = gw.gateway_fee_amount;
    gatewayFeePercent = gw.gateway_fee_percent_effective;
  }
  // PIX: typically no gateway fee

  const totalFees = checkoutFee + gatewayFee;
  const netProfit = revenue - cost - totalFees;
  const marginPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  return { netProfit, marginPercent, checkoutFee, gatewayFee, gatewayFeePercent, totalFees };
}

/**
 * Format BRL currency.
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
