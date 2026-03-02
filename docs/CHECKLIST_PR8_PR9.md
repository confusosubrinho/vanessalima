# Checklist manual PR8/PR9 — Start unificado + evidências

Validação reproduzível de **PR8** (checkout_settings canônico) e **PR9 Fase 1** (route `"start"` no checkout-router + CheckoutStart thin).

**Rotas e telas reais do projeto:**

| Onde | Rota / Caminho |
|------|-----------------|
| Carrinho | `/carrinho` |
| Início do checkout (thin) | `/checkout/start` |
| Página de pagamento (embedded) | `/checkout` |
| Confirmação pós-pagamento | `/checkout/obrigado` |
| Admin — Checkout & Pagamentos | **Configurações** → **Checkout & Pagamentos** → `/admin/checkout-transparente` |
| Admin — Pedidos | **Pedidos** → `/admin/pedidos` |

**Botões/labels reais:**

- No carrinho: **"Finalizar Compra"** (habilitado após calcular frete) ou **"Calcule o frete primeiro"**.
- Em `/checkout/start`: a tela mostra **"Redirecionando para pagamento seguro..."** e dispara automaticamente a chamada ao router (sem botão "Iniciar checkout" — o início é a navegação para `/checkout/start`).
- Em erro no start: **"Tentar novamente"** e **"Voltar ao carrinho"**.

---

## Smoke Test rápido (≈5 min)

Executar em staging antes de ir para produção.

1. **Migrations:** No Supabase SQL Editor: `SELECT COUNT(*) FROM public.checkout_settings_canonical;` → deve retornar `1`. `SELECT * FROM public.checkout_settings LIMIT 1;` → deve retornar uma linha (view aponta para canônica).
2. **Resolve:** Chamar a edge `checkout-create-session` com `{ "action": "resolve" }` → resposta com `flow`, `provider`, `channel`, `experience` (sem dados sensíveis).
3. **Admin:** Abrir **Checkout & Pagamentos** (`/admin/checkout-transparente`), alternar Stripe ativo → salvar → recarregar e confirmar que a config persiste.
4. **Start internal:** Config Stripe internal (embedded). Carrinho com 1 item → **Finalizar Compra** → `/checkout/start` → redireciona para `/checkout` → concluir pagamento (sandbox) → confirmação.
5. **Start external:** Config Stripe external. Repetir até **Finalizar Compra** → deve redirecionar para Stripe Checkout e, após pagar, voltar para `/checkout/obrigado`.
6. **Pedido no admin:** Em **Pedidos** (`/admin/pedidos`) deve aparecer o pedido do passo 4 ou 5 com status coerente.

Se todos os 6 passos passarem, seguir com o checklist completo abaixo.

---

## A) Pré-requisitos (1 vez)

### A1) Migrations aplicadas

| Verificação | Comando / Ação | Resultado esperado |
|-------------|----------------|--------------------|
| Tabela canônica existe e é singleton | No Supabase SQL: `SELECT id, active_provider, channel, experience FROM public.checkout_settings_canonical;` | Exatamente 1 linha; `id = 00000000-0000-0000-0000-000000000001` |
| View aponta para canônica | `SELECT * FROM public.checkout_settings LIMIT 1;` | Uma linha com as colunas da canônica (id, enabled, active_provider, channel, experience, etc.) |

### A2) Edges deployadas

| Edge | O que validar |
|------|----------------|
| **update-checkout-settings** | POST com JWT admin e body `{ "active_provider", "channel", "experience" }` retorna 200 e atualiza `checkout_settings_canonical` (e espelha em legado). |
| **checkout-router** (route `"start"`) | POST com body `{ "route": "start", "cart_id", "items": [{ "variant_id", "quantity" }] }` retorna `action`, `provider`, `channel`, `experience`; preços/totais vêm do servidor. |
| **checkout-create-session** (resolve) | POST com `{ "action": "resolve" }` retorna `flow`, `provider`, `channel`, `experience`; lê canônica (ou view) primeiro, fallback para config antiga. |

### A3) Integrações

- **Stripe:** Chaves sandbox/prod configuradas em **Checkout & Pagamentos** → seção Stripe; webhook configurado e respondendo.
- **Yampi (se aplicável):** Token/config na seção Yampi; teste de conexão OK.

### A4) Evidência mínima — Resposta do resolve

Exemplo de resposta esperada (sem dados sensíveis):

```json
{
  "flow": "transparent",
  "redirect_url": "/checkout",
  "provider": "stripe",
  "channel": "internal",
  "experience": "transparent",
  "checkout_mode": "embedded"
}
```

Ou para external:

```json
{
  "flow": "gateway",
  "provider": "stripe",
  "channel": "external",
  "experience": "native",
  "checkout_mode": "external"
}
```

**Registrar:** Print ou cópia da resposta (sem tokens/chaves) na pasta de evidências.

---

## B) Cenário A — Stripe internal (channel=internal, experience=transparent)

**Setup no Admin (Checkout & Pagamentos)**

1. Abrir **Configurações** → **Checkout & Pagamentos** (`/admin/checkout-transparente`).
2. Garantir: **Stripe** ativo; modo = checkout na própria página (embedded / internal).
3. Salvar se alterou algo.

**Execução no comprador**

1. Loja → adicionar produto ao carrinho → ir para **Carrinho** (`/carrinho`).
2. Calcular frete (se aplicável) até o botão **"Finalizar Compra"** ficar habilitado.
3. Clicar **"Finalizar Compra"** → navega para `/checkout/start` → tela **"Redirecionando para pagamento seguro..."** → redireciona para `/checkout`.
4. Preencher dados e pagar (sandbox: cartão de teste ou PIX).
5. Confirmar redirecionamento para `/checkout/obrigado` (ou página de confirmação configurada).

**Resultados esperados**

- Resposta do route `"start"`: `action: "render"`, sem `redirect_url` externo (ou redirect para `/checkout`).
- CheckoutStart não decide provider; apenas chama o router e obedece `action` / `redirect_url`.
- Em **Pedidos** (`/admin/pedidos`) o pedido aparece com status correto (ex.: pago/processando).

**Evidências**

- Print da config no Admin (Checkout & Pagamentos) com Stripe internal.
- Print da tela `/checkout/start` (“Redirecionando para pagamento seguro...”).
- Print da confirmação em `/checkout/obrigado`.
- **request_id** da chamada ao checkout-router (Network ou logs).
- Trecho de log do checkout-router: `route`, `provider`, `channel`, `action`, `order_id`, `duration_ms`.

---

## C) Cenário B — Stripe external (channel=external, experience=native)

**Setup**

1. Em **Checkout & Pagamentos**, ativar **Stripe** e escolher modo **external** (checkout na página do Stripe).
2. Salvar.

**Execução**

1. Carrinho com itens → **"Finalizar Compra"** → `/checkout/start`.
2. Deve redirecionar para **Stripe Checkout** (URL externa).
3. Concluir pagamento no Stripe (sandbox).
4. Retorno para a loja (ex.: `/checkout/obrigado?session_id=...`).

**Resultados esperados**

- Resposta do `"start"`: `action: "redirect"`, `redirect_url` apontando para Stripe.
- Uso de `idempotencyKey` por `order_id` nas chamadas Stripe (evita duplicar sessão/intent em retry).

**Evidências**

- Print da config (Stripe external).
- Print do redirect para Stripe (URL ou tela do Stripe).
- Print da confirmação após retorno.
- **request_id** e **order_id**; trecho de log do checkout-router.
- (Opcional) Print do Stripe Dashboard (sandbox) mostrando a sessão/pagamento.

---

## D) Cenário C — Yampi external (channel=external)

**Setup**

1. Em **Checkout & Pagamentos**, ativar **Yampi** (e desativar Stripe para esse fluxo, ou configurar Yampi como ativo).
2. Configurar token/alias Yampi se necessário; salvar.

**Execução**

1. Carrinho → **"Finalizar Compra"** → `/checkout/start`.
2. Redirecionamento para o checkout Yampi (URL externa).
3. Concluir fluxo no Yampi e retornar à loja.

**Resultados esperados**

- Resposta do `"start"`: `action: "redirect"`, `redirect_url` para o checkout Yampi.
- Pedido criado/atualizado via webhook Yampi (conforme integração).

**Evidências**

- Print da config (Yampi ativo).
- Print do redirect para Yampi e da confirmação de retorno.
- **request_id**; trecho de log do checkout-router.

---

## E) Extras (pega-bugs)

### E1) Duplo clique / retry no Start

**Passos**

- Com Stripe internal ou external: na tela `/checkout/start`, simular **2 cliques rápidos** no link que leva para `/checkout/start` (ex.: voltar ao carrinho e clicar **"Finalizar Compra"** duas vezes rápido), ou **tentar novamente** após um timeout (botão **"Tentar novamente"**).

**Esperado**

- Mesmo `order_id` nas duas requisições (idempotência por `cart_id`).
- Nenhuma sessão/intent duplicada no Stripe; nenhum pedido duplicado no Admin.

**Evidência**

- Logs com mesmo `order_id` e ausência de duplicação (ex.: um único pedido em **Pedidos** para aquele carrinho).

### E2) Refresh no meio do fluxo

**Stripe internal**

- Em `/checkout` (página de pagamento), antes de pagar, dar **F5** (refresh).
- **Esperado:** retoma o fluxo sem travar (pedido já existe; pode pedir novamente o client_secret ou exibir estado coerente).

**Stripe external**

- Após retorno do Stripe, na URL `/checkout/obrigado?session_id=...`, dar **F5**.
- **Esperado:** página de confirmação carrega de novo sem erro (idempotência da confirmação).

**Evidência**

- Breve descrição: “Refresh em /checkout” e “Refresh em /checkout/obrigado” sem erro.

### E3) Config inválida (bloqueio server-side)

**Passos**

- Tentar salvar combinações inválidas pela edge **update-checkout-settings**:
  - **Yampi + channel internal:** ex.: body `{ "active_provider": "yampi", "channel": "internal", "experience": "native" }`.
  - **Appmax + channel external (se não suportado):** ex.: `{ "active_provider": "appmax", "channel": "external", "experience": "transparent" }`.

**Esperado**

- Resposta **400** ou **422** com mensagem clara (ex.: “Yampi só permite channel external”).
- UI do Admin exibe o erro (toast ou mensagem) e não persiste a config inválida.

**Evidência**

- Print da resposta da API (status + body) e/ou da mensagem de erro na tela.

---

## F) Plano de evidência (obrigatório)

Para **cada** cenário A/B/C e extras E1–E3:

| Item | O que registrar |
|------|------------------|
| Print da config no Admin | Tela **Checkout & Pagamentos** com provider/channel/modo usado. |
| Print do início do checkout | `/checkout/start` ou redirect (conforme cenário). |
| Print da confirmação/resultado | `/checkout/obrigado` ou tela final. |
| **request_id** | Usado na chamada ao checkout-router (Network tab ou header `x-request-id`). |
| Trecho de log do checkout-router | Incluir: `route`, `provider`, `channel`, `action`, `order_id`, `duration_ms` (sem dados sensíveis). |

---

## Template de coleta de evidência

Copiar para cada execução e preencher:

```markdown
### Cenário: [ A | B | C | E1 | E2 | E3 ]
- **Data/hora:**
- **Ambiente:** [ sandbox | produção ]
- **request_id:**
- **order_id:** (se aplicável)
- **Prints/links:**
  - Config Admin:
  - Início checkout:
  - Confirmação:
- **Logs (trecho relevante):**
  - checkout-router:
  - (outros se necessário)
- **Observações:**
```

---

## Resumo de referência rápida

| Cenário | Config | action esperado | Próximo passo |
|---------|--------|------------------|---------------|
| A — Stripe internal | Stripe ativo, embedded/internal | `render` | Redireciona para `/checkout` |
| B — Stripe external | Stripe ativo, external | `redirect` | Redireciona para Stripe Checkout |
| C — Yampi | Yampi ativo | `redirect` | Redireciona para Yampi |
| E1 | Qualquer | Idempotência | Mesmo order_id, sem duplicar |
| E2 | Qualquer | — | Refresh não trava |
| E3 | Inválida | 400/422 | Mensagem clara; UI mostra erro |

Documento gerado para PR8/PR9 — checklist reproduzível. Sem dados sensíveis.
