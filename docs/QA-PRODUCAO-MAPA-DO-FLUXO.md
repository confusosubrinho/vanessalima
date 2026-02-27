# A) MAPA DO FLUXO — E-commerce Vanessa Lima (vanessalima.lovable.app)

**Objetivo:** Mapear telas/rotas do funil, integrações externas e tabelas do banco para auditoria de produção (checkout, pagamento, estoque, anti-duplicação, webhooks).

---

## 1. Telas / Rotas do funil de compra

| Ordem | Rota | Componente | Descrição |
|-------|------|------------|-----------|
| 1 | `/` | `Index` | Vitrine / home |
| 2 | `/produto/:slug` | `ProductDetail` | Página do produto (variantes, preço, estoque, add to cart) |
| 3 | `/categoria/:slug` | `CategoryPage` | Listagem por categoria |
| 4 | `/carrinho` | `Cart` | Carrinho (localStorage; persistente) |
| 5 | `/checkout/start` | `CheckoutStart` | Início do checkout: chama `checkout-create-session`; pode redirecionar para Yampi (externo) ou `/checkout` |
| 6 | `/checkout` | `Checkout` | Checkout nativo: 3 etapas (Identificação → Entrega → Pagamento). Cria pedido + itens; depois Stripe ou Appmax |
| 7 | Pagamento | Stripe Elements (in-page) ou redirect Appmax/PIX | Stripe: `stripe-create-intent` → PaymentIntent → Elements. Appmax: `process-payment` (PIX/cartão) |
| 8 | `/pedido-confirmado/:orderId` ou `/pedido-confirmado` | `OrderConfirmation` | Confirmação; exibe PIX pendente ou status (pending/processing/…); polling ou Realtime por ordem |
| 9 | `/conta` | `MyAccount` | “Meus pedidos” (aba Orders) + perfil; apenas usuário logado (`orders` filtrado por `user_id`) |
| 10 | `/rastreio` | `RastreioPage` | Rastreio por email + número do pedido (guest ou logado) |

**Outras rotas relevantes:** `/auth` (login/cadastro), `/checkout/obrigado` (`CheckoutReturn`), `/busca` (SearchPage), páginas institucionais (FAQ, trocas, etc.).

---

## 2. Integrações externas (onde entram)

| Integração | Onde entra | Client / Server / Webhook | Observação |
|------------|------------|---------------------------|------------|
| **Stripe** | Pagamento (cartão + PIX) | **Client:** `StripePaymentForm`, `useStripeConfig` (config de `integrations_checkout_providers`). **Server:** Edge `stripe-create-intent` (cria PaymentIntent, valida preço/estoque, baixa estoque). **Webhook:** Edge `stripe-webhook` (payment_intent.succeeded/failed/canceled, charge.refunded, charge.dispute.*). | Idempotência por `stripe_webhook_events.event_id` UNIQUE. Estoque baixado no create_payment_intent; devolvido em failed/canceled. |
| **Appmax** | Gateway PIX/cartão (alternativa ao Stripe) | **Client:** Checkout chama `process-payment` (tokenize_card + create_transaction). **Server:** Edge `process-payment` (valida preço/cupom, baixa estoque via `decrement_stock`, chama API Appmax). **Webhook:** Edge `appmax-webhook` (token na URL); idempotência por `order_events.event_hash`; atualiza status e chama `cancel_order_return_stock` quando cancelado. | Rate limit in-memory por IP (10 req/min). |
| **Yampi** | Checkout externo (opcional) | **Client:** `CheckoutStart` chama `checkout-create-session`; se provider=yampi e SKUs ok, redireciona para link Yampi. **Server:** `checkout-create-session` cria payment link e retorna redirect_url. **Webhook:** `yampi-webhook` (eventos de pedido/pagamento). | Só usado se `integrations_checkout.enabled` e provider Yampi configurado; senão fallback para checkout nativo. |
| **Bling** | NFe / estoque | **Server:** `bling-sync`, `bling-sync-single-stock`, `bling-webhook`. Pós-pagamento: `process-payment` invoca `bling-sync` com `order_to_nfe` (fire-and-forget). | Não bloqueia fluxo de pagamento. |
| **ViaCEP / similar** | CEP | **Client:** `lookupCEP` em `lib/validators` (fetch no front). | Apenas preenchimento de endereço. |
| **Frete** | Cálculo de frete | **Server:** Edge `calculate-shipping`. **Client:** `ShippingCalculator` no Checkout. | Resultado armazenado no contexto do carrinho (`selectedShipping`). |

---

## 3. Tabelas do banco relevantes

| Tabela | Uso no fluxo |
|--------|----------------|
| **products** | Catálogo; base_price, sale_price, category_id, is_active. |
| **product_variants** | SKU, size, color, stock_quantity, base_price, sale_price, price_modifier. Estoque baixado por `decrement_stock` (Stripe + Appmax); devolvido por webhook (Stripe) ou `cancel_order_return_stock` (Appmax). |
| **categories** | Navegação e filtros. |
| **orders** | Pedido: order_number (trigger), user_id (null = guest), access_token (guest), idempotency_key (unique), status, shipping_*, customer_*, total_amount, subtotal, discount_amount, shipping_cost, coupon_code, provider/gateway, transaction_id (Stripe PI id), stripe_charge_id, appmax_order_id, checkout_session_id (opcional). |
| **order_items** | Itens do pedido: order_id, product_id, product_variant_id, quantity, unit_price, total_price, product_name, variant_info. |
| **payments** | Registro de pagamento: order_id, provider, gateway, status, amount, transaction_id, installments, raw (JSON). |
| **customers** | Cliente por email; total_orders, total_spent; criado/atualizado no pós-pagamento (Stripe webhook e process-payment). |
| **coupons** | Cupom: code, discount_type, discount_value, uses_count, max_uses, expiry_date, applicable_*. Incremento de uso via RPC `increment_coupon_uses` no sucesso do pagamento. |
| **profiles** | Dados do usuário (user_id, full_name, phone, address, city, state, zip_code). |
| **abandoned_carts** | Carrinhos abandonados; preenchido por `checkout-create-session` e por `saveAbandonedCart` no front (CartContext). |
| **stripe_webhook_events** | Idempotência Stripe: event_id UNIQUE; evita processar mesmo evento duas vezes. |
| **order_events** | Idempotência Appmax: event_hash (SHA256 de type+order_id+payload). |
| **payment_pricing_config** | Regras de preço: pix_discount, parcelas sem juros, etc. (single row is_active). |
| **integrations_checkout** | enabled, provider, fallback_to_native. |
| **integrations_checkout_providers** | provider (stripe/yampi), config (publishable_key, etc.), is_active. |
| **store_settings** | store_name, contact_whatsapp, etc. |
| **inventory_movements** | Movimentações (refund ao cancelar pedido Appmax/nativo). |

---

## 4. Fluxo resumido (nativo: Stripe ou Appmax)

1. **Vitrine → Produto → Carrinho:** dados no client (localStorage: `cart`, `appliedCoupon`, `selectedShipping`, `shippingZip`).
2. **Checkout:** usuário pode ir direto para `/checkout` ou passar por `/checkout/start` (que pode redirecionar para Yampi ou `/checkout`).
3. **No Checkout (nativo):**  
   - Gera **idempotency_key** (UUID) no client (uma vez por montagem do componente).  
   - Antes de criar pedido: consulta `orders` por `idempotency_key`; se existir, redireciona para `/pedido-confirmado/:id` (anti-duplicação).  
   - Insert em **orders** (order_number = TEMP, depois trigger gera definitivo) e em **order_items**.  
   - **Stripe:** chama `stripe-create-intent` (valida preço/estoque server-side, baixa estoque via `decrement_stock`, cria PaymentIntent); exibe Elements; sucesso tratado no client e redirect para confirmação. Webhook atualiza status e insere `payments`.  
   - **Appmax:** chama `process-payment` (valida preço/cupom, baixa estoque, chama API Appmax); resposta com PIX ou confirmação; webhook Appmax atualiza status e pode chamar `cancel_order_return_stock`.  
4. **Confirmação:** OrderConfirmation lê ordem por `id` (e, se guest, por `access_token` via header `x-order-token`); Realtime (logado) ou polling (guest) para mudança de status.
5. **Meus pedidos:** apenas `/conta` com `orders` filtrado por `user_id` (RLS: user vê só próprio ou admin).

---

## 5. Pontos críticos para testes (referência para o plano B)

- **Idempotência:** `orders.idempotency_key` (unique) no client; consulta antes de insert. Stripe: `stripe_webhook_events.event_id`. Appmax: `order_events.event_hash`.
- **Estoque:** `decrement_stock` com `FOR UPDATE` (lock por variante); em Stripe baixa no create_payment_intent; em Appmax no create_transaction. Devolução: Stripe webhook (restoreStock), Appmax webhook + `cancel_order_return_stock`.
- **RLS:** Orders: SELECT com `user_id = auth.uid()` ou `access_token = x-order-token` ou is_admin(). Order_items e payments atrelados à ordem.
- **Guest:** `access_token` em orders; confirmação e rastreio usam token no header para ler ordem.

Este mapa serve de base para o **Plano de Testes Exaustivo** (B) e para as correções e automação (D–F).
