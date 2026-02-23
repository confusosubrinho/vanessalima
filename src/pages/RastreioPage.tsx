import { useState } from 'react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Package, Search, ExternalLink, Mail, Hash, Loader2, CheckCircle, Clock, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const statusLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: 'Aguardando Pagamento', icon: <Clock className="h-4 w-4" />, color: 'text-yellow-600' },
  processing: { label: 'Pagamento Confirmado', icon: <CheckCircle className="h-4 w-4" />, color: 'text-primary' },
  shipped: { label: 'Enviado', icon: <Truck className="h-4 w-4" />, color: 'text-blue-600' },
  delivered: { label: 'Entregue', icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600' },
  cancelled: { label: 'Cancelado', icon: <Package className="h-4 w-4" />, color: 'text-destructive' },
};

export default function RastreioPage() {
  const { toast } = useToast();
  const [trackingCode, setTrackingCode] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // IMPROVEMENT #2: Guest order lookup
  const [guestEmail, setGuestEmail] = useState('');
  const [guestOrderNumber, setGuestOrderNumber] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestOrder, setGuestOrder] = useState<any>(null);
  const [guestItems, setGuestItems] = useState<any[]>([]);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingCode.trim()) {
      setSubmitted(true);
    }
  };

  const handleGuestLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestEmail.trim() || !guestOrderNumber.trim()) {
      toast({ title: 'Preencha email e número do pedido', variant: 'destructive' });
      return;
    }
    setGuestLoading(true);
    setGuestOrder(null);
    setGuestItems([]);

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, status, total_amount, created_at, shipping_name, tracking_code, payment_method')
        .eq('customer_email', guestEmail.toLowerCase().trim())
        .eq('order_number', guestOrderNumber.trim().toUpperCase())
        .maybeSingle();

      if (error || !data) {
        toast({ title: 'Pedido não encontrado', description: 'Verifique o email e número do pedido.', variant: 'destructive' });
        return;
      }

      setGuestOrder(data);

      // Fetch items
      const { data: items } = await supabase
        .from('order_items')
        .select('product_name, variant_info, quantity, unit_price, total_price')
        .eq('order_id', data.id);

      setGuestItems(items || []);
    } catch (err) {
      console.error('Guest lookup error:', err);
      toast({ title: 'Erro ao buscar pedido', variant: 'destructive' });
    } finally {
      setGuestLoading(false);
    }
  };

  const correiosUrl = `https://www.linkcorreios.com.br/?id=${trackingCode.trim()}`;

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Rastreie seu Pedido</h1>
          <p className="text-muted-foreground mb-8">
            Insira o código de rastreio ou busque pelo número do pedido e email.
          </p>

          {/* Tab-like sections */}
          <div className="space-y-8">
            {/* Section 1: Tracking Code */}
            <div className="bg-background rounded-xl p-6 shadow-sm text-left">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Rastrear por código de envio
              </h3>
              <form onSubmit={handleTrack} className="flex gap-3">
                <Input
                  value={trackingCode}
                  onChange={(e) => { setTrackingCode(e.target.value); setSubmitted(false); }}
                  placeholder="Ex: AA123456789BR"
                  className="text-center text-lg"
                  required
                />
                <Button type="submit" className="rounded-full px-6">
                  <Search className="h-4 w-4 mr-2" />
                  Rastrear
                </Button>
              </form>

              {submitted && trackingCode.trim() && (
                <div className="mt-4 bg-muted/50 rounded-lg p-6 space-y-3 animate-fade-in text-center">
                  <p className="text-muted-foreground">
                    Código: <strong className="text-foreground">{trackingCode.trim()}</strong>
                  </p>
                  <a
                    href={correiosUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-medium hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Rastrear nos Correios
                  </a>
                </div>
              )}
            </div>

            {/* Section 2: Guest Order Lookup */}
            <div className="bg-background rounded-xl p-6 shadow-sm text-left">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Buscar meu pedido (sem login)
              </h3>
              <form onSubmit={handleGuestLookup} className="space-y-3">
                <div>
                  <Label htmlFor="guest-email">Email usado na compra</Label>
                  <Input
                    id="guest-email"
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="guest-order">Número do pedido</Label>
                  <Input
                    id="guest-order"
                    value={guestOrderNumber}
                    onChange={(e) => setGuestOrderNumber(e.target.value)}
                    placeholder="Ex: VAN20260223001000"
                    required
                  />
                </div>
                <Button type="submit" disabled={guestLoading} className="w-full">
                  {guestLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Hash className="h-4 w-4 mr-2" />}
                  Buscar Pedido
                </Button>
              </form>

              {guestOrder && (
                <div className="mt-4 bg-muted/50 rounded-lg p-5 space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-lg">{guestOrder.order_number}</span>
                    <span className={`flex items-center gap-1 text-sm font-medium ${statusLabels[guestOrder.status]?.color || ''}`}>
                      {statusLabels[guestOrder.status]?.icon}
                      {statusLabels[guestOrder.status]?.label || guestOrder.status}
                    </span>
                  </div>

                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p>Data: {new Date(guestOrder.created_at).toLocaleDateString('pt-BR')}</p>
                    <p>Total: <strong className="text-foreground">{formatPrice(guestOrder.total_amount)}</strong></p>
                    {guestOrder.tracking_code && (
                      <p>Rastreio: <strong className="text-foreground">{guestOrder.tracking_code}</strong></p>
                    )}
                  </div>

                  {guestItems.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-sm font-medium">Itens:</p>
                      {guestItems.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span>{item.product_name} {item.variant_info && `(${item.variant_info})`} x{item.quantity}</span>
                          <span className="font-medium">{formatPrice(item.total_price)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {guestOrder.tracking_code && (
                    <a
                      href={`https://www.linkcorreios.com.br/?id=${guestOrder.tracking_code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-primary text-sm hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Rastrear nos Correios
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-12 bg-muted/30 rounded-xl p-6 text-left">
            <h3 className="font-semibold mb-3">Dúvidas sobre rastreamento?</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• O código de rastreio é enviado por e-mail após o despacho do pedido.</li>
              <li>• O rastreamento pode levar até 24h para ser atualizado após o envio.</li>
              <li>• Para mais informações, entre em contato pelo WhatsApp: (42) 99112-0205</li>
            </ul>
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
