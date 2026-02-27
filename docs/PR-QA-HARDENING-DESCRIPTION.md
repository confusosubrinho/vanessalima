## QA Hardening Final — pré-GO definitivo

### Resumo
Implementação dos 9 itens de hardening antes do GO para produção, com evidências no relatório.

### Itens entregues

| # | Item | Artefatos |
|---|------|------------|
| 1 | **Remover SKIPs Playwright** | `scripts/seed-qa.mjs`, `e2e/global-setup.ts`, E2E sem `test.skip` |
| 2 | **Concorrência estoque** | `src/test/decrement-stock-concurrency.test.ts` |
| 3 | **Reconciliação** | `supabase/functions/reconcile-order/index.ts`, `src/test/reconcile-order.test.ts` |
| 4 | **Webhook chaos** | `docs/QA-WEBHOOK-CHAOS.md`, idempotência no stripe-webhook |
| 5 | **Constraints/Invariantes DB** | `supabase/migrations/20260227160000_qa_constraints_invariants.sql` |
| 6 | **Anti-fraude preço** | Server recalcula total no create-intent; `src/test/anti-fraud-price.test.ts` |
| 7 | **Duas abas** | E2E em `e2e/checkout-flow.spec.ts` (duas abas checkout) |
| 8 | **Reserva/TTL** | `docs/QA-RESERVA-ESTOQUE-TTL.md` |
| 9 | **Observabilidade** | `docs/QA-OBSERVABILIDADE.md`, correlation id em webhook/reconcile |

### Evidências
- **Vitest:** 16 testes, 6 arquivos, todos passando (`npm run test`).
- **E2E:** Com `npm run seed:qa` (ou env SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), globalSetup roda seed → 0 skipped. Sem seed, falhas explícitas.
- **Relatório:** `docs/QA-PRODUCAO-CHECKLIST-E-RELATORIO-FINAL.md` (seção **QA Hardening Final** com tabela e queries/logs).

### Como validar
```bash
npm run test
npm run seed:qa   # opcional, requer env Supabase
npm run test:e2e
```
Aplicar migrations no Supabase (payments UNIQUE + constraints) antes do deploy.
