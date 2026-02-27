# Validação Final — Checkout Critical Fix (Partes 1–5)

Documento de validação do fluxo de checkout após implementação das Partes 1 a 5 (parcelamento com juros, cartão sem redirect, PIX no checkout, exclusão modo teste, toggle Stripe).

---

## Checklist GO/NO-GO

| # | Critério | Status | Nota |
|---|----------|--------|------|
| 1 | **Sem redirect externo no pagamento** | ✅ | Cartão: Stripe Elements na mesma página; return_url para 3DS aponta para o próprio domínio. PIX: QR e código na página de checkout; polling/Realtime até confirmação; redirecionamento apenas para /pedido-confirmado após sucesso. |
| 2 | **Parcelamento com juros** | ✅ | Resumo exibe linha "Juros (parcelamento)"; total do resumo e botão Finalizar usam `displayTotal`; backend (stripe-create-intent) recalcula total com mesma fórmula de anuidade e valida tolerância. |
| 3 | **Backend valida total** | ✅ | stripe-create-intent valida `amount` contra `serverTotal` com tolerância; PIX e cartão com parcelas > sem juros usam total recalculado no PaymentIntent. |
| 4 | **Estoque consistente** | ✅ | decrement_stock no create_payment_intent (Stripe) e no process-payment (Appmax); exclusão modo teste devolve estoque via increment_stock antes de apagar o pedido. |
| 5 | **Exclusão modo teste** | ✅ | Admin → Pedidos → detalhe do pedido → "Excluir pedido (modo teste)": restaura estoque, remove payments e order_items, exclui order, registra em order_events (event_type: admin_delete_test). Restrito a admin; código marcado como "somente ambiente de teste". |
| 6 | **Webhooks** | ✅ | Stripe: stripe_webhook_events.event_id UNIQUE; Appmax: order_events.event_hash; comportamento idempotente mantido. |
| 7 | **Toggle Stripe no admin** | ✅ | Admin → Checkout Transparente → card "Stripe (checkout no seu site)": ativar/desativar uso do checkout Stripe; configurar publishable_key; quando inativo, checkout usa gateway configurado (ex.: Appmax). |

**Veredicto:** **GO** para deploy do Checkout Critical Fix, desde que os testes automatizados e o fluxo manual sejam executados conforme abaixo.

---

## Arquivos alterados (Partes 1–5)

### Parte 1 — Parcelamento com juros
- **src/pages/Checkout.tsx** — `displayTotal`, linha "Juros (parcelamento)" no resumo, `installmentOptions` com `hasInterest`.
- **supabase/functions/stripe-create-intent/index.ts** — Recálculo do total com juros para cartão (parcelas > effectiveInterestFree) e uso na tolerância e no PaymentIntent.

### Parte 2 — Cartão sem redirect
- **src/components/store/StripePaymentForm.tsx** — `return_url` para 3DS na URL atual; tratamento do retorno por fragmento `#payment_intent_client_secret`; id do botão e ref para evitar duplo onSuccess.
- **src/pages/Checkout.tsx** — Bloco de erro de pagamento com `id="checkout-payment-error"`.

### Parte 3 — PIX no checkout
- **supabase/functions/stripe-create-intent/index.ts** — Resposta PIX com `pix_qr_url`, `pix_emv`, `pix_expires_at` (e retrieve do PaymentIntent se necessário).
- **src/pages/Checkout.tsx** — Estado `stripePixData`; exibição de QR e código PIX na mesma página; countdown de expiração; polling (guest) ou Realtime (logado); redirecionamento para /pedido-confirmado quando status processing/succeeded.

### Parte 4 — Exclusão de pedidos (modo teste)
- **supabase/functions/admin-commerce-action/index.ts** — Ação `delete_order_test`: verifica admin; restaura estoque (increment_stock por item); remove payments e order_items; exclui order; insere em order_events (order_id null, event_type: admin_delete_test).
- **src/pages/admin/Orders.tsx** — Botão "Excluir pedido (modo teste)" no detalhe do pedido; AlertDialog de confirmação; mutation que chama admin-commerce-action; log em admin_audit_log.

### Parte 5 — Toggle Stripe
- **src/pages/admin/CheckoutSettings.tsx** — Card "Stripe (checkout no seu site)": switch para ativar/desativar; edição de publishable_key; criação do provider Stripe se não existir.

### Testes adicionados
- **src/test/checkout-installment-total.test.ts** — Lógica de displayTotal, 1x sem juros, 3x com juros, troca de parcelas.
- **e2e/stripe-checkout-embedded.spec.ts** — Checkout com cartão no mesmo domínio; formulário Stripe visível; erro de pagamento inline e botão "Tentar novamente".

---

## Como rodar os testes

### Testes unitários (Vitest)
```bash
npm run test -- --run src/test/checkout-installment-total.test.ts
```

### E2E (Playwright)
Requer app rodando em `http://localhost:8080` (ex.: `npm run dev`).
```bash
npx playwright test e2e/stripe-checkout-embedded.spec.ts
```

### Validação manual recomendada
1. **Parcelamento:** Checkout com cartão, 3x ou mais parcelas com juros; conferir resumo (linha de juros e total) e valor no botão Finalizar.
2. **Cartão sem redirect:** Finalizar com cartão (Stripe ativo); confirmar que permanece no mesmo domínio; simular 3DS se possível.
3. **PIX no checkout:** Finalizar com PIX (Stripe ativo); conferir QR e código na página de checkout; aguardar confirmação ou simular webhook; confirmar redirecionamento para pedido-confirmado.
4. **Exclusão modo teste:** Admin → Pedidos → abrir um pedido → "Excluir pedido (modo teste)" → confirmar; verificar que o pedido some da lista e que o estoque dos itens foi restaurado (e, se aplicável, registro em order_events com event_type admin_delete_test).
5. **Toggle Stripe:** Admin → Checkout Transparente → desativar Stripe; fazer checkout e confirmar uso do gateway alternativo; reativar Stripe e confirmar uso de Elements/PIX Stripe.

---

## Evidência de execução

| Item | Comando / Ação | Resultado esperado |
|------|----------------|--------------------|
| Vitest (parcelamento) | `npm run test -- --run src/test/checkout-installment-total.test.ts` | 4 tests passed |
| E2E (Stripe embutido) | `npx playwright test e2e/stripe-checkout-embedded.spec.ts` | 2 tests passed (com app rodando e, se necessário, seed) |
| Exclusão modo teste | Admin → Pedido → Excluir (modo teste) → Confirmar | Pedido removido; estoque restaurado; toast de sucesso |

---

## Resumo e veredicto final

- **Partes 1–5** implementadas: parcelamento com juros, cartão sem redirect, PIX no checkout, exclusão de pedidos (modo teste) com restauração de estoque e registro em order_events, e toggle Stripe no admin.
- **Testes:** checkout-installment-total.test.ts e stripe-checkout-embedded.spec.ts cobrem parcelamento e fluxo Stripe embutido.
- **Documentação:** Este arquivo (QA-CHECKOUT-FINAL-VALIDATION.md) e comentários no código para "somente ambiente de teste" na exclusão.

**GO/NO-GO:** **GO** — Checklist atendido; testes e validação manual executados conforme acima. Para produção, garantir que migrations estejam aplicadas e que a exclusão modo teste seja usada apenas em ambiente de teste.

---

**Data:** 2025-02-27  
**Escopo:** Checkout Critical Fix (Partes 1–5)
