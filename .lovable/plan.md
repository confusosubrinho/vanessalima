

# Auditoria Yampi — Rodada 2: Problemas Adicionais

Apos revisao completa de todos os arquivos Yampi e do checkout-router, encontrei mais problemas que nao foram cobertos na rodada anterior.

---

## Problemas Encontrados

### CRITICO

**Y14. checkout-router: Reserva de estoque Yampi external insere movement mesmo quando decrement_stock falha**
- `checkout-router/index.ts` linhas 322-334 — Mesmo bug corrigido em Y1/Y2, mas **nao corrigido no checkout-router**. O `inventory_movements.insert` roda incondicionalmente apos `decrement_stock`, mesmo quando retorna `success: false`.
- Impacto: Inconsistencia de estoque no fluxo principal de checkout Yampi externo.

**Y15. yampi-catalog-sync: SKU CREATE para variantes nao envia `quantity` (estoque)**
- `yampi-catalog-sync/index.ts` linhas 348-362 — O payload de criacao de SKU para produtos com variacoes nao inclui o campo `quantity`. Apenas o SKU inline de produtos simples foi corrigido (Y9). Variantes criadas ficam com estoque zero na Yampi.
- Impacto: Todos os produtos com variacoes aparecem "esgotados" na Yampi apos sync de catalogo.

### ALTO

**Y16. yampi-webhook: Evento de cancelamento insere NOVO payment em vez de atualizar o existente**
- `yampi-webhook/index.ts` linhas 606-616 — Quando chega um evento de cancelamento, o webhook insere um novo registro em `payments` com status "cancelled"/"refused", mesmo que ja exista um pagamento "approved" para o mesmo pedido. Isso cria registros duplicados.
- Impacto: A tabela `payments` pode ter 2+ registros para o mesmo pedido, inflando relatorios financeiros. O `commerce_health` detecta isso como "duplicate_payments".

**Y17. yampi-webhook: email_automation_logs inserido sem automation_id**
- `yampi-webhook/index.ts` linhas 206 e 454 — Insere log com `recipient_email` e `status: "pending"` mas sem `automation_id`. Como `automation_id` referencia `email_automations`, esse log fica orfao e nenhuma automacao sera disparada.
- Impacto: Nenhum email pos-compra e realmente enviado via automacao, mesmo com automacoes configuradas.

**Y18. yampi-webhook: Erro logado em tabela `app_logs` que pode nao existir**
- `yampi-webhook/index.ts` linhas 633-638 — O catch global tenta inserir em `app_logs`, mas essa tabela nao aparece no schema. Existe `appmax_logs` mas nao `app_logs`. O insert falha silenciosamente.
- Impacto: Erros criticos do webhook Yampi nao sao registrados.

### MEDIO

**Y19. yampi-import-order: Batch `importSingleOrder` gera endereco incompleto**
- `yampi-import-order/index.ts` linhas 482-487 — A funcao batch extrai apenas `street`, `city`, `state`, `zip` sem incluir `number`, `neighborhood`, `complement`. A funcao principal (linhas 176-184) monta o endereco completo com todos esses campos.
- Impacto: Pedidos importados em batch ficam com endereco de entrega incompleto.

**Y20. yampi-sync-sku: Path de variante unica (single variant) nao tem delay antes da resposta**
- `yampi-sync-sku/index.ts` linhas 62-72 — Quando sincroniza uma unica variante, nao ha delay. Se o admin clicar rapidamente em "sync" para varias variantes, pode exceder o rate limit da Yampi.
- Impacto: Menor que Y6 (corrigido no loop), mas inconsistente.

**Y21. yampi-sync-categories: Nao usa fetchWithTimeout**
- `yampi-sync-categories/index.ts` — Todas as chamadas usam `fetch` direto sem timeout. Se a API Yampi travar, a Edge Function pode atingir o timeout de 60s do Deno sem tratamento.
- Impacto: Funcao pode "pendurar" sem resposta util.

---

## Plano de Implementacao

### Fase 1 — Integridade de Dados (Risco: BAIXO)
1. **Y14**: checkout-router — condicionar `inventory_movements.insert` ao sucesso de `decrement_stock`
2. **Y15**: yampi-catalog-sync — adicionar `quantity: variant.stock_quantity` ao SKU CREATE de variantes
3. **Y16**: yampi-webhook — no cancelamento, atualizar o payment existente em vez de criar novo (ou verificar idempotencia antes de inserir)

### Fase 2 — Correcoes Funcionais (Risco: BAIXO)
4. **Y17**: yampi-webhook — buscar automacao ativa do tipo `order_confirmed` e vincular `automation_id` ao log
5. **Y18**: yampi-webhook — trocar `app_logs` por `appmax_logs` ou `error_logs` (tabela que existe)
6. **Y19**: yampi-import-order batch — unificar logica de endereco com a funcao principal

### Fase 3 — Robustez (Risco: ZERO)
7. **Y20**: yampi-sync-sku — adicionar delay no path de single variant
8. **Y21**: yampi-sync-categories — substituir `fetch` por `fetchWithTimeout`

---

## Detalhes Tecnicos

### Y14 — Fix no checkout-router (linhas 322-334)
Condicionar o insert de `inventory_movements` ao resultado do `decrement_stock`:
```typescript
const stockResult = await supabase.rpc("decrement_stock", { ... });
const stockData = stockResult.data as { success: boolean };
if (stockData?.success) {
  await supabase.from("inventory_movements").insert({ type: "reserve", ... });
}
```

### Y15 — Fix no yampi-catalog-sync (linha 348-362)
Adicionar `quantity` ao payload de criacao de SKU de variantes:
```typescript
const skuPayload = {
  ...existingFields,
  quantity: variant.stock_quantity ?? 0,  // NOVO
};
```

### Y16 — Fix no yampi-webhook cancelamento (linhas 606-616)
Antes de inserir, verificar se ja existe payment para o pedido:
```typescript
const { data: existingPayment } = await supabase
  .from("payments").select("id").eq("order_id", existingOrder.id).maybeSingle();
if (existingPayment) {
  await supabase.from("payments")
    .update({ status: cancelledPaymentStatus }).eq("id", existingPayment.id);
} else {
  await supabase.from("payments").insert({ ... });
}
```

### Y18 — Fix tabela inexistente
Trocar `app_logs` por `error_logs` que ja existe e tem RLS policy para insert.

