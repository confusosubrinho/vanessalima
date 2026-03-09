

# Diagnóstico: Sincronização de Status de Pedidos com a Yampi

## Bugs Críticos Encontrados

### Bug 1 (CRÍTICO): `order.status.updated` com status intermediários re-executa fluxo de pagamento
**Arquivo:** `yampi-webhook/index.ts` linhas 59-62

Quando a Yampi envia `order.status.updated` com status `processing`, `in_production`, `in_separation` ou `ready_for_shipping`, o código trata como `order.paid`, o que redireciona para o bloco `approvedEvents`. Isso tenta **criar um novo pedido ou re-processar pagamento** em um pedido que já foi pago.

Cenário real: Pedido pago → Yampi envia status `in_production` → sistema tenta criar novo pedido duplicado ou re-debitar estoque.

### Bug 2: Sem handler para atualizações de status intermediárias
Não existe bloco para tratar transições como `processing → in_separation → ready_for_shipping → shipped`. Todas caem no fluxo de pagamento aprovado ou são ignoradas.

### Bug 3: Status `processing` não mapeado no `yampi-sync-order-status`
**Arquivo:** `yampi-sync-order-status/index.ts` linha 137

O mapeamento de status não inclui `processing`, `in_production`, `in_separation`, `ready_for_shipping` explicitamente. Eles caem no `else` padrão que é `processing`, mas por acidente.

### Bug 4: Webhook não protege contra re-processamento de pedidos já pagos
No bloco `approvedEvents`, se um pedido já existe por `checkout_session_id` com status `processing` ou `shipped`, o webhook re-executa o update completo (payment, customer, inventory), podendo duplicar movimentações.

### Bug 5: Falta tratamento de `refund` parcial
Yampi pode enviar `payment.refunded` para reembolsos parciais. O código atual cancela o pedido inteiro.

---

## Plano de Correções

### Correção 1: Criar bloco separado para status intermediários no webhook
Em vez de rotear `processing/in_production/in_separation/ready_for_shipping` para `order.paid`, criar uma nova categoria `statusUpdateEvents` que apenas atualiza o campo `status` do pedido sem re-processar pagamento.

```typescript
// ANTES (Bug):
else if (["processing", "in_production", "in_separation", "ready_for_shipping"].includes(statusValue)) {
  effectiveEvent = "order.paid"; // ERRADO - re-processa pagamento
}

// DEPOIS (Fix):
else if (["processing", "in_production", "in_separation", "ready_for_shipping"].includes(statusValue)) {
  effectiveEvent = "order.status_update"; // Novo evento que só atualiza status
}
```

Novo bloco handler:
```typescript
const statusUpdateEvents = ["order.status_update"];
if (statusUpdateEvents.includes(effectiveEvent)) {
  // Apenas atualiza status do pedido, sem mexer em pagamento/estoque
  const externalRef = resourceData?.order_id?.toString() || ...;
  // Busca pedido, atualiza status para "processing", loga evento
}
```

### Correção 2: Proteção contra re-processamento no bloco approved
Adicionar verificação: se o pedido encontrado por session já tem status `processing`, `shipped` ou `delivered`, pular re-processamento de pagamento e estoque.

### Correção 3: Completar mapeamento no `yampi-sync-order-status`
Adicionar status explícitos: `processing`, `in_production`, `in_separation`, `ready_for_shipping`, `invoiced`.

### Correção 4: Tratamento de refund vs cancelamento
Diferenciar `payment.refunded` (pode ser parcial, não cancela pedido) de `order.cancelled`.

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/yampi-webhook/index.ts` | Fix #1, #2, #4: novo bloco status_update, proteção re-processamento |
| `supabase/functions/yampi-sync-order-status/index.ts` | Fix #3: completar mapeamento de status |

## Impacto
- Elimina criação de pedidos duplicados quando Yampi envia status intermediários
- Previne re-debitação de estoque em pedidos já processados
- Mapeamento completo de todos os status possíveis da Yampi

