
-- Create help_articles table
CREATE TABLE public.help_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT 'both',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

-- Anyone can read help articles (store needs public access)
CREATE POLICY "Anyone can read help articles"
  ON public.help_articles FOR SELECT
  USING (true);

-- Only admins can manage help articles
CREATE POLICY "Admins can manage help articles"
  ON public.help_articles FOR ALL
  USING (is_admin());

-- Auto-update updated_at
CREATE TRIGGER update_help_articles_updated_at
  BEFORE UPDATE ON public.help_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial content
INSERT INTO public.help_articles (key, title, content, audience) VALUES
  ('admin.pricing', 'Juros e Cartões', E'## Como funciona\n\nEsta aba é a **única fonte de verdade** para todas as regras financeiras do sistema.\n\n### Parcelas sem juros\nDefina quantas parcelas sem juros oferecer. O custo financeiro é absorvido pela loja.\n\n### Juros por parcela\nEscolha entre taxa fixa ou personalizada por parcela.\n\n### Taxa de Checkout Transparente\nSe ativa, essa taxa é descontada internamente do lucro sem alterar o preço ao cliente.\n\n### Desconto PIX / Boleto\nPercentual de desconto aplicado quando o cliente escolhe PIX ou boleto.', 'admin'),
  
  ('admin.products', 'Gerenciamento de Produtos', E'## Produtos\n\nAqui você gerencia todo o catálogo.\n\n### Seleção em massa\nUse os checkboxes para selecionar vários produtos e aplicar ações em lote.\n\n### Filtros\nFiltre por categoria, status, estoque e sincronização Bling.\n\n### Importação/Exportação\nUse CSV para importar ou exportar produtos em massa.', 'admin'),
  
  ('admin.products.bulk_edit', 'Edição em Massa', E'## Edição em Massa\n\nPermite alterar campos de vários produtos simultaneamente.\n\n### Como usar\n1. Selecione os produtos desejados\n2. Clique em "Editar em massa"\n3. Ative os campos que deseja alterar\n4. Preencha os novos valores\n5. Revise o resumo e confirme\n\n### Campos disponíveis\n- Peso, Largura, Altura, Comprimento\n- Categoria e Marca\n\n⚠️ Apenas campos ativados serão alterados.', 'admin'),
  
  ('admin.products.bling_sync', 'Sincronização Bling', E'## Sincronização com Bling\n\n### Status\n- 🟢 **Sincronizado**: produto atualizado com o Bling\n- 🟡 **Pendente**: aguardando sincronização\n- 🔴 **Erro**: falha na última sincronização\n\n### Ações\n- **Sincronizar selecionados**: envia produtos para o Bling\n- **Reprocessar com erro**: tenta novamente os que falharam\n\nA sincronização roda via fila em segundo plano.', 'admin'),
  
  ('admin.dashboard', 'Painel Administrativo', E'## Dashboard\n\nVisão geral do desempenho da loja.\n\n- Vendas do período\n- Pedidos recentes\n- Produtos mais vendidos\n- Métricas de tráfego', 'admin'),
  
  ('admin.orders', 'Gerenciamento de Pedidos', E'## Pedidos\n\nAcompanhe e gerencie todos os pedidos.\n\n### Status\n- **Pendente**: aguardando pagamento\n- **Processando**: pagamento confirmado\n- **Enviado**: em transporte\n- **Entregue**: concluído\n- **Cancelado**: pedido cancelado\n\n### Ações\nAtualize status, adicione código de rastreio e visualize detalhes.', 'admin'),
  
  ('admin.settings', 'Configurações Gerais', E'## Configurações\n\nAjustes gerais da loja.\n\n- Nome e logo da loja\n- Contato (email, telefone, WhatsApp)\n- Redes sociais\n- Endereço\n\n⚠️ Regras financeiras (juros, parcelas, descontos) são gerenciadas na aba **Juros e Cartões**.', 'admin'),
  
  ('admin.reports', 'Relatórios', E'## Relatórios\n\nAcompanhe métricas de vendas, tráfego e desempenho.\n\n- Dashboard de vendas\n- Análise de tráfego\n- Carrinhos abandonados\n- Automações de email', 'admin'),
  
  ('store.home', 'Página Inicial', E'## Bem-vindo!\n\nNavegue pelas categorias, confira os destaques e aproveite as ofertas.', 'store'),
  
  ('store.catalog', 'Catálogo', E'## Navegando o catálogo\n\nUse os filtros laterais para encontrar o que procura:\n- Filtre por tamanho, cor e preço\n- Ordene por mais vendidos, novidades ou preço', 'store'),
  
  ('store.product', 'Página do Produto', E'## Detalhes do Produto\n\n### Parcelamento\nO valor "a partir de Xx" mostra a menor parcela sem juros disponível.\n\n### Desconto PIX\nPague com PIX e economize! O desconto é aplicado automaticamente.\n\n### Frete\nDigite seu CEP para calcular o frete e prazo de entrega.', 'store'),
  
  ('store.cart', 'Carrinho', E'## Seu Carrinho\n\n- Altere quantidades ou remova itens\n- Calcule o frete pelo CEP\n- Aplique cupom de desconto\n- Frete grátis disponível acima do valor mínimo', 'store'),
  
  ('store.checkout', 'Checkout', E'## Finalizando sua Compra\n\n### Formas de pagamento\n- **PIX**: desconto aplicado automaticamente\n- **Cartão de crédito**: parcele em até 12x\n- Parcelas sem juros conforme política da loja\n\n### Frete\nEscolha a opção de entrega que preferir.\n\n### Cupom\nAplique seu cupom antes de finalizar.', 'store'),
  
  ('store.account', 'Minha Conta', E'## Minha Conta\n\nGerencie seus dados pessoais, endereço e acompanhe seus pedidos.', 'store'),
  
  ('store.order_status', 'Acompanhamento de Pedido', E'## Status do Pedido\n\nAcompanhe o andamento da sua compra. Use o código de rastreio para verificar a entrega.', 'store');
