import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BookOpen, BarChart3, Target, Zap, Tag } from 'lucide-react';

export default function ConversionManual() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manual de Conversões</h1>
        <p className="text-muted-foreground">Guia completo para configurar rastreamento via Google Tag Manager</p>
      </div>

      <Alert>
        <BookOpen className="h-4 w-4" />
        <AlertDescription>
          Todos os botões possuem IDs únicos e eventos são disparados via <code>dataLayer.push()</code>. 
          Configure tudo pelo <strong>Google Tag Manager</strong> sem alterar código.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="gtm" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="gtm">GTM Setup</TabsTrigger>
          <TabsTrigger value="ga4">GA4 via GTM</TabsTrigger>
          <TabsTrigger value="facebook">Pixel via GTM</TabsTrigger>
          <TabsTrigger value="google-ads">Google Ads via GTM</TabsTrigger>
          <TabsTrigger value="events">Eventos & IDs</TabsTrigger>
        </TabsList>

        {/* GTM SETUP */}
        <TabsContent value="gtm" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" />1. Instalar o Google Tag Manager</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none space-y-4">
              <p>O GTM é o hub central. Todos os pixels (GA4, Facebook, Google Ads) serão configurados dentro dele.</p>
              
              <h3>Passo 1: Criar conta no GTM</h3>
              <ol>
                <li>Acesse <a href="https://tagmanager.google.com" target="_blank" rel="noopener">tagmanager.google.com</a></li>
                <li>Clique em <strong>"Criar conta"</strong></li>
                <li>Nome da conta: <code>Vanessa Lima Shoes</code></li>
                <li>País: <code>Brasil</code></li>
                <li>Nome do contêiner: <code>vanessalima.lovable.app</code></li>
                <li>Plataforma: <strong>Web</strong></li>
                <li>Aceite os termos e clique em <strong>"Sim"</strong></li>
              </ol>

              <h3>Passo 2: Instalar o código no site</h3>
              <p>Após criar, o GTM mostrará dois trechos de código:</p>
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-medium text-sm mb-2">Código do &lt;head&gt;:</p>
                <pre className="text-xs overflow-x-auto bg-background p-3 rounded border"><code>{`<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>
<!-- End Google Tag Manager -->`}</code></pre>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-medium text-sm mb-2">Código do &lt;body&gt;:</p>
                <pre className="text-xs overflow-x-auto bg-background p-3 rounded border"><code>{`<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`}</code></pre>
              </div>

              <h3>Passo 3: Colar no Admin</h3>
              <ol>
                <li>Vá em <strong>Configurações → Código Externo</strong></li>
                <li>Cole o primeiro código no campo <strong>"Código do Head"</strong></li>
                <li>Cole o segundo código no campo <strong>"Código do Body"</strong></li>
                <li>Salve</li>
              </ol>

              <h3>Passo 4: Criar variável do Data Layer</h3>
              <p>No GTM, crie variáveis para capturar dados dos eventos:</p>
              <ol>
                <li>Vá em <strong>Variáveis → Variáveis definidas pelo usuário → Nova</strong></li>
                <li>Tipo: <strong>Variável da camada de dados</strong></li>
                <li>Crie uma variável para cada campo:</li>
              </ol>
              <table>
                <thead><tr><th>Nome da Variável</th><th>Nome na Camada de Dados</th></tr></thead>
                <tbody>
                  <tr><td><code>DLV - ecommerce.value</code></td><td><code>ecommerce.value</code></td></tr>
                  <tr><td><code>DLV - ecommerce.currency</code></td><td><code>ecommerce.currency</code></td></tr>
                  <tr><td><code>DLV - ecommerce.transaction_id</code></td><td><code>ecommerce.transaction_id</code></td></tr>
                  <tr><td><code>DLV - ecommerce.items</code></td><td><code>ecommerce.items</code></td></tr>
                  <tr><td><code>DLV - ecommerce.payment_type</code></td><td><code>ecommerce.payment_type</code></td></tr>
                  <tr><td><code>DLV - ecommerce.item_name</code></td><td><code>ecommerce.items.0.item_name</code></td></tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GA4 VIA GTM */}
        <TabsContent value="ga4" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />GA4 pelo Google Tag Manager</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none space-y-4">
              <h3>Passo 1: Criar Tag de Configuração GA4</h3>
              <ol>
                <li>No GTM vá em <strong>Tags → Nova</strong></li>
                <li>Nome: <code>GA4 - Configuração</code></li>
                <li>Tipo de tag: <strong>Google Analytics: Configuração do GA4</strong></li>
                <li>ID de medição: <code>G-XXXXXXXXXX</code> (copie do GA4 → Admin → Streams de dados)</li>
                <li>Acionador: <strong>All Pages</strong></li>
                <li>Salve</li>
              </ol>

              <h3>Passo 2: Tag de Evento — purchase (Compra)</h3>
              <ol>
                <li><strong>Tags → Nova</strong></li>
                <li>Nome: <code>GA4 - Event - purchase</code></li>
                <li>Tipo: <strong>Google Analytics: evento do GA4</strong></li>
                <li>Tag de configuração: selecione <code>GA4 - Configuração</code></li>
                <li>Nome do evento: <code>purchase</code></li>
                <li>Parâmetros do evento:</li>
              </ol>
              <table>
                <thead><tr><th>Nome do Parâmetro</th><th>Valor</th></tr></thead>
                <tbody>
                  <tr><td><code>transaction_id</code></td><td>{`{{DLV - ecommerce.transaction_id}}`}</td></tr>
                  <tr><td><code>value</code></td><td>{`{{DLV - ecommerce.value}}`}</td></tr>
                  <tr><td><code>currency</code></td><td>{`{{DLV - ecommerce.currency}}`}</td></tr>
                  <tr><td><code>payment_type</code></td><td>{`{{DLV - ecommerce.payment_type}}`}</td></tr>
                  <tr><td><code>items</code></td><td>{`{{DLV - ecommerce.items}}`}</td></tr>
                </tbody>
              </table>
              <p>Acionador: crie um <strong>Acionador de Evento personalizado</strong>:</p>
              <ul>
                <li>Tipo: <strong>Evento personalizado</strong></li>
                <li>Nome do evento: <code>purchase</code></li>
              </ul>

              <h3>Passo 3: Tag de Evento — add_to_cart</h3>
              <ol>
                <li>Nome: <code>GA4 - Event - add_to_cart</code></li>
                <li>Tipo: <strong>Google Analytics: evento do GA4</strong></li>
                <li>Nome do evento: <code>add_to_cart</code></li>
                <li>Parâmetros: <code>value</code>, <code>currency</code>, <code>items</code></li>
                <li>Acionador: Evento personalizado <code>add_to_cart</code></li>
              </ol>

              <h3>Passo 4: Tag de Evento — begin_checkout</h3>
              <ol>
                <li>Nome: <code>GA4 - Event - begin_checkout</code></li>
                <li>Nome do evento: <code>begin_checkout</code></li>
                <li>Parâmetros: <code>value</code>, <code>currency</code>, <code>items</code></li>
                <li>Acionador: Evento personalizado <code>begin_checkout</code></li>
              </ol>

              <h3>Passo 5: Tag de Evento — view_item</h3>
              <ol>
                <li>Nome: <code>GA4 - Event - view_item</code></li>
                <li>Nome do evento: <code>view_item</code></li>
                <li>Parâmetros: <code>value</code>, <code>currency</code>, <code>items</code></li>
                <li>Acionador: Evento personalizado <code>view_item</code></li>
              </ol>

              <h3>Passo 6: Marcar como conversão no GA4</h3>
              <ol>
                <li>Vá ao <strong>Google Analytics → Admin → Eventos</strong></li>
                <li>Quando os eventos aparecerem, clique no toggle <strong>"Marcar como conversão"</strong> para: <code>purchase</code>, <code>begin_checkout</code>, <code>add_to_cart</code></li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FACEBOOK PIXEL VIA GTM */}
        <TabsContent value="facebook" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />Meta Pixel (Facebook/Instagram) via GTM</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none space-y-4">
              <h3>Passo 1: Criar Tag — Facebook Pixel Base</h3>
              <ol>
                <li>No GTM: <strong>Tags → Nova</strong></li>
                <li>Nome: <code>FB Pixel - Base</code></li>
                <li>Tipo de tag: <strong>HTML Personalizado</strong></li>
                <li>Cole o código abaixo (substitua o ID):</li>
              </ol>
              <pre className="text-xs overflow-x-auto bg-background p-3 rounded border"><code>{`<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'SEU_PIXEL_ID_AQUI');
fbq('track', 'PageView');
</script>`}</code></pre>
              <ul>
                <li>Acionador: <strong>All Pages</strong></li>
                <li>Configurações avançadas → Opções de disparo: <strong>Uma vez por página</strong></li>
              </ul>

              <h3>Passo 2: Tag — Purchase (Compra)</h3>
              <ol>
                <li>Nome: <code>FB Pixel - Purchase</code></li>
                <li>Tipo: <strong>HTML Personalizado</strong></li>
                <li>Código:</li>
              </ol>
              <pre className="text-xs overflow-x-auto bg-background p-3 rounded border"><code>{`<script>
fbq('track', 'Purchase', {
  value: {{DLV - ecommerce.value}},
  currency: 'BRL',
  content_type: 'product',
  contents: {{DLV - ecommerce.items}}
});
</script>`}</code></pre>
              <ul>
                <li>Acionador: Evento personalizado <code>purchase</code></li>
              </ul>

              <h3>Passo 3: Tag — AddToCart</h3>
              <pre className="text-xs overflow-x-auto bg-background p-3 rounded border"><code>{`<script>
fbq('track', 'AddToCart', {
  value: {{DLV - ecommerce.value}},
  currency: 'BRL',
  content_type: 'product',
  contents: {{DLV - ecommerce.items}}
});
</script>`}</code></pre>
              <ul><li>Acionador: Evento personalizado <code>add_to_cart</code></li></ul>

              <h3>Passo 4: Tag — InitiateCheckout</h3>
              <pre className="text-xs overflow-x-auto bg-background p-3 rounded border"><code>{`<script>
fbq('track', 'InitiateCheckout', {
  value: {{DLV - ecommerce.value}},
  currency: 'BRL'
});
</script>`}</code></pre>
              <ul><li>Acionador: Evento personalizado <code>begin_checkout</code></li></ul>

              <h3>Passo 5: Tag — ViewContent</h3>
              <pre className="text-xs overflow-x-auto bg-background p-3 rounded border"><code>{`<script>
fbq('track', 'ViewContent', {
  value: {{DLV - ecommerce.value}},
  currency: 'BRL',
  content_name: {{DLV - ecommerce.item_name}},
  content_type: 'product'
});
</script>`}</code></pre>
              <ul><li>Acionador: Evento personalizado <code>view_item</code></li></ul>

              <h3>Passo 6: Conversões Personalizadas por Pagamento</h3>
              <p>No <strong>Gerenciador de Eventos do Meta</strong>:</p>
              <ol>
                <li>Vá em <strong>Conversões personalizadas → Criar</strong></li>
                <li>Evento: <code>Purchase</code></li>
                <li>Regra: parâmetro <code>payment_type</code> contém <code>pix</code></li>
                <li>Nome: <code>Compra PIX</code></li>
                <li>Repita para <code>card</code> e <code>boleto</code></li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GOOGLE ADS VIA GTM */}
        <TabsContent value="google-ads" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" />Google Ads via GTM</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none space-y-4">
              <h3>Passo 1: Obter IDs do Google Ads</h3>
              <ol>
                <li>Acesse <strong>Google Ads → Ferramentas → Conversões</strong></li>
                <li>Clique em <strong>"+ Nova ação de conversão"</strong></li>
                <li>Selecione <strong>"Site"</strong></li>
                <li>Escolha <strong>"Adicionar manualmente uma ação de conversão"</strong></li>
                <li>Configure:
                  <ul>
                    <li>Categoria: <strong>Compra/Venda</strong></li>
                    <li>Nome: <code>Compra no site</code></li>
                    <li>Valor: <strong>Usar valores diferentes para cada conversão</strong></li>
                    <li>Contagem: <strong>Cada conversão</strong></li>
                  </ul>
                </li>
                <li>Salve e copie o <strong>Conversion ID</strong> (formato: <code>AW-XXXXXXXXX</code>) e o <strong>Conversion Label</strong></li>
              </ol>

              <h3>Passo 2: Tag de Vinculação do Google Ads</h3>
              <ol>
                <li>No GTM: <strong>Tags → Nova</strong></li>
                <li>Nome: <code>Google Ads - Linker</code></li>
                <li>Tipo: <strong>Vinculação de conversões do Google Ads</strong></li>
                <li>Acionador: <strong>All Pages</strong></li>
              </ol>

              <h3>Passo 3: Tag de Remarketing</h3>
              <ol>
                <li>Nome: <code>Google Ads - Remarketing</code></li>
                <li>Tipo: <strong>Remarketing do Google Ads</strong></li>
                <li>Conversion ID: <code>AW-XXXXXXXXX</code></li>
                <li>Acionador: <strong>All Pages</strong></li>
              </ol>

              <h3>Passo 4: Tag de Conversão — Purchase</h3>
              <ol>
                <li>Nome: <code>Google Ads - Conversion - Purchase</code></li>
                <li>Tipo: <strong>Acompanhamento de conversões do Google Ads</strong></li>
                <li>Conversion ID: <code>AW-XXXXXXXXX</code></li>
                <li>Conversion Label: <code>(cole o label copiado)</code></li>
                <li>Valor de conversão: <code>{`{{DLV - ecommerce.value}}`}</code></li>
                <li>Código da moeda: <code>BRL</code></li>
                <li>Transaction ID: <code>{`{{DLV - ecommerce.transaction_id}}`}</code></li>
                <li>Acionador: Evento personalizado <code>purchase</code></li>
              </ol>

              <h3>Passo 5: Smart Bidding</h3>
              <p>Após 30+ conversões nos últimos 30 dias:</p>
              <ol>
                <li>Vá na campanha → <strong>Configurações → Lances</strong></li>
                <li>Mude para <strong>"Maximizar o valor da conversão"</strong></li>
                <li>Defina ROAS alvo (ex: 500% = R$5 de retorno por R$1 gasto)</li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EVENTS LIST */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>DataLayer Events & Button IDs</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none space-y-4">
              <h3>Eventos enviados ao dataLayer</h3>
              <p>O site dispara automaticamente os seguintes eventos via <code>window.dataLayer.push()</code>:</p>
              <table>
                <thead><tr><th>Evento</th><th>Quando dispara</th><th>Dados enviados</th></tr></thead>
                <tbody>
                  <tr><td><code>page_view</code></td><td>Toda navegação</td><td>page_path, page_title</td></tr>
                  <tr><td><code>view_item</code></td><td>Abrir página de produto</td><td>item_id, item_name, price, category, currency</td></tr>
                  <tr><td><code>add_to_cart</code></td><td>Adicionar ao carrinho</td><td>item_id, item_name, item_variant, price, quantity, value, currency</td></tr>
                  <tr><td><code>begin_checkout</code></td><td>Ir para checkout</td><td>items[], value, currency, coupon</td></tr>
                  <tr><td><code>add_shipping_info</code></td><td>Avançar p/ pagamento</td><td>items[], shipping_tier, value</td></tr>
                  <tr><td><code>add_payment_info</code></td><td>Selecionar pagamento</td><td>payment_type (pix/card/boleto)</td></tr>
                  <tr><td><code>purchase</code></td><td>Pedido finalizado</td><td>transaction_id, value, currency, payment_type, items[], shipping, tax</td></tr>
                </tbody>
              </table>

              <h3>Exemplo de dataLayer.push() — purchase</h3>
              <pre className="text-xs overflow-x-auto bg-background p-3 rounded border"><code>{`window.dataLayer.push({
  event: 'purchase',
  ecommerce: {
    transaction_id: 'VL202602091234',
    value: 299.90,
    currency: 'BRL',
    payment_type: 'pix',
    shipping: 15.00,
    items: [{
      item_id: 'abc-123',
      item_name: 'Sandália Rasteira',
      item_variant: '37 - Preto',
      price: 149.95,
      quantity: 2,
      item_category: 'Sandálias'
    }]
  }
});`}</code></pre>

              <h3>IDs de Botões para Acionadores de Clique</h3>
              <p>Caso queira criar acionadores de clique no GTM (tipo: <strong>Clique — Todos os elementos</strong>), use o filtro <strong>Click ID contém</strong>:</p>
              <table>
                <thead><tr><th>ID do Elemento</th><th>Localização</th><th>Ação</th></tr></thead>
                <tbody>
                  <tr><td><code>btn-buy-[slug]</code></td><td>Grid de produtos</td><td>Abre seletor de variante</td></tr>
                  <tr><td><code>btn-variant-add-to-cart</code></td><td>Modal de variante</td><td>Adiciona ao carrinho com variante</td></tr>
                  <tr><td><code>btn-checkout-to-shipping</code></td><td>Checkout — Etapa 1</td><td>Avança para dados de entrega</td></tr>
                  <tr><td><code>btn-checkout-to-payment</code></td><td>Checkout — Etapa 2</td><td>Avança para pagamento</td></tr>
                  <tr><td><code>btn-checkout-finalize</code></td><td>Checkout — Etapa 3</td><td>Finaliza o pedido</td></tr>
                  <tr><td><code>payment-pix</code></td><td>Checkout</td><td>Seleciona PIX</td></tr>
                  <tr><td><code>payment-card</code></td><td>Checkout</td><td>Seleciona Cartão</td></tr>
                  <tr><td><code>payment-boleto</code></td><td>Checkout</td><td>Seleciona Boleto</td></tr>
                  <tr><td><code>product-card-[slug]</code></td><td>Listagem</td><td>Card do produto</td></tr>
                </tbody>
              </table>

              <h3>Checklist de Verificação</h3>
              <ol>
                <li>Instale a extensão <strong>Tag Assistant</strong> do Chrome</li>
                <li>Ative o <strong>modo Preview</strong> no GTM</li>
                <li>Navegue pelo site e verifique se os eventos aparecem na aba <strong>"Data Layer"</strong></li>
                <li>Confirme que as tags estão disparando na aba <strong>"Tags Fired"</strong></li>
                <li>Quando tudo estiver correto, clique em <strong>"Publicar"</strong> no GTM</li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
