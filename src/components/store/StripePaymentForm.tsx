import { useState, useEffect, useCallback } from 'react';
import { loadStripe, type Stripe as StripeType, type StripeElementsOptions } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

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

function CheckoutForm({ onSuccess, onError, total, isLoading, setIsLoading }: {
  onSuccess: () => void;
  onError: (message: string) => void;
  total: number;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async () => {
    if (!stripe || !elements || isLoading) return;
    setIsLoading(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/obrigado`,
        },
        redirect: 'if_required',
      });

      if (error) {
        onError(error.message || 'Erro no pagamento');
      } else {
        onSuccess();
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
      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />
      <Button
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
