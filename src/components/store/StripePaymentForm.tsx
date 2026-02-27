import { useState, useEffect, useRef } from 'react';
import { loadStripe, type Stripe as StripeType, type StripeElementsOptions } from '@stripe/stripe-js';
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Lock } from 'lucide-react';

let stripePromise: Promise<StripeType | null> | null = null;

function getStripe(publishableKey: string) {
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

interface StripePaymentFormProps {
  clientSecret: string;
  publishableKey: string;
  onSuccess: () => void;
  onError: (message: string) => void;
  total: number;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
}

const elementStyle = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1a1a1a',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': { color: '#9ca3af' },
      padding: '12px',
    },
    invalid: { color: '#ef4444' },
  },
};

function CheckoutForm({ clientSecret, onSuccess, onError, total, isLoading, setIsLoading }: {
  clientSecret: string;
  onSuccess: () => void;
  onError: (message: string) => void;
  total: number;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const handledReturnRef = useRef(false);

  // Retorno de 3DS: Stripe redireciona para return_url com #payment_intent_client_secret e redirect_status no fragment
  useEffect(() => {
    if (!stripe || !clientSecret || handledReturnRef.current) return;
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const piSecret = params.get('payment_intent_client_secret');
    const status = params.get('redirect_status');
    if (!piSecret || piSecret !== clientSecret) return;
    handledReturnRef.current = true;
    if (status === 'succeeded' || status === 'processing') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      onSuccess();
    }
  }, [stripe, clientSecret, onSuccess]);

  const handleSubmit = async () => {
    if (!stripe || !elements || isLoading) return;
    setIsLoading(true);

    try {
      const cardNumber = elements.getElement(CardNumberElement);
      if (!cardNumber) {
        onError('Erro ao carregar formulário do cartão');
        setIsLoading(false);
        return;
      }

      const returnUrl = typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}${window.location.search || ''}`
        : undefined;

      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardNumber,
          },
          return_url: returnUrl,
        }
      );

      if (error) {
        onError(error.message || 'Erro no pagamento');
      } else if (paymentIntent?.status === 'succeeded') {
        onSuccess();
      } else if (paymentIntent?.status === 'processing') {
        onSuccess();
      } else {
        onError('Pagamento não confirmado. Tente novamente.');
      }
    } catch (err: any) {
      onError(err?.message || 'Erro inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-medium mb-1.5 block">Número do cartão</Label>
          <div className="border rounded-md px-3 py-2.5 bg-background focus-within:ring-2 focus-within:ring-ring focus-within:border-primary transition-colors">
            <CardNumberElement options={elementStyle} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium mb-1.5 block">Validade</Label>
            <div className="border rounded-md px-3 py-2.5 bg-background focus-within:ring-2 focus-within:ring-ring focus-within:border-primary transition-colors">
              <CardExpiryElement options={elementStyle} />
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium mb-1.5 block">CVV</Label>
            <div className="border rounded-md px-3 py-2.5 bg-background focus-within:ring-2 focus-within:ring-ring focus-within:border-primary transition-colors">
              <CardCvcElement options={elementStyle} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        <span>Pagamento seguro processado por Stripe</span>
      </div>

      <Button
        id="btn-stripe-pay"
        onClick={handleSubmit}
        className="w-full"
        size="lg"
        disabled={isLoading || !stripe || !elements}
      >
        {isLoading ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</>
        ) : (
          `Pagar ${formatPrice(total)}`
        )}
      </Button>
    </div>
  );
}

export function StripePaymentForm({
  clientSecret,
  publishableKey,
  onSuccess,
  onError,
  total,
  isLoading,
  setIsLoading,
}: StripePaymentFormProps) {
  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: 'hsl(var(--primary))',
        borderRadius: '8px',
      },
    },
    locale: 'pt-BR',
  };

  return (
    <Elements stripe={getStripe(publishableKey)} options={options}>
      <CheckoutForm
        clientSecret={clientSecret}
        onSuccess={onSuccess}
        onError={onError}
        total={total}
        isLoading={isLoading}
        setIsLoading={setIsLoading}
      />
    </Elements>
  );
}

// Hook to check if Stripe is the active provider
export function useStripeConfig() {
  const [config, setConfig] = useState<{ publishable_key: string | null; is_active: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.functions.invoke('stripe-create-intent', {
          body: { action: 'get_config' },
        });
        setConfig(data);
      } catch {
        setConfig(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { config, loading };
}
