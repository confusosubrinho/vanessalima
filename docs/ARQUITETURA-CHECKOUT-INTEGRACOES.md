# Arquitetura: Checkout e integrações (transparente vs gateway)

## Objetivo

Permitir ativar e desativar facilmente **checkout transparente** e **gateway de pagamento**, com uma única fonte de verdade e suporte a novos provedores no futuro.

## Conceitos

| Termo | Significado |
|-------|-------------|
| **Checkout transparente** | Pagamento na própria página da loja (formulário no site). Ex.: Stripe (embedded), Appmax. |
| **Gateway** | Redirecionamento para página externa de pagamento. Ex.: Stripe Checkout (hosted), Yampi. |
| **Provider** | Provedor de pagamento: `stripe`, `yampi`, `appmax`, `native`. |

## Fonte única de verdade

- **Tabela `integrations_checkout`** (singleton): `enabled`, `provider` (qual está em uso), `fallback_to_native`.
- **Tabela `integrations_checkout_providers`**: por provedor, `is_active` e `config` (ex.: Stripe `checkout_mode`: `embedded` | `external`).

O **CheckoutStart** (`/checkout/start`) é o **único ponto de entrada**: tudo passa por ele. Ele chama a edge function **checkout-create-session** com `action: "resolve"` para decidir o fluxo.

## Resolver (`checkout-create-session` com `action: "resolve"`)

Retorno:

- `flow: "transparent"` → redirecionar para `/checkout` (página da loja; formulário Stripe embutido ou Appmax).
- `flow: "gateway", provider: "stripe"` → fluxo Stripe: criar pedido, criar sessão Stripe, redirecionar para URL do Stripe.
- `flow: "gateway", provider: "yampi"` → chamar `checkout-create-session` com itens do carrinho, obter `redirect_url` Yampi e redirecionar.

Regras:

1. Se `integrations_checkout.enabled` é false → `transparent` (fallback `/checkout`).
2. Se `provider` é `appmax` ou `native` → `transparent`.
3. Se o provider atual (ex.: `stripe`, `yampi`) não está ativo em `integrations_checkout_providers` → `transparent` (fallback).
4. **Stripe**: se `config.checkout_mode === "external"` → `gateway` stripe; senão → `transparent` (Stripe embedded na `/checkout`).
5. **Yampi**: → `gateway` yampi.
6. Qualquer outro provider futuro: incluir no resolver com `flow` e `provider` adequados.

## Fluxos

```
Carrinho / Header  →  "Finalizar compra"  →  /checkout/start (CheckoutStart)
                                              ↓
                                    checkout-create-session { action: "resolve" }
                                              ↓
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
              flow: transparent         flow: gateway             flow: gateway
                    │                   provider: stripe          provider: yampi
                    ↓                         │                         │
              navigate(/checkout)     criar pedido + sessão       checkout-create-session
                    │                 Stripe → redirect           (items) → redirect_url
                    ↓                         │                         │
              Página Checkout.tsx      Stripe hosted page         Yampi hosted page
              (Stripe embedded ou
               Appmax conforme config)
```

## Adicionando um novo provider

1. **Inserir** em `integrations_checkout_providers` (provider, display_name, config).
2. **No resolver** (checkout-create-session, action `resolve`): tratar o novo `provider` (se modo gateway → `flow: "gateway", provider: "novo"`; se transparente → `flow: "transparent"` ou redirecionar para `/checkout`).
3. **No CheckoutStart**: em `flow === "gateway" && provider === "novo"`, chamar a edge function/lógica que gera o link ou sessão e redirecionar.
4. **Se for transparente**: na página `/checkout` (Checkout.tsx), adicionar ramo que exibe o formulário do novo provider quando for o ativo (ex.: ler provider ativo e mostrar componente correspondente).

## Admin: toggles

- **Desativar Stripe**: em `integrations_checkout_providers` marcar `is_active = false` para stripe; em `integrations_checkout` atualizar `provider` para `yampi` se Yampi ativo, senão `appmax`.
- **Desativar Yampi**: idem; `provider` → `stripe` se Stripe ativo, senão `appmax`.
- **Ativar Yampi**: `provider` → `yampi`; ativar Stripe: `provider` → `stripe`.

Assim o resolver e o CheckoutStart sempre leem o mesmo estado e não quebram ao alternar entre transparente e gateway.
