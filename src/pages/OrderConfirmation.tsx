import { useState, useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle, Package, ArrowRight, Copy, Clock, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.png';

const statusLabels: Record<string, { label: string; description: string; color: string }> = {
  pending: {
    label: 'Aguardando Pagamento',
    description: 'Estamos aguardando a confirmação do seu pagamento.',
    color: 'text-yellow-600',
  },
  processing: {
    label: 'Pagamento Confirmado',
    description: 'Seu pagamento foi aprovado! O pedido está sendo preparado.',
    color: 'text-primary',
  },
  shipped: {
    label: 'Enviado',
    description: 'Seu pedido está a caminho!',
    color: 'text-blue-600',
  },
  delivered: {
    label: 'Entregue',
    description: 'Seu pedido foi entregue com sucesso.',
    color: 'text-green-600',
  },
  cancelled: {
    label: 'Cancelado',
    description: 'Este pedido foi cancelado.',
    color: 'text-destructive',
  },
};

// BUG #5: PIX countdown hook
function usePixCountdown(expirationDate: string | null) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!expirationDate) return;
    const expiry = new Date(expirationDate).getTime();
    const tick = () => {
      const remaining = Math.max(0, expiry - Date.now());
      setTimeLeft(remaining);
      if (remaining === 0) setIsExpired(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expirationDate]);

  if (timeLeft === null) return { display: null, isExpired: false, isUrgent: false };

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  return {
    display: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    isExpired,
    isUrgent: timeLeft < 5 * 60 * 1000,
  };
}

export default function OrderConfirmation() {
  const location = useLocation();
  const { orderId: urlOrderId } = useParams<{ orderId: string }>();
  const { toast } = useToast();

  // BUG #4: Persist state in sessionStorage
  const SESSION_KEY = `order_confirm_${urlOrderId || 'unknown'}`;

  const getInitialState = () => {
    // 1. location.state (fresh navigation)
    if (location.state?.orderId) {
      const s = {
        orderId: location.state.orderId,
        orderNumber: location.state.orderNumber,
        paymentMethod: location.state.paymentMethod || 'pix',
        pixQrcode: location.state.pixQrcode || null,
        pixEmv: location.state.pixEmv || null,
        pixExpirationDate: location.state.pixExpirationDate || null,
        customerEmail: location.state.customerEmail || null,
        guestToken: location.state.guestToken || null,
      };
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
      return s;
    }
    // 2. sessionStorage (refresh)
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    // 3. Fallback
    return {
      orderId: urlOrderId || null,
      orderNumber: null,
      paymentMethod: 'pix',
      pixQrcode: null,
      pixEmv: null,
      pixExpirationDate: null,
      customerEmail: null,
      guestToken: null,
    };
  };

  const [confirmState] = useState(getInitialState);
  const [orderData, setOrderData] = useState<any>(null);
  const [orderStatus, setOrderStatus] = useState('pending');
  const [isLoading, setIsLoading] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);

  // Fetch store whatsapp
  useEffect(() => {
    supabase.from('store_settings').select('contact_whatsapp').limit(1).maybeSingle()
      .then(({ data }) => { if (data?.contact_whatsapp) setWhatsappNumber(data.contact_whatsapp.replace(/\D/g, '')); });
  }, []);

  // Fetch order data from DB (recovery on refresh)
  useEffect(() => {
    const id = confirmState.orderId || urlOrderId;
    if (!id) return;
    setIsLoading(true);
    const fetchOrder = async () => {
      try {
        const { data } = await supabase
          .from('orders')
          .select('id, order_number, status, payment_method, total_amount, created_at')
          .eq('id', id)
          .single();
        if (data) {
          setOrderData(data);
          setOrderStatus(data.status);
          if (!confirmState.orderNumber && data.order_number) {
            try {
              const stored = sessionStorage.getItem(SESSION_KEY);
              if (stored) {
                const parsed = JSON.parse(stored);
                parsed.orderNumber = data.order_number;
                sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
              }
            } catch {}
          }
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrder();
  }, [confirmState.orderId, urlOrderId]);

  // BUG #6: Realtime for logged-in users, polling for guests
  useEffect(() => {
    const id = confirmState.orderId || urlOrderId;
    if (!id) return;

    const guestToken = confirmState.guestToken;

    if (guestToken) {
      // Guest: poll every 10s since realtime won't work without RLS match
      const poll = async () => {
        const { data } = await supabase
          .from('orders')
          .select('status')
          .eq('id', id)
          .eq('access_token', guestToken)
          .single();
        if (data?.status && data.status !== orderStatus) {
          setOrderStatus(data.status);
          const info = statusLabels[data.status];
          if (info) toast({ title: info.label, description: info.description });
        }
      };
      poll();
      const interval = setInterval(poll, 10000);
      return () => clearInterval(interval);
    }

    // Logged-in user: use Realtime
    const channel = supabase
      .channel(`order-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        (payload) => {
          const newStatus = payload.new?.status;
          if (newStatus && newStatus !== orderStatus) {
            setOrderStatus(newStatus);
            const info = statusLabels[newStatus];
            if (info) toast({ title: info.label, description: info.description });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [confirmState.orderId, urlOrderId, confirmState.guestToken]);

  const orderNumber = confirmState.orderNumber || orderData?.order_number || (isLoading ? 'Carregando...' : 'N/A');
  const paymentMethod = confirmState.paymentMethod || orderData?.payment_method || 'pix';
  const pixQrcode = confirmState.pixQrcode;
  const pixEmv = confirmState.pixEmv;
  const pixExpirationDate = confirmState.pixExpirationDate;

  const pixCountdown = usePixCountdown(pixExpirationDate);

  const currentStatusInfo = statusLabels[orderStatus] || statusLabels.pending;

  const copyPixCode = () => {
    if (pixEmv) {
      navigator.clipboard.writeText(pixEmv);
      toast({ title: 'Código PIX copiado!' });
    }
  };

  const paymentInfo: Record<string, { title: string; description: string }> = {
    pix: {
      title: 'PIX',
      description: pixEmv
        ? 'Escaneie o QR Code abaixo ou copie o código PIX para realizar o pagamento.'
        : 'Realize o pagamento via PIX para confirmar seu pedido. O QR Code ou chave será enviado por email.',
    },
    card: {
      title: 'Cartão de Crédito',
      description: 'Seu pagamento foi processado com sucesso. O pedido será preparado em breve.',
    },
  };

  const info = paymentInfo[paymentMethod] || paymentInfo.pix;

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="bg-background border-b">
        <div className="container-custom py-4 flex items-center justify-center">
          <Link to="/">
            <img src={logo} alt="Logo" className="h-8" />
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-background rounded-xl shadow-sm p-8 md:p-12 max-w-lg w-full text-center space-y-6">
          <div className="flex justify-center">
            {orderStatus === 'pending' ? (
              <Clock className="h-16 w-16 text-yellow-500" />
            ) : orderStatus === 'cancelled' ? (
              <Package className="h-16 w-16 text-destructive" />
            ) : (
              <CheckCircle className="h-16 w-16 text-primary" />
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold mb-2">
              {orderStatus === 'pending' ? 'Aguardando Pagamento' : 'Pedido Realizado!'}
            </h1>
            <p className="text-muted-foreground">
              Seu pedido <strong className="text-foreground">{orderNumber}</strong> foi registrado com sucesso.
            </p>
          </div>

          {/* Real-time status indicator */}
          <div className={`bg-muted/50 rounded-lg p-4 space-y-2 ${currentStatusInfo.color}`}>
            <div className="flex items-center justify-center gap-2 font-medium">
              {orderStatus === 'pending' && <Loader2 className="h-4 w-4 animate-spin" />}
              <Package className="h-4 w-4" />
              <span>{currentStatusInfo.label}</span>
            </div>
            <p className="text-sm text-muted-foreground">{currentStatusInfo.description}</p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-left space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <Package className="h-4 w-4" />
              Pagamento via {info.title}
            </div>
            <p className="text-sm text-muted-foreground">{info.description}</p>
          </div>

          {/* PIX QR Code with countdown */}
          {paymentMethod === 'pix' && orderStatus === 'pending' && (
            <div className="space-y-3">
              {pixQrcode && !pixCountdown.isExpired && (
                <>
                  <img src={pixQrcode} alt="QR Code PIX" className="mx-auto w-48 h-48" />
                  {pixCountdown.display && (
                    <div className={`text-center text-sm font-mono font-bold ${
                      pixCountdown.isUrgent ? 'text-destructive animate-pulse' : 'text-muted-foreground'
                    }`}>
                      ⏱ Expira em {pixCountdown.display}
                    </div>
                  )}
                  {pixEmv && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground break-all bg-muted/50 p-2 rounded text-left font-mono">
                        {pixEmv}
                      </p>
                      <Button variant="outline" size="sm" onClick={copyPixCode} className="gap-2">
                        <Copy className="h-3 w-3" />
                        Copiar código PIX
                      </Button>
                    </div>
                  )}
                </>
              )}

              {pixCountdown.isExpired && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-center">
                  <p className="font-medium text-destructive">QR Code PIX expirado</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Infelizmente o código PIX expirou. Entre em contato pelo WhatsApp para reagendar o pagamento.
                  </p>
                  {whatsappNumber && (
                    <Button variant="outline" size="sm" className="mt-3 gap-2" asChild>
                      <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-3 w-3" />
                        Falar no WhatsApp
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Payment confirmed message for PIX */}
          {paymentMethod === 'pix' && orderStatus !== 'pending' && orderStatus !== 'cancelled' && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 text-sm">
              <p className="text-primary font-medium">✓ Pagamento PIX confirmado!</p>
              <p className="text-muted-foreground mt-1">Seu pedido está sendo preparado.</p>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Enviamos os detalhes do pedido e informações de pagamento para o seu email.
          </p>

          <div className="flex flex-col gap-3 pt-2">
            <Button asChild size="lg" id="btn-order-continue-shopping">
              <Link to="/">
                Continuar Comprando
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" id="btn-order-track">
              <Link to="/rastreio">Rastrear Pedido</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
