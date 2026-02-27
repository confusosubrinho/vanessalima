# Backend — Pendências e comando único

Este documento consolida o que está **pendente ou necessário** na parte de backend (Supabase, Edge Functions, RPCs, scripts) e o **comando que executa tudo que pode ser automatizado** nesse escopo.

---

## Comando único: validar backend

```bash
npm run qa:backend
```

**O que ele executa (em sequência, falha na primeira falha):**

| Passo | Comando interno | Descrição |
|-------|-----------------|-----------|
| 1 | `npm run typecheck` | Verificação de tipos TypeScript (inclui tipos do Supabase e do projeto). |
| 2 | `npm run test`     | Todos os testes Vitest em `src/**/*.{test,spec}.{ts,tsx}`. |

Ou seja: **typecheck + testes unitários/integração**. Não inclui lint nem E2E (Playwright).

- **Sem variáveis de ambiente:** todos os testes que não dependem de Supabase rodam; os que dependem de `VITE_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` podem ser pulados ou falhar (dependendo do arquivo).
- **Com `VITE_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`:** os testes que chamam Supabase (RPCs, Edge Functions) rodam de fato; use para validar integração com o backend.

**Exit code:** 0 = sucesso; ≠ 0 = typecheck ou algum teste falhou.

---

## Testes que tocam o backend (Vitest)

Estes arquivos em `src/test/` exercitam regras de negócio, RPCs ou Edge Functions:

| Arquivo | O que valida | Requer env Supabase? |
|---------|----------------|----------------------|
| `reconcile-order.test.ts` | Contrato da reconciliação (reconcile-order) | Não (mock) |
| `release-expired-reservations.test.ts` | TTL reserva + liberação de estoque | Sim |
| `decrement-stock-concurrency.test.ts` | Concorrência no `decrement_stock` | Sim |
| `checkout-two-tabs-concurrency.test.ts` | Duas abas / 1 checkout ativo por carrinho | Sim |
| `webhook-security.test.ts` | Assinatura/validação de webhooks | Sim (parcial) |
| `anti-fraud-price.test.ts` | Antifraude de preço no create-intent | Não (mock) |
| `purchase-flow.test.tsx` | Fluxo de compra (UI + dados) | Opcional |
| `product-detail.test.tsx` | Página de produto | Não |

Rodar `npm run qa:backend` com env definido garante que esses testes (quando aplicável) sejam executados.

---

## Pendências que **não** entram no comando (manuais)

Estes itens são necessários para produção ou para evidência completa, mas **não** são executados pelo `qa:backend`:

| Item | Onde está | Ação |
|------|------------|------|
| **Migrations no Supabase** | `supabase/migrations/` (ex.: payments UNIQUE, constraints QA) | Aplicar manualmente no Dashboard (SQL Editor) ou com `supabase db push` se o projeto estiver linkado. Ver `docs/QA-PRODUCAO-MIGRATION-APPLY-VERIFY.md`. |
| **Índice `payments(provider, transaction_id)`** | Migration + doc | Executar no SQL Editor a query de verificação do doc acima e confirmar que o índice existe. |
| **Seed para E2E** | `npm run seed:qa` | Necessário para E2E (Playwright). Rodar antes de `npm run test:e2e` ou garantir que o globalSetup tenha `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` para rodar o seed. |
| **Liberar reservas expiradas** | Edge Function `release-expired-reservations` | Script: `npm run reservations:cleanup` (requer `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`). Uso operacional/cron. |
| **Reconciliar pedidos pendentes** | Edge Function `reconcile-order` | Script: `npm run reconcile:stale [horas]` (requer env). Uso operacional/cron. |
| **test.skip no E2E** | `e2e/admin-smoke.spec.ts` | Um teste usa `test.skip()` quando os botões "Liberar reservas" / "Reconciliar" não aparecem (ex.: sem seed). Não faz parte do `qa:backend` (E2E é outro comando). |

Nenhum deles é “executado” pelo `qa:backend`; são passos de deploy, operação ou validação manual.

---

## Lovable

O projeto usa **Lovable** para auth (`@lovable.dev/cloud-auth-js`) e publicação (ex.: vanessalima.lovable.app). Não há testes automatizados específicos “do Lovable” no repositório; o que importa para o backend é:

- **Typecheck** e **testes Vitest** (incluindo os que chamam Supabase), cobertos por `npm run qa:backend`.
- E2E e publicar no Lovable seguem o fluxo normal (seed, `qa:ultimate` ou `qa:admin`, deploy pela plataforma).

---

## Resumo

- **Para rodar tudo que está pendente e necessário no backend (automatizável):**  
  `npm run qa:backend`

- **Para validação completa incluindo E2E:**  
  Defina `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, rode `npm run seed:qa` (ou deixe o globalSetup rodar) e depois `npm run qa:ultimate` ou `npm run qa:admin`.

- **Pendências que continuam manuais:** migrations, verificação do índice payments, scripts operacionais (reservations:cleanup, reconcile:stale) e o seed quando for usar E2E.
