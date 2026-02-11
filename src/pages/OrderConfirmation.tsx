import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle, Package, ArrowRight, Copy, Clock, Loader2 } from 'lucide-react';
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

export default function OrderConfirmation() {
  const location = useLocation();
  const { toast } = useToast();
  const orderNumber = location.state?.orderNumber || 'N/A';
  const orderId = location.state?.orderId;
  const paymentMethod = location.state?.paymentMethod || 'pix';
  const pixQrcode = location.state?.pixQrcode;
  const pixEmv = location.state?.pixEmv;

  const [orderStatus, setOrderStatus] = useState('pending');

  // Subscribe to Realtime order status updates
  useEffect(() => {
    if (!orderId) return;

    // Fetch initial status
    supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single()
      .then(({ data }) => {
        if (data?.status) setOrderStatus(data.status);
      });

    // Listen for real-time changes
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const newStatus = payload.new?.status;
          if (newStatus && newStatus !== orderStatus) {
            setOrderStatus(newStatus);
            const info = statusLabels[newStatus];
            if (info) {
              toast({ title: info.label, description: info.description });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

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
  const currentStatusInfo = statusLabels[orderStatus] || statusLabels.pending;

  const copyPixCode = () => {
    if (pixEmv) {
      navigator.clipboard.writeText(pixEmv);
      toast({ title: 'Código PIX copiado!' });
    }
  };

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

          {/* PIX QR Code */}
          {paymentMethod === 'pix' && pixQrcode && orderStatus === 'pending' && (
            <div className="space-y-3">
              <img src={pixQrcode} alt="QR Code PIX" className="mx-auto w-48 h-48" />
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
