# Passo 4 — Percursos pelas telas admin críticas

## 1. Escopo

Telas consideradas críticas para operação: **Dashboard**, **Pedidos**, **Produtos**, **Clientes**, **Configurações da Loja**, **Integrações**, **Checkout Transparente**, **Juros e Cartões (Preços)**. A análise foi feita por code review (sem execução manual).

---

## 2. Dashboard (`/admin`)

- **Conteúdo**: KPIs (receita, pedidos, ticket, clientes) por período (hoje, 7, 30, 90 dias), comparação com período anterior, gráficos (linha e pizza por status), card de “Configuração da Loja” (5 itens), notificações.
- **Dados**: Queries em `orders`, `customers` com filtro por `created_at`; `store_settings`, `site_theme`, `products` para o health card.
- **Observações**: Tratamento de `PGRST116` não aplicado no Dashboard (usa `.single()` ou espera dados); se não houver pedidos no período, totais zerados — OK. Health card some quando 5/5 — OK.
- **Risco**: Baixo. Possível melhoria: loading/empty states mais explícitos nos gráficos.

---

## 3. Pedidos (`/admin/pedidos`)

- **Listagem**: Query `orders` com `select('*')`, ordenação por `created_at` desc. Filtros: busca (número do pedido / nome), status, datas, valor min/max, ordenação.
- **Busca**: `o.order_number.toLowerCase()` e `o.shipping_name.toLowerCase()`. Se `order_number` ou `shipping_name` forem `null`, ocorre **erro em tempo de execução**.
- **Exportar**: Gera CSV com número, cliente, cidade, estado, status, subtotal, frete, desconto, total, data, rastreio — OK.
- **Importar**: Lê CSV e faz `parseCSV`; apenas loga quantidade de linhas e limpa o input. **Não persiste dados** (não insere/atualiza pedidos). Comportamento atual é de stub.
- **Detalhe do pedido (modal)**: Exibe endereço de entrega, resumo (subtotal, frete, desconto, total), rastreamento e observações. **Não carrega nem exibe itens do pedido** (`order_items`); o admin não vê quais produtos e quantidades compõem o pedido. Também não mostra `provider` (appmax/yampi), `customer_email` ou `order_number` de forma destacada no cabeçalho (só no título).
- **Alteração de status**: Select por pedido chama `updateStatusMutation`; invalida `admin-orders` e toast — OK.
- **Permissão**: Menu exige `orders.read`; não há checagem explícita de permissão de escrita na mutação (depende de RLS).

**Achados**  
| Prioridade | Achado | Status |
|------------|--------|--------|
| P1 | Busca quebra se `order_number` ou `shipping_name` for null | **Corrigido**: uso de `(o.order_number ?? '')` e `(o.shipping_name ?? '')` na busca. |
| P1 | Modal de detalhe não mostra itens do pedido | **Corrigido**: query `order_items` ao abrir o modal; tabela com produto, variante, qtd, unitário e total; email e provider (Yampi/Appmax) quando existirem. |
| P2 | Importar pedidos não persiste | Pendente: implementar import (mapeamento colunas → campos, validação, insert/update) ou remover/desabilitar botão e deixar claro que é “em breve”. |

---

## 4. Produtos (`/admin/produtos`)

- **Listagem**: Query com `products` + `category`, `product_images`, `product_variants`; filtros por busca, categoria, status (ativo/inativo), origem (Bling/manual), abas (estoque ativo/baixo/inativo), paginação (25 por página).
- **Edição**: `ProductFormDialog`; criação/edição com variantes, imagens, preços — fluxo esperado.
- **Exclusão**: Delete em `products` (cascade nas variantes/imagens conforme schema) — OK.
- **Edição em massa**: `BulkEditDialog`, atualiza produtos selecionados e grava em `product_change_log` — OK.
- **Bling**: Sincronização por produto via `bling-sync-single-stock`; badge de status/última sync/erro; filtro “Bling” para produtos com `bling_product_id` — OK.
- **Exportar**: `ProductExportDialog` — OK.
- **Permissão**: Catálogo sem permissão específica no menu; subitens (ex.: Avaliações) podem usar `reviews.read`.

**Achados**  
- Nenhum bug crítico identificado. Melhoria opcional: loading state consistente na lista e no diálogo de sync Bling.

---

## 5. Clientes (`/admin/clientes`)

- **Listagem**: Query `customers` com `select('*')`. Filtros: busca (nome/email), datas, valor gasto min/max, quantidade de pedidos, ordenação.
- **Busca**: `c.full_name.toLowerCase()` e `c.email.toLowerCase()`. Se `full_name` ou `email` for `null`, **erro em tempo de execução**.
- **Ordenação por nome**: `a.full_name.localeCompare(b.full_name)` — mesmo risco se `full_name` for null.
- **Exportar/Importar**: Export CSV; import com validação e upsert por email — fluxo coerente.
- **Detalhe**: Modal com dados do cliente e histórico — OK.

**Achados**  
| Prioridade | Achado | Status |
|------------|--------|--------|
| P1 | Busca e ordenação quebram com `full_name` ou `email` null | **Corrigido**: busca e ordenação por nome com null-safe (`?? ''`). |

---

## 6. Configurações da Loja (`/admin/configuracoes`)

- **Dados**: `store_settings` (uma linha), abas Geral, Contato, Footer, Segurança (2FA, logs de erro).
- **Geral**: Nome, logo, frete grátis, variantes na grade; upload de logo em `product-media` — OK.
- **Salvar**: Insert ou update por `id`; trata `PGRST116` na leitura (single); erro em update/insert mostrado em toast — OK.
- **Loading**: Exibe “Carregando...” enquanto isLoading — OK.

**Achados**  
- Nenhum bug crítico. Interface alinhada ao uso de `store_settings`.

---

## 7. Integrações (`/admin/integracoes`)

- **Conteúdo**: Bling (OAuth, loja, sync, URL de webhook, config de sync, monitoramento), Checkout transparente (Yampi/Appmax), catálogo Yampi (produtos/variantes sem ID, sync categorias/imagens), logs de teste de checkout.
- **Bling**: Conexão OAuth, seleção de loja, botão “Sincronizar” chama `bling-sync`; painel de config usa `bling_sync_config`; URL do webhook exibida para cópia — OK.
- **Yampi**: Form em modal (alias, user_token, user_secret_key, URLs, mode, stock_mode, etc.); salvamento em `integrations_checkout_providers` — OK.
- **Cron Bling**: Documentar que, com `BLING_CRON_SECRET` definido, a URL de cron deve incluir `?secret=` (conforme Passo 3).

**Achados**  
- Nenhum bug crítico. Melhoria: na tela ou no help, mencionar a necessidade do secret no cron quando configurado.

---

## 8. Checkout Transparente (`/admin/checkout-transparente`)

- **Conteúdo**: Escolha de provider (Appmax/Yampi), ativação do checkout transparente e fallback para nativo; configuração Yampi (modal) e URL do webhook; produtos/variantes sem mapeamento Yampi; logs de teste.
- **Consistência**: Usa `integrations_checkout` e `integrations_checkout_providers`; alinhado ao `checkout-create-session` — OK.

**Achados**  
- Nenhum bug crítico.

---

## 9. Juros e Cartões (`/admin/precos`)

- **Dados**: `payment_pricing_config` (registro ativo); parcelas, juros, desconto PIX/boleto, taxa gateway, modo de arredondamento, taxa checkout transparente.
- **Salvar**: Update/insert na tabela; invalidação de cache de preços (`invalidatePricingCache`) — OK.
- **Preview**: Cálculo de parcelas e custo com `getInstallmentOptions` e `getGatewayCost` — OK.

**Achados**  
- Nenhum bug crítico.

---

## 10. Acesso e permissões

- **AdminLayout**: Usa `useAdminRole` (admin_members ou user_roles); menu filtra itens por `hasPermission(role, permission)`; rotas não fazem checagem extra — acesso efetivo depende de RLS e do fato de apenas admins chegarem ao layout.
- **RLS**: Políticas nas tabelas (orders, products, customers, store_settings, etc.) definem quem pode ler/escrever; as telas assumem que o usuário já é admin.

**Achados**  
- Nenhuma inconsistência grave. Boa prática: em mutações sensíveis (ex.: alterar status de pedido, excluir produto), garantir que a política RLS exija o papel adequado.

---

## 11. Resumo dos achados e prioridade

| Prioridade | Tela | Achado |
|------------|------|--------|
| P1 | Pedidos | ~~Busca quebra se null~~ **Corrigido.** |
| P1 | Pedidos | ~~Detalhe sem itens~~ **Corrigido:** modal exibe itens, email e provider. |
| P1 | Clientes | ~~Busca/ordenação quebram se null~~ **Corrigido.** |
| P2 | Pedidos | Importar CSV não persiste dados (stub). |
| P3 | Integrações | Documentar uso de `BLING_CRON_SECRET` na URL de cron. |

---

## 12. Conclusão

As telas admin críticas estão em geral coerentes com o schema e com as integrações. Os pontos que mais impactam o uso diário são: **proteção contra null na busca/ordenação (Pedidos e Clientes)** e **exibição dos itens do pedido no modal de detalhe (Pedidos)**. O import de pedidos em CSV hoje é apenas stub e deve ser implementado ou sinalizado como “em breve” para não gerar expectativa incorreta.

Implementar as correções P1 (null safety em Pedidos e Clientes + itens do pedido no detalhe) deixa o admin mais estável e completo para operação.
