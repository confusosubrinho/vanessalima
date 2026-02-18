import { StoreLayout } from '@/components/store/StoreLayout';
import { CreditCard, QrCode, FileText } from 'lucide-react';
import { usePricingConfig } from '@/hooks/usePricingConfig';

export default function FormasPagamentoPage() {
  const { data: pricingConfig } = usePricingConfig();
  const pixDiscount = pricingConfig?.pix_discount ?? 5;
  const interestFreeInstallments = pricingConfig?.interest_free_installments ?? 3;
  const maxInstallments = pricingConfig?.max_installments ?? 6;

  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Formas de Pagamento</h1>
          <p className="text-muted-foreground mb-10">Oferecemos diversas opções para sua conveniência.</p>

          <div className="space-y-8">
            <div className="p-6 border rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <QrCode className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">PIX</h3>
                  <p className="text-primary font-medium">{pixDiscount}% de desconto</p>
                </div>
              </div>
              <p className="text-muted-foreground">Pagamento instantâneo com {pixDiscount}% de desconto. O QR Code é gerado automaticamente no checkout. Confirmação imediata!</p>
            </div>

            <div className="p-6 border rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Cartão de Crédito</h3>
                  <p className="text-primary font-medium">Até {interestFreeInstallments}x sem juros</p>
                </div>
              </div>
              <p className="text-muted-foreground mb-3">
                Parcele suas compras em até {interestFreeInstallments}x sem juros
                {maxInstallments > interestFreeInstallments && ` ou até ${maxInstallments}x com juros`}. Aceitamos as principais bandeiras:
              </p>
              <div className="flex gap-3 flex-wrap">
                {['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard'].map(brand => (
                  <span key={brand} className="px-3 py-1 bg-muted rounded-full text-sm">{brand}</span>
                ))}
              </div>
            </div>

            <div className="p-6 border rounded-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Boleto Bancário</h3>
                  <p className="text-muted-foreground text-sm">Prazo de compensação: 1-3 dias úteis</p>
                </div>
              </div>
              <p className="text-muted-foreground">O boleto será gerado no checkout. Após o pagamento, a compensação ocorre em até 3 dias úteis.</p>
            </div>
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
