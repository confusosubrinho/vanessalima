# Webhook chaos — duplicado, retry, fora de ordem

## Comportamento garantido

### Duplicado (mesmo event_id)
- **Stripe:** Inserção em `stripe_webhook_events` com `event_id` UNIQUE. Segunda requisição com o mesmo `event.id` → constraint violation → retorno 200 `{ received: true, duplicate: true }`, processamento não repete.
- **Appmax:** `order_events.event_hash` UNIQUE; evento duplicado não insere e não reprocessa.

### Retry (Stripe reenvia o mesmo evento)
- Mesmo que duplicado: idempotência por `event_id`. Retornamos 200 para o Stripe parar de reenviar.

### Fora de ordem (ex.: payment_intent.succeeded depois de payment_intent.canceled)
- **Stripe:** Cada handler atualiza o pedido com o status do evento. Se chegar `succeeded` depois de `canceled`, o último update (succeeded) deixa o pedido como `paid`. Fonte da verdade é o Stripe: se o PI está succeeded, o pedido deve ficar paid.
- **Reconciliação:** A Edge Function `reconcile-order` consulta o Stripe e corrige o status do pedido (ex.: pagou mas order ficou pending).

## Estado final correto

- Sempre que `payment_intent.succeeded` for processado (ou reconciliado), o pedido fica `paid` e existe 1 registro em `payments` para esse `transaction_id`.
- Eventos de falha/cancelamento devolvem estoque e atualizam status para `failed`/`cancelled`.

## Eventos auditáveis

- **Stripe:** `stripe_webhook_events` — cada evento recebido com `event_id`, `event_type`, `payload`, `processed`.
- **Appmax:** `order_events` — cada evento com `event_hash`, `event_type`, `payload`, `received_at`.
- **Pedido:** `orders.last_webhook_event` indica o último evento aplicado.

Queries úteis:

```sql
-- Eventos Stripe por pedido (via transaction_id)
SELECT swe.event_id, swe.event_type, swe.processed
FROM stripe_webhook_events swe
JOIN orders o ON o.transaction_id = (swe.payload->>'id')
WHERE o.id = 'ORDER_UUID';
```
