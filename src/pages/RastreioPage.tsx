import { useState } from 'react';
import { StoreLayout } from '@/components/store/StoreLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Search, ExternalLink } from 'lucide-react';

export default function RastreioPage() {
  const [trackingCode, setTrackingCode] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingCode.trim()) {
      setSubmitted(true);
    }
  };

  const correiosUrl = `https://www.linkcorreios.com.br/?id=${trackingCode.trim()}`;

  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Rastreie seu Pedido</h1>
          <p className="text-muted-foreground mb-8">
            Insira o código de rastreio que você recebeu por e-mail para acompanhar a entrega do seu pedido.
          </p>

          <form onSubmit={handleTrack} className="flex gap-3 max-w-md mx-auto mb-8">
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
            <div className="bg-muted/50 rounded-xl p-8 space-y-4 animate-fade-in">
              <p className="text-muted-foreground">
                Redirecionando para o rastreamento do código: <strong className="text-foreground">{trackingCode.trim()}</strong>
              </p>
              <div className="space-y-3">
                <a
                  href={correiosUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-medium hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Rastrear nos Correios
                </a>
                <p className="text-xs text-muted-foreground">
                  Você será redirecionado para o site dos Correios para acompanhar em tempo real.
                </p>
              </div>
            </div>
          )}

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
