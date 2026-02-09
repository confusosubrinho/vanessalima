import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BookOpen, BarChart3, Target, Zap } from 'lucide-react';

export default function ConversionManual() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manual de Conversões</h1>
        <p className="text-muted-foreground">Guia completo para configurar rastreamento de conversões</p>
      </div>

      <Alert>
        <BookOpen className="h-4 w-4" />
        <AlertDescription>
          Todos os botões do site possuem IDs únicos para facilitar o rastreamento de eventos. 
          Os eventos são disparados automaticamente quando configurados corretamente.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="ga" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="ga">Google Analytics</TabsTrigger>
          <TabsTrigger value="facebook">Facebook Pixel</TabsTrigger>
          <TabsTrigger value="google-ads">Google Ads</TabsTrigger>
          <TabsTrigger value="events">Lista de Eventos</TabsTrigger>
        </TabsList>

        <TabsContent value="ga" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Configuração Google Analytics 4</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <h3>1. Obtenha o ID de medição</h3>
              <p>Acesse <strong>Google Analytics → Administrador → Propriedade → Streams de dados</strong>. Copie o ID (formato <code>G-XXXXXXXXXX</code>).</p>
              <p>Cole em <strong>Configurações → Código Externo → Pixels & Analytics → Google Analytics ID</strong>.</p>

              <h3>2. Conversões de compra</h3>
              <p>Em <strong>Google Analytics → Administrador → Eventos</strong>, marque como conversão:</p>
              <ul>
                <li><code>purchase</code> — Compra finalizada (todos métodos)</li>
                <li><code>begin_checkout</code> — Início do checkout</li>
                <li><code>add_to_cart</code> — Adição ao carrinho</li>
              </ul>

              <h3>3. Separando conversões por pagamento</h3>
              <p>Crie segmentos personalizados para filtrar:</p>
              <ul>
                <li><strong>PIX:</strong> evento <code>purchase</code> com parâmetro <code>payment_type = pix</code></li>
                <li><strong>Cartão:</strong> evento <code>purchase</code> com parâmetro <code>payment_type = card</code></li>
                <li><strong>Boleto:</strong> evento <code>purchase</code> com parâmetro <code>payment_type = boleto</code></li>
              </ul>

              <h3>4. Compras pagas vs não pagas</h3>
              <ul>
                <li><code>payment_confirmed</code> — Pagamento confirmado (status: processing/shipped/delivered)</li>
                <li><code>payment_pending</code> — Aguardando pagamento (status: pending)</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="facebook" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />Configuração Meta Pixel (Facebook/Instagram)</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <h3>1. Instale o Pixel</h3>
              <p>Acesse <strong>Meta Business Suite → Gerenciador de Eventos → Fontes de dados</strong>. Copie o Pixel ID.</p>
              <p>Cole em <strong>Configurações → Código Externo → Facebook Pixel ID</strong>.</p>

              <h3>2. Configure eventos padrão</h3>
              <p>Os seguintes eventos são enviados automaticamente:</p>
              <table>
                <thead><tr><th>Evento</th><th>Quando dispara</th></tr></thead>
                <tbody>
                  <tr><td><code>PageView</code></td><td>Toda página carregada</td></tr>
                  <tr><td><code>ViewContent</code></td><td>Página de produto</td></tr>
                  <tr><td><code>AddToCart</code></td><td>Clique em adicionar ao carrinho</td></tr>
                  <tr><td><code>InitiateCheckout</code></td><td>Início do checkout</td></tr>
                  <tr><td><code>Purchase</code></td><td>Pedido finalizado</td></tr>
                </tbody>
              </table>

              <h3>3. Conversões por pagamento</h3>
              <p>No Gerenciador de Eventos, crie <strong>Conversões Personalizadas</strong>:</p>
              <ul>
                <li><strong>Compra PIX:</strong> Evento Purchase + parâmetro <code>payment_method = pix</code></li>
                <li><strong>Compra Cartão:</strong> Evento Purchase + parâmetro <code>payment_method = card</code></li>
                <li><strong>Compra Boleto:</strong> Evento Purchase + parâmetro <code>payment_method = boleto</code></li>
              </ul>

              <h3>4. Audiências</h3>
              <p>Crie audiências personalizadas baseadas em:</p>
              <ul>
                <li>Quem visualizou produtos (ViewContent) mas não comprou</li>
                <li>Quem adicionou ao carrinho mas não finalizou</li>
                <li>Compradores dos últimos 30 dias (para lookalike)</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="google-ads" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" />Configuração Google Ads</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <h3>1. Vincule GA4 ao Google Ads</h3>
              <p>Em <strong>Google Analytics → Administrador → Links de produto → Google Ads</strong>, vincule sua conta.</p>

              <h3>2. Importe conversões do GA4</h3>
              <p>Em <strong>Google Ads → Ferramentas → Conversões → Nova ação</strong>:</p>
              <ol>
                <li>Selecione "Importar do Google Analytics"</li>
                <li>Marque o evento <code>purchase</code></li>
                <li>Configure o valor como "Usar valores específicos do evento"</li>
              </ol>

              <h3>3. Valores e atribuição</h3>
              <p>O sistema envia automaticamente os seguintes dados com cada conversão:</p>
              <ul>
                <li><code>value</code> — Valor total do pedido</li>
                <li><code>currency</code> — BRL</li>
                <li><code>transaction_id</code> — Número do pedido</li>
                <li><code>items</code> — Lista de produtos com nome, preço e quantidade</li>
              </ul>

              <h3>4. Smart Bidding</h3>
              <p>Use as conversões importadas para otimizar lances automaticamente. Recomenda-se ROAS alvo após 30+ conversões.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>IDs de Botões e Eventos do Site</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <h3>Botões com IDs únicos</h3>
              <table>
                <thead><tr><th>ID</th><th>Localização</th><th>Ação</th></tr></thead>
                <tbody>
                  <tr><td><code>btn-buy-[slug]</code></td><td>Grid de produtos</td><td>Abre seletor de variante</td></tr>
                  <tr><td><code>btn-variant-add-to-cart</code></td><td>Modal de variante</td><td>Adiciona ao carrinho</td></tr>
                  <tr><td><code>btn-checkout-to-shipping</code></td><td>Checkout Etapa 1</td><td>Avança para entrega</td></tr>
                  <tr><td><code>btn-checkout-to-payment</code></td><td>Checkout Etapa 2</td><td>Avança para pagamento</td></tr>
                  <tr><td><code>btn-checkout-finalize</code></td><td>Checkout Etapa 3</td><td>Finaliza pedido</td></tr>
                  <tr><td><code>btn-order-continue-shopping</code></td><td>Confirmação</td><td>Volta à loja</td></tr>
                  <tr><td><code>product-card-[slug]</code></td><td>Grid de produtos</td><td>Card do produto</td></tr>
                  <tr><td><code>btn-checkout-qty-plus/minus-[id]</code></td><td>Checkout resumo</td><td>Altera quantidade</td></tr>
                  <tr><td><code>payment-pix / payment-card / payment-boleto</code></td><td>Checkout</td><td>Seleção de pagamento</td></tr>
                </tbody>
              </table>

              <h3>Eventos disparados automaticamente</h3>
              <table>
                <thead><tr><th>Evento</th><th>Dados enviados</th></tr></thead>
                <tbody>
                  <tr><td><code>page_view</code></td><td>URL, título da página</td></tr>
                  <tr><td><code>view_item</code></td><td>Produto: nome, preço, categoria, ID</td></tr>
                  <tr><td><code>add_to_cart</code></td><td>Produto, variante, quantidade, valor</td></tr>
                  <tr><td><code>begin_checkout</code></td><td>Itens, valor total</td></tr>
                  <tr><td><code>purchase</code></td><td>Nº pedido, valor, itens, método pagamento</td></tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
