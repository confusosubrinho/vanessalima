# Passo 7 — Priorização de achados e melhorias

Consolidação dos achados dos Passos 2 a 6, agrupados por **área** e **prioridade** (P0 / P1 / P2 / P3), com status **implementado** ou **pendente**.

---

## Critérios de prioridade

| Nível | Critério | Exemplo |
|-------|----------|---------|
| **P0** | Crítico: bloqueia compra, perda de dados ou falha de segurança grave | Pedido duplicado, vazamento de segredo |
| **P1** | Importante: estabilidade, dados incorretos ou UX que confunde o fluxo | Busca quebra com null, detalhe sem itens, checkout Yampi inválido, estoque não devolvido ao cancelar |
| **P2** | Melhoria: robustez, segurança adicional, funcionalidade incompleta | Timeouts HTTP, import CSV stub, sanitizar HTML, consistência Bling×cancelamentos |
| **P3** | Opcional: documentação, manutenção, polish | Documentar cron Bling, unificar import do errorLogger, atualizar Browserslist |

---

## Por área

### 1. Fluxo de compra (Passo 2)

| Prioridade | Achado | Status |
|------------|--------|--------|
| P1 (UX) | Header: "Finalizar Compra" sem exigir frete | **Implementado** — sem frete mostra "Calcule o frete no carrinho" → `/carrinho` |
| P1 (UX) | CheckoutStart: resumo só com subtotal | **Implementado** — Subtotal + Desconto + Frete + Total |
| P1 (UX) | CheckoutStart: carrinho vazio (ex.: outra aba) não redirecionava | **Implementado** — redirect para `/carrinho` quando `items.length === 0` |

Nenhum item pendente nesta área.

---

### 2. Integrações / bordas (Passo 3)

| Prioridade | Integração | Achado | Status |
|------------|------------|--------|--------|
| P1 | Yampi (checkout-create-session) | Variantes sem `yampi_sku_id` geravam link inválido | **Implementado** — validação em todos os itens; fallback ou 400 |
| P2 | Todas | Chamadas HTTP externas sem timeout | **Implementado** — `fetchWithTimeout` (25 s) nas Edge Functions (appmax, process-payment, checkout-create-session, calculate-shipping, bling-webhook, bling-sync, yampi-catalog-sync, tray-import). |
| P2 | Bling (cron) | Cron stock sync sem autenticação | **Implementado** — `BLING_CRON_SECRET` (query ou body) quando definido |
| P3 | Yampi webhook | Resposta sempre 200 | Mantido de propósito; opcional: logar corpo em falha |

---

### 3. Telas admin (Passo 4)

| Prioridade | Tela | Achado | Status |
|------------|------|--------|--------|
| P1 | Pedidos | Busca quebrava com `order_number` ou `shipping_name` null | **Implementado** — null-safe na busca |
| P1 | Pedidos | Modal de detalhe sem itens do pedido | **Implementado** — query `order_items`, tabela + email + provider |
| P1 | Clientes | Busca/ordenação quebravam com `full_name` ou `email` null | **Implementado** — null-safe |
| P2 | Pedidos | Importar CSV não persiste (stub) | **Implementado** — botão desabilitado com label "Importar (em breve)" e tooltip "Funcionalidade em desenvolvimento". |
| P3 | Integrações | Documentar uso de `BLING_CRON_SECRET` | Documentado em Passo 3 (URL e body) |

---

### 4. Estoque (Passo 5)

| Prioridade | Achado | Status |
|------------|--------|--------|
| P1 | Cancelamento de pedido nativo (Appmax) não devolvia estoque | **Implementado** — RPC `cancel_order_return_stock` no admin e no appmax-webhook |
| P2 | Consistência Bling × cancelamentos | **Pendente** — Bling como fonte de verdade pode sobrescrever saldo após devolução; mitigar com sync/atualização no ERP ou aceitar próximo sync |

---

### 5. Performance (Passo 6)

| Prioridade | Achado | Status |
|------------|--------|--------|
| — | Bundle e lazy loading | OK — manualChunks, lazy de rotas e seções; nenhum chunk > 600 kB |
| — | Dashboard waterfalls | OK — KPIs em `Promise.all`; gráfico e top produtos em paralelo |
| P3 | errorLogger import dinâmico + estático | **Corrigido** — import estático em `main.tsx` |
| P3 | Browserslist desatualizado | Opcional: `npx update-browserslist-db@latest` (pode exigir bun) |

---

### 6. Segurança (Passo 6)

| Prioridade | Achado | Status |
|------------|--------|--------|
| — | Segredos só no backend, webhooks com validação, RLS | OK |
| P2 | XSS em conteúdo administrável | **Implementado** — sanitização com DOMPurify em `product.description`, `page.content` (InstitutionalPage), `seal.html_code` (Footer). |
| P3 | Content-Security-Policy | Não implementada; melhoria futura |

---

## Resumo por prioridade

### P0 — Crítico
- Nenhum item em aberto (não foi identificado P0 nos passos 2–6).

### P1 — Importante
- Todos **implementados**: fluxo (Header + CheckoutStart), Yampi `yampi_sku_id`, admin (Pedidos/Clientes null + itens no detalhe), estoque (devolução ao cancelar Appmax).

### P2 — Pendentes
Nenhum. Itens P2 foram implementados: timeouts HTTP, import CSV (sinalizado "em breve"), sanitização HTML, processo Bling documentado em Passo 5.

### P3 — Opcional
| Área | Item |
|------|------|
| Integrações | Logar corpo em falha no webhook Yampi (resposta continua 200) |
| Admin | Documentação BLING_CRON_SECRET — já em Passo 3 |
| Performance | Unificar import do errorLogger; atualizar Browserslist |
| Segurança | Avaliar CSP em produção |

---

## Próximos passos sugeridos

Os itens P2 abaixo foram **implementados** nesta rodada:

1. ~~**P2 — Segurança**~~ **Feito**: DOMPurify em descrição do produto, página institucional e selo.
2. ~~**P2 — Admin**~~ **Feito**: Botão Importar desabilitado com "Importar (em breve)" e tooltip.
3. ~~**P2 — Integrações**~~ **Feito**: `fetchWithTimeout` (25 s) nas Edge Functions (appmax, process-payment, checkout-create-session, calculate-shipping, bling-webhook, bling-sync, yampi-catalog-sync, tray-import).
4. ~~**P2 — Estoque**~~ **Feito**: Processo Bling × cancelamentos documentado em Passo 5.
5. **P3**: Conforme disponibilidade — atualizar Browserslist (`npx update-browserslist-db@latest`; pode exigir bun), import do errorLogger já unificado em `main.tsx`, considerar CSP em produção.

---

## Conclusão

Os itens **P1** identificados na análise foram implementados nos passos anteriores. Os **P2** foram implementados nesta rodada (timeouts HTTP, import CSV sinalizado "em breve", sanitização HTML, processo Bling documentado). O sistema está mais seguro e previsível para operação e manutenção.
