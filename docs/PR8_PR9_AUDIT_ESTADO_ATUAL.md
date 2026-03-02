# PR8/PR9 — Auditoria do estado atual + mapeamento old → new

## 1) Resumo do estado atual

### Tabelas atuais

**integrations_checkout** (singleton de fato: 1 row)
- `id` uuid PK
- `enabled` boolean NOT NULL DEFAULT false
- `provider` text NOT NULL DEFAULT 'native' — valores: 'stripe' | 'yampi' | 'appmax' | 'native'
- `fallback_to_native` boolean NOT NULL DEFAULT true
- `updated_at` timestamptz

**integrations_checkout_providers**
- `id` uuid PK
- `provider` text NOT NULL — 'stripe' | 'yampi' | ...
- `display_name` text
- `is_active` boolean NOT NULL DEFAULT false
- `config` jsonb NOT NULL DEFAULT '{}'
- `created_at`, `updated_at` timestamptz

Para Stripe, `config` contém: `publishable_key`, `secret_key`, **`checkout_mode`** ('embedded' | 'external').

Provider/mode: definidos por (1) qual provider está ativo em `integrations_checkout.provider` e (2) em `integrations_checkout_providers` qual está `is_active`; para Stripe, `config.checkout_mode` define embedded vs external.

---

### View public.checkout_settings (PR5)

```sql
SELECT
  c.id, c.enabled, c.provider AS active_provider, c.fallback_to_native, c.updated_at,
  (p.config->>'checkout_mode')::text AS checkout_mode,
  CASE
    WHEN c.provider IN ('appmax', 'native') THEN 'transparent'
    WHEN c.provider = 'stripe' AND (p.config->>'checkout_mode') = 'external' THEN 'gateway'
    WHEN c.provider = 'stripe' THEN 'transparent'
    WHEN c.provider = 'yampi' THEN 'gateway'
    ELSE 'transparent'
  END AS experience
FROM integrations_checkout c
LEFT JOIN integrations_checkout_providers p ON p.provider = c.provider AND p.is_active = true;
```

Leitura unificada; escrita continua em `integrations_checkout` + `integrations_checkout_providers`.

---

### CheckoutSettings.tsx — como salva

- **Leitura:** `integrations_checkout` limit 1; `integrations_checkout_providers` todos.
- **Toggles Stripe/Yampi:** ao ativar Stripe: atualiza `integrations_checkout_providers.is_active` para o provider e `integrations_checkout.provider` para 'stripe' (ou yampi/appmax) e `enabled: true`. Idem ao ativar Yampi.
- **Stripe config:** update em `integrations_checkout_providers` (config com `publishable_key`, `secret_key`, **checkout_mode**: 'embedded' | 'external').
- **Fallback:** update em `integrations_checkout` (`fallback_to_native`).
- Não usa a view; usa direto as duas tabelas.

---

### checkout-create-session "resolve"

1. Lê `integrations_checkout` limit 1.
2. Se não enabled → `{ flow: "transparent", redirect_url: "/checkout" }`.
3. Provider appmax/native → `{ flow: "transparent", redirect_url: "/checkout" }`.
4. Lê `integrations_checkout_providers` do provider; se não is_active → transparent.
5. **Stripe:** se `config.checkout_mode === "external"` → `{ flow: "gateway", provider: "stripe", checkout_mode: "external" }`; senão → `{ flow: "transparent", redirect_url: "/checkout", provider: "stripe", checkout_mode: "embedded" }`.
6. **Yampi:** `{ flow: "gateway", provider: "yampi" }`.

Não usa a view; usa as duas tabelas.

---

### checkout-router

- Rotas: `resolve` | `create_gateway_session` | `stripe_intent` | `process_payment`.
- Mapeamento: resolve/create_gateway_session → checkout-create-session; stripe_intent → stripe-create-intent; process_payment → process-payment.
- Body: repassa payload e adiciona `request_id`; para route resolve cola `action: "resolve"`.
- Resposta: `success`, `error?`, e o resto do payload do alvo.
- **Não existe route "start".**

---

### CheckoutStart.tsx — regras atuais

1. Chama **checkout-create-session** com `action: "resolve"` (direto, não via router).
2. Se `flow === "transparent"` ou !flow → `navigate("/checkout")`.
3. Se `flow === "gateway"` e provider === "yampi" → chama checkout-create-session com items/attribution → redirect para `redirect_url` ou fallback para /checkout.
4. Se flow !== gateway ou provider !== stripe → navigate("/checkout").
5. Se gateway + stripe: cria pedido no DB (orders + order_items), chama **stripe-create-intent** com `action: "create_checkout_session"`, redireciona para `checkout_url`.

Lógica de decisão (transparent vs gateway, yampi vs stripe external) está no **front**.

---

### Checkout.tsx (resumo)

- Usa `invokeCheckoutFunction` para stripe-create-intent (create_payment_intent) e process-payment.
- Cria pedido com idempotency_key = cartId; trata 23505 redirecionando para pedido existente.
- Não chama resolve no início; assume que veio de CheckoutStart ou entrada direta em /checkout.

---

## 2) O que precisa continuar funcionando durante a migração

- Alternar Stripe/Yampi no admin e ao iniciar checkout o fluxo correto (transparent vs gateway, provider certo).
- Stripe embedded (transparent) e Stripe external (gateway com redirect) devem continuar iguais.
- Yampi gateway (redirect) deve continuar igual.
- Appmax/native: redirect para /checkout e pagamento na página.
- Resolve (ou equivalente) deve retornar flow + provider para o front ou para o router.
- Chaves e config do Stripe/Yampi continuam em `integrations_checkout_providers` (ou só lidas de lá) até migração total; a nova tabela não substitui chaves secretas.
- Health check do checkout (resolve) deve continuar funcionando.
- Nada de quebrar para quem já está em produção (leitura com fallback).

---

## 3) Conflitos de nomenclatura — mapa old → new

| Antigo (código/view) | Novo (PR8 tabela) | Notas |
|----------------------|-------------------|--------|
| `flow` = "transparent" | `channel` = "internal" | flow transparent = checkout na nossa página |
| `flow` = "gateway" | `channel` = "external" | flow gateway = redirect para provider |
| `checkout_mode` = "embedded" | `experience` = "transparent" | Stripe na página = transparent |
| `checkout_mode` = "external" | `channel` = "external" + `experience` = "native" | Stripe redirect = external + native (checkout session) |
| `provider` = stripe/yampi/appmax/native | `active_provider` = stripe/yampi/appmax | "native" vira appmax ou fallback; manter appmax como interno |
| `fallback_to_native` | Pode ficar na config antiga ou como flag; PR8 não precisa obrigatoriamente migrar (podemos setar experience/internal conforme provider) | |
| `experience` (view) = transparent/gateway | `experience` (tabela) = "transparent" \| "native" | Na view, experience era derivado (transparent vs gateway). Na tabela, experience = transparent (form na página) vs native (página do provider). |

**Derivação consistente para resposta do resolve:**

- `flow` (para compatibilidade): `flow = (channel === 'external') ? 'gateway' : 'transparent'`.
- `provider`: igual a `active_provider`.
- `channel`: internal | external.
- `experience`: transparent | native.

Assim o front e o router podem usar o shape novo e, se precisar, ainda ler `flow` derivado.

---

## 4) Conflitos potenciais a evitar

- Não renomear colunas nas tabelas antigas ainda; a nova tabela usa nomes novos (active_provider, channel, experience).
- Resolve (e depois route start) deve retornar **também** `flow` derivado de `channel` para compatibilidade com CheckoutStart até migrar para route start.
- Admin hoje escreve em duas tabelas; na PR8 o admin passa a escrever na nova tabela (via update-checkout-settings) e, se quisermos manter compatibilidade total, podemos espelhar para as antigas em um trigger ou na edge (opcional). Especificação PR8 diz: “se tabela nova estiver vazia, cair para config antiga”. Então: leitura com fallback; escrita só na nova (e seed inicial espelhando o antigo).

Documento gerado para PR8/PR9 — Passo 0 (auditoria).

---

## 5) PR8/PR9 pós-merge — source of truth e compatibilidade

**checkout_settings canônica é source of truth; legado é compat.**

- **Tabela canônica:** `public.checkout_settings_canonical` (singleton, id fixo `00000000-0000-0000-0000-000000000001`). Uma única linha; constraint + índice único garantem singleton.
- **View de compat:** `public.checkout_settings` é recriada apontando para `checkout_settings_canonical` (não é mais baseada em `integrations_checkout`). Quem lê `checkout_settings` continua funcionando.
- **Escritas:** apenas na edge **update-checkout-settings** (UPDATE em `checkout_settings_canonical`). A edge espelha em `integrations_checkout` e `integrations_checkout_providers` (provider, enabled, is_active, config.checkout_mode) para compatibilidade com código legado.
- **Frontend (CheckoutSettings.tsx):** não espelha mais nas tabelas legadas. Apenas chama a edge `update-checkout-settings`; a edge atualiza a canônica e espelha no legado. Persistência de chaves Stripe/Yampi continua em `integrations_checkout_providers.config` (admin salva config; modo/ativo é espelhado pela edge).
- **Dropar a view** `public.checkout_settings` só em PR de limpeza futuro, quando não houver dependências.
