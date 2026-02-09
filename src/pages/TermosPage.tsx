import { StoreLayout } from '@/components/store/StoreLayout';

export default function TermosPage() {
  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="max-w-3xl mx-auto prose prose-sm max-w-none">
          <h1 className="text-3xl font-bold mb-6">Termos de Uso</h1>

          <p className="text-muted-foreground mb-4">Última atualização: Fevereiro de 2026</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">1. Aceitação dos Termos</h2>
          <p className="text-muted-foreground mb-4">Ao acessar e utilizar o site Vanessa Lima Shoes, você concorda com estes termos de uso. Caso não concorde com algum dos termos, recomendamos que não utilize nosso site.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">2. Produtos e Preços</h2>
          <p className="text-muted-foreground mb-4">Os preços dos produtos podem ser alterados sem aviso prévio. As imagens dos produtos são meramente ilustrativas e podem apresentar pequenas variações de cor devido à configuração do monitor. Nos reservamos o direito de limitar quantidades de produtos por pedido.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">3. Processo de Compra</h2>
          <p className="text-muted-foreground mb-4">Para realizar uma compra, é necessário criar uma conta com informações verdadeiras e atualizadas. O pedido será confirmado após a aprovação do pagamento pela operadora.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">4. Pagamento</h2>
          <p className="text-muted-foreground mb-4">Aceitamos cartões de crédito, PIX e boleto bancário. Parcelamento em até 6x sem juros no cartão de crédito. O processamento do pagamento é feito por meio de gateways seguros e homologados.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">5. Entrega</h2>
          <p className="text-muted-foreground mb-4">Os prazos de entrega informados são estimativas e podem variar conforme a região. A Vanessa Lima Shoes não se responsabiliza por atrasos causados por fatores externos como greves, desastres naturais ou problemas da transportadora.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">6. Propriedade Intelectual</h2>
          <p className="text-muted-foreground mb-4">Todo o conteúdo do site, incluindo textos, imagens, logotipos e design, é de propriedade da Vanessa Lima Shoes e está protegido por leis de direitos autorais.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">7. Contato</h2>
          <p className="text-muted-foreground mb-4">Em caso de dúvidas sobre estes termos, entre em contato: contato@vanessalimashoes.com.br ou (42) 99112-0205.</p>
        </div>
      </div>
    </StoreLayout>
  );
}
