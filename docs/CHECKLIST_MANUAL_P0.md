# Checklist manual P0 (PR7)

Verificação manual dos riscos P0 mitigados nos PRs 1–6. Executar antes de release ou após mudanças no checkout/admin.

---

## P0-1 — Admin Orders: paginação e timeout

**Risco original:** Carga total de pedidos pode travar ou dar timeout.

**Mitigação (PR1):** Query com `.range(0, 49)` e timeout de 15s na `queryFn`.

| Passo | Ação | Resultado esperado |
|-------|------|--------------------|
| 1 | Abrir **Admin → Pedidos** com muitos pedidos (ex.: >50). | Lista mostra no máximo 50 pedidos; não trava. |
| 2 | Inspecionar código: `src/pages/admin/Orders.tsx` — constante `ADMIN_ORDERS_PAGE_SIZE = 50` e `.range(0, ADMIN_ORDERS_PAGE_SIZE - 1)`. | Confirmar uso de `range` e limite 50. |
| 3 | (Opcional) Simular timeout (throttling de rede) e recarregar Pedidos. | Após ~15s aparece "Não foi possível carregar os pedidos" + botão "Tentar novamente". |

**Evidência no código:** `Orders.tsx` ~84–98: `ADMIN_ORDERS_TIMEOUT_MS = 15000`, `Promise.race` com timeout, `.range(0, ADMIN_ORDERS_PAGE_SIZE - 1)`.

---

## P0-2 — Checkout: timeout nas chamadas

**Risco original:** Usuário pode ficar em “loading” indefinido.

**Mitigação (PR1):** Todas as chamadas de checkout usam `invokeCheckoutFunction` com timeout de 20s e mensagem única ao falhar.

| Passo | Ação | Resultado esperado |
|-------|------|--------------------|
| 1 | Inspecionar `src/lib/checkoutClient.ts`: `DEFAULT_CHECKOUT_TIMEOUT_MS = 20000` e `Promise.race([invokePromise, timeoutPromise])`. | Timeout configurado e usado no race. |
| 2 | Em `CheckoutStart.tsx` e `Checkout.tsx`, confirmar que as chamadas às Edge Functions usam `invokeCheckoutFunction` (ou `invokeCheckoutRouter`) e não `supabase.functions.invoke` direto. | Nenhum invoke direto sem timeout. |
| 3 | (Opcional) Simular timeout (ex.: desligar backend) e iniciar checkout. | Após ~20s: erro “Não conseguimos concluir. Tente novamente.” e opções “Tentar novamente” / “Voltar ao carrinho”. |

**Evidência no código:** `checkoutClient.ts`: timeout 20s, rejeição com mensagem única; `CheckoutStart.tsx` / `Checkout.tsx`: uso de `invokeCheckoutFunction` / `invokeCheckoutRouter`.

---

## P0-3 — Stripe: Idempotency-Key nas chamadas de API

**Risco original:** Retry pode criar segunda cobrança.

**Mitigação (PR2):** Uso de `idempotencyKey` em `paymentIntents.create` e `checkout.sessions.create`.

| Passo | Ação | Resultado esperado |
|-------|------|--------------------|
| 1 | Abrir `supabase/functions/stripe-create-intent/index.ts`. | Arquivo existe. |
| 2 | Buscar por `idempotencyKey` ou `idempotency_key`. | Encontrado em `paymentIntents.create(..., { idempotencyKey: \`pi_${order_id}\` })` e em `checkout.sessions.create(..., { idempotencyKey: \`cs_${order_id}\` })`. |
| 3 | (Opcional) Em ambiente de teste, duas chamadas com o mesmo `order_id` para criar PaymentIntent. | Segunda chamada retorna o mesmo PaymentIntent (sem nova cobrança). |

**Evidência no código:** `stripe-create-intent/index.ts`: linhas ~287 (PaymentIntent) e ~494 (Checkout Session) com segundo argumento `{ idempotencyKey: ... }`.

---

## Resumo

- **P0-1:** Admin Pedidos com limite 50 e timeout 15s.
- **P0-2:** Checkout com timeout 20s e mensagem única.
- **P0-3:** Stripe com Idempotency-Key em create PaymentIntent e create Checkout Session.

Assinatura: _________________________ Data: __________
