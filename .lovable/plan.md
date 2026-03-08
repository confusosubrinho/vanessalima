

## Bling Integration — Round 8: Bugs & Correções

### Bug 1 (Médio): `bling-sync-single-stock` não usa `hasRecentLocalMovements` nem registra `inventory_movements`

A função de sincronização individual de estoque (`bling-sync-single-stock`) atualiza o `stock_quantity` diretamente (linhas 203-204, 213-214, 224-226) sem verificar movimentos locais recentes e sem registrar entradas em `inventory_movements`. Isso significa que um admin pode acidentalmente sobrescrever estoque de uma venda recente ao clicar "Sincronizar estoque" para um produto individual, e a movimentação não aparece na auditoria.

**Fix**: Adicionar `hasRecentLocalMovements` check antes de cada update e registrar `inventory_movements` com `type: "bling_sync"` quando o estoque muda.

---

### Bug 2 (Médio): `bling-sync-single-stock` usa `fetch` nativo em vez de `fetchWithTimeout`

Nas linhas 123, 142 e 188, as chamadas à API do Bling usam `fetch()` nativo sem timeout. Se a API do Bling travar, a Edge Function fica pendente até o timeout do runtime (60s), sem feedback para o admin.

**Fix**: Substituir `fetch()` por `fetchWithTimeout()` (já importável de `_shared/fetchWithTimeout.ts`).

---

### Bug 3 (Médio): `bling-sync-single-stock` não verifica `admin_members` para autorização

A verificação de admin (linhas 46-52) checa apenas `user_roles` mas não `admin_members`. Outros módulos (`bling-sync`, `bling-oauth`) verificam ambas as tabelas. Um membro de equipe com role em `admin_members` mas não em `user_roles` recebe "Acesso negado" ao tentar sincronizar estoque individual.

**Fix**: Adicionar fallback para `admin_members` como nos outros módulos.

---

### Bug 4 (Baixo): `bling-oauth` gera `state` no `get_auth_url` mas não valida no callback

Na linha 157, um `state` UUID é gerado e incluído na URL de autorização. Porém, no callback (linhas 24-90), o `state` retornado pelo Bling não é verificado. Isso viola a proteção CSRF do OAuth 2.0 — um atacante pode forjar callbacks com códigos obtidos de outra forma.

**Fix**: Armazenar o `state` gerado (em tabela temporária ou como cookie/header) e validar no callback. Como alternativa mais simples para o momento, verificar que o `state` param existe e é um UUID válido.

---

### Bug 5 (Baixo): `cancelBlingOrder` não consome response body no path de sucesso

Na linha 218-221 de `blingStockPush.ts`, quando o PATCH retorna sucesso (`response.ok`), o body nunca é consumido. Isso pode causar resource leak no Deno, similar ao que foi corrigido no `fetchWithRateLimit`.

**Fix**: Adicionar `await response.text()` ou `await response.body?.cancel()` no path de sucesso.

---

### Bug 6 (Baixo): `updateStockForBlingId` pode se chamar recursivamente sem limite

Na linha 250 de `bling-webhook`, quando `newStock === undefined && token`, a função busca o saldo e chama `updateStockForBlingId` recursivamente. Se o Bling retornar dados inconsistentes (ex: `stock === null` na primeira chamada mas não na recursiva), pode ocorrer um loop. Embora na prática o guard `if (stock !== null)` previna isso, não há proteção explícita contra recursão.

**Fix**: Adicionar um parâmetro `depth` para limitar a recursão a 1 nível.

---

### Arquivos a Modificar

1. **`supabase/functions/bling-sync-single-stock/index.ts`** — Adicionar `hasRecentLocalMovements`, `inventory_movements`, `fetchWithTimeout`, e fallback `admin_members`
2. **`supabase/functions/_shared/blingStockPush.ts`** — Consumir body no `cancelBlingOrder` sucesso
3. **`supabase/functions/bling-webhook/index.ts`** — Adicionar guard de recursão no `updateStockForBlingId`

### Deploy
Redeploy: `bling-sync-single-stock`, `bling-webhook`

