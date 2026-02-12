import { StoreLayout } from '@/components/store/StoreLayout';
import { Search, ShoppingBag, CreditCard, Truck } from 'lucide-react';
import { useStoreContact, formatPhone, getWhatsAppNumber } from '@/hooks/useStoreContact';

export default function ComoComprarPage() {
  const { data: contact } = useStoreContact();
  const whatsappNum = getWhatsAppNumber(contact?.contact_whatsapp);
  const phoneDisplay = formatPhone(contact?.contact_phone || contact?.contact_whatsapp);

  const steps = [
    { icon: Search, title: '1. Escolha o produto', desc: 'Navegue pelas categorias ou utilize a busca para encontrar o calçado perfeito. Confira as fotos, descrição, tamanhos disponíveis e avaliações.' },
    { icon: ShoppingBag, title: '2. Adicione ao carrinho', desc: 'Selecione o tamanho desejado e clique em "Adicionar ao Carrinho". Você pode continuar comprando e adicionar mais itens.' },
    { icon: CreditCard, title: '3. Finalize o pagamento', desc: 'No carrinho, confira seus itens, calcule o frete pelo CEP e escolha a forma de pagamento: PIX com desconto, cartão de crédito parcelado ou boleto bancário.' },
    { icon: Truck, title: '4. Receba em casa', desc: 'Após a confirmação do pagamento, seu pedido será preparado e enviado. Você receberá o código de rastreio por email para acompanhar a entrega.' },
  ];

  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Como Comprar</h1>
          <p className="text-muted-foreground mb-10">Comprar na {contact?.store_name || 'nossa loja'} é fácil, rápido e seguro!</p>

          <div className="space-y-8">
            {steps.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-5">
                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Icon className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">{title}</h3>
                  <p className="text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 p-6 bg-primary/5 rounded-lg border border-primary/20">
            <h3 className="font-semibold mb-2">Precisa de ajuda?</h3>
            <p className="text-muted-foreground text-sm">
              {whatsappNum && (
                <>Entre em contato pelo WhatsApp <a href={`https://wa.me/${whatsappNum}`} className="text-primary font-medium">{phoneDisplay}</a></>
              )}
              {whatsappNum && contact?.contact_email && ' ou '}
              {contact?.contact_email && (
                <>email <a href={`mailto:${contact.contact_email}`} className="text-primary font-medium">{contact.contact_email}</a></>
              )}
            </p>
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
