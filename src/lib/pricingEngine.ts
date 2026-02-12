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
  total: number;
  hasInterest: boolean;
  monthlyRate: number;
  label: string;
}

// Cache
let _cachedConfig: PricingConfig | null = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

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
    // Fallback defaults
    return {
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
function calcInstallment(price: number, monthlyRate: number, n: number): { installmentValue: number; total: number } {
  if (n === 1 || monthlyRate <= 0) {
    return { installmentValue: Math.round(price * 100) / 100, total: Math.round(price * 100) / 100 };
  }
  
  const i = monthlyRate;
  const factor = (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  const installmentValue = Math.round(price * factor * 100) / 100;
  const total = Math.round(installmentValue * n * 100) / 100;
  
  return { installmentValue, total };
}

/**
 * Get all installment options for a given price.
 */
export function getInstallmentOptions(price: number, config: PricingConfig): InstallmentOption[] {
  const options: InstallmentOption[] = [];

  for (let n = 1; n <= config.max_installments; n++) {
    const monthlyRate = getMonthlyRate(config, n);
    const hasInterest = monthlyRate > 0;
    
    // For 1x with card_cash_rate
    let basePrice = price;
    if (n === 1 && config.card_cash_rate > 0) {
      basePrice = price * (1 + config.card_cash_rate / 100);
    }
    
    const { installmentValue, total } = hasInterest 
      ? calcInstallment(price, monthlyRate, n) 
      : { installmentValue: Math.round(basePrice / n * 100) / 100, total: Math.round(basePrice * 100) / 100 };

    // Check min installment value
    if (n > 1 && installmentValue < config.min_installment_value) break;

    const suffix = hasInterest ? ` (total ${formatCurrency(total)})` : ' sem juros';
    
    options.push({
      n,
      installmentValue,
      total,
      hasInterest,
      monthlyRate,
      label: `${n}x de ${formatCurrency(installmentValue)}${suffix}`,
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
 */
export function calculateNetProfit(
  revenue: number,
  cost: number,
  config: PricingConfig,
  paymentMethod: 'pix' | 'card' = 'card',
  installments: number = 1
): { netProfit: number; marginPercent: number; checkoutFee: number; gatewayRate: number } {
  const checkoutFee = getTransparentCheckoutFee(revenue, config);
  
  // Gateway rate: for card 1x use card_cash_rate, for installments use the monthly rate
  let gatewayRate = 0;
  if (paymentMethod === 'card') {
    if (installments === 1) {
      gatewayRate = revenue * (config.card_cash_rate / 100);
    } else if (installments > config.interest_free_installments) {
      const monthlyRate = getMonthlyRate(config, installments);
      gatewayRate = revenue * monthlyRate * installments; // approximate
    }
  }
  
  const netProfit = revenue - cost - checkoutFee - gatewayRate;
  const marginPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  
  return { netProfit, marginPercent, checkoutFee, gatewayRate };
}

/**
 * Format BRL currency.
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
