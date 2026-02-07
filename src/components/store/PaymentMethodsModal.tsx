import { CreditCard, QrCode, Banknote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PaymentMethodsModalProps {
  basePrice: number;
  maxInstallments?: number;
}

export function PaymentMethodsModal({ basePrice, maxInstallments = 6 }: PaymentMethodsModalProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(price);
  };

  // Calculate installments with interest
  const getInstallments = () => {
    const installments = [];
    
    for (let i = 1; i <= 12; i++) {
      const isWithoutInterest = i <= maxInstallments;
      // Simulated interest rate of 1.99% per month after free installments
      const rate = isWithoutInterest ? 0 : 0.0199;
      const total = isWithoutInterest ? basePrice : basePrice * Math.pow(1 + rate, i);
      const installmentValue = total / i;
      
      installments.push({
        quantity: i,
        value: installmentValue,
        total: total,
        withoutInterest: isWithoutInterest,
      });
    }
    
    return installments;
  };

  const installments = getInstallments();
  const pixDiscount = basePrice * 0.1; // 10% discount
  const pixPrice = basePrice - pixDiscount;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="text-sm p-0 h-auto text-primary underline">
          Ver formas de pagamento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Formas de Pagamento</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="pix" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pix" className="flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              PIX
            </TabsTrigger>
            <TabsTrigger value="card" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Cartão
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="pix" className="space-y-4 mt-4">
            <div className="text-center p-6 bg-muted/50 rounded-lg">
              <QrCode className="h-12 w-12 mx-auto text-primary mb-4" />
              <p className="text-2xl font-bold text-primary">{formatPrice(pixPrice)}</p>
              <p className="text-sm text-muted-foreground mt-1">
                10% de desconto no PIX
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                (Economia de {formatPrice(pixDiscount)})
              </p>
            </div>
            
            <div className="space-y-2 text-sm">
              <h4 className="font-medium">Como funciona:</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary">1.</span>
                  Finalize seu pedido e escolha PIX como forma de pagamento
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">2.</span>
                  Escaneie o QR Code ou copie o código PIX
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">3.</span>
                  Pagamento confirmado em segundos!
                </li>
              </ul>
            </div>
          </TabsContent>
          
          <TabsContent value="card" className="mt-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-4">
                Parcelamento no cartão de crédito:
              </p>
              
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {installments.map((item) => (
                  <div
                    key={item.quantity}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      item.withoutInterest ? 'bg-primary/5' : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {item.quantity}x
                      </span>
                      <span className={item.withoutInterest ? 'text-primary font-medium' : ''}>
                        {formatPrice(item.value)}
                      </span>
                    </div>
                    <div className="text-right">
                      {item.withoutInterest ? (
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                          Sem juros
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Total: {formatPrice(item.total)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Aceitamos: Visa, Mastercard, Elo, American Express e Hipercard
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
