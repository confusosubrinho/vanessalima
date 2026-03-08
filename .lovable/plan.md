

## Auditoria do Painel Admin (Parte 2) — Bugs e Melhorias

---

### Bug 1 (Alto): SalesDashboard inclui pedidos cancelados em receita e KPIs

Em `SalesDashboard.tsx` (linhas 104-116), `stats.revenue` soma `total_amount` de **todos** os pedidos sem filtrar cancelados. O mesmo erro corrigido no `Dashboard.tsx` existe aqui. Receita, ticket médio e comparação com período anterior ficam inflados. A query `allOrders` (linha 96-101) também não filtra cancelados para o cálculo de `prevStats`.

**Fix**: Filtrar `orders.filter(o => o.status !== 'cancelled')` antes de calcular `stats` e `prevStats`.

---

### Bug 2 (Alto): SalesDashboard carrega TODOS os pedidos sem limite

A query `allOrders` (linha 96-101) faz `select('id, total_amount, status, created_at')` sem `.limit()`. Com milhares de pedidos, isso causa lentidão e pode atingir o limite de 1000 rows do Supabase, resultando em comparação de período anterior incorreta.

**Fix**: Adicionar filtro temporal na query `allOrders` para carregar apenas os dados necessários para a comparação (período atual + anterior), ou usar `.limit(2000)` com ordenação.

---

### Bug 3 (Médio): Exclusão de cupom e categoria sem confirmação

Em `Coupons.tsx` (linha 344), `deleteMutation.mutate(coupon.id)` é chamado diretamente sem AlertDialog. Em `Categories.tsx` (linha 198), `deleteMutation.mutate(category.id)` também não tem confirmação. Exclusão acidental com um clique.

**Fix**: Adicionar AlertDialog de confirmação similar ao que foi implementado em Products.tsx.

---

### Bug 4 (Médio): Exclusão de banner sem confirmação

Em `Banners.tsx` (linha 156-166), `deleteMutation` existe mas é chamado diretamente sem confirmação. Similar aos Cupons e Categorias.

**Fix**: Adicionar AlertDialog de confirmação.

---

### Bug 5 (Médio): Reviews search com SQL injection via `.or()`

Em `Reviews.tsx` (linha 58), a busca usa `.or(\`customer_name.ilike.%${search}%,comment.ilike.%${search}%\`)` com interpolação direta do `search`. Caracteres especiais como `,`, `.`, `(`, `)` no input podem quebrar a query PostgREST ou injetar filtros indesejados.

**Fix**: Sanitizar o `search` removendo caracteres especiais de PostgREST antes da interpolação, ou usar `.ilike('customer_name', `%${search}%`)` com encadeamento.

---

### Bug 6 (Baixo): Settings salva `soft_descriptor` mas o campo não existe na tabela `store_settings`

O formulário em `Settings.tsx` (linhas 23, 205-212) gerencia `soft_descriptor`, mas a tabela `store_settings` (conforme schema) não tem essa coluna. O `.update()` silenciosamente ignora a coluna inexistente, mas o valor nunca é persistido.

**Fix**: Ou remover o campo do formulário, ou adicionar a coluna `soft_descriptor` via migration.

---

### Arquivos a Modificar

1. **`src/pages/admin/SalesDashboard.tsx`** — Filtrar cancelados dos KPIs; limitar query allOrders
2. **`src/pages/admin/Coupons.tsx`** — Adicionar AlertDialog de confirmação na exclusão
3. **`src/pages/admin/Categories.tsx`** — Adicionar AlertDialog de confirmação na exclusão
4. **`src/pages/admin/Banners.tsx`** — Adicionar AlertDialog de confirmação na exclusão
5. **`src/pages/admin/Reviews.tsx`** — Sanitizar input de busca no `.or()`
6. **`src/pages/admin/Settings.tsx`** — Adicionar coluna `soft_descriptor` via migration ou remover campo do form

