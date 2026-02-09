import { StoreLayout } from '@/components/store/StoreLayout';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const faqItems = [
  {
    question: 'Não fiquei satisfeito com minha compra. Desejo devolver o produto ou trocá-lo.',
    answer: 'Se você efetuou a compra através do site Vanessa Lima Shoes, recebeu o produto em perfeitas condições, e ainda assim não se sentiu feliz com a compra, você poderá solicitar através de nossa central de atendimento (42) 9-9112-0205 ou no menu FALE CONOSCO, a desistência da compra, tendo seu valor total restituído (exceto o frete), ou a troca por outro produto.'
  },
  {
    question: 'Tenho algum desconto se pagar à vista?',
    answer: 'Sim! Oferecemos 5% de desconto para pagamentos via PIX. O desconto é aplicado automaticamente ao selecionar esta forma de pagamento no checkout.'
  },
  {
    question: 'Quais são as formas de pagamento?',
    answer: 'Aceitamos cartões de crédito (Visa, Mastercard, Elo, American Express, Hipercard, Diners), PIX e boleto bancário. No cartão de crédito, você pode parcelar em até 6x sem juros.'
  },
  {
    question: 'Qual o prazo de entrega?',
    answer: 'O prazo de entrega varia de acordo com a sua região. Após a confirmação do pagamento, o pedido é preparado em até 2 dias úteis. O frete é calculado no carrinho pelo seu CEP. Enviamos para todo o Brasil.'
  },
  {
    question: 'Como rastrear meu pedido?',
    answer: 'Após o envio do seu pedido, você receberá um email com o código de rastreio. Você pode acompanhar o status do seu pedido na aba "Meus Pedidos" dentro da sua conta ou diretamente no site dos Correios/transportadora.'
  },
  {
    question: 'Os produtos são de couro legítimo?',
    answer: 'Sim! Trabalhamos com couro legítimo de alta qualidade em grande parte dos nossos calçados. Na descrição de cada produto você encontra o material detalhado.'
  },
  {
    question: 'Como escolher o tamanho correto?',
    answer: 'Recomendamos que você meça o comprimento do seu pé e compare com a nossa tabela de medidas. Em caso de dúvida, entre em contato conosco pelo WhatsApp (42) 9-9112-0205 que ajudaremos você a escolher o tamanho ideal.'
  },
  {
    question: 'Posso trocar o produto se o tamanho não servir?',
    answer: 'Sim! Oferecemos a primeira troca gratuita em até 7 dias após o recebimento do produto. Basta entrar em contato com nosso atendimento para solicitar a troca.'
  },
  {
    question: 'Vocês possuem loja física?',
    answer: 'Atualmente atendemos exclusivamente pela loja virtual e WhatsApp. Nosso escritório fica em Guarapuava - PR.'
  },
  {
    question: 'Qual a política de garantia?',
    answer: 'Todos os nossos produtos possuem garantia de 30 dias contra defeitos de fabricação. Caso identifique algum problema, entre em contato conosco para análise e resolução.'
  },
  {
    question: 'É seguro comprar no site?',
    answer: 'Sim! Nosso site utiliza certificado SSL para criptografia de dados, e todos os pagamentos são processados por gateways seguros e homologados. Seus dados estão 100% protegidos.'
  },
  {
    question: 'Frete grátis, como funciona?',
    answer: 'Oferecemos frete grátis para compras acima de R$ 399,00. O benefício é aplicado automaticamente no carrinho quando o valor mínimo é atingido.'
  },
];

export default function FAQPage() {
  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Perguntas Frequentes</h1>
          <p className="text-muted-foreground mb-8">Tire suas dúvidas sobre compras, entregas, trocas e mais.</p>

          <Accordion type="single" collapsible className="space-y-3">
            {faqItems.map((item, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg px-4">
                <AccordionTrigger className="text-left font-medium hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </StoreLayout>
  );
}
