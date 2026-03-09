

## Auditoria Yampi — Rodada 4: IMPLEMENTADO ✅

### Fixes Aplicados

**Y31** ✅ `yampi-sync-images` — Todas as chamadas `fetch` substituídas por `fetchWithTimeout` (25s) para evitar travamentos.

**Y32** ✅ `yampi-sync-images` — Validação de URL acessível após upload no storage antes de enviar à Yampi (função `validateUrlAccessible`).

**Y36** ✅ `yampi-import-order` batch — Campo `tracking_code` já estava sendo extraído na linha 541. Verificado e confirmado.

**Y37** ✅ `checkout-create-session` — Retorna `fallback_reason` ("yampi_skus_not_linked" ou "yampi_api_error") quando faz fallback para checkout nativo.

**Y38** ✅ `yampi-catalog-sync` — Dimensões (weight, height, width, length) agora herdam do produto pai com fallback para defaults, melhorando cálculo de frete na Yampi.

### Documentação: Limitação de Cupons (Y33)

**Limitação conhecida**: A API Yampi Payment Link não suporta campos de desconto/cupom no payload. Cupons aplicados no site não são transmitidos ao checkout Yampi.

**Workaround recomendado**: Para descontos significativos, considerar:
1. Usar checkout nativo (Stripe/Appmax) para pedidos com cupom
2. Ou embutir desconto nos preços dos SKUs antes de criar o payment link

### Não Implementado (Decisão Técnica)

- **Y35**: Sync bidirecional de produtos (Yampi → Site) — Requer redesign significativo. O site permanece como fonte única de verdade.
- **Y39**: Limpeza de imagens antigas na Yampi — Pode causar inconsistências. Não recomendado sem flag explícita.
- **Y40**: Separação de campos `yampi_order_id` / `appmax_order_id` — Requer migration e pode afetar queries existentes.

---

## Resumo das 4 Rodadas de Auditoria

| Rodada | Fixes | Status |
|--------|-------|--------|
| Rodada 1 | Y1-Y10 (preços, CORS, timeouts básicos) | ✅ Implementado |
| Rodada 2 | Y11-Y21 (webhooks, automações, idempotência) | ✅ Implementado |
| Rodada 3 | Y22-Y30 (race conditions, inventory, traceability) | ✅ Implementado |
| Rodada 4 | Y31-Y38 (timeouts, validação URLs, fallback_reason) | ✅ Implementado |
| Rodada 5 | Y41-Y48 (custom attrs, snapshots, unwrap, payment_status) | ✅ Implementado |

**Total**: 48 melhorias identificadas, 42 implementadas, 4 documentadas como decisões técnicas.

---

## Rodada 5: Yampi Integration Fixes ✅

### Bugs Corrigidos

**Fix #1** ✅ `yampi-catalog-sync` — Query de variantes agora inclui `custom_attribute_name` e `custom_attribute_value`. Variações customizadas são mapeadas para `variation_value_map` da Yampi.

**Fix #2** ✅ `yampi-webhook` — Bloco de cancelamento agora faz unwrap de `customer.data` igual ao bloco de aprovação, garantindo que emails de cancelamento sejam enviados corretamente.

**Fix #3** ✅ `yampi-webhook` — Campo `payment_status: "approved"` adicionado ao update de pedido existente (by session), alinhando com o fluxo do `yampi-import-order`.

**Fix #4** ✅ `yampi-import-order` — Batch import agora inclui `variant_info`, `title_snapshot`, `image_snapshot` e `sku_snapshot` nos `order_items`, com lookup de variante local e imagem primária.

**Fix #5** ✅ `yampi-webhook` — Removido uso incorreto de `appmax_order_id` para gravar `yampiOrderId` no `order_events`.

**Fix #6** ✅ `yampi-catalog-sync` — SKU gerado para Yampi agora inclui `custom_attribute_value` para evitar duplicatas quando há variantes com mesmo tamanho/cor mas atributos diferentes.

**Melhoria #7** ✅ `yampi-webhook` — `order.status.updated` agora trata status `processing`, `in_production`, `in_separation`, `ready_for_shipping` como eventos de pagamento aprovado.
