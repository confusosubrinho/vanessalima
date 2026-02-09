import { StoreLayout } from '@/components/store/StoreLayout';

export default function PoliticaPrivacidadePage() {
  return (
    <StoreLayout>
      <div className="container-custom py-12">
        <div className="max-w-3xl mx-auto prose prose-sm max-w-none">
          <h1 className="text-3xl font-bold mb-6">Política de Privacidade</h1>
          
          <p className="text-muted-foreground mb-4">Última atualização: Fevereiro de 2026</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">1. Informações Coletadas</h2>
          <p className="text-muted-foreground mb-4">A Vanessa Lima Shoes coleta informações fornecidas voluntariamente por você ao realizar compras, criar conta ou entrar em contato conosco. Isso inclui: nome completo, email, telefone, CPF, endereço de entrega e dados de pagamento.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">2. Uso das Informações</h2>
          <p className="text-muted-foreground mb-4">Utilizamos suas informações para: processar pedidos e pagamentos, enviar atualizações sobre pedidos, oferecer suporte ao cliente, enviar comunicações de marketing (quando autorizado), melhorar nossos produtos e serviços.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">3. Compartilhamento de Dados</h2>
          <p className="text-muted-foreground mb-4">Seus dados pessoais podem ser compartilhados com: processadores de pagamento para concluir transações, transportadoras para entrega de produtos, e autoridades legais quando exigido por lei.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">4. Segurança</h2>
          <p className="text-muted-foreground mb-4">Adotamos medidas de segurança adequadas para proteger suas informações pessoais contra acesso não autorizado, alteração, divulgação ou destruição. Utilizamos certificado SSL e processamento seguro de pagamentos.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">5. Cookies</h2>
          <p className="text-muted-foreground mb-4">Nosso site utiliza cookies para melhorar a experiência do usuário, lembrar preferências e analisar o tráfego do site.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">6. Seus Direitos</h2>
          <p className="text-muted-foreground mb-4">De acordo com a LGPD, você tem direito a: acessar seus dados, corrigir informações, solicitar a exclusão de dados, revogar consentimento e solicitar portabilidade.</p>

          <h2 className="text-xl font-semibold mt-8 mb-3">7. Contato</h2>
          <p className="text-muted-foreground mb-4">Para questões sobre privacidade, entre em contato: contato@vanessalimashoes.com.br ou (42) 99112-0205.</p>
        </div>
      </div>
    </StoreLayout>
  );
}
