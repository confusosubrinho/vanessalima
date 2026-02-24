# Passo 2 — Simulação do fluxo de compra e achados

## 1. Fluxo traçado (code review)

### 1.1 Entrada no fluxo
- **Index** → cliques em produto ou categoria → **ProductDetail** ou **CategoryPage**.
- **ProductDetail**: seleção de tamanho (e cor se houver), quantidade; valida variante em estoque e ativa antes de `addItem`. **OK.**
- **Cart** (rota `/carrinho`): lista itens, mostra estoque atualizado (query `cart-stock`), desconto, frete (ShippingCalculator), total. Botão "Finalizar Compra" só habilita se `selectedShipping` estiver definido; leva a `/checkout/start`. **OK.**
- **Header (drawer do carrinho)**: Sem frete selecionado exibe "Calcule o frete no carrinho" (link para `/carrinho`); com frete, "Finalizar Compra" → `/checkout/start`. **Corrigido** (ver seção 3).

### 1.2 CheckoutStart (`/checkout/start`)
- Se `items.length === 0` → redireciona para `/carrinho`. **OK.**
- Chama `checkout-create-session` com `items` (variant_id + quantity) e atribuição.
- Se retorno tem `redirect_url`:
  - Começa com `http` → limpa carrinho e faz `window.location.href` (Yampi). **OK.**
  - Senão → `navigate(redirect_url)` (ex.: `/checkout`).
- Se não há `redirect_url` → `navigate("/checkout")`. **OK.**
- Em erro → mostra mensagem e após 3s redireciona para `/checkout`. **OK.**
- **Resumo exibido**: Subtotal + Desconto (se houver) + Frete (se houver) + Total real. Redireciona para `/carrinho` se o carrinho ficar vazio (ex.: outra aba). **Corrigido** (seção 3).

### 1.3 Checkout nativo (`/checkout`)
- Se `items.length === 0` e não `isSubmitted` → tela "Carrinho vazio" com link para home. **OK.**
- Passos: Identificação → Entrega → Pagamento.
- **Identificação**: email, nome, telefone, CPF; validação de email (regex) e CPF (validators). **OK.**
- **Entrega**: CEP (com lookup ViaCEP), endereço, número, bairro, cidade, estado; exige `selectedShipping` (ShippingCalculator na própria página). **OK.**
- **Pagamento**: PIX ou cartão; cupom (CouponInput); cartão: Luhn, validade, titular, CVV; parcelas via `getInstallmentOptions(total, pc)`. **OK.**
- Submit: idempotência por `idempotency_key`; criação de `orders` + `order_items`; chamada `process-payment` (Appmax); em sucesso → `clearCart()`, navega para `/pedido-confirmado/:orderId` com state (orderNumber, PIX, guestToken, etc.). **OK.**
- Em erro de pagamento → toast e `setPaymentError` com sugestão; não limpa carrinho. **OK.**

### 1.4 OrderConfirmation (`/pedido-confirmado/:orderId` ou `/pedido-confirmado`)
- Estado inicial: `location.state` > `sessionStorage` > fallback com `urlOrderId`. **OK.**
- Busca pedido no Supabase (com cliente guest usando header `x-order-token` quando há `guestToken`). **OK.**
- PIX: countdown de expiração, QR e código copiável; mensagem quando expirado. **OK.**
- Atualização de status: Realtime para logado; polling 10s para guest. **OK.**

### 1.5 CheckoutReturn (`/checkout/obrigado`) — retorno Yampi
- Limpa carrinho e remove `checkout_session_id` do localStorage no mount. **OK.**
- Busca pedido por `provider = 'yampi'` e `checkout_session_id = sessionId`. **OK.**
- Até 10 tentativas a cada 3s; se achar pedido mostra detalhes; senão mostra mensagem genérica "Obrigado pela sua compra!". **OK.**

---

## 2. Validações e regras de negócio (conferidas)

| Ponto | Status |
|-------|--------|
| Carrinho vazio em CheckoutStart | Redireciona para /carrinho |
| Carrinho vazio em Checkout (não submetido) | Tela "Carrinho vazio" + link home |
| CPF e email no passo Identificação | Validados (validateCPF, regex email) |
| Endereço e frete no passo Entrega | CEP + endereço completo + selectedShipping obrigatórios |
| Cartão: Luhn, validade, titular, CVV | Validados antes do submit |
| Preço do pedido | getCartItemUnitPrice + pricingEngine (PIX/cartão) alinhados ao backend |
| Idempotência | idempotency_key evita pedido duplicado ao reenviar |
| Convidado (sem auth) | access_token no pedido; process-payment aceita order_access_token; OrderConfirmation usa x-order-token para buscar/polling |

---

## 3. Divergências / melhorias identificadas

### 3.1 [UX] Header: "Finalizar Compra" sem exigir frete — **Corrigido**
- **Onde**: `Header.tsx` — link "Finalizar Compra" no drawer do carrinho.
- **Implementado**: Se `selectedShipping` for null, o botão exibe "Calcule o frete no carrinho" (variant secondary) e leva para `/carrinho`; caso contrário, "Finalizar Compra" → `/checkout/start`.

### 3.2 [UX] CheckoutStart: "Total" é só subtotal — **Corrigido**
- **Onde**: `CheckoutStart.tsx` — resumo do pedido.
- **Implementado**: Resumo passa a exibir Subtotal, Desconto (se `discount > 0`), Frete (se `selectedShipping`), e Total = `subtotal - discount + shippingCost`.

### 3.3 [Edge] CheckoutStart: effect roda uma vez — **Corrigido**
- **Onde**: `CheckoutStart.tsx`.
- **Implementado**: `useEffect` com `[items.length, navigate]` redireciona para `/carrinho` sempre que `items.length === 0` (inclui carrinho esvaziado em outra aba).

---

## 4. Resumo

- **Fluxo geral**: Navegação, validações (CPF, email, endereço, frete, cartão), criação de pedido, idempotência, PIX/cartão e retorno Yampi estão coerentes com o código e sem bugs críticos encontrados.
- **Ajustes aplicados** (todos implementados):
  1. Header: botão "Finalizar Compra" só quando há frete; senão "Calcule o frete no carrinho" → `/carrinho`.
  2. CheckoutStart: resumo com Subtotal, Desconto, Frete e Total real.
  3. CheckoutStart: redirecionamento para `/carrinho` quando o carrinho fica vazio (ex.: outra aba).
