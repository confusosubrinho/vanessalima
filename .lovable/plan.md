

## Auditoria do Sistema de Avaliações — Bugs, Melhorias e Mobile

Após análise de `ProductReviews.tsx` (frontend), `Reviews.tsx` (admin), `ProductCard.tsx` e `ProductDetail.tsx`, identifiquei os seguintes problemas:

---

### Bug 1 (Alto): Filtro inconsistente entre `is_approved` e `status` — avaliações podem não aparecer

O sistema tem **dois campos** de moderação na tabela `product_reviews`: `is_approved` (boolean legado) e `status` (enum: pending/published/rejected). Os componentes filtram de formas diferentes:

- `ProductCard.tsx` e `ProductDetail.tsx`: filtram apenas por `.eq('is_approved', true)` — ignoram `status`
- `ProductReviews.tsx`: filtra por `.eq('is_approved', true)` E `.eq('status', 'published')` — duplo filtro

O admin (`Reviews.tsx`) só atualiza `status`, nunca muda `is_approved`. Resultado: quando o admin publica uma avaliação (`status = 'published'`), ela aparece no `ProductReviews` **somente se** `is_approved` também for `true` (que é o default). Mas se `is_approved` for `false`, a avaliação fica invisível apesar de publicada.

**Fix**: Padronizar todos os componentes para filtrar apenas por `status = 'published'`, removendo referências a `is_approved`. O campo `is_approved` é legado e deve ser ignorado.

---

### Bug 2 (Alto): Query com cast `as any` quebra cadeia do Supabase builder

Em `ProductReviews.tsx` linha 30-35:
```typescript
const { data, error } = await (supabase
  .from('product_reviews')
  .select('*')
  .eq('product_id', productId)
  .eq('is_approved', true) as any)
  .eq('status', 'published')
```

O `as any` foi inserido para contornar um erro de tipagem, mas quebra a cadeia do query builder. O `.eq('status', 'published')` pode não ser aplicado corretamente em runtime dependendo da versão do SDK.

**Fix**: Remover o cast `as any` e o filtro `is_approved`, usar apenas `.eq('status', 'published')`.

---

### Bug 3 (Médio): Admin Reviews sem layout mobile — botões de ação inacessíveis

A página `Reviews.tsx` renderiza botões de ação (Publicar/Rejeitar/Responder/Ver) em uma coluna lateral (`shrink-0`). No mobile, isso comprime o conteúdo da avaliação e os botões ficam apertados. Não há tratamento com `useIsMobile`.

**Fix**: No mobile, mover os botões de ação para baixo do conteúdo da avaliação (stack vertical) em vez de ao lado.

---

### Bug 4 (Médio): Formulário de avaliação sem validação de tamanho — possível abuso

O formulário em `ProductReviews.tsx` aceita `name`, `title` e `comment` sem limite de caracteres. Um usuário mal-intencionado pode enviar textos enormes.

**Fix**: Adicionar `maxLength` nos inputs (name: 100, title: 150, comment: 1000) e exibir contador de caracteres no textarea.

---

### Melhoria 5 (Médio): Avaliações no frontend sem paginação

`ProductReviews.tsx` carrega até todas as avaliações publicadas de um produto sem limite. Com muitas avaliações, a página fica pesada.

**Fix**: Adicionar `.limit(10)` na query inicial e um botão "Carregar mais" que incrementa o range.

---

### Melhoria 6 (Baixo): Admin Reviews — contagem de avaliações pendentes no título

Não há indicação visual de quantas avaliações estão pendentes de moderação. O admin precisa filtrar manualmente.

**Fix**: Adicionar badge com contagem de pendentes no título da página.

---

### Arquivos a Modificar

1. **`src/components/store/ProductReviews.tsx`** — Corrigir query (remover `is_approved`/`as any`), adicionar limite + "carregar mais", validação de input
2. **`src/pages/ProductDetail.tsx`** — Trocar filtro `is_approved` por `status = 'published'`
3. **`src/components/store/ProductCard.tsx`** — Trocar filtro `is_approved` por `status = 'published'`
4. **`src/pages/admin/Reviews.tsx`** — Adicionar layout mobile responsivo e badge de pendentes

