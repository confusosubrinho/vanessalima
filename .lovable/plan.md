

# Auditoria Yampi — Rodada 3: Problemas Adicionais

---

## Problemas Encontrados

### CRITICO

**Y22. checkout-create-session: `price_cost` e `price_sale` identicos no fast sync (linhas 249-251)**
O fast sync executado dentro do `checkout-create-session` (quando `config.sync_enabled`) envia `price_cost: unitPrice, price_sale: unitPrice` — exatamente o mesmo bug corrigido em Y7 no `yampi-sync-sku` e `yampi-catalog-sync`, mas que permanece nesta terceira ocorrencia. Isso sobrescreve o preco de custo correto na Yampi toda vez que um cliente inicia o checkout.
- **Impacto**: Cada checkout Yampi reseta o custo do produto para o preco de venda na Yampi, destruindo dados de margem.
- **Fix**: Separar `price_cost` usando `variant.base_price ?? product.base_price` e `price_sale` usando o preco de venda calculado.

**Y23. checkout-create-session: Variavel global mutavel `_currentOrigin` causa race condition (linhas 6, 358-359)**
A variavel `let _currentOrigin` e definida no escopo global do modulo e atualizada a cada request (`_currentOrigin = req.headers.get("Origin")`). Em cenarios de concorrencia (multiplos requests simultaneos), um request pode usar o `Origin` de outro request na funcao `jsonRes`, retornando CORS headers errados.
- **Impacto**: Requests concorrentes podem falhar com CORS error ou, pior, permitir origens nao autorizadas.
- **Fix**: Passar `corsHeaders` como parametro para `jsonRes` (como ja feito no `checkout-router`) em vez de usar variavel global.

### ALTO

**Y24. checkout-release-expired-reservations: Nao registra `inventory_movements` de release (linhas 93-99)**
Quando pedidos expirados sao cancelados, o stock e restaurado via `increment_stock` mas nenhum `inventory_movement` do tipo "release" e inserido. Isso cria inconsistencia na tabela de auditoria — o estoque foi restaurado mas nao ha registro de por que.
- **Impacto**: Relatorios de movimentacao de estoque ficam incompletos. O `commerce_health` pode detectar divergencias entre estoque real e movimentos registrados.
- **Fix**: Apos cada `increment_stock`, inserir `inventory_movements` com `type: "release"` e `order_id`.

**Y25. checkout-create-session: Fast sync Yampi nao tem timeout nem tratamento de erro (linhas 240-263)**
O loop de sync de SKUs no checkout nao trata a resposta do `fetchWithTimeout`. Se a API Yampi retornar erro (429, 500), o checkout continua silenciosamente sem logar o problema. Alem disso, se o timeout de 25s for atingido em um SKU, o checkout inteiro falha com AbortError.
- **Impacto**: Checkout pode falhar ou ter SKUs desatualizados sem nenhum log.
- **Fix**: Envolver cada chamada PUT em try/catch e logar erros sem bloquear o checkout.

**Y26. yampi-sync-order-status: Nao usa fetchWithTimeout (linhas 93-94, 113-114)**
Todas as chamadas `fetch` para a API Yampi sao feitas sem timeout. Se a API travar, a Edge Function fica pendurada ate o timeout do Deno (60s).
- **Impacto**: Admin fica esperando indefinidamente ao tentar sincronizar status de pedido.
- **Fix**: Substituir `fetch` por `fetchWithTimeout`.

### MEDIO

**Y27. yampi-webhook: Evento shipped sobrescreve status de pedido "delivered" (linha 512-515)**
Se um evento `order.shipped` chegar DEPOIS de `order.delivered` (possivel em retransmissoes ou reprocessamento), o status do pedido e revertido de "delivered" para "shipped" — regressao de status.
- **Impacto**: Pedidos ja entregues podem aparecer como "enviados" no painel admin.
- **Fix**: Verificar se o status atual e "delivered" antes de atualizar para "shipped". Se ja esta delivered, ignorar.

**Y28. yampi-import-order batch: Nao insere `email_automation_logs` (linhas 562-573)**
A funcao `importSingleOrder` nao cria logs de automacao de email para pedidos importados, ao contrario do webhook (Y17 corrigido). Pedidos importados em batch nao disparam emails pos-compra.
- **Impacto**: Clientes de pedidos importados nao recebem email de confirmacao.
- **Fix**: Apos inserir o pagamento, buscar automacao ativa e inserir `email_automation_logs`.

**Y29. yampi-import-order batch: Nao insere `order_events` para rastreabilidade (todo o fluxo)**
A funcao batch nao registra nenhum `order_event` para o pedido importado. Isso dificulta a rastreabilidade e auditoria — nao ha como saber pelo `order_events` que um pedido foi importado manualmente.
- **Impacto**: Falta de rastreabilidade. Pedidos importados sao invisiveis no painel de eventos.
- **Fix**: Inserir um `order_event` com `event_type: "yampi_imported"` apos criar o pedido.

**Y30. yampi-webhook: Evento cancelled nao insere `email_automation_logs` para cancelamento**
Quando um pedido e cancelado, nenhum log de automacao de email de cancelamento e criado, mesmo que exista uma automacao configurada para `order_cancelled`.
- **Fix**: Buscar automacao ativa com `trigger_event: "order_cancelled"` e inserir log.

---

## Plano de Implementacao

### Fase 1 — Bugs Criticos (Risco: BAIXO)
1. **Y22**: checkout-create-session — corrigir `price_cost` vs `price_sale` no fast sync
2. **Y23**: checkout-create-session — eliminar variavel global `_currentOrigin`, passar corsHeaders como parametro

### Fase 2 — Integridade de Auditoria (Risco: BAIXO)
3. **Y24**: checkout-release-expired-reservations — inserir `inventory_movements` tipo "release"
4. **Y27**: yampi-webhook — verificar status atual antes de regredir de "delivered" para "shipped"
5. **Y25**: checkout-create-session — try/catch no fast sync Yampi
6. **Y26**: yampi-sync-order-status — substituir `fetch` por `fetchWithTimeout`

### Fase 3 — Melhorias de Rastreabilidade (Risco: ZERO)
7. **Y28**: yampi-import-order batch — inserir `email_automation_logs`
8. **Y29**: yampi-import-order batch — inserir `order_events` de importacao
9. **Y30**: yampi-webhook — inserir log de automacao de email no cancelamento

