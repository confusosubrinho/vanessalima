import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, ChevronRight, Truck, CreditCard, MapPin, ArrowLeft, Plus, Minus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { validateCPF, formatCPF, formatCEP, formatPhone, lookupCEP } from '@/lib/validators';
import { ShippingCalculator } from '@/components/store/ShippingCalculator';
import { usePricingConfig } from '@/hooks/usePricingConfig';
import { getInstallmentOptions, formatCurrency as formatPricingCurrency, type PricingConfig } from '@/lib/pricingEngine';
import { HelpHint } from '@/components/HelpHint';
import { CouponInput } from '@/components/store/CouponInput';
import logo from '@/assets/logo.png';
import { getCartItemUnitPrice, hasSaleDiscount } from '@/lib/cartPricing';
import { isCouponValidForLocation } from '@/lib/couponDiscount';
import { StripePaymentForm, useStripeConfig } from '@/components/store/StripePaymentForm';

type Step = 'identification' | 'shipping' | 'payment';

function formatCardNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
  return digits;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// IMPROVEMENT #4: Luhn algorithm
function luhnCheck(num: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let digit = parseInt(num[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export default function Checkout() {
  const navigate = useNavigate();
  const { items, subtotal, clearCart, updateQuantity, selectedShipping, shippingZip, discount, appliedCoupon, removeCoupon } = useCart();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<Step>('identification');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cpfError, setCpfError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [selectedInstallments, setSelectedInstallments] = useState(1);
  const [customerIp, setCustomerIp] = useState('0.0.0.0');
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  // Stripe state
  const { config: stripeConfig } = useStripeConfig();
  const isStripeActive = stripeConfig?.is_active && !!stripeConfig?.publishable_key;
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [stripeOrderId, setStripeOrderId] = useState<string | null>(null);

  // IMPROVEMENT #5: Payment error state
  const [paymentError, setPaymentError] = useState<{
    message: string;
    suggestion: string;
  } | null>(null);

  // Use central pricing config
  const { data: pricingConfig } = usePricingConfig();
  const pc: PricingConfig = pricingConfig || {
    id: '', is_active: true, max_installments: 6, interest_free_installments: 3, interest_free_installments_sale: null,
    card_cash_rate: 0, pix_discount: 5, cash_discount: 5, pix_discount_applies_to_sale_products: true,
    interest_mode: 'fixed', monthly_rate_fixed: 0, monthly_rate_by_installment: {}, min_installment_value: 25,
    rounding_mode: 'adjust_last', transparent_checkout_fee_enabled: false, transparent_checkout_fee_percent: 0,
    gateway_fee_1x_percent: 4.99, gateway_fee_additional_per_installment_percent: 2.49,
    gateway_fee_starts_at_installment: 2, gateway_fee_mode: 'linear_per_installment',
  };

  const hasAnySaleItem = items.some(hasSaleDiscount);
  const effectiveInterestFree = (hasAnySaleItem && (pc as any).interest_free_installments_sale != null)
    ? (pc as any).interest_free_installments_sale
    : pc.interest_free_installments;

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    phone: '',
    cpf: '',
    cep: '',
    address: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    paymentMethod: 'pix',
    cardNumber: '',
    cardHolder: '',
    cardExpiry: '',
    cardCvv: '',
  });

  // Collect customer IP
  useEffect(() => {
    try {
      if ((window as any).AppmaxScripts) {
        (window as any).AppmaxScripts.init(
          (data: any) => { if (data?.ip) setCustomerIp(data.ip); },
          () => {}
        );
      } else {
        fetch('https://api.ipify.org?format=json')
          .then(r => r.json())
          .then(d => { if (d?.ip) setCustomerIp(d.ip); })
          .catch(() => {});
      }
    } catch {
      // Silent fail
    }
  }, []);

  // Revalidate coupon when CEP/state change: remove if coupon is restricted to other locations
  useEffect(() => {
    if (!appliedCoupon) return;
    const hasLocationRestriction =
      (appliedCoupon.applicable_states?.length ?? 0) > 0 ||
      (appliedCoupon.applicable_zip_prefixes?.length ?? 0) > 0;
    if (!hasLocationRestriction) return;
    const state = formData.state?.trim() || '';
    const zip = formData.cep?.replace(/\D/g, '') || '';
    if (!state && !zip) return;
    if (!isCouponValidForLocation(appliedCoupon, state, zip)) {
      removeCoupon();
      toast({
        title: 'Cupom removido',
        description: 'Este cupom não é válido para o endereço de entrega informado.',
        variant: 'destructive',
      });
    }
  }, [formData.cep, formData.state, appliedCoupon, removeCoupon, toast]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
  };

  const steps = [
    { id: 'identification', label: 'Identificação', icon: MapPin },
    { id: 'shipping', label: 'Entrega', icon: Truck },
    { id: 'payment', label: 'Pagamento', icon: CreditCard },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  const handleMaskedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'cpf') {
      setFormData(prev => ({ ...prev, cpf: formatCPF(value) }));
      setCpfError('');
    } else if (name === 'cep') {
      setFormData(prev => ({ ...prev, cep: formatCEP(value) }));
    } else if (name === 'phone') {
      setFormData(prev => ({ ...prev, phone: formatPhone(value) }));
    } else if (name === 'cardNumber') {
      setFormData(prev => ({ ...prev, cardNumber: formatCardNumber(value) }));
    } else if (name === 'cardExpiry') {
      setFormData(prev => ({ ...prev, cardExpiry: formatExpiry(value) }));
    } else if (name === 'cardCvv') {
      setFormData(prev => ({ ...prev, cardCvv: value.replace(/\D/g, '').slice(0, 4) }));
    } else if (name === 'email') {
      setFormData(prev => ({ ...prev, email: value }));
      setEmailError('');
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCepBlur = useCallback(async () => {
    const cleaned = formData.cep.replace(/\D/g, '');
    if (cleaned.length !== 8) return;
    setCepLoading(true);
    const result = await lookupCEP(cleaned);
    setCepLoading(false);
    if (result) {
      setFormData(prev => ({
        ...prev,
        address: result.logradouro || prev.address,
        neighborhood: result.bairro || prev.neighborhood,
        city: result.localidade || prev.city,
        state: result.uf || prev.state,
      }));
    } else {
      toast({ title: 'CEP não encontrado', variant: 'destructive' });
    }
  }, [formData.cep, toast]);

  const handleNextStep = () => {
    if (currentStep === 'identification') {
      if (!formData.email || !formData.name || !formData.phone || !formData.cpf) {
        toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
        return;
      }
      if (!validateEmail(formData.email)) {
        setEmailError('Email inválido');
        toast({ title: 'Email inválido. Verifique e tente novamente.', variant: 'destructive' });
        return;
      }
      if (!validateCPF(formData.cpf)) {
        setCpfError('CPF inválido');
        toast({ title: 'CPF inválido. Verifique e tente novamente.', variant: 'destructive' });
        return;
      }
      setCurrentStep('shipping');
    } else if (currentStep === 'shipping') {
      if (!formData.cep || !formData.address || !formData.number || !formData.neighborhood || !formData.city || !formData.state) {
        toast({ title: 'Preencha o endereço completo', variant: 'destructive' });
        return;
      }
      if (!selectedShipping) {
        toast({ title: 'Selecione um método de envio', description: 'Calcule o frete pelo CEP para continuar.', variant: 'destructive' });
        return;
      }
      setCurrentStep('payment');
    }
  };

  // Use pricing engine for installments
  const shippingCost = selectedShipping ? selectedShipping.price : 0;
  const total = subtotal - discount + shippingCost;

  // PIX total: when pix_discount_applies_to_sale_products is false, apply discount only to full-price items
  let finalTotal: number;
  if (formData.paymentMethod === 'pix') {
    const applyPixToSale = pc.pix_discount_applies_to_sale_products;
    if (!applyPixToSale) {
      let subtotalFull = 0;
      let subtotalSale = 0;
      for (const item of items) {
        const lineTotal = getCartItemUnitPrice(item) * item.quantity;
        if (hasSaleDiscount(item)) subtotalSale += lineTotal;
        else subtotalFull += lineTotal;
      }
      const subtotalAfterCoupon = Math.max(0, subtotal - discount);
      const ratioFull = subtotal > 0 ? subtotalFull / subtotal : 0;
      const ratioSale = subtotal > 0 ? subtotalSale / subtotal : 0;
      const fullPart = subtotalAfterCoupon * ratioFull;
      const salePart = subtotalAfterCoupon * ratioSale;
      const pixDiscountPct = pc.pix_discount / 100;
      finalTotal = fullPart * (1 - pixDiscountPct) + salePart + shippingCost;
    } else {
      const pixDiscountPct = pc.pix_discount / 100;
      finalTotal = total * (1 - pixDiscountPct);
    }
  } else {
    finalTotal = total;
  }

  const pixDiscountAmount = formData.paymentMethod === 'pix'
    ? Math.max(0, total - finalTotal)
    : 0;

  const installmentOptions = getInstallmentOptions(total, pc, hasAnySaleItem).map(opt => ({
    value: opt.n,
    label: opt.label,
    total: opt.total,
  }));

  const handleSubmit = async () => {
    if (isLoading || isSubmitted) return;

    // Card validation (only for Appmax flow, Stripe handles its own)
    if (!isStripeActive && formData.paymentMethod === 'card') {
      const cardDigits = formData.cardNumber.replace(/\s/g, '');
      if (cardDigits.length < 15) { toast({ title: 'Número de cartão inválido', variant: 'destructive' }); return; }
      if (!luhnCheck(cardDigits)) { toast({ title: 'Número de cartão inválido', description: 'Verifique os dados digitados.', variant: 'destructive' }); return; }
      const [expMonth, expYear] = formData.cardExpiry.split('/');
      const expDate = new Date(2000 + parseInt(expYear || '0'), parseInt(expMonth || '0') - 1);
      if (expDate < new Date()) { toast({ title: 'Cartão expirado', variant: 'destructive' }); return; }
      if (!formData.cardHolder || formData.cardHolder.trim().length < 3) { toast({ title: 'Nome do titular inválido', variant: 'destructive' }); return; }
      if (formData.cardCvv.length < 3) { toast({ title: 'CVV inválido', variant: 'destructive' }); return; }
    }

    setIsLoading(true);
    setPaymentError(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id || null;
      const idempotencyKey = idempotencyKeyRef.current;

      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, order_number')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingOrder) {
        setIsSubmitted(true);
        navigate(`/pedido-confirmado/${existingOrder.id}`, {
          state: { orderId: existingOrder.id, orderNumber: existingOrder.order_number },
          replace: true,
        });
        return;
      }

      const guestToken = userId ? null : crypto.randomUUID();

      let orderTotal: number;
      if (formData.paymentMethod === 'pix') {
        orderTotal = finalTotal;
      } else if (formData.paymentMethod === 'card' && selectedInstallments > effectiveInterestFree) {
        const selected = installmentOptions.find(o => o.value === selectedInstallments);
        orderTotal = selected ? selected.total : finalTotal;
      } else {
        orderTotal = finalTotal;
      }

      // 1. Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: 'TEMP',
          user_id: userId,
          subtotal: subtotal,
          shipping_cost: shippingCost,
          discount_amount: discount,
          total_amount: orderTotal,
          status: 'pending',
          shipping_name: formData.name,
          shipping_address: `${formData.address}, ${formData.number}${formData.complement ? ' - ' + formData.complement : ''}`,
          shipping_city: formData.city,
          shipping_state: formData.state,
          shipping_zip: formData.cep,
          shipping_phone: formData.phone,
          coupon_code: appliedCoupon?.code || null,
          customer_email: formData.email.toLowerCase(),
          customer_cpf: formData.cpf,
          idempotency_key: idempotencyKey,
          access_token: guestToken,
          notes: null,
        } as any)
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Insert order items
      const orderItems = items.map(item => ({
        order_id: order.id,
        product_id: item.product.id,
        product_variant_id: item.variant.id,
        product_name: item.product.name,
        variant_info: `Tam: ${item.variant.size}${item.variant.color ? ' | Cor: ' + item.variant.color : ''}`,
        quantity: item.quantity,
        unit_price: getCartItemUnitPrice(item),
        total_price: getCartItemUnitPrice(item) * item.quantity,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      // ─── STRIPE FLOW ───
      if (isStripeActive) {
        const productsForStripe = items.map(item => ({
          sku: item.product.sku || item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          price: getCartItemUnitPrice(item),
          variant_id: item.variant.id,
          product_id: item.product.id,
        }));

        const { data: intentResult, error: intentError } = await supabase.functions.invoke('stripe-create-intent', {
          body: {
            action: 'create_payment_intent',
            order_id: order.id,
            amount: orderTotal,
            payment_method: formData.paymentMethod === 'card' ? 'card' : 'pix',
            customer_email: formData.email,
            customer_name: formData.name,
            products: productsForStripe,
            coupon_code: appliedCoupon?.code || null,
            discount_amount: discount,
            installments: selectedInstallments,
            order_access_token: guestToken,
          },
        });

        if (intentError || intentResult?.error) {
          throw new Error(intentResult?.error || intentError?.message || 'Erro ao criar pagamento Stripe');
        }

        // Show Stripe Elements
        setStripeClientSecret(intentResult.client_secret);
        setStripeOrderId(order.id);
        setIsLoading(false);
        return; // Don't navigate yet — user completes payment in Elements
      }

      // ─── APPMAX FLOW (existing) ───
      const appmaxPaymentMethod = formData.paymentMethod === 'card' ? 'credit-card' : formData.paymentMethod;
      const expiryParts = formData.cardExpiry.split('/');
      const expiryMonth = expiryParts[0] || '';
      const expiryYear = expiryParts[1] ? '20' + expiryParts[1] : '';

      const productsForAppmax = items.map(item => ({
        sku: item.product.sku || item.product.id,
        name: item.product.name,
        quantity: item.quantity,
        price: getCartItemUnitPrice(item),
        variant_id: item.variant.id,
        product_id: item.product.id,
      }));

      const paymentPayload: Record<string, unknown> = {
        action: 'create_transaction',
        order_id: order.id,
        amount: orderTotal,
        payment_method: appmaxPaymentMethod,
        customer_name: formData.name,
        customer_email: formData.email,
        customer_phone: formData.phone,
        customer_cpf: formData.cpf,
        customer_ip: customerIp,
        shipping_zip: formData.cep,
        shipping_address: formData.address,
        shipping_number: formData.number,
        shipping_complement: formData.complement,
        shipping_neighborhood: formData.neighborhood,
        shipping_city: formData.city,
        shipping_state: formData.state,
        products: productsForAppmax,
        coupon_code: appliedCoupon?.code || null,
        discount_amount: discount,
        order_access_token: guestToken,
      };

      if (formData.paymentMethod === 'card') {
        try {
          const tokenizeResponse = await supabase.functions.invoke('process-payment', {
            body: {
              action: 'tokenize_card',
              order_id: order.id,
              order_access_token: guestToken,
              card_number: formData.cardNumber.replace(/\s/g, ''),
              card_holder: formData.cardHolder,
              expiration_month: expiryMonth,
              expiration_year: expiryYear,
              security_code: formData.cardCvv,
            },
          });
          if (tokenizeResponse.error || tokenizeResponse.data?.error) {
            throw new Error(tokenizeResponse.data?.error || 'Erro ao tokenizar cartão');
          }
          paymentPayload.card_token = tokenizeResponse.data.token;
        } catch (tokenErr: any) {
          throw new Error(tokenErr?.message || 'Erro ao processar dados do cartão');
        }
        paymentPayload.installments = selectedInstallments;
      }

      const { data: paymentResult, error: pmtError } = await supabase.functions.invoke(
        'process-payment',
        { body: paymentPayload }
      );

      if (pmtError) {
        await supabase.from('orders').update({ notes: `ERRO PAGAMENTO: ${pmtError.message}` }).eq('id', order.id);
        throw new Error(pmtError.message || 'Erro ao processar pagamento');
      }

      if (paymentResult?.error) {
        await supabase.from('orders').update({ notes: `ERRO APPMAX: ${paymentResult.error}` }).eq('id', order.id);
        throw new Error(paymentResult.error);
      }

      if (paymentResult?.appmax_order_id || paymentResult?.pay_reference) {
        await supabase.from('orders').update({
          notes: `Appmax Order: ${paymentResult.appmax_order_id || 'N/A'} | Ref: ${paymentResult.pay_reference || 'N/A'}`,
        }).eq('id', order.id);
      }

      supabase.functions.invoke('bling-sync', {
        body: { action: 'order_to_nfe', order_id: order.id },
      }).catch(() => {});

      setIsSubmitted(true);
      clearCart();

      navigate(`/pedido-confirmado/${order.id}`, {
        state: {
          orderId: order.id,
          orderNumber: order.order_number,
          paymentMethod: formData.paymentMethod,
          pixQrcode: paymentResult?.pix_qrcode,
          pixEmv: paymentResult?.pix_emv,
          pixExpirationDate: paymentResult?.pix_expiration_date,
          customerEmail: formData.email,
          guestToken: guestToken,
        },
        replace: true,
      });
    } catch (err: any) {
      console.error('Checkout error:', err);
      const msg = err?.message || 'Erro desconhecido';

      let suggestion = 'Tente novamente ou use outro método de pagamento.';
      if (msg.includes('recusado') || msg.includes('denied') || msg.includes('declined')) {
        suggestion = 'Seu banco recusou o cartão. Verifique o limite disponível ou tente outro cartão.';
      } else if (msg.includes('estoque') || msg.includes('stock')) {
        suggestion = 'Um item do seu carrinho ficou sem estoque durante o pagamento. Atualize o carrinho.';
      } else if (msg.includes('token') || msg.includes('cartão')) {
        suggestion = 'Verifique os dados do cartão e tente novamente.';
      } else if (msg.includes('divergente') || msg.includes('Recarregue')) {
        suggestion = 'Os preços podem ter sido atualizados. Recarregue a página e tente novamente.';
      }

      setPaymentError({ message: msg, suggestion });
      toast({ title: 'Pagamento não realizado', description: msg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // Stripe success handler
  const handleStripeSuccess = () => {
    setIsSubmitted(true);
    clearCart();
    if (stripeOrderId) {
      navigate(`/pedido-confirmado/${stripeOrderId}`, {
        state: { orderId: stripeOrderId, paymentMethod: formData.paymentMethod },
        replace: true,
      });
    }
  };

  const handleStripeError = (message: string) => {
    setPaymentError({ message, suggestion: 'Verifique os dados e tente novamente.' });
    toast({ title: 'Pagamento não realizado', description: message, variant: 'destructive' });
  };

  // Pre-fill CEP from cart
  useEffect(() => {
    if (shippingZip && !formData.cep) {
      setFormData(prev => ({ ...prev, cep: shippingZip }));
    }
  }, [shippingZip]);

  if (items.length === 0 && !isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2">Carrinho vazio</h1>
          <p className="text-muted-foreground mb-4">Adicione produtos para continuar</p>
          <Button asChild id="btn-checkout-back-empty">
            <Link to="/">Voltar para a loja</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-50">
        <div className="container-custom py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild id="btn-checkout-back">
              <Link to="/carrinho">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <Link to="/">
              <img src={logo} alt="Vanessa Lima Shoes" className="h-8" />
            </Link>
          </div>
          <div className="text-sm text-muted-foreground">
            Compra 100% segura
          </div>
        </div>
      </header>

      {/* Progress steps */}
      <div className="bg-background border-b">
        <div className="container-custom py-4">
          <div className="flex items-center justify-center gap-2 sm:gap-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <button
                  id={`btn-checkout-step-${step.id}`}
                  onClick={() => index < currentStepIndex && setCurrentStep(step.id as Step)}
                  disabled={index > currentStepIndex}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full transition-colors text-xs sm:text-sm ${
                    currentStep === step.id
                      ? 'bg-primary text-primary-foreground'
                      : index < currentStepIndex
                      ? 'bg-primary/20 text-primary cursor-pointer'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {index < currentStepIndex ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <step.icon className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline font-medium">{step.label}</span>
                </button>
                {index < steps.length - 1 && (
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 mx-1 sm:mx-2 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="container-custom py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="bg-background rounded-lg p-6 shadow-sm">
              {/* Step 1: Identification */}
              {currentStep === 'identification' && (
                <div className="space-y-6 animate-fade-in">
                  <h2 className="text-xl font-bold">Seus dados</h2>
                  
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleMaskedChange}
                        placeholder="seu@email.com"
                        className={emailError ? 'border-destructive' : ''}
                      />
                      {emailError && <p className="text-sm text-destructive mt-1">{emailError}</p>}
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="name">Nome completo *</Label>
                        <Input
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleMaskedChange}
                          placeholder="Seu nome"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Telefone *</Label>
                        <Input
                          id="phone"
                          name="phone"
                          value={formData.phone}
                          onChange={handleMaskedChange}
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="cpf">CPF *</Label>
                      <Input
                        id="cpf"
                        name="cpf"
                        value={formData.cpf}
                        onChange={handleMaskedChange}
                        placeholder="000.000.000-00"
                        className={cpfError ? 'border-destructive' : ''}
                      />
                      {cpfError && <p className="text-sm text-destructive mt-1">{cpfError}</p>}
                    </div>
                  </div>

                  <Button onClick={handleNextStep} className="w-full" size="lg" id="btn-checkout-to-shipping">
                    Continuar para entrega
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}

              {/* Step 2: Shipping */}
              {currentStep === 'shipping' && (
                <div className="space-y-6 animate-fade-in">
                  <h2 className="text-xl font-bold">Endereço de entrega</h2>
                  
                  <div className="grid gap-4">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="relative">
                        <Label htmlFor="cep">CEP *</Label>
                        <Input
                          id="cep"
                          name="cep"
                          value={formData.cep}
                          onChange={handleMaskedChange}
                          onBlur={handleCepBlur}
                          placeholder="00000-000"
                        />
                        {cepLoading && (
                          <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-9 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    <div className="grid md:grid-cols-4 gap-4">
                      <div className="md:col-span-3">
                        <Label htmlFor="address">Endereço *</Label>
                        <Input
                          id="address"
                          name="address"
                          value={formData.address}
                          onChange={handleMaskedChange}
                          placeholder="Rua, Avenida..."
                        />
                      </div>
                      <div>
                        <Label htmlFor="number">Número *</Label>
                        <Input
                          id="number"
                          name="number"
                          value={formData.number}
                          onChange={handleMaskedChange}
                          placeholder="123"
                        />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="complement">Complemento</Label>
                        <Input
                          id="complement"
                          name="complement"
                          value={formData.complement}
                          onChange={handleMaskedChange}
                          placeholder="Apto, Bloco..."
                        />
                      </div>
                      <div>
                        <Label htmlFor="neighborhood">Bairro *</Label>
                        <Input
                          id="neighborhood"
                          name="neighborhood"
                          value={formData.neighborhood}
                          onChange={handleMaskedChange}
                          placeholder="Seu bairro"
                        />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="city">Cidade *</Label>
                        <Input
                          id="city"
                          name="city"
                          value={formData.city}
                          onChange={handleMaskedChange}
                          placeholder="Sua cidade"
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">Estado *</Label>
                        <Input
                          id="state"
                          name="state"
                          value={formData.state}
                          onChange={handleMaskedChange}
                          placeholder="UF"
                          maxLength={2}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Real shipping calculator */}
                  <div className="space-y-4">
                    <h3 className="font-medium">Calcular frete</h3>
                    <ShippingCalculator />
                    {selectedShipping && (
                      <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        <span className="text-sm">
                          <span className="font-medium">{selectedShipping.name}</span>
                          <span className="text-muted-foreground ml-2">
                            {selectedShipping.price === 0 ? 'Grátis' : formatPrice(selectedShipping.price)}
                            {selectedShipping.deadline && ` • ${selectedShipping.deadline}`}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>

                  <Button onClick={handleNextStep} className="w-full" size="lg" id="btn-checkout-to-payment">
                    Continuar para pagamento
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}

              {/* Step 3: Payment */}
              {currentStep === 'payment' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold">Pagamento</h2>
                    <HelpHint helpKey="store.checkout" />
                  </div>

                  {/* Coupon in payment step */}
                  <CouponInput />

                  <RadioGroup
                    value={formData.paymentMethod}
                    onValueChange={(value) => {
                      setFormData(prev => ({ ...prev, paymentMethod: value }));
                      setSelectedInstallments(1);
                      setPaymentError(null);
                    }}
                    className="space-y-4"
                  >
                    <div className={`p-4 border rounded-lg cursor-pointer transition-colors ${formData.paymentMethod === 'pix' ? 'border-primary bg-primary/5' : 'hover:border-primary'}`}>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <RadioGroupItem value="pix" id="payment-pix" />
                          <Label htmlFor="payment-pix" className="cursor-pointer flex-1">
                            <span className="font-medium">PIX</span>
                            <p className="text-sm text-muted-foreground">Pagamento instantâneo com {pc.pix_discount}% de desconto</p>
                          </Label>
                          <span className="font-bold text-primary">{formatPrice(finalTotal)}</span>
                        </div>
                        {pixDiscountAmount > 0 && (
                          <div className="pl-7 text-sm text-muted-foreground">
                            <span className="line-through">{formatPrice(total)}</span>
                            <span className="block text-xs">{pc.pix_discount}% off no PIX</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={`p-4 border rounded-lg cursor-pointer transition-colors ${formData.paymentMethod === 'card' ? 'border-primary bg-primary/5' : 'hover:border-primary'}`}>
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value="card" id="payment-card" />
                        <Label htmlFor="payment-card" className="cursor-pointer flex-1">
                          <span className="font-medium">Cartão de Crédito</span>
                          <p className="text-sm text-muted-foreground">
                            Em até {effectiveInterestFree}x sem juros
                            {pc.max_installments > effectiveInterestFree && ` ou até ${pc.max_installments}x`}
                          </p>
                        </Label>
                        <span className="font-medium">{formatPrice(total)}</span>
                      </div>
                    </div>
                  </RadioGroup>

                  {/* Stripe Elements flow */}
                  {stripeClientSecret && isStripeActive && stripeConfig?.publishable_key ? (
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/30 animate-fade-in">
                      <h3 className="font-medium flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Pagamento via Stripe
                      </h3>
                      <StripePaymentForm
                        clientSecret={stripeClientSecret}
                        publishableKey={stripeConfig.publishable_key}
                        onSuccess={handleStripeSuccess}
                        onError={handleStripeError}
                        total={finalTotal}
                        isLoading={isLoading}
                        setIsLoading={setIsLoading}
                      />
                    </div>
                  ) : (
                    <>
                      {/* Card fields (Appmax flow) */}
                      {formData.paymentMethod === 'card' && !isStripeActive && (
                        <div className="space-y-4 p-4 border rounded-lg bg-muted/30 animate-fade-in">
                          <h3 className="font-medium flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Dados do Cartão
                          </h3>
                          <div>
                            <Label htmlFor="cardNumber">Número do cartão *</Label>
                            <Input id="cardNumber" name="cardNumber" value={formData.cardNumber} onChange={handleMaskedChange} placeholder="0000 0000 0000 0000" maxLength={19} autoComplete="cc-number" />
                          </div>
                          <div>
                            <Label htmlFor="cardHolder">Nome impresso no cartão *</Label>
                            <Input id="cardHolder" name="cardHolder" value={formData.cardHolder} onChange={handleMaskedChange} placeholder="NOME COMO ESTÁ NO CARTÃO" autoComplete="cc-name" className="uppercase" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="cardExpiry">Validade *</Label>
                              <Input id="cardExpiry" name="cardExpiry" value={formData.cardExpiry} onChange={handleMaskedChange} placeholder="MM/AA" maxLength={5} autoComplete="cc-exp" />
                            </div>
                            <div>
                              <Label htmlFor="cardCvv">CVV *</Label>
                              <Input id="cardCvv" name="cardCvv" type="password" value={formData.cardCvv} onChange={handleMaskedChange} placeholder="000" maxLength={4} autoComplete="cc-csc" />
                            </div>
                          </div>
                          <div>
                            <Label>Parcelas</Label>
                            <Select value={String(selectedInstallments)} onValueChange={(val) => setSelectedInstallments(Number(val))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {installmentOptions.map(opt => (
                                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={handleSubmit}
                        className="w-full"
                        size="lg"
                        disabled={isLoading || isSubmitted}
                        id="btn-checkout-finalize"
                      >
                        {isSubmitted && !isLoading ? (
                          'Pedido Enviado ✓'
                        ) : isLoading ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando pagamento...</>
                        ) : (
                          `Finalizar Pedido — ${formatPrice(formData.paymentMethod === 'card' && selectedInstallments > effectiveInterestFree
                            ? (installmentOptions.find(o => o.value === selectedInstallments)?.total || finalTotal)
                            : finalTotal
                          )}`
                        )}
                      </Button>
                    </>
                  )

                  {/* IMPROVEMENT #5: Payment error details */}
                  {paymentError && (
                    <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg space-y-2">
                      <p className="font-medium text-destructive text-sm">❌ {paymentError.message}</p>
                      <p className="text-sm text-muted-foreground">{paymentError.suggestion}</p>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => setPaymentError(null)}>
                          Tentar novamente
                        </Button>
                        {formData.paymentMethod === 'card' && (
                          <Button size="sm" variant="ghost" onClick={() => {
                            setPaymentError(null);
                            setFormData(prev => ({ ...prev, paymentMethod: 'pix' }));
                          }}>
                            Pagar com PIX
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Order summary */}
          <div className="lg:col-span-1">
            <div className="bg-background rounded-lg p-6 shadow-sm sticky top-32">
              <h2 className="font-bold text-lg mb-4">Resumo do Pedido</h2>
              
              <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4">
                {items.map((item) => {
                  const unitPrice = getCartItemUnitPrice(item);
                  const maxQty = item.variant.stock_quantity || 99;
                  return (
                    <div key={item.variant.id} className="flex gap-3 items-start">
                      <img
                        src={item.product.images?.[0]?.url || '/placeholder.svg'}
                        alt={item.product.name}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1 text-sm space-y-1">
                        <p className="font-medium line-clamp-1">{item.product.name}</p>
                        <p className="text-muted-foreground">
                          Tam: {item.variant.size}
                          {item.variant.color && ` | Cor: ${item.variant.color}`}
                        </p>
                        <button
                          onClick={() => {
                            window.open(`/produto/${item.product.slug}`, '_blank');
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          Alterar variante
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            id={`btn-checkout-qty-minus-${item.variant.id}`}
                            onClick={() => updateQuantity(item.variant.id, item.quantity - 1)}
                            className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="font-medium w-6 text-center">{item.quantity}</span>
                          <button
                            id={`btn-checkout-qty-plus-${item.variant.id}`}
                            onClick={() => {
                              if (item.quantity < maxQty) {
                                updateQuantity(item.variant.id, item.quantity + 1);
                              } else {
                                toast({ title: `Estoque máximo: ${maxQty} unidades`, variant: 'destructive' });
                              }
                            }}
                            className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="font-medium">{formatPrice(unitPrice * item.quantity)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span>Desconto{appliedCoupon ? ` (${appliedCoupon.code})` : ''}</span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Frete{selectedShipping ? ` (${selectedShipping.name})` : ''}</span>
                  <span className={shippingCost === 0 ? 'text-primary' : ''}>
                    {selectedShipping ? (shippingCost === 0 ? 'Grátis' : formatPrice(shippingCost)) : 'A calcular'}
                  </span>
                </div>
                {formData.paymentMethod === 'pix' && pixDiscountAmount > 0 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span>Desconto PIX ({pc.pix_discount}%)</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total</span>
                  {/* IMPROVEMENT #3: Animate total change */}
                  <span key={finalTotal.toFixed(2)} className="animate-fade-in">
                    {formatPrice(finalTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
