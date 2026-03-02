# AUDIT REPORT — Checkout Multi-Provider

**Escopo:** Auditoria 360° (PR0) — sem alteração de código.  
**Objetivo:** Mapa AS-IS, inventário de arquivos/rotas e riscos priorizados (P0/P1/P2) com evidência no código.

---

## 1. Inventário de arquivos e rotas

### 1.1 Rotas (App.tsx)

| Rota | Uso |
|------|-----|
| `/carrinho` | Carrinho do comprador |
| `/checkout` | Página de checkout (formulário + pagamento) |
| `/checkout/start` | Início do fluxo (resolve provider, redireciona ou vai para /checkout) |
| `/checkout/obrigado` | Obrigado (pós-Stripe external) |
| `/pedido-confirmado/:orderId` | Confirmação por ID |
| `/pedido-confirmado` | Confirmação genérica |
| `/admin/pedidos` | Listagem de pedidos (admin) |
| `/admin/checkout-transparente` | Configuração checkout (CheckoutSettings) |
| `/admin/commerce-health` | Saúde commerce / reconciliação |
| `/admin/integracoes` | Integrações (Stripe, Yampi, Appmax, Bling, etc.) |

### 1.2 Edge Functions (checkout / pagamento / webhooks)

| Função | Inputs principais | Outputs | Auth |
|--------|-------------------|--------|------|
| `checkout-create-session` | `action: "resolve"` ou `items`, `success_url`, `cancel_url` | `flow`, `provider`, ou `checkout_url` (Yampi), ou redirect | Sem auth em `resolve`; com body em Yampi |
| `checkout-router` | `route` + payload (resolve \| create_gateway_session \| stripe_intent \| process_payment) | Shape unificado: `success`, `error?`, + dados do alvo | Mesmo que as funções delegadas |
| `stripe-create-intent` | `order_id`, `create_checkout_session` ou `create_payment_intent`, `amount`, `metadata` | `client_secret`, `session_id`, `redirect_url` | Bearer ou `order_access_token` |
| `process-payment` | `order_id`, `order_access_token`, dados de cartão/PIX | Resultado da transação Appmax | Bearer ou `order_id` + `order_access_token` |
| `stripe-webhook` | Body raw (Stripe signature) | 200/400 | Verificação de assinatura `Stripe-Signature` |
| `yampi-webhook` | Query `token`, body (eventos Yampi) | 200 | Token na query |
| `appmax-webhook` | Query `token`, body (eventos Appmax) | 200 | Token na query |
| `reconcile-order` | POST `{ order_id }` | `ok`, `previous_status`, `new_status`, `payment_synced` | Bearer (service_role ou admin) |
| `admin-commerce-action` | Ação (ex.: release, reconcile) | — | Admin |

### 1.3 Componentes e páginas de UI (checkout / comprador)

| Arquivo | Responsabilidade |
|---------|-------------------|
| `src/pages/CheckoutStart.tsx` | Resolve provider via `checkout-create-session`; gateway Yampi → redirect; Stripe external → cria pedido, chama `stripe-create-intent`, redirect; transparent → navega para `/checkout` |
| `src/pages/Checkout.tsx` | Formulário de dados + pagamento; cria pedido (idempotency_key = cartId); Stripe embedded (PaymentIntent) ou Appmax (`process-payment`); proteção duplo submit com `submitInProgressRef` |
| `src/pages/CheckoutReturn.tsx` | Retorno do gateway; busca pedido por `external_reference = session_id`; polling 10×3s; sem timeout explícito na chamada; fallback "Obrigado pela sua compra!" quando não acha pedido |
| `src/pages/OrderConfirmation.tsx` | Confirmação de pedido por state/params |
| `src/pages/Cart.tsx` | Carrinho e link para checkout |

### 1.4 Admin (pedidos e configurações)

| Arquivo | Responsabilidade |
|---------|-------------------|
| `src/pages/admin/Orders.tsx` | Lista **todos** os pedidos (sem paginação: `.select('*').order('created_at', { ascending: false })`); atualiza status; chama `admin-commerce-action`; correlation_id para audit |
| `src/pages/admin/CheckoutSettings.tsx` | Toggles Stripe/Yampi; config Stripe (chaves, checkout_mode embedded/external); config Yampi; sync catálogo; test connection; **alternância provider já existe** (1-clique) |
| `src/pages/admin/CommerceHealth.tsx` | Ações de saúde commerce (release, reconcile); correlation_id |
| `src/pages/admin/Integrations.tsx` | Appmax, Bling, Stripe catalog sync, healthchecks |
| `src/pages/admin/AppmaxCallback.tsx` | Callback e logs Appmax |

### 1.5 Helpers e regras de negócio

| Arquivo | Responsabilidade |
|---------|-------------------|
| `src/contexts/CartContext.tsx` | Estado do carrinho; `cart_id` em localStorage (`CART_ID_KEY = 'cart_id'`); `getOrCreateCartId()` |
| `src/lib/cartPricing.ts` | `getCartItemUnitPrice` |
| `src/lib/couponDiscount.ts` | `computeCouponDiscount` |
| `src/lib/pricingEngine.ts` | Cálculo de totais |
| `src/hooks/usePricingConfig.ts` | Config de preços |

### 1.6 Migrations relevantes (idempotência e unicidade)

| Migração | Evidência |
|----------|-----------|
| `20260223160527_*` | `orders.idempotency_key` ADD COLUMN + UNIQUE INDEX |
| `20260227160751_*` | `idx_orders_cart_id_unique` (cart_id UNIQUE WHERE NOT NULL) |
| `20260227175940_*` | `idx_orders_idempotency_key_unique`, `idx_orders_cart_id_unique` |
| `20260227200000_orders_cart_id_unique_active.sql` | `idx_orders_cart_id_active` (UNIQUE ativo) |
| `20260227133932_*` | `stripe_webhook_events` (event_id UNIQUE), order_status enum (paid, failed, refunded, disputed) |
| (posterior) | `stripe_webhook_events`: `processed_at`, `error_message` (PR3) |
| `20260227150000_payments_unique_provider_transaction_id.sql` | UNIQUE (provider, transaction_id) WHERE transaction_id IS NOT NULL |
| `order_events` (Appmax) | `event_hash` UNIQUE para idempotência de webhook |

---

## 2. Mapeamento do fluxo AS-IS (comprador)

### 2.1 Diagrama textual

```
[Carrinho] --> /checkout/start (CheckoutStart)
                    |
                    +-- checkout-create-session(action: "resolve")
                    |       lê integrations_checkout + integrations_checkout_providers
                    |       retorna { flow: "transparent"|"gateway", provider }
                    |
                    +-- Se flow === "gateway" e provider === "yampi":
                    |       checkout-create-session(body: items, success_url, cancel_url)
                    |       --> redirect para checkout_url Yampi
                    |
                    +-- Se flow === "gateway" e provider === "stripe" (external):
                    |       Cria pedido no DB (cart_id, idempotency_key = cartId)
                    |       --> stripe-create-intent(create_checkout_session)
                    |       --> redirect para Stripe
                    |
                    +-- Se flow === "transparent":
                    |       --> navigate(/checkout)

[Checkout.tsx] (transparent)
    |  idempotencyKey = cartId
    |  Verifica order existente por idempotency_key; se pending/processing --> redirect pedido-confirmado
    |  Cria order (cart_id, idempotency_key), order_items
    |  Se 23505 cart_id --> busca por cart_id, redirect pedido-confirmado
    |
    +-- Stripe embedded:
    |       stripe-create-intent(create_payment_intent) --> client_secret
    |       Element + confirmPayment --> status no front
    |       Status success --> navigate pedido-confirmado
    |
    +-- Appmax:
            process-payment(order_id, token, card/pix) --> atualiza pedido no backend
            --> navigate pedido-confirmado
```

### 2.2 Onde nasce o “checkout intent”

- **Transparent (Stripe ou Appmax):** em `Checkout.tsx` ao submeter o form — pedido criado antes do pagamento; intent criado em seguida (`stripe-create-intent` ou `process-payment`).
- **Gateway Stripe (external):** em `CheckoutStart.tsx` — pedido criado antes; `stripe-create-intent` com `create_checkout_session` retorna URL; redirect para Stripe.
- **Gateway Yampi:** em `CheckoutStart.tsx` — `checkout-create-session` com items retorna `checkout_url`; redirect para Yampi (pedido pode ser criado no webhook Yampi em `payment.approved`).

### 2.3 Quando o pedido é criado

| Provider / modo | Quando o pedido é criado |
|-----------------|---------------------------|
| Stripe external | No front (CheckoutStart) antes do redirect; `cart_id` + `idempotency_key`; webhook atualiza status e `external_reference`. |
| Stripe transparent | No front (Checkout) antes de chamar `stripe-create-intent`; webhook atualiza status. |
| Appmax | No front (Checkout) antes de chamar `process-payment`; backend process-payment cria/atualiza na Appmax e atualiza order no DB. |
| Yampi | No webhook `payment.approved` (yampi-webhook); pedido criado no nosso DB nesse momento. |

### 2.4 Como o status muda

- **Front:** em fluxos transparentes, após confirmar pagamento (Stripe Element ou resposta de `process-payment`) o front pode navegar para confirmação; o estado canônico vem do DB atualizado pelo webhook ou pelo `process-payment`.
- **Webhook:** Stripe (`payment_intent.succeeded`, etc.), Yampi (`payment.approved`), Appmax (eventos com precedência, sem regredir status) atualizam `orders.status` e, quando aplicável, `payments` / `external_reference`.

### 2.5 Redirect e retorno do usuário

- **Stripe external:** redirect para Stripe; retorno em `success_url` (ex.: `/checkout/obrigado?session_id=...`) ou `cancel_url`. `CheckoutReturn.tsx` usa `session_id` (query ou localStorage `checkout_session_id`); busca pedido por `external_reference = session_id`; polling 10×3s; depois para (sem mensagem explícita de “timeout”); se não achar pedido, mostra “Obrigado pela sua compra!” genérico.
- **Yampi:** redirect para Yampi; retorno conforme URLs configuradas na Yampi (success/cancel).
- **Appmax/Stripe transparent:** não há redirect externo; confirmação na mesma sessão.

### 2.6 Dados temporários

- **localStorage:** `cart_id`, `cart`, `appliedCoupon`, `selectedShipping`, `shippingZip`; em fluxo Stripe external também `checkout_session_id` (limpo no retorno).
- **DB:** `orders` (cart_id, idempotency_key, status, external_reference, transaction_id); `order_items`; `payments`; `stripe_webhook_events`; `order_events` (Appmax).

### 2.7 Pontos de corrida e risco

- **Front x webhook:** usuário pode ver “aguardando confirmação” enquanto o webhook ainda não atualizou; polling em CheckoutReturn (10×3s) pode acabar antes do webhook processar → usuário vê fallback “Obrigado pela sua compra!” mesmo sem pedido encontrado.
- **Retries:** Stripe idempotente por `event_id`; Yampi por external_reference (duplicate: true); Appmax por `event_hash`. Front: retry sem idempotency key explícita nas chamadas à API Stripe em `stripe-create-intent` (apenas idempotência de pedido por cart_id/idempotency_key).
- **Refresh durante pagamento:** Checkout verifica order por idempotency_key/cart_id e redireciona para pedido-confirmado se já existir; evita criar segundo pedido, mas refresh no meio do pagamento pode deixar usuário em estado confuso.
- **Duplo clique:** `submitInProgressRef` em Checkout; `hasStartedCheckout` em CheckoutStart; UNIQUE no DB (cart_id, idempotency_key) impedem segundo pedido para o mesmo carrinho.

---

## 3. Mapeamento do fluxo AS-IS (admin)

### 3.1 Listagem de pedidos

- **Arquivo:** `src/pages/admin/Orders.tsx`.
- **Query:** `supabase.from('orders').select('*').order('created_at', { ascending: false })` — **sem `.range()` nem `.limit()`**: carrega todos os pedidos.
- **Risco:** com muitos pedidos (milhares), carga pesada e possível “load infinito” percebido ou timeout; não há paginação nem limite configurado.

### 3.2 Divergência gateway x DB

- **reconcile-order:** edge function que recebe `order_id`, consulta Stripe e atualiza status do pedido no DB (caso “pagou mas não atualizou”).
- **Admin:** em CommerceHealth e/ou Orders existe chamada a `admin-commerce-action` (release, reconcile); não há uma tela dedicada “divergência gateway x DB” com lista lado a lado; reconcile é por pedido/ação.

### 3.3 Reprocessar evento / sync / logs

- **Stripe:** tabela `stripe_webhook_events` com event_id, processed_at, error_message; não há botão “Reprocessar webhooks com erro” na UI (evidência: busca por “reprocess” no admin).
- **Yampi/Appmax:** logs em tabelas/test logs; sem botão genérico “reprocessar com erro” documentado no inventário.
- **CommerceHealth:** ações de release/reconcile existem; correlation_id e audit em `auditLogger`.

### 3.4 Onde falha hoje (diagnóstico)

- **Load infinito:** possível em Admin Orders se a lista for muito grande (sem paginação/timeout).
- **Paginação:** não existe em Orders (lista única).
- **Filtros:** existem filtros em Orders (showFilters); não há índice específico documentado para filtros complexos além de `created_at`.
- **CheckoutSettings:** alternância 1-clique Stripe/Yampi já existe; Appmax é fallback quando ambos desativados; sem “modo interno/externo” e “transparente/nativo” centralizados em uma única tabela `checkout_settings` (config vem de `integrations_checkout` + `integrations_checkout_providers`).

---

## 4. Checklist de falhas (somente diagnóstico)

| Pergunta | Resposta | Evidência |
|----------|----------|-----------|
| Duplicação de pedido | Mitigada | UNIQUE `cart_id` e `idempotency_key` em `orders`; front verifica antes de inserir e em 23505 redireciona para pedido existente. Checkout.tsx ~364–368, 427–434; CheckoutStart usa cartId como idempotency_key. |
| Duplicação de cobrança | Mitigada | Stripe: event_id UNIQUE em stripe_webhook_events. Payments: UNIQUE(provider, transaction_id). Appmax: event_hash em order_events. Stripe API: idempotency key **não** enviada explicitamente nas chamadas em stripe-create-intent (risco P1). |
| Evento de webhook perdido | Possível | Sem retry automático; reconcile-order permite corrigir por pedido. CheckoutReturn para de pollar após 10×3s e mostra mensagem genérica se pedido não aparecer. |
| Evento duplicado idempotente? | Sim (Stripe, Yampi, Appmax) | stripe_webhook_events.event_id UNIQUE; yampi por external_reference + duplicate; appmax por event_hash UNIQUE. |
| Falha de rede: UI recupera? | Parcial | Sem timeout explícito nas chamadas `supabase.functions.invoke` no checkout; sem botão “Tentar novamente” padronizado em todas as telas de erro. |
| Refresh durante pagamento | Redireciona | Se já existe order com mesmo idempotency_key/cart_id, redireciona para pedido-confirmado; não duplica. |
| Sessão expira | A verificar | Se auth expira no meio do checkout, comportamento não mapeado neste documento; fluxo guest usa access_token no pedido. |
| Voltar do gateway externo | Confirma quando acha pedido | CheckoutReturn busca por external_reference = session_id; se webhook já rodou, acha e mostra confirmação; se não, poll 10×3s e depois fallback genérico. |
| Status regredindo | Evitado (Appmax) | appmax-webhook: regras de precedência (não regride). Stripe/Yampi: lógica não regride na implementação atual. |

---

## 5. Riscos priorizados (P0 / P1 / P2)

### P0 — Crítico (corrigir primeiro)

| ID | Risco | Evidência | Onde |
|----|--------|-----------|------|
| P0-1 | Admin Orders sem paginação: carga total de pedidos pode travar ou dar timeout | `.select('*').order('created_at', { ascending: false })` sem range/limit | `src/pages/admin/Orders.tsx` ~85–89 |
| P0-2 | Chamadas de checkout sem timeout: usuário pode ficar em “loading” indefinido | Nenhum `AbortSignal`/timeout em `supabase.functions.invoke` em CheckoutStart e Checkout | `src/pages/CheckoutStart.tsx` (invoke 38, 55, 162); `src/pages/Checkout.tsx` (492, 520, 600, 622) |
| P0-3 | Stripe API sem Idempotency-Key: retry pode criar segunda cobrança | `stripe.paymentIntents.create(intentParams)` e `stripe.checkout.sessions.create(sessionParams)` sem segundo argumento `{ idempotencyKey }` | `supabase/functions/stripe-create-intent/index.ts` linhas 287 e 490 |

### P1 — Alto

| ID | Risco | Evidência | Onde |
|----|--------|-----------|------|
| P1-1 | CheckoutReturn: após 30s sem pedido, mensagem genérica (“Obrigado pela sua compra!”) em vez de “Não conseguimos confirmar; tente novamente” | `attempts >= MAX_ATTEMPTS` → setLoading(false); order null → bloco “Obrigado pela sua compra!” | `src/pages/CheckoutReturn.tsx` 50–53, 112–122 |
| P1-2 | Request/correlation_id não propagado no fluxo de checkout comprador | Nenhum header x-correlation-id ou request_id nas chamadas de Checkout/CheckoutStart às edge functions | CheckoutStart.tsx, Checkout.tsx (apenas admin usa correlationId em audit) |
| P1-3 | process-payment (Appmax): criar cobrança sem chave de idempotência explícita no provider | Depende de order_id + fluxo único; se front retentar, pode haver dupla tentativa na Appmax | `supabase/functions/process-payment/index.ts` e Checkout.tsx 600, 622 |
| P1-4 | resolve (checkout-create-session) sem auth: qualquer um pode descobrir provider/modo | `action: "resolve"` não exige Bearer | `supabase/functions/checkout-create-session/index.ts` |

### P2 — Médio

| ID | Risco | Evidência | Onde |
|----|--------|-----------|------|
| P2-1 | Alternância provider em tabela dedicada: hoje em integrations_checkout + providers; não há uma única “checkout_settings” com active_provider, checkout_mode, experience | Config fragmentada em integrations_checkout e integrations_checkout_providers | CheckoutSettings.tsx; checkout-create-session lê essas tabelas |
| P2-2 | Admin: sem listagem de webhook_events com status de erro e botão “Reprocessar” | stripe_webhook_events tem processed_at e error_message; UI de reprocesso não encontrada | Admin: CommerceHealth / Orders / Integrations |
| P2-3 | Duplo clique no botão “Pagar” apenas com ref (submitInProgressRef); sem disabled visual garantido em todos os caminhos | submitInProgressRef usado; botão pode não estar disabled em todos os estados de loading | Checkout.tsx (verificar todos os branches de submit) |
| P2-4 | Falha de rede no invoke: sem retry controlado nem mensagem única “Tentar novamente” | Erro cai em catch; toast/estado local; sem padrão único de retry | Checkout.tsx, CheckoutStart.tsx |

---

## 6. Resumo executivo

- **Fluxo comprador:** bem definido; pedido criado antes do pagamento (Stripe/Appmax) ou no webhook (Yampi); idempotência de pedido por cart_id/idempotency_key; webhooks idempotentes por event_id/event_hash/external_reference.
- **Gaps principais:** (1) sem timeout nas chamadas de checkout → risco de load infinito; (2) admin Orders sem paginação → risco de carga total; (3) Stripe server-side sem Idempotency-Key → risco de dupla cobrança em retry; (4) retorno do gateway com mensagem genérica após timeout de polling; (5) ausência de correlation/request_id no fluxo comprador.
- **Alternância provider:** já existe em Admin (CheckoutSettings) via toggles Stripe/Yampi e config; falta centralizar em uma única “checkout_settings” e expor “modo” e “experiência” de forma unificada (PR4/PR5).

---

## 7. Próximos passos (após PR0)

- **PR1:** Observabilidade + eliminar load infinito: correlation_id/request_id, timeouts e fallback UI, logging estruturado, paginação/timeout no admin.
- **PR2:** Reforçar idempotência: chave única por tentativa, garantir que Stripe use Idempotency-Key nas chamadas de API, padronizar quem cria o pedido.
- **PR3:** Webhooks: assinatura, tabela de eventos com status/erro, processamento idempotente e regras de ordem.
- **PR4:** Checkout router mínimo que delega para implementações existentes e retorna shape unificado.
- **PR5:** Checkout_settings (Supabase) + tela Admin “Checkout & Pagamentos” com 1-clique e health check.
- **PR6:** Conciliação + reprocessamento (sync status, reprocessar webhooks com erro, timeline do pedido).
- **PR7:** Testes mínimos e checklist manual P0.

---

## 8. PR1 — Entregue (Observabilidade + “Mata load infinito”)

- **request_id / correlation:** `src/lib/checkoutClient.ts` — `generateRequestId()`, `invokeCheckoutFunction()` propaga `request_id` no body e header `x-request-id`. CheckoutStart e Checkout usam em todas as chamadas de checkout.
- **Timeouts:** Todas as chamadas de checkout usam `invokeCheckoutFunction` com timeout de 20s (configurável). Em timeout: erro "Não conseguimos concluir. Tente novamente.".
- **Fallback UI:** CheckoutStart: botões "Tentar novamente" e "Voltar ao carrinho" em caso de erro; retry via `retryTrigger`. Checkout: toast + `setPaymentError` com sugestão; para timeout, sugestão "Verifique sua conexão e tente novamente.".
- **Duplo clique:** Checkout já usa `submitInProgressRef` e botão `disabled={isLoading || isSubmitted}`.
- **Logging estruturado:** checkout-create-session, stripe-create-intent, process-payment e stripe-webhook logam JSON com `scope`, `request_id`, `provider`, `order_id`, `action`/`event_type` (sem dados sensíveis).
- **Admin Orders:** Query com `.range(0, 49)` (limite 50), timeout 15s na queryFn; em erro ou timeout, bloco "Não foi possível carregar os pedidos" + botão "Tentar novamente" (`refetch()`).

---

## 9. PR2 — Entregue (Idempotência e anti-duplicação)

- **Chave única por tentativa:** Já existente no DB: `orders.idempotency_key` e `orders.cart_id` com UNIQUE (migrations 20260223160527, 20260227160751, 20260227175940, 20260227200000). Front usa `idempotency_key = cartId` e trata 23505 redirecionando para pedido existente.
- **Stripe Idempotency-Key:** Em `supabase/functions/stripe-create-intent/index.ts`:
  - `stripe.paymentIntents.create(intentParams, { idempotencyKey: \`pi_${order_id}\` })` (linha ~287).
  - `stripe.checkout.sessions.create(sessionParams, { idempotencyKey: \`cs_${order_id}\` })` (linha ~494).
  Retries com o mesmo `order_id` recebem o mesmo PaymentIntent/Session do Stripe, sem segunda cobrança.
- **process-payment (Appmax) anti-duplicação:** Em `supabase/functions/process-payment/index.ts`, no início do bloco `action === "create_transaction"` (após destructuring do payload): busca do pedido por `order_id`; se `status` ∈ `['processing','paid','shipped','delivered']` ou `appmax_order_id` já preenchido, retorna 200 com `{ success: true, appmax_order_id, idempotent: true }` sem chamar a API Appmax. Log estruturado com `idempotent: true, reason: "order_already_charged"`.
- **Evidência:** Duplo clique ou retry no mesmo pedido não duplicam cobrança (Stripe por idempotency key; Appmax por guard no process-payment). Pedido único garantido por UNIQUE no DB.

---

## 10. PR3 — Entregue (Webhooks: assinatura, tabela com status/erro, idempotência e regras)

- **Assinatura:** Stripe webhook já valida assinatura com `stripe.webhooks.constructEventAsync(body, signature, webhookSecret)`; sem signature ou secret → 400. (`supabase/functions/stripe-webhook/index.ts` linhas 35–58.)
- **Tabela de eventos com status/erro:** Migration `20260301190100_stripe_webhook_events_processed_at_error.sql` adiciona em `stripe_webhook_events`: `processed_at timestamptz NULL`, `error_message text NULL`; índices parciais para `processed_at` e para eventos com erro. Após processar com sucesso o webhook atualiza `processed_at = now()` e `error_message = null`; em catch atualiza `processed_at = now()` e `error_message = <mensagem>`. Permite listar eventos com falha e reprocessar (UI em PR6).
- **Processamento idempotente:** Insert em `stripe_webhook_events` com `event_id` UNIQUE; 23505 → 200 `{ received: true, duplicate: true }` sem reprocessar. Já existente.
- **Regras de ordem:** Status do pedido não regride: webhook Stripe só seta `paid`, `failed`, `cancelled`, `refunded`, `disputed`; não seta `pending`. Appmax já tem regras de precedência no appmax-webhook. Documentado como evidência de não-regressão.

---

## 11. PR4 — Entregue (Checkout router mínimo + shape unificado)

- **Router:** Nova edge function `checkout-router` (`supabase/functions/checkout-router/index.ts`) recebe POST com `route` + payload e delega para as implementações existentes:
  - `route: "resolve"` → `checkout-create-session` (body com `action: "resolve"`);
  - `route: "create_gateway_session"` → `checkout-create-session` (body com `items`, `attribution`, etc.);
  - `route: "stripe_intent"` → `stripe-create-intent` (body com `create_payment_intent` / `create_checkout_session`, `order_id`, etc.);
  - `route: "process_payment"` → `process-payment` (body com `action: "tokenize_card"` ou `create_transaction`, etc.).
  Delegação via HTTP para `SUPABASE_URL/functions/v1/<target>` com timeout 22s; encaminha `Authorization` e `x-request-id`.
- **Shape unificado de resposta:** Todas as respostas do router têm `success: boolean` e opcionalmente `error: string` no top level; o restante do payload do alvo é repassado (flow, redirect_url, client_secret, appmax_order_id, etc.). Erro de rede ou do alvo → `success: false` e `error` preenchido.
- **Cliente:** Em `src/lib/checkoutClient.ts` foram adicionados `CheckoutRouterResponse<T>`, tipo do shape unificado, e `invokeCheckoutRouter(route, payload, requestId?, timeoutMs?)` para chamar o router. O front pode continuar usando `invokeCheckoutFunction` nas funções diretas ou migrar para `invokeCheckoutRouter` para uma única entrada e resposta unificada.

---

## 12. PR5 — Entregue (checkout_settings + tela “Checkout & Pagamentos” com health check)

- **checkout_settings (Supabase):** View `public.checkout_settings` (migration `20260301200000_checkout_settings_view.sql`) unifica a leitura em uma única linha: `id`, `enabled`, `active_provider`, `fallback_to_native`, `updated_at`, `checkout_mode` (extraído do config do provider ativo), `experience` (transparent | gateway derivado de provider + checkout_mode). Fonte: `integrations_checkout` + `integrations_checkout_providers`. SELECT concedido a anon, authenticated e service_role.
- **Tela Admin “Checkout & Pagamentos”:** A tela em `/admin/checkout-transparente` já exibia o título “Checkout & Pagamentos”; o menu lateral foi atualizado para o label **“Checkout & Pagamentos”** em `src/pages/admin/AdminLayout.tsx`. Alternância 1-clique (Stripe/Yampi) e configuração por provider permanecem como antes.
- **Health check:** Novo card “Saúde do checkout” em `src/pages/admin/CheckoutSettings.tsx` (componente `CheckoutHealthCard`): botão “Verificar saúde do checkout” chama `checkout-create-session` com `action: "resolve"` e exibe flow + provider em caso de sucesso, ou erro em caso de falha; toast de feedback e indicador visual (CheckCircle2 / XCircle).

---

## 13. PR6 — Entregue (Conciliação + reprocessamento + timeline do pedido)

- **Sync status (conciliação):** A Edge Function `reconcile-order` já existia: recebe `POST { order_id }`, consulta o Stripe (`paymentIntents.retrieve`), e se `pi.status === "succeeded"` atualiza o pedido para `paid` e insere/atualiza registro em `payments`. Na tela Admin **Pedidos** (`src/pages/admin/Orders.tsx`), no diálogo de detalhes do pedido, foi adicionado o botão **"Conciliar com Stripe"** para pedidos com `provider === 'stripe'` e `transaction_id` preenchido; ao clicar, chama `reconcile-order` com o JWT do admin e exibe toast com resultado (previous_status → new_status ou mensagem "Nada a atualizar").
- **Reprocessar webhooks com erro:** Nova Edge Function `reprocess-stripe-webhook` (`supabase/functions/reprocess-stripe-webhook/index.ts`): recebe `POST { event_id }` com Authorization Bearer, valida que o evento existe em `stripe_webhook_events`, busca o evento na API Stripe (`stripe.events.retrieve(event_id)`), reexecuta a mesma lógica de tratamento dos eventos (payment_intent.succeeded, payment_intent.payment_failed, charge.refunded, etc.) e atualiza a linha em `stripe_webhook_events` com `processed_at` e `error_message` (null em sucesso). Ação admin `list_failed_webhook_events` adicionada em `admin-commerce-action`: retorna lista de eventos com `error_message` não nulo (até 100, ordenados por `created_at` desc). Na tela **Commerce Health** (`src/pages/admin/CommerceHealth.tsx`), novo card **"Webhooks Stripe com erro"** lista esses eventos (event_id, event_type, error_message, created_at) e botão **"Reprocessar"** por linha que chama `reprocess-stripe-webhook`; após sucesso a lista é invalidada.
- **Timeline do pedido:** No diálogo de detalhes do pedido (Admin > Pedidos), nova seção **"Timeline"** exibe: (1) data/hora de criação do pedido (`created_at`), (2) última atualização (`updated_at`) e, quando existir, o último evento de webhook (`last_webhook_event`), em formato legível (dd/MM/yyyy às HH:mm).

---

## 14. PR7 — Entregue (Testes mínimos e checklist manual P0)

- **Checklist manual P0:** Documento `docs/CHECKLIST_MANUAL_P0.md` com passos para verificação manual dos três riscos P0: (P0-1) Admin Pedidos com paginação/limit 50 e timeout 15s; (P0-2) Checkout com timeout 20s e mensagem única; (P0-3) Stripe com Idempotency-Key em PaymentIntent e Checkout Session. Cada item tem evidência no código e resultado esperado.
- **Testes mínimos:** (1) `src/test/checkout-client.test.ts`: `generateRequestId` retorna UUID; `DEFAULT_CHECKOUT_TIMEOUT_MS` é 20000 (exportado para teste). (2) `src/test/idempotency-guards.test.ts`: réplica da regra do process-payment (Appmax) — `orderAlreadyCharged(status, appmaxOrderId)` retorna true para status processing/paid/shipped/delivered ou quando `appmax_order_id` está preenchido. (3) `src/test/webhook-security.test.ts`: adicionado teste de que `reprocess-stripe-webhook` sem Authorization retorna 401. Testes existentes (reconcile-order, webhook-security Stripe/reconcile) mantidos.

---

*Documento gerado no âmbito do PR0 — Auditoria 360° (sem alteração de código).*
