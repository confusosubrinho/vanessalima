

## Bling Integration — Round 6: Bugs & Melhorias SaaS

### Bug 1 (Crítico): `cleanup_variations` deleta variantes que podem ter pedidos associados

Em `bling-sync` linhas 1029-1035, a ação `cleanup_variations` faz `delete` em `product_variants` em lote (via `in("product_id", chunkIds)`) sem verificar se alguma variante está referenciada em `order_items`. Diferente do `upsertParentWithVariants` (que foi corrigido no Round 5 para desativar em vez de deletar), esta ação ainda pode quebrar referências de pedidos existentes.

**Fix**: Antes de deletar variantes, verificar `order_items.product_variant_id` e apenas desativar as que tiverem referências.

---

### Bug 2 (Médio): `relink_variants` não verifica `hasRecentLocalMovements` antes de atualizar estoque

Em `bling-sync` linhas 983-985, o `relink_variants` atualiza `stock_quantity` para cada variante re-vinculada sem verificar movimentos recentes. Se o admin revincula variantes logo após uma venda, o estoque do Bling (desatualizado) pode sobrescrever o local.

**Fix**: Adicionar `hasRecentLocalMovements` check antes de cada update de estoque no relink.

---

### Bug 3 (Médio): `upsertParentWithVariants` não verifica `hasRecentLocalMovements` ao atualizar estoque de variantes existentes

Em `bling-sync` linhas 393-401, quando uma variante existente é atualizada durante a sincronização de produtos (`sync_products` ou `first_import`), o `stock_quantity` é sobrescrito diretamente sem verificar movimentos locais recentes. Toda a proteção implementada nos rounds anteriores funciona para o cron e o webhook, mas **não** para a sincronização completa de produtos.

**Fix**: Antes de atualizar `stock_quantity` em variantes existentes no `upsertParentWithVariants`, verificar `hasRecentLocalMovements`.

---

### Bug 4 (Médio): `inventory_movements` não é registrado no `syncStock` manual nem no `batchStockSync` do cron

Nos rounds anteriores, o `updateStockForBlingId` (webhook) foi atualizado para registrar `inventory_movements` com `type: "bling_sync"`. Porém, o `syncStock` manual (linhas 778-780) e o `batchStockSync` cron (linhas 528-534) atualizam estoque sem registrar a movimentação. Isso cria gaps na auditoria — é impossível distinguir uma alteração feita pelo cron de uma venda.

**Fix**: Após cada update de estoque no `syncStock` e `batchStockSync`, buscar o estoque anterior e inserir em `inventory_movements` com `type: "bling_sync"`.

---

### Bug 5 (Baixo): `PHASE 4: Clean up variations` pode deletar variantes com pedidos

Em `bling-sync` linhas 694-706, o cleanup de variações standalone faz `delete` em `product_variants`, `product_images`, etc. sem verificar `order_items`. Se uma variação standalone foi comprada antes de ser classificada como variação, deletá-la quebra o pedido.

**Fix**: Verificar `order_items` antes de deletar variantes no cleanup. Desativar em vez de deletar se houver referências.

---

### Bug 6 (Baixo): Response body não consumida em `fetchWithRateLimit` quando há 429

Em `_shared/blingFetchWithRateLimit.ts` linha 12-15, quando o status é 429, o body da response não é consumido antes do retry, causando potencial resource leak no Deno.

**Fix**: Adicionar `await res.text()` ou `await res.body?.cancel()` antes do `continue` no loop de retry.

---

### Melhoria 1: Proteção contra `bling_client_secret` exposto no banco

O `bling_client_secret` está armazenado em texto plano na tabela `store_settings`, que é acessível por RLS a admins. Qualquer admin pode ler o secret via query. Em um SaaS de alto nível, secrets devem estar em variáveis de ambiente ou vault.

**Fix**: Mover `bling_client_secret` para secrets do projeto (via `add_secret` tool) e lê-lo com `Deno.env.get("BLING_CLIENT_SECRET")` nas edge functions. No banco, armazenar apenas uma versão mascarada para exibição na UI.

---

### Melhoria 2: `createOrder` em `bling-sync` não usa `bling_variant_id` nos itens do pedido

Tanto em `bling-sync/createOrder` quanto em `_shared/blingStockPush.ts/autoPushOrderToBling`, os itens do pedido Bling usam apenas o `sku` do produto pai. Se o produto tem variações, o Bling precisa do `codigo` (SKU) da **variante** para decrementar o estoque corretamente. O campo `product_variant_id` está nos `order_items`, mas o SKU da variante não é buscado.

**Fix**: Para cada item do pedido, buscar o SKU da variante em `product_variants` usando `order_items.product_variant_id`, não apenas o SKU do produto pai.

---

### Melhoria 3: `cancelBlingOrder` deveria usar `PATCH` com situação em vez de endpoint inexistente

O endpoint `POST /pedidos/vendas/{id}/cancelar` pode não existir na API v3 do Bling. A documentação oficial usa `PATCH /pedidos/vendas/{id}` com `{ "situacao": { "valor": 12 } }` (12 = cancelado). Se o endpoint não existir, o cancelamento silenciosamente falha.

**Fix**: Verificar e usar o endpoint correto da API v3 do Bling para cancelar pedidos.

---

### Arquivos a Modificar

1. **`supabase/functions/bling-sync/index.ts`** — Proteger `cleanup_variations` e `relink_variants`; adicionar `hasRecentLocalMovements` no `upsertParentWithVariants`; registrar `inventory_movements` no `syncStock`; buscar SKU da variante no `createOrder`
2. **`supabase/functions/bling-webhook/index.ts`** — Registrar `inventory_movements` no `batchStockSync`
3. **`supabase/functions/_shared/blingFetchWithRateLimit.ts`** — Consumir body em resposta 429
4. **`supabase/functions/_shared/blingStockPush.ts`** — Buscar SKU da variante no `autoPushOrderToBling`; corrigir endpoint de cancelamento

### Deploy
Redeploy: `bling-sync`, `bling-webhook`

