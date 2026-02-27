# B) PLANO DE TESTES EXAUSTIVO — E-commerce Produção

Matriz de testes com pré-condição, passos, resultado esperado, evidência e severidade (P0/P1/P2).

---

## 1) Conta e autenticação

| ID | Caso de teste | Pré-condição | Passos | Resultado esperado | Evidência | Severidade |
|----|----------------|--------------|--------|--------------------|-----------|------------|
| AUTH-01 | Criar conta com email/senha | Deslogado | Acessar /auth → Cadastrar → preencher nome, email, senha, confirmar senha → Cadastrar | Conta criada; toast "Verifique seu email"; redirecionamento ou mensagem de confirmação | auth.users (Supabase) novo row; email de confirmação enviado | P1 |
| AUTH-02 | Login com email/senha | Conta existente | /auth → Entrar → email/senha corretos → Entrar | Login ok; redirecionamento para / | Session ativa; localStorage/cookie de sessão | P0 |
| AUTH-03 | Logout | Logado | Clicar em Sair (header ou /conta) | Sessão encerrada; redirecionamento para / | Session null | P1 |
| AUTH-04 | Sessão expirada | Logado; token expirado (esperar ou manipular) | Navegar para /conta ou ação que exige auth | Redirecionamento para /auth ou mensagem de sessão expirada | Não acessa dados protegidos | P1 |
| AUTH-05 | Reset de senha | Deslogado | Acionar "Esqueci minha senha" (se existir) → email → enviar | Email de reset enviado; link válido | Email recebido; link redireciona e permite nova senha | P1 |
| AUTH-06 | Checkout como guest | Deslogado; carrinho com itens | Ir para /checkout → preencher dados → finalizar | Pedido criado com user_id null e access_token preenchido; confirmação exibida | orders.user_id IS NULL, orders.access_token NOT NULL | P0 |
| AUTH-07 | Checkout logado | Logado; carrinho com itens | Ir para /checkout → finalizar | Pedido com user_id = auth.uid(); visível em /conta | orders.user_id preenchido; /conta lista o pedido | P0 |
| AUTH-08 | Acesso indevido: ver pedido de outro usuário | User A logado | Alterar URL para /pedido-confirmado/{order_id_de_B} ou chamar API com order_id de B sem token de guest | Não exibir dados do pedido de B; 403 ou lista vazia | RLS impede SELECT em orders onde user_id != auth.uid() e access_token != header | P0 |

---

## 2) Carrinho / Produto / Preço

| ID | Caso de teste | Pré-condição | Passos | Resultado esperado | Evidência | Severidade |
|----|----------------|--------------|--------|--------------------|-----------|------------|
| CART-01 | Adicionar item ao carrinho | Vitrine com produto em estoque | Produto → selecionar variante → Adicionar ao carrinho | Item no carrinho; toast/sidebar atualizado; localStorage "cart" com item | localStorage.cart; itemCount aumentou | P0 |
| CART-02 | Remover item | Carrinho com 1+ itens | Carrinho → remover 1 item | Item removido; subtotal atualizado | localStorage.cart sem o item | P0 |
| CART-03 | Alterar quantidade rapidamente (spam + teclas) | Carrinho com item | Clicar várias vezes em + ou - em sequência rápida | Quantidade final correta; sem pedido duplicado ou estado quebrado | Quantidade no DOM e no localStorage consistente | P1 |
| CART-04 | Variação (tamanho/cor) e preço correto | Produto com variantes e preços diferentes | Selecionar variante A → adicionar; selecionar variante B → adicionar | Dois itens no carrinho com preços distintos conforme variante | unit_price no cart por variante = product_variants.base_price/sale_price | P0 |
| CART-05 | Estoque limite: 1 unidade restante | Variante com stock_quantity = 1 | Adicionar 1 ao carrinho; tentar aumentar para 2 no carrinho ou na PDP | Limite de 1 aplicado; mensagem de estoque máximo | quantity <= stock_quantity; toast "Estoque máximo" se tentar mais | P0 |
| CART-06 | Carrinho persistente (reload) | Carrinho com itens | F5 ou fechar e reabrir aba | Itens e quantidades mantidos | localStorage.cart idêntico antes/depois | P0 |

---

## 3) Checkout e endereço

| ID | Caso de teste | Pré-condição | Passos | Resultado esperado | Evidência | Severidade |
|----|----------------|--------------|--------|--------------------|-----------|------------|
| CHK-01 | Campos obrigatórios e validações | Na etapa Identificação | Clicar "Continuar" sem preencher | Mensagem de preenchimento obrigatório; não avança | Toast ou inline error | P0 |
| CHK-02 | CEP inválido / endereço incompleto | Etapa Entrega | CEP inexistente ou endereço sem número | Toast "CEP não encontrado" ou "Preencha o endereço completo"; não avança para Pagamento | Validação client-side e/ou server | P1 |
| CHK-03 | Voltar etapa e manter dados | Checkout na etapa Pagamento | Voltar para Entrega; alterar CEP; voltar para Identificação | Dados preenchidos mantidos ao voltar | formData e selectedShipping persistidos no state | P1 |
| CHK-04 | Editar endereço e refletir no pedido final | Checkout completo | Alterar CEP após calcular frete; selecionar novo frete; finalizar | Pedido criado com shipping_* e shipping_cost do último estado | orders.shipping_address, shipping_cost coerentes com resumo | P0 |

---

## 4) Pagamentos (tudo que existir)

| ID | Caso de teste | Pré-condição | Passos | Resultado esperado | Evidência | Severidade |
|----|----------------|--------------|--------|--------------------|-----------|------------|
| PAY-01 | Sucesso (PIX ou cartão conforme gateway) | Checkout preenchido; gateway ativo | Escolher método → Finalizar → concluir pagamento (ou simular sucesso) | Redirecionamento para /pedido-confirmado; status paid/processing | orders.status; payments.status approved | P0 |
| PAY-02 | Falha (cartão recusado / PIX expirado) | Checkout preenchido | Finalizar com cartão recusado ou não pagar PIX | Mensagem de erro; pedido permanece pending ou failed; estoque devolvido (Stripe/Appmax) | orders.status failed ou pending; product_variants.stock_quantity restaurado | P0 |
| PAY-03 | Cancelamento (usuário cancela no gateway) | Durante fluxo Stripe/Appmax | Clicar em cancelar ou fechar modal | Retorno ao checkout ou confirmação; pedido cancelado; estoque devolvido | orders.status cancelled; estoque incrementado | P1 |
| PAY-04 | Pagamento pendente e depois aprovado (webhook) | PIX gerado | Não pagar; simular webhook payment_intent.succeeded (ou equivalente Appmax) | Status da ordem atualizado para paid/processing na tela (polling/Realtime) | orders.status atualizado; OrderConfirmation reflete status | P0 |
| PAY-05 | Usuário fecha aba durante pagamento | Após criar pedido, durante PaymentIntent/PIX | Fechar aba antes de confirmar pagamento | Pedido fica pending; webhook ao pagar depois atualiza status; sem duplicar cobrança | 1 pedido, 1 pagamento quando webhook chegar | P0 |
| PAY-06 | Refresh durante processamento | Após clicar Finalizar (antes de redirect) | F5 ou refresh | Idempotency: mesmo pedido reutilizado ou mensagem clara; não criar segundo pedido/pagamento | orders com mesmo idempotency_key; 1 order, 1 payment | P0 |
| PAY-07 | Pagamento repetido (duas tentativas) | Primeira tentativa com sucesso | Clicar "Finalizar" duas vezes rápido (ou duas abas) | Apenas 1 pedido e 1 pagamento válido | COUNT(orders) e COUNT(payments) por idempotency_key/session = 1 | P0 |

---

## 5) Anti-duplicação / Idempotência (P0)

| ID | Caso de teste | Pré-condição | Passos | Resultado esperado | Evidência | Severidade |
|----|----------------|--------------|--------|--------------------|-----------|------------|
| IDEM-01 | Double click no botão "Finalizar" | Checkout na etapa Pagamento; botão visível | Clicar 2x rápido em "Finalizar Pedido" | 1 pedido criado; 1 pagamento (ou 1 intent); redirect único | orders: 1 row com idempotency_key; payments: 1 row para essa ordem | P0 |
| IDEM-02 | Clicar 10x em "Pagar" | Stripe Elements ou botão Appmax visível | 10 cliques rápidos | 1 pedido; 1 PaymentIntent ou 1 transação Appmax | DB: 1 order, 1 payment; gateway: 1 charge | P0 |
| IDEM-03 | Duas abas: checkout concluído nas duas | Carrinho com itens; duas abas em /checkout com mesmo carrinho | Aba 1: preencher e finalizar com sucesso. Aba 2: finalizar também | Aba 1: sucesso. Aba 2: reutiliza mesmo pedido (idempotency_key) ou erro amigável; no máximo 1 pedido pago | orders: 1 ou 2 (segundo com mesmo idempotency_key reutilizado); apenas 1 com status paid | P0 |
| IDEM-04 | Rede lenta + usuário impaciente | Throttle de rede (DevTools) | Preencher checkout → Finalizar → enquanto loading, clicar de novo ou refresh | Mesmo pedido; sem duplicar cobrança nem estoque | 1 order, 1 payment; stock decrementado uma vez | P0 |

---

## 6) Estoque / Oversell (P0)

| ID | Caso de teste | Pré-condição | Passos | Resultado esperado | Evidência | Severidade |
|----|----------------|--------------|--------|--------------------|-----------|------------|
| STK-01 | Dois usuários compram a última unidade ao mesmo tempo | Variante com stock_quantity = 1 | User A e B adicionam ao carrinho e disparam checkout/finalizam quase simultaneamente | Apenas 1 pedido completa; o outro falha por "Estoque insuficiente" | product_variants.stock_quantity = 0; 1 order com item, outro falha ou cancelado | P0 |
| STK-02 | Reserva/baixa atômica (transação/lock) | Qualquer fluxo de pagamento | Finalizar pedido que baixa estoque | decrement_stock com FOR UPDATE; nenhuma venda com quantidade > estoque | Nenhum order_items.quantity agregado por variant_id > stock_quantity em momento da venda | P0 |
| STK-03 | Pagamento falha/cancelado: estoque volta | Pedido criado; estoque já baixado (Stripe ou Appmax) | Simular payment_intent.payment_failed ou cancel; ou Appmax cancel | Estoque restaurado (increment_stock / cancel_order_return_stock) | product_variants.stock_quantity igual ao anterior à venda | P0 |

---

## 7) Webhooks e consistência (P0)

| ID | Caso de teste | Pré-condição | Passos | Resultado esperado | Evidência | Severidade |
|----|----------------|--------------|--------|--------------------|-----------|------------|
| WH-01 | Webhook chega antes do frontend confirmar | Pedido criado; pagamento aprovado no gateway | Stripe envia payment_intent.succeeded antes do redirect do front | Ordem atualizada para paid; front ao carregar /pedido-confirmado mostra status correto | orders.status = paid; payments inserido | P0 |
| WH-02 | Webhook duplicado (retry do gateway) | Stripe reenvia mesmo event_id | Enviar mesmo evento 2x (mesmo event_id) | Segunda vez ignorada (idempotency); ordem não atualizada duas vezes; payments não duplicado | stripe_webhook_events.event_id UNIQUE; 1 row em payments para esse PI | P0 |
| WH-03 | Webhook fora de ordem (paid depois canceled) | Eventos fora de ordem | Enviar payment_intent.canceled e depois payment_intent.succeeded (ou inverso) | Estado final consistente: último evento vence; ex.: se succeeded chega por último, ordem fica paid | orders.status reflete o evento mais "final" conforme regra de negócio | P0 |

---

## 8) Observabilidade

| ID | Caso de teste | Pré-condição | Passos | Resultado esperado | Evidência | Severidade |
|----|----------------|--------------|--------|--------------------|-----------|------------|
| OBS-01 | Logs úteis (correlation id por pedido) | Qualquer fluxo de pedido | Criar pedido e pagamento; verificar logs (edge functions / app_logs) | Logs contêm order_id ou correlation_id rastreável | app_logs ou console com order_id/correlation_id | P2 |
| OBS-02 | Erros com mensagem clara | Forçar erro (estoque, cupom inválido) | Finalizar com estoque insuficiente ou cupom expirado | Mensagem de erro entendível para o usuário | Toast ou UI com texto explicativo | P1 |
| OBS-03 | Auditoria mínima (quem alterou status do pedido) | Admin altera status ou webhook altera | Alterar status do pedido (admin ou webhook) | Registro de alteração (admin_audit_log ou last_webhook_event) | admin_audit_log ou orders.last_webhook_event preenchido | P2 |

---

## Resumo de severidade

- **P0:** Bloqueante para produção (cobrança duplicada, oversell, pedido sem pagamento, quebra de idempotência).
- **P1:** Grave (segurança, integridade de dados, UX crítica).
- **P2:** Desejável (observabilidade, mensagens, auditoria).

**Ordem sugerida de execução:** P0 primeiro (idempotência, estoque, webhooks, pagamento), depois P1 (auth, checkout, erros), depois P2.
