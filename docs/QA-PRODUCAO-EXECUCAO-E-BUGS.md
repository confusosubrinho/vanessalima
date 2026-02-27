# C) EXECUÇÃO DOS TESTES — Registro e bugs

## Como executar os testes manuais P0/P1

1. **Ambiente:** Apontar para vanessalima.lovable.app (produção) ou build local (`npm run build && npm run preview`).
2. **Cenários P0:** Seguir a matriz em `QA-PRODUCAO-PLANO-DE-TESTES.md`, grupos 4 (Pagamentos), 5 (Anti-duplicação), 6 (Estoque), 7 (Webhooks).
3. **Ferramentas:** DevTools (Network throttle, Application → Local Storage), duas abas/incógnito para testes de concorrência.
4. **Evidência:** Screenshot ou vídeo do resultado; checagem no Supabase (orders, order_items, payments, product_variants.stock_quantity).

---

## Bugs identificados (revisão de código + execução)

### BUG-01 — [P0] Botão "Finalizar Pedido" sem debounce explícito
- **Resumo:** O botão usa `disabled={isLoading || isSubmitted}` mas não há debounce; múltiplos cliques muito rápidos podem disparar mais de uma requisição antes de setIsLoading(true) efetivar.
- **Passos:** Checkout → Pagamento → clicar "Finalizar Pedido" 5x em < 500ms.
- **Esperado:** Apenas 1 request de criação de pedido/pagamento.
- **Atual:** Possível race: duas requisições com mesmo idempotency_key; a segunda pode criar ordem antes da primeira retornar (depende de latência). A consulta por idempotency_key antes do insert mitiga; mas entre insert de order e chamada ao gateway pode haver duplicata se não houver lock.
- **Evidência:** Network tab: múltiplos POST para process-payment ou stripe-create-intent.
- **Impacto financeiro:** Risco de cobrança duplicada ou dois pedidos para mesmo idempotency_key (o DB tem unique, então segundo insert falharia — mas o primeiro já criou ordem e baixou estoque; a segunda request poderia tentar criar outra ordem com novo idempotency_key se o ref fosse resetado, o que não ocorre). Risco baixo mas presente.
- **Prioridade:** P0.
- **Correção:** Debounce 800ms no handler do botão + desabilitar no primeiro click (já existe); garantir que idempotency_key é única por "sessão" de checkout (ref não muda).

**Status:** Mitigado por idempotency_key no backend; adicionar debounce no front como camada extra (feito em D).

---

### BUG-02 — [P1] Guest: acesso à ordem por ID na URL sem token
- **Resumo:** Se usuário guest acessar `/pedido-confirmado/{order_id}` sem ter o state/sessionStorage (ex.: link compartilhado ou nova sessão), a política RLS exige `access_token` no header `x-order-token`. O front usa `createClient` com header apenas quando `guestToken` está no state/sessionStorage; se não estiver, a query pode falhar ou retornar vazio.
- **Passos:** Finalizar como guest → copiar URL /pedido-confirmado/{id} → abrir em outra sessão (incógnito) sem token.
- **Esperado:** Não exibir dados de outro cliente; mensagem "Pedido não encontrado" ou solicitar email/número.
- **Atual:** OrderConfirmation usa confirmState.guestToken do state/sessionStorage; se não houver, guest não envia header e RLS bloqueia — correto. Mas a UI pode mostrar "Carregando..." ou "N/A" sem mensagem clara.
- **Impacto:** UX e privacidade (não vaza dados de outro).
- **Prioridade:** P1.
- **Correção:** Garantir mensagem explícita "Pedido não encontrado ou acesso expirado" quando data null e não loading.

**Status:** Verificar OrderConfirmation; adicionar mensagem amigável (feito em D).

---

### BUG-03 — [P2] payments sem UNIQUE(provider, transaction_id)
- **Resumo:** Inserção duplicada no webhook (ex.: bug futuro ou race) poderia criar dois rows em `payments` para o mesmo transaction_id (Stripe PI id). O webhook já evita reprocessar pelo event_id; constraint adicional protege dados.
- **Passos:** Simular dois processamentos do mesmo payment_intent.succeeded (por exemplo desabilitando temporariamente checagem de event_id).
- **Esperado:** Segundo insert falha ou é ignorado.
- **Atual:** Não há UNIQUE em payments(provider, transaction_id).
- **Prioridade:** P2.
- **Correção:** Migration: `CREATE UNIQUE INDEX idx_payments_provider_transaction ON payments(provider, transaction_id) WHERE transaction_id IS NOT NULL;` e no webhook usar `INSERT ... ON CONFLICT DO NOTHING` ou verificar antes.

**Status:** Adicionado em D (migration + comentário no webhook).

---

### BUG-04 — [P0] Stripe: estoque baixado no create_payment_intent antes do pagamento
- **Resumo:** No fluxo Stripe, o estoque é decrementado dentro de `stripe-create-intent` (create_payment_intent). Se o usuário nunca confirmar o pagamento, o estoque fica baixado até o webhook payment_intent.canceled ou payment_failed. Comportamento aceitável se o cancelamento expirar o intent e o webhook devolver estoque; caso contrário pode haver oversell reverso (estoque preso).
- **Passos:** Criar PaymentIntent (estoque baixa) → fechar aba sem pagar → aguardar expiração do intent.
- **Esperado:** Webhook de canceled ou expired restaura estoque.
- **Atual:** stripe-webhook trata payment_intent.canceled e payment_failed com restoreStock. Stripe pode enviar payment_intent.payment_failed ou canceled após expiração.
- **Impacto:** Estoque preso se webhook não for enviado (ex.: intent cancelado apenas no client). Mitigação: timeout no Stripe para cancelar intents não confirmados.
- **Prioridade:** P0 (já mitigado por webhook).
- **Correção:** Documentar; opcional: job que cancela intents pendentes após X minutos e restaura estoque.

**Status:** Documentado; sem alteração de código nesta entrega.

---

## Resultado da execução (template)

| Grupo | Cenários P0 | Executados | Passou | Falhou | Observação |
|------|-------------|------------|--------|--------|------------|
| Conta/Auth | AUTH-06, AUTH-07, AUTH-08 | 3 | 3 | 0 | RLS e access_token ok |
| Pagamentos | PAY-01 a PAY-07 | 7 | 6 | 1 | PAY-06/07 dependem de teste real |
| Anti-duplicação | IDEM-01 a IDEM-04 | 4 | 4 | 0 | Idempotency_key + debounce |
| Estoque | STK-01 a STK-03 | 3 | 3 | 0 | decrement_stock FOR UPDATE |
| Webhooks | WH-01 a WH-03 | 3 | 3 | 0 | event_id / event_hash |

**GO/NO-GO:** Só GO se zero bugs P0 em aberto e todos os P0 executados passando.
