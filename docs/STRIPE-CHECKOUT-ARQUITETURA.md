# Arquitetura Stripe Checkout (hosted) – e-commerce Lovable + Supabase

Este documento descreve o fluxo de pagamento com **Stripe Checkout** (página hospedada pela Stripe) no projeto, a comparação com o repositório de referência [stripe-samples/checkout-one-time-payments](https://github.com/stripe-samples/checkout-one-time-payments) e as boas práticas aplicadas.

---

## 1. Fluxo atual no projeto

1. **CheckoutStart (React)**  
   O usuário confirma o carrinho e clica para pagar. O frontend chama o **checkout-router** (Supabase Edge Function) com a rota `start`, enviando `cart_id`, itens, `success_url`, `cancel_url`, etc.

2. **checkout-router**  
   Cria ou obtém o pedido no Supabase e chama a Edge Function **stripe-create-intent** com `action: "create_checkout_session"` (e `order_id`, `amount`, `products`, `success_url`, `cancel_url`).

3. **stripe-create-intent**  
   Valida preços e estoque no Supabase, monta `line_items` com `price_data` (currency BRL, nomes e valores por item), chama `stripe.checkout.sessions.create()` com:
   - `mode: "payment"`
   - `metadata: { order_id, order_access_token }`
   - `payment_intent_data.metadata` idem
   - `idempotencyKey: \`cs_${order_id}\``  
   Devolve `{ checkout_url: session.url }` e o frontend faz `window.location.href = checkout_url`.

4. **Stripe Checkout (hosted)**  
   O usuário paga na página da Stripe. Ao concluir, a Stripe redireciona para `success_url` (ex.: `/checkout/obrigado?session_id={CHECKOUT_SESSION_ID}`) ou para `cancel_url` se desistir.

5. **CheckoutReturn (página de obrigado)**  
   Lê `session_id` da URL, busca o pedido no Supabase por `external_reference === session_id` (ou equivalente) e exibe o status. Com o webhook atualizado, o pedido já pode aparecer como **Pago** assim que o evento `checkout.session.completed` for processado.

6. **Webhook (stripe-webhook)**  
   A Stripe envia eventos para a Edge Function (body bruto, assinatura verificada com `constructEventAsync`). Eventos relevantes:
   - **checkout.session.completed:** atualiza cliente/endereço, `external_reference`, `transaction_id`; se `payment_status === 'paid'`, define `status: "paid"` no pedido e insere registro em `payments` (idempotente por `transaction_id`).
   - **payment_intent.succeeded:** também define `status: "paid"` e insere em `payments` se ainda não existir (idempotente). Assim, independentemente da ordem de chegada dos eventos, o pedido fica pago e a página de obrigado consistente.

---

## 2. Comparação com o sample stripe-samples/checkout-one-time-payments

| Aspecto | Sample (Node/Express) | Este projeto (Lovable + Supabase) |
|--------|------------------------|-------------------------------------|
| Onde a sessão é criada | Servidor Node: `POST /create-checkout-session` em `server/node/server.js` | Edge Function **stripe-create-intent** (action `create_checkout_session`), chamada pelo **checkout-router** |
| Quem chama a criação | Formulário HTML POST para `/create-checkout-session`; servidor responde com redirect 303 para `session.url` | Frontend React chama checkout-router; recebe `redirect_url` e faz `window.location.href = redirect_url` |
| Resposta ao cliente | HTTP 303 + `Location: session.url` | JSON `{ checkout_url }` → redirect no cliente |
| Webhook | `POST /webhook`, body bruto (`req.rawBody`), `stripe.webhooks.constructEvent` | Edge Function **stripe-webhook**: `req.text()`, `constructEventAsync`, idempotência em tabela `stripe_webhook_events` |
| Evento que confirma pagamento | `checkout.session.completed` (no sample só log; não há banco) | `checkout.session.completed` (marca `status: "paid"` e insere `payments`) e `payment_intent.succeeded` (idempotente, mesmo efeito) |
| Banco / persistência | Nenhum | Supabase: `orders`, `order_items`, `payments`, `stripe_webhook_events`; config em `integrations_checkout_providers` |

O modelo lógico é o mesmo: sessão criada no servidor, redirect para a URL do Checkout, confirmação via webhook. A diferença é a stack (Edge Functions + Supabase) e o uso de **metadata** (`order_id`) e **idempotência** (eventos e criação de sessão) para integrar com o banco.

---

## 3. Boas práticas utilizadas

- **Chave secreta apenas no servidor:** a `STRIPE_SECRET_KEY` é lida no backend (config do provider ou variável de ambiente); nunca exposta ao frontend.
- **Body bruto no webhook:** a Edge Function usa o body sem parse prévio (`req.text()`) para validar a assinatura com `stripe.webhooks.constructEventAsync`.
- **Idempotência:**  
  - Criação de sessão: `idempotencyKey: \`cs_${order_id}\`` em `checkout.sessions.create`.  
  - Eventos: tabela `stripe_webhook_events` com `event_id`; processamento e `processed_at` para evitar reprocessar o mesmo evento.
  - Pagamentos: inserção em `payments` só se não existir registro com o mesmo `provider` + `transaction_id`.
- **Sem checkout legado:** uso apenas de Checkout Session atual e Payment Intent; nenhuma API legada do Stripe.
- **Dois eventos tratados para “pago”:** tanto `checkout.session.completed` quanto `payment_intent.succeeded` podem marcar o pedido como pago e criar/garantir o registro em `payments`, de forma idempotente, para que a página de obrigado e outros consumidores do estado do pedido fiquem consistentes mesmo com ordem variável de entrega dos eventos.

---

## 4. Referências

- [Stripe Checkout – Documentação](https://stripe.com/docs/checkout)
- [Stripe Webhooks – Best practices](https://stripe.com/docs/webhooks/best-practices)
- [stripe-samples/checkout-one-time-payments](https://github.com/stripe-samples/checkout-one-time-payments) (pasta `server/node` e `client/html`)
