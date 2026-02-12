import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Bell, Mail, MessageCircle } from 'lucide-react';

interface StockNotifyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  variantId?: string;
  variantInfo?: string;
  currentPrice?: number;
}

export function StockNotifyModal({
  open,
  onOpenChange,
  productId,
  productName,
  variantId,
  variantInfo,
  currentPrice,
}: StockNotifyModalProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [desiredPrice, setDesiredPrice] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot check
    if (honeypot) return;

    if (!email && !whatsapp) {
      toast({ title: 'Preencha pelo menos e-mail ou WhatsApp', variant: 'destructive' });
      return;
    }

    // Basic email validation
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: 'E-mail inválido', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('stock_notifications' as any).insert({
        product_id: productId,
        variant_id: variantId || null,
        variant_info: variantInfo || null,
        email: email || null,
        whatsapp: whatsapp || null,
        desired_price: desiredPrice ? parseFloat(desiredPrice) : null,
      } as any);

      if (error) {
        if (error.code === '23505') {
          toast({ title: 'Você já está cadastrado para este produto!', description: 'Avisaremos assim que estiver disponível.' });
        } else {
          throw error;
        }
      } else {
        toast({ title: '✅ Cadastro realizado!', description: 'Você será avisado assim que o produto voltar ao estoque.' });
      }

      onOpenChange(false);
      setEmail('');
      setWhatsapp('');
      setDesiredPrice('');
    } catch (err: any) {
      toast({ title: 'Erro ao cadastrar', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Avise-me quando voltar
          </DialogTitle>
          <DialogDescription>
            Cadastre-se para receber um aviso quando{' '}
            <strong>{productName}</strong>
            {variantInfo && <> ({variantInfo})</>} estiver disponível novamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Honeypot - hidden from humans */}
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="notify-email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> E-mail
            </Label>
            <Input
              id="notify-email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
          </div>

          <div>
            <Label htmlFor="notify-whatsapp" className="flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp (opcional)
            </Label>
            <Input
              id="notify-whatsapp"
              type="tel"
              placeholder="(00) 00000-0000"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              maxLength={20}
            />
          </div>

          {currentPrice && (
            <div>
              <Label htmlFor="notify-price" className="text-xs text-muted-foreground">
                Avise-me se o preço baixar para (opcional)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  id="notify-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={currentPrice.toFixed(2)}
                  value={desiredPrice}
                  onChange={(e) => setDesiredPrice(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Preço atual: {formatPrice(currentPrice)}
              </p>
            </div>
          )}

          {variantInfo && (
            <div className="px-3 py-2 bg-muted rounded-lg text-sm">
              <span className="text-muted-foreground">Variação selecionada:</span>{' '}
              <strong>{variantInfo}</strong>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Cadastrando...' : 'Quero ser avisado'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Seus dados são protegidos e não serão compartilhados.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
