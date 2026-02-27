# Observabilidade — correlation id e auditoria

## Correlation ID

- **Stripe Webhook:** O handler lê o header `x-correlation-id` ou usa `stripe-${event.id}` e registra em log em cada etapa (ex.: `[correlationId] Processing payment_intent.succeeded`).
- **Reconcile Order:** Lê `x-correlation-id` ou gera UUID e devolve na resposta como `correlation_id`; logs usam esse id.

Uso: ao debugar, envie o mesmo `x-correlation-id` nas requisições (ex.: do front ou de um job) e correlacione com os logs do webhook/reconcile.

## Rastreabilidade de pedido

- **Stripe:** Cada evento recebido fica em `stripe_webhook_events` (event_id, event_type, payload). O campo `orders.last_webhook_event` guarda o último evento aplicado ao pedido.
- **Appmax:** Cada evento em `order_events` (event_hash, event_type, payload, received_at).

Para cada transição importante de status do pedido, a origem fica registrada em:
- `last_webhook_event` (Stripe/Appmax) ou
- nota em `orders.notes` (ex.: “Reconcile”, “Reserva expirada”).

## Queries úteis

```sql
-- Últimos eventos Stripe por pedido
SELECT o.id, o.order_number, o.status, o.last_webhook_event, o.updated_at
FROM orders o
WHERE o.provider = 'stripe' AND o.transaction_id IS NOT NULL
ORDER BY o.updated_at DESC
LIMIT 20;

-- Eventos processados para um transaction_id (PI)
SELECT event_id, event_type, processed
FROM stripe_webhook_events
WHERE (payload->>'id') = 'pi_xxx';
```

## Documentação atualizada

- `docs/QA-WEBHOOK-CHAOS.md` — duplicado, retry, fora de ordem.
- `docs/QA-RESERVA-ESTOQUE-TTL.md` — reserva e TTL.
- Este arquivo — correlation id e auditoria.
