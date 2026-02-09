import { Link, useLocation } from 'react-router-dom';
import { CheckCircle, Package, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';

export default function OrderConfirmation() {
  const location = useLocation();
  const orderNumber = location.state?.orderNumber || 'N/A';
  const paymentMethod = location.state?.paymentMethod || 'pix';

  const paymentInfo: Record<string, { title: string; description: string }> = {
    pix: {
      title: 'PIX',
      description: 'Realize o pagamento via PIX para confirmar seu pedido. O QR Code ou chave será enviado por email.',
    },
    card: {
      title: 'Cartão de Crédito',
      description: 'Seu pagamento foi processado com sucesso. O pedido será preparado em breve.',
    },
    boleto: {
      title: 'Boleto Bancário',
      description: 'O boleto foi gerado e enviado para o seu email. O pedido será confirmado após a compensação (até 3 dias úteis).',
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
            <CheckCircle className="h-16 w-16 text-primary" />
          </div>

          <div>
            <h1 className="text-2xl font-bold mb-2">Pedido Realizado!</h1>
            <p className="text-muted-foreground">
              Seu pedido <strong className="text-foreground">{orderNumber}</strong> foi registrado com sucesso.
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-left space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <Package className="h-4 w-4" />
              Pagamento via {info.title}
            </div>
            <p className="text-sm text-muted-foreground">{info.description}</p>
          </div>

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
