# Plano de testes E2E — PR0→PR7 + PR8/PR9 (regressão completa)

## Objetivo

Validar fluxos do comprador, do admin e do backend (router, webhooks, reconcile, reprocess) de ponta a ponta, com evidência (report, trace, screenshots).

---

## Fase 0 — Auditoria / Stack

### Ferramentas existentes

| Item | Estado |
|------|--------|
| **Package manager** | npm (package-lock.json) |
| **Unit tests** | Vitest (`npm run test`) |
| **E2E** | **Playwright** já instalado (`@playwright/test` 1.58.2) |
| **App** | Vite, porta **8080** |
| **Supabase** | Via env (remoto ou local manual). Não há `supabase start` nos scripts. |

### Comandos para rodar localmente

```bash
# 1. Variáveis de ambiente (obrigatório para E2E)
# Copie .env.e2e.example para .env.e2e e preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
# Ou exporte no shell:
#   export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
#   export E2E_ADMIN_EMAIL=qa-admin@example.com E2E_ADMIN_PASSWORD=qa-admin-e2e-secure  # opcional

# 2. Seed de dados QA (rodado automaticamente pelo globalSetup do Playwright)
npm run seed:qa

# 3. App (em outro terminal, ou deixe o webServer do Playwright subir)
npm run dev

# 4. Rodar E2E
npm run test:e2e

# 5. Ver report após falhas
npm run test:e2e:report

# 6. Modo UI (opcional)
npm run test:e2e:ui
```

### Configuração Playwright (após Fase 0)

- **baseURL:** `http://localhost:8080` (ou `APP_BASE_URL`)
- **Retries em CI:** 2
- **trace:** on-first-retry
- **screenshot:** only-on-failure
- **video:** retain-on-failure
- **outputDir:** test-results/playwright
- **Reporter em CI:** list + HTML em test-results/playwright-report

### Guard de produção

O `global-setup` aborta se `NODE_ENV=production` ou `VITE_MODE=production`, para evitar rodar E2E em produção por engano.

### Infra para testes

- **Preferência:** Supabase local (`supabase start` / `supabase db reset` + migrations + seed). Não está automatizado nos scripts atuais.
- **Modo remoto (staging):** Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` apontando para um projeto de staging. Documente no README ou aqui as env vars necessárias.
- **Arquivo .env.e2e:** Use para carregar variáveis só em E2E (ex.: `dotenv -e .env.e2e -- playwright test`). Não commite `.env.e2e` com chaves reais.

---

## O que é mockado e por quê

| Alvo | Estratégia | Motivo |
|------|------------|--------|
| **Stripe / Yampi / Appmax ao vivo** | Não depender de pagamento real em CI. Interceptar respostas das edges ou usar modo E2E (header `x-e2e: true`) que marca pedido como pago sem gateway. | CI sem chaves reais; testes estáveis. |
| **checkout-router route "start"** | Pode chamar a edge de verdade com Supabase local/staging; preços vêm do DB (variantes). | Validar schema Zod, rate limit, idempotência. |
| **stripe-webhook / yampi-webhook** | Chamar edges com payloads fixture; validar updates no DB (idempotência, não duplicar). | Testar webhooks sem Stripe/Yampi real. |
| **Resolve** | Chamar checkout-create-session com `action: "resolve"`; resposta com provider/channel/experience/flow. | Validar leitura da canônica. |

---

## Como rodar em CI

- Definir env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` (secrets).
- `npm run test:e2e` (Playwright sobe o webServer e roda os testes).
- **Artifacts:** guardar `test-results/playwright-report` (HTML), `test-results/playwright` (traces, screenshots, vídeos em falha).

---

## Como ler o report

- **List reporter:** saída no terminal (pass/fail por teste).
- **HTML report (CI):** `playwright show-report test-results/playwright-report` ou publicar o diretório como artifact.
- **Trace (falha):** em `test-results/playwright/` há pastas por teste; abrir com `playwright show-trace <path>`.
- **Screenshots:** em `test-results/playwright/` nas pastas do teste que falhou.
- **request_id:** nos logs do teste ou via interceptação de rede (page.request) para correlacionar com logs do backend.

---

## Estrutura de specs (alvo)

- **e2e/** — raiz dos testes (testDir)
  - **e2e/global-setup.ts** — seed:qa + guard prod
  - **e2e/helpers/** — db, auth, cart, settings, http, assertions
  - **e2e/specs/** — checkout-start-thin, checkout-stripe-internal, checkout-stripe-external, checkout-yampi-external, idempotency-double-click, refresh-resume
  - **e2e/api/** — router-start-validation, rate-limit, webhook-idempotency, reconcile-order, reprocess-stripe-webhook (podem ser .spec.ts que usam requestContext em vez de page)
  - **e2e/admin-*.spec.ts** — admin-orders-pagination, admin-checkout-settings, commerce-health-webhooks (mantidos na raiz ou em specs/)
- **Fixtures:** em e2e/fixtures/ para payloads de webhook (stripe event_id, yampi payload, etc.)

---

## Fases 1–5 concluídas

### Fase 1 — Helpers e seed
- **e2e/helpers/** — db.ts, auth.ts, settings.ts, http.ts, assertions.ts, cart.ts, index.ts
- **Seed:** `npm run seed:qa` (globalSetup); 1 categoria, 1 produto + variante, admin qa-admin@example.com
- **Cleanup:** cleanupE2EOrders, cleanupE2EWebhookEvents (prefixo e2e_)

### Fase 2 — Specs comprador (e2e/specs/)
- checkout-start-thin.spec.ts (route start, render, redirect)
- checkout-stripe-internal.spec.ts (mock router → /checkout)
- checkout-stripe-external.spec.ts (redirect, /checkout/obrigado)
- checkout-yampi-external.spec.ts (redirect yampi)
- idempotency-double-click.spec.ts (duplo clique)
- refresh-resume.spec.ts (F5 em /checkout e /checkout/obrigado)

### Fase 3 — Specs admin (e2e/specs/)
- admin-orders-pagination.spec.ts
- admin-checkout-settings.spec.ts
- admin-commerce-health-webhooks.spec.ts

### Fase 4 — Backend API (e2e/api/)
- router-start-validation.spec.ts (400 inválido, 200 válido)
- rate-limit.spec.ts (31 req → 429)
- webhook-idempotency.spec.ts (skip sem STRIPE_WEBHOOK_SECRET)
- reconcile-order.spec.ts (404, 400)
- reprocess-stripe-webhook.spec.ts (400, 404)

### Fase 5 — Execução e CI
- **Script full:** `npm run test:e2e:full` (seed:qa + playwright test)
- **CI:** `.github/workflows/e2e.yml` — roda em push/PR para main; artifacts: playwright-report, playwright-results (em falha)

### Total de testes (aprox.)
- Specs novos (specs/ + api/): ~25 testes
- Existentes (admin-smoke, checkout-flow, product-card-click, stripe-checkout-embedded): ~15+
- **Total:** ~40+ testes E2E

### Como rodar local
1. `cp .env.e2e.example .env.e2e` e preencha SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (e opcional E2E_ADMIN_*).
2. `npm run test:e2e:full` (faz seed + E2E) ou `npm run seed:qa` depois `npm run test:e2e`.
3. Em falha: `npm run test:e2e:report` e/ou `npx playwright show-trace test-results/playwright/...`

### Sugestões de estabilização
- **Flakiness:** aumentar timeouts em specs que dependem de redirect externo (Stripe/Yampi); usar `waitForURL` com timeout maior.
- **CI:** garantir que SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY apontem para staging ou Supabase local em runner; rate-limit pode falhar se várias jobs rodarem com mesmo IP (usar cart_id único por run).
- **Webhook idempotency:** para rodar sem Stripe real, implementar modo E2E na edge stripe-webhook (ex.: header x-e2e + secret de teste) ou manter test skip quando STRIPE_WEBHOOK_SECRET não definido.

---

## Resumo Fase 0 (entregue)

- **Ferramenta de teste E2E:** Playwright já existe.
- **Comandos:** `npm run test:e2e`, `npm run test:e2e:ui`, `npm run test:e2e:report`.
- **App:** Vite, porta 8080.
- **Supabase:** remoto ou local manual; variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórias para seed e testes.
- **Config atualizada:** trace, screenshot, video, outputDir, reporter HTML em CI, guard produção no global-setup.

Em seguida: Fases 1–5 (helpers, fixtures, specs comprador/admin/API, script full, CI).
