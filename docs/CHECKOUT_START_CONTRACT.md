# Contrato route "start" (PR9 Fase 1)

## Objetivo

O front chama **sempre** o checkout-router com `route: "start"`. O router lê `checkout_settings`, cria ou obtém o pedido (idempotente por `cart_id`), delega para a implementação correta (checkout-create-session, stripe-create-intent) e devolve uma resposta canônica com `action: "redirect"` ou `action: "render"`. O front não decide mais provider/flow — apenas envia o payload e reage ao `action`.

## Request

Enviado no body do POST para `/functions/v1/checkout-router`:

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| route | "start" | sim | Sempre "start" |
| request_id | string | sim | UUID da requisição |
| cart_id | string | sim | Identificador estável do carrinho (ex.: localStorage) |
| success_url | string | não | URL de sucesso (redirect externo) |
| cancel_url | string | não | URL de cancelamento |
| attribution | object | não | utm_source, utm_medium, utm_campaign, etc. |
| customer | object | não | email, name, phone |
| shipping | object | não | zip, method_id |
| items | array | sim | Lista de { variant_id, quantity, unit_price?, product_name? } |
| subtotal | number | sim | Subtotal do carrinho |
| discount_amount | number | não | Desconto aplicado |
| shipping_cost | number | não | Custo de frete |
| total_amount | number | sim | Total a cobrar |
| order_access_token | string \| null | não | Token de acesso para guest (obrigatório se não houver user_id) |
| user_id | string \| null | não | ID do usuário autenticado |
| coupon_code | string \| null | não | Código do cupom |

## Response (shape canônico)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| success | boolean | Se a operação foi bem-sucedida |
| provider | "stripe" \| "yampi" \| "appmax" | Provider ativo |
| channel | "internal" \| "external" | internal = checkout na loja; external = redirect |
| experience | "transparent" \| "native" | transparent = form na página; native = página do provider |
| action | "redirect" \| "render" | redirect = ir para redirect_url; render = abrir /checkout com state |
| order_id | string | ID do pedido (quando aplicável) |
| order_access_token | string | Token de acesso ao pedido (guest) |
| redirect_url | string | URL para redirecionar (action=redirect) |
| client_secret | string | Client secret do PaymentIntent (action=render, Stripe) |
| message | string | Mensagem opcional |
| error | string | Mensagem de erro em caso de falha |

## Comportamento do front (CheckoutStart)

1. Montar o payload com `cart_id`, `items`, totais, `success_url`, `cancel_url`, `user_id` ou `order_access_token`.
2. Chamar `invokeCheckoutRouter('start', payload)`.
3. Se `action === "redirect"` e `redirect_url` começar com `http`: `window.location.href = redirect_url` (e limpar carrinho).
4. Se `action === "redirect"` e `redirect_url` for path: `navigate(redirect_url)`.
5. Se `action === "render"`: `navigate('/checkout', { state: { orderId, provider, requestId, orderAccessToken, clientSecret } })`.
6. Caso contrário: `navigate('/checkout')`.

## Fluxos no router (resumo)

- **checkout_settings** lido primeiro; se não houver linha, fallback para resolve (checkout-create-session action resolve).
- Pedido criado ou obtido por `cart_id` (idempotência).
- **external + yampi:** checkout-create-session com items/attribution → redirect_url.
- **external + stripe:** stripe-create-intent create_checkout_session → redirect_url.
- **internal + stripe:** stripe-create-intent create_payment_intent → client_secret, action=render.
- **internal + appmax:** action=render, redirect_url=/checkout (front segue com process-payment).

Ver `docs/CHECKOUT_SETTINGS.md` para provider/channel/experience e validações.
