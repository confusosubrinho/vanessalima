

# Auditoria de Bugs e Melhorias na Integração Bling

## Bugs Encontrados

### BUG 1 — Response body consumida duas vezes em `cancelBlingOrder` (MÉDIO)
Em `blingStockPush.ts` linha 221, quando `response.ok === true`, o código chama `response.body?.cancel()`. Porém o body nunca foi lido (nenhum `await response.json()` ou `await response.text()`). Isso funciona mas desperdiça a resposta do Bling que pode conter dados úteis para log. Não é um crash, mas é inconsistente com o fluxo do `!response.ok` onde o body é lido via `.json()`.

### BUG 2 — `syncStockOnly` faz query de estoque sem batching (MÉDIO)
Em `bling-webhook/index.ts` linhas 386-389, `syncStockOnly` monta TODOS os IDs de variação numa única query string (`idsProdutos[]=X&idsProdutos[]=Y...`). Para produtos com muitas variações (50+), a URL pode exceder limites de URL do Bling, causando erro 414. O `bling-sync` faz batching correto em lotes de 50, mas o webhook não.

### BUG 3 — `order_events` INSERT policy é `WITH CHECK (true)` (BAIXO)
A tabela `order_events` tem policy de INSERT com `WITH CHECK (true)` — qualquer usuário autenticado pode inserir eventos. Deveria ser restrito a service role/admins, similar à correção feita nas outras tabelas de serviço.

### BUG 4 — `stripe_webhook_events` INSERT policy é `WITH CHECK (true)` (BAIXO)
Mesmo problema do BUG 3 — qualquer usuário pode inserir registros de webhook do Stripe.

### BUG 5 — Token refresh na `blingTokenRefresh.ts` não valida `tokenData.refresh_token` (BAIXO)
Na linha 47 do refresh, se `tokenData.access_token` existir mas `tokenData.refresh_token` for null/undefined, o update vai gravar `null` no campo `bling_refresh_token`, quebrando futuros refreshes. Deveria manter o refresh_token antigo se o novo não vier.

## Melhorias Propostas

### MELHORIA 1 — Batching no `syncStockOnly` do webhook
Aplicar o mesmo padrão de lotes de 50 IDs que já existe no `bling-sync` para evitar URLs longas demais.

### MELHORIA 2 — Proteger refresh_token contra sobrescrita por null
Em `blingTokenRefresh.ts`, só atualizar `bling_refresh_token` se o novo valor existir.

### MELHORIA 3 — Restringir INSERT em `order_events` e `stripe_webhook_events`
Aplicar `is_admin()` no `WITH CHECK` dessas tabelas de serviço, igual ao que foi feito na migration anterior.

### MELHORIA 4 — Log de auditoria em `cancelBlingOrder`
Consumir o body da resposta de sucesso para logar o resultado do cancelamento.

## Arquivos Modificados

- **`supabase/functions/_shared/blingTokenRefresh.ts`** — Proteger refresh_token contra null
- **`supabase/functions/bling-webhook/index.ts`** — Batching na `syncStockOnly`
- **`supabase/functions/_shared/blingStockPush.ts`** — Consumir body corretamente no cancel
- **1 migration SQL** — Restringir INSERT em `order_events` e `stripe_webhook_events`

## Nenhuma regra existente será afetada
Todas as correções são aditivas ou defensivas. Não alteram lógica de negócio, fluxos de sync ou comportamento de webhook existentes.

