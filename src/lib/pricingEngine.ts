import { supabase } from '@/integrations/supabase/client';

export interface PricingConfig {
  id: string;
  is_active: boolean;
  max_installments: number;
  interest_free_installments: number;
  card_cash_rate: number;
  pix_discount: number;
  cash_discount: number;
  interest_mode: 'fixed' | 'by_installment';
  monthly_rate_fixed: number;
  monthly_rate_by_installment: Record<string, number>;
  min_installment_value: number;
  rounding_mode: 'adjust_last' | 'truncate';
  transparent_checkout_fee_enabled: boolean;
  transparent_checkout_fee_percent: number;
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
  interest_mode: 'fixed',
  monthly_rate_fixed: 0,
  monthly_rate_by_installment: {},
  min_installment_value: 25,
  rounding_mode: 'adjust_last',
  transparent_checkout_fee_enabled: false,
  transparent_checkout_fee_percent: 0,
};

/**
 * Single source of truth — returns active financial config.
 * Alias: getFinancialConfig
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

  const config: PricingConfig = {
    id: (data as any).id,
    is_active: (data as any).is_active,
    max_installments: (data as any).max_installments,
    interest_free_installments: (data as any).interest_free_installments,
    card_cash_rate: Number((data as any).card_cash_rate) || 0,
    pix_discount: Number((data as any).pix_discount) || 0,
    cash_discount: Number((data as any).cash_discount) || 0,
    interest_mode: (data as any).interest_mode || 'fixed',
    monthly_rate_fixed: Number((data as any).monthly_rate_fixed) || 0,
    monthly_rate_by_installment: (data as any).monthly_rate_by_installment || {},
    min_installment_value: Number((data as any).min_installment_value) || 25,
    rounding_mode: (data as any).rounding_mode || 'adjust_last',
    transparent_checkout_fee_enabled: (data as any).transparent_checkout_fee_enabled ?? false,
    transparent_checkout_fee_percent: Number((data as any).transparent_checkout_fee_percent) || 0,
  };

  _cachedConfig = config;
  _cacheTime = Date.now();
  return config;
}

/** Alias for getActivePricingConfig — the single financial config function. */
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
 * parcela = P * (i * (1+i)^n) / ((1+i)^n - 1)
 */
function calcInstallmentRaw(price: number, monthlyRate: number, n: number): number {
  if (n === 1 || monthlyRate <= 0) return price;
  const i = monthlyRate;
  const factor = (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  return price * factor;
}

/**
 * Apply rounding_mode = adjust_last:
 * Round each installment to 2 decimals, adjust last one so total is exact.
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

  // truncate mode (fallback)
  return { installmentValue, lastInstallmentValue: installmentValue, total: Math.round(installmentValue * n * 100) / 100 };
}

/**
 * Core installment calculation — used by front and back.
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

  // For 1x with card_cash_rate
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

  // Interest-bearing
  const rawInstallment = calcInstallmentRaw(price, monthlyRate, n);
  const totalExact = rawInstallment * n;
  const { installmentValue, lastInstallmentValue, total } = applyRounding(rawInstallment, n, totalExact, config.rounding_mode);
  return { installmentValue, lastInstallmentValue, total, hasInterest: true, monthlyRate };
}

/**
 * Get all installment options for a given price.
 */
export function getInstallmentOptions(price: number, config: PricingConfig): InstallmentOption[] {
  const options: InstallmentOption[] = [];

  for (let n = 1; n <= config.max_installments; n++) {
    const result = calculateInstallments(price, config, 'card', n);

    // Check min installment value
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
 * Get the best highlight for display (e.g., "3x sem juros de R$ 33,00").
 */
export function getBestHighlight(price: number, config: PricingConfig): string {
  const options = getInstallmentOptions(price, config);
  
  // Find best interest-free option
  const interestFreeOptions = options.filter(o => !o.hasInterest && o.n > 1);
  if (interestFreeOptions.length > 0) {
    const best = interestFreeOptions[interestFreeOptions.length - 1];
    return `${best.n}x de ${formatCurrency(best.installmentValue)} sem juros`;
  }
  
  // If no interest-free, show max installments
  if (options.length > 1) {
    const last = options[options.length - 1];
    return `até ${last.n}x de ${formatCurrency(last.installmentValue)}`;
  }
  
  return formatCurrency(price);
}

/**
 * Get PIX price with discount.
 */
export function getPixPrice(price: number, config: PricingConfig): number {
  return Math.round(price * (1 - config.pix_discount / 100) * 100) / 100;
}

/**
 * Calculate transparent checkout fee (internal cost, not shown to customer).
 */
export function getTransparentCheckoutFee(orderTotal: number, config: PricingConfig): number {
  if (!config.transparent_checkout_fee_enabled || config.transparent_checkout_fee_percent <= 0) return 0;
  return Math.round(orderTotal * (config.transparent_checkout_fee_percent / 100) * 100) / 100;
}

/**
 * Calculate net profit for an order considering cost, gateway fees and checkout fee.
 * This is the ONLY function that should be used for profit/margin calculations.
 */
export function calculateNetProfit(
  revenue: number,
  cost: number,
  config: PricingConfig,
  paymentMethod: 'pix' | 'card' = 'card',
  installments: number = 1
): { netProfit: number; marginPercent: number; checkoutFee: number; gatewayFee: number; totalFees: number } {
  const checkoutFee = getTransparentCheckoutFee(revenue, config);
  
  // Gateway fee: for card 1x use card_cash_rate
  // For interest-free installments the merchant absorbs the cost (card_cash_rate applied)
  // For interest-bearing installments the customer pays interest, but there's still a base gateway fee
  let gatewayFee = 0;
  if (paymentMethod === 'card') {
    // The card_cash_rate represents the gateway's base fee for card transactions
    gatewayFee = revenue * (config.card_cash_rate / 100);
  }
  // PIX typically has no gateway fee (or a much lower one) — handled by card_cash_rate = 0 for pix
  
  const totalFees = checkoutFee + gatewayFee;
  const netProfit = revenue - cost - totalFees;
  const marginPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  
  return { netProfit, marginPercent, checkoutFee, gatewayFee, totalFees };
}

/**
 * Format BRL currency.
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
