

## Auditoria do Painel Admin — Bugs e Melhorias

---

### Bug 1 (Alto): Console warning — ProductCarousel "cannot be given refs"

O `ProductCarousel` é um componente funcional regular que recebe ref via `useHorizontalScrollAxisLock` internamente, mas quando usado em `ProductDetail.tsx` com `ref`, gera o warning "Function components cannot be given refs". Isso é o mesmo padrão que corrigimos no WhatsAppFloat/CookieConsent.

**Fix**: Não é necessário `forwardRef` aqui — o problema está no chamador. Verificar se `ProductDetail.tsx` passa `ref` ao `ProductCarousel` e remover essa passagem, já que o componente gerencia seu próprio ref internamente.

---

### Bug 2 (Alto): Pedidos carregam apenas 50 registros sem paginação

`Orders.tsx` faz `.range(0, 49)` e filtra/ordena **client-side**. Se há mais de 50 pedidos, o admin só vê os 50 mais recentes. Não há botões de paginação nem indicação de que existem mais pedidos. Os filtros de data e valor atuam apenas sobre esses 50.

**Fix**: Adicionar paginação no componente de pedidos (similar ao que `Products.tsx` já tem com `currentPage` e `totalPages`). Manter a query limitada mas adicionar navegação entre páginas.

---

### Bug 3 (Médio): Clientes carregam TODOS os registros sem limite

`Customers.tsx` faz `select('*')` sem `.limit()`. Com milhares de clientes, isso vai causar lentidão e possivelmente timeout. Diferente de Pedidos que limita a 50, Clientes não tem nenhum limite.

**Fix**: Adicionar `.limit(200)` e paginação client-side, ou implementar paginação server-side.

---

### Bug 4 (Médio): Exclusão de produto sem confirmação

Em `Products.tsx` (linhas 735, 837), `deleteMutation.mutate(product.id)` é chamado diretamente no `DropdownMenuItem` sem `AlertDialog` de confirmação. Um clique acidental exclui o produto permanentemente.

**Fix**: Adicionar state `productToDelete` e um `AlertDialog` de confirmação antes de executar a exclusão, similar ao padrão já usado em `Orders.tsx` para `orderToDeleteTest`.

---

### Bug 5 (Médio): Dashboard KPIs incluem pedidos cancelados na receita

Em `Dashboard.tsx` (linha 169), a receita é calculada somando `total_amount` de **todos** os pedidos no período, incluindo `cancelled`. Isso infla os números de receita e ticket médio.

**Fix**: Filtrar pedidos com status `cancelled` ao calcular receita: `currentOrders.data?.filter(o => o.status !== 'cancelled')`.

---

### Bug 6 (Baixo): AdminErrorIndicator não aparece no mobile

Em `AdminLayout.tsx` (linha 619), o `<AdminErrorIndicator />` só é renderizado no layout desktop. No layout mobile (linha 564-591), não há referência ao componente. Admins usando mobile não veem erros do sistema.

**Fix**: Adicionar `<AdminErrorIndicator />` no layout mobile, antes do `<MobileBottomBar />`.

---

### Bug 7 (Baixo): Página de Clientes sem layout mobile responsivo

`Customers.tsx` renderiza a tabela desktop em todas as resoluções (não usa `useIsMobile`). No mobile, a tabela fica com scroll horizontal e difícil de usar. Pedidos e Produtos já têm layouts mobile separados.

**Fix**: Adicionar layout de cards para mobile, similar ao que `Orders.tsx` já faz com `isMobile ? cards : table`.

---

### Arquivos a Modificar

1. **`src/pages/ProductDetail.tsx`** — Remover ref passado ao ProductCarousel
2. **`src/pages/admin/Orders.tsx`** — Adicionar paginação client-side
3. **`src/pages/admin/Customers.tsx`** — Adicionar limite na query, paginação e layout mobile
4. **`src/pages/admin/Products.tsx`** — Adicionar AlertDialog de confirmação antes de excluir
5. **`src/pages/admin/Dashboard.tsx`** — Filtrar pedidos cancelados dos KPIs
6. **`src/pages/admin/AdminLayout.tsx`** — Adicionar AdminErrorIndicator no mobile

