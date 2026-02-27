# Reserva de estoque e TTL (expiração)

## Comportamento atual

- **Stripe:** Estoque é baixado no `stripe-create-intent` (criação do PaymentIntent). Se o cliente não pagar, o Stripe envia `payment_intent.canceled` ou `payment_intent.payment_failed` e o webhook devolve o estoque via `restoreStock`.
- **Appmax:** Estoque é baixado no `process-payment` ao criar a transação; em cancelamento o webhook chama `cancel_order_return_stock`.

Não há reserva com TTL explícita: a “reserva” é a baixa imediata, e a liberação é feita pelo webhook (cancelado/falha) ou por job de limpeza (ver abaixo).

## Expiração de reserva (TTL) — recomendação

Para evitar estoque preso quando o usuário abandona sem pagar e o gateway não envia cancel:

1. **TTL sugerido:** 15 minutos a partir da criação do PaymentIntent (ou da criação do pedido com `transaction_id`).
2. **Implementação:** Job agendado (cron) ou Edge Function agendada que:
   - Lista pedidos com `status = 'pending'`, `provider = 'stripe'`, `transaction_id` preenchido e `created_at` (ou `updated_at`) há mais de 15 minutos.
   - Para cada um, consulta o Stripe (`paymentIntents.retrieve`): se status for `canceled` ou não for `succeeded`, chama a mesma lógica de `restoreStock` e atualiza o pedido para `cancelled` com nota “Reserva expirada (TTL 15 min)”.
3. **Alternativa:** Stripe permite [cancelar PaymentIntents automaticamente](https://stripe.com/docs/payments/payment-intents/automatic-cancellation) (ex.: 24h); o webhook `payment_intent.canceled` já devolve o estoque. Para TTL de 15 min seria necessário cancelar o PI via API no job e deixar o webhook fazer a devolução.

## Documentação de comportamento

| Cenário | Ação | Resultado |
|--------|------|-----------|
| Cliente paga (PIX/cartão) | Webhook `payment_intent.succeeded` | Pedido → paid, estoque permanece baixado. |
| Cliente desiste / não paga | Webhook `payment_intent.canceled` ou `payment_failed` | Estoque devolvido, pedido → cancelled/failed. |
| Webhook de cancelamento não chega | Job TTL (futuro) ou cancelamento manual do PI no Stripe | Estoque devolvido quando o PI for cancelado e o webhook processado. |

Até existir job de TTL, a garantia é: **qualquer evento de cancelamento/falha do Stripe devolve o estoque**. Para reduzir estoque preso, configurar no Stripe o cancelamento automático de PaymentIntents não confirmados quando possível.
