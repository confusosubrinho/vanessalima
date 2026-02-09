import { StoreLayout } from '@/components/store/StoreLayout';
import { RefreshCw, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export default function TrocasPage() {
  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Trocas e Devoluções</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {[
              { icon: RefreshCw, title: 'Primeira troca grátis', desc: 'A primeira troca é por nossa conta!' },
              { icon: Clock, title: 'Prazo de 7 dias', desc: 'Após o recebimento do produto' },
              { icon: CheckCircle, title: 'Produto sem uso', desc: 'Com etiquetas e embalagem original' },
              { icon: AlertCircle, title: 'Defeito de fabricação', desc: 'Garantia de 30 dias' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="prose prose-sm max-w-none space-y-6">
            <h2 className="text-xl font-semibold">Como solicitar uma troca ou devolução?</h2>
            <ol className="text-muted-foreground space-y-3 list-decimal pl-5">
              <li>Entre em contato com nosso atendimento pelo WhatsApp (42) 9-9112-0205 ou pelo email contato@vanessalimashoes.com.br</li>
              <li>Informe o número do pedido, o produto e o motivo da troca/devolução</li>
              <li>Aguarde as instruções de envio. Na primeira troca, enviaremos um código de postagem gratuito</li>
              <li>Embale o produto na embalagem original, com etiquetas</li>
              <li>Envie o produto conforme as instruções recebidas</li>
              <li>Após recebermos e verificarmos o produto, processaremos a troca ou reembolso em até 5 dias úteis</li>
            </ol>

            <h2 className="text-xl font-semibold mt-8">Condições para troca/devolução</h2>
            <ul className="text-muted-foreground space-y-2 list-disc pl-5">
              <li>O produto deve estar sem uso, com todas as etiquetas e na embalagem original</li>
              <li>O prazo para solicitação é de até 7 dias corridos após o recebimento</li>
              <li>Produtos com defeito de fabricação podem ser trocados em até 30 dias</li>
              <li>Produtos de promoção/outlet seguem as mesmas regras</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8">Reembolso</h2>
            <p className="text-muted-foreground">O reembolso será feito na mesma forma de pagamento utilizada na compra. Para cartão de crédito, o estorno pode levar até 2 faturas para ser concluído pela operadora. Para PIX e boleto, o reembolso é feito via transferência bancária em até 5 dias úteis.</p>
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
