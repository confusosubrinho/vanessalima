

## Auditoria UX Completa — Bugs e Melhorias

Após analisar todos os componentes principais da loja (Header, ProductCard, ProductDetail, Cart, Checkout, NotFound, Newsletter, SearchPreview, BannerCarousel, StickyAddToCart, VariantSelectorModal, CategoryGrid), identifiquei os seguintes problemas e oportunidades de melhoria:

---

### Bug 1 (Alto): Página 404 não está em português e não usa o layout da loja

O `NotFound.tsx` exibe "Oops! Page not found" em inglês e não utiliza o `StoreLayout`, quebrando a experiência visual. O visitante perde header, footer e navegação.

**Fix**: Traduzir para PT-BR, envolver com `StoreLayout`, adicionar campo de busca e sugestões de navegação para reduzir taxa de abandono.

---

### Bug 2 (Alto): Newsletter não persiste o email — `setTimeout` simula envio

O componente `Newsletter` usa um `setTimeout` de 800ms para simular o cadastro. O email digitado **nunca é salvo** no banco de dados. Visitantes recebem feedback positivo mas nenhum cupom é gerado.

**Fix**: Salvar o email na tabela `newsletter_subscribers` (criar se não existir) e disparar toast apenas após sucesso do insert.

---

### Bug 3 (Médio): Busca mobile sem botão de fechar/limpar o campo

O `SearchPreview` no mobile não tem um botão de limpar (X) quando o campo tem conteúdo. Em telas pequenas, o usuário precisa selecionar manualmente o texto para apagar. Isso causa fricção.

**Fix**: Adicionar ícone X no input quando `query.length > 0`, limpando o campo e fechando o dropdown.

---

### Bug 4 (Médio): `AddedToCartToast` bloqueia interação com a página

O toast de "Adicionado ao carrinho" usa `fixed inset-0` com `pointer-events-none` no container, mas o card interno tem `pointer-events-auto`. O overlay ocupa toda a tela e em alguns navegadores mobile pode interceptar toques fora do card. Além disso, não há feedback de acessibilidade (`role`, `aria-live`).

**Fix**: Mudar de `fixed inset-0` para posicionamento fixo centralizado sem overlay. Adicionar `role="status"` e `aria-live="polite"`.

---

### Bug 5 (Médio): Cart drawer usa preço do produto em vez do preço da variante

No Header (cart drawer), linha 400, o preço é calculado como `Number(item.product.sale_price || item.product.base_price) * item.quantity`, ignorando variantes com preço próprio (`variant.base_price`, `variant.sale_price`). Isso mostra preço incorreto quando variantes têm preços diferentes.

**Fix**: Usar a mesma função `getCartItemUnitPrice(item)` já usada na página Cart.

---

### Bug 6 (Baixo): `StickyAddToCart` exige dois taps para comprar mesmo com variante selecionada

O componente tem lógica de "confirmação em dois passos": primeiro tap rola até variantes, segundo tap adiciona ao carrinho. Quando o usuário **já selecionou** tamanho e cor e desce a página, o primeiro tap no botão "Comprar" ainda rola para cima em vez de adicionar. Isso é contra-intuitivo.

**Fix**: Quando `hasSelectedVariant` é `true`, pular a confirmação e chamar `onAddToCart` diretamente no primeiro tap.

---

### Melhoria 1: Imagens do cart drawer não usam `resolveImageUrl`

As imagens dos itens no cart drawer (Header linhas 367-369) usam `item.product.images?.[0]?.url` diretamente, sem otimização de tamanho. Isso carrega imagens em resolução original dentro de thumbnails de 64px.

**Fix**: Usar `resolveImageUrl(item.product.images?.[0]?.url, { width: 128 })`.

---

### Melhoria 2: Sem feedback visual ao remover item do carrinho

Na página Cart e no drawer, remover um item acontece instantaneamente sem animação. O item desaparece de forma abrupta, causando "flash" de reflow.

**Fix**: Adicionar animação de saída (`animate-out fade-out` do Tailwind) antes de remover o item do estado.

---

### Melhoria 3: VariantSelectorModal não mostra cores

O `VariantSelectorModal` (compra rápida do grid) apenas lista tamanhos. Produtos com variações de cor não mostram opções de cor, potencialmente adicionando a cor errada ao carrinho.

**Fix**: Agrupar variantes por cor quando cores existirem, mostrando seletor de cor antes dos tamanhos, similar ao ProductDetail.

---

### Melhoria 4: Banner carousel sem swipe no mobile

O `BannerCarousel` usa `translateX` para transição mas não tem handlers de touch/swipe. No mobile, o visitante só pode navegar pelos dots, não por gestos naturais.

**Fix**: Adicionar `onTouchStart/onTouchEnd` com detecção de swipe (threshold 50px), similar ao já implementado nos tabs do ProductDetail.

---

### Arquivos a Modificar

1. **`src/pages/NotFound.tsx`** — Traduzir, adicionar StoreLayout e campo de busca
2. **`src/components/store/Newsletter.tsx`** — Persistir email no banco
3. **`src/components/store/SearchPreview.tsx`** — Adicionar botão limpar (X)
4. **`src/components/store/AddedToCartToast.tsx`** — Corrigir posicionamento e acessibilidade
5. **`src/components/store/Header.tsx`** — Corrigir preço no cart drawer com `getCartItemUnitPrice`; otimizar imagens com `resolveImageUrl`
6. **`src/components/store/StickyAddToCart.tsx`** — Remover confirmação dupla desnecessária
7. **`src/components/store/VariantSelectorModal.tsx`** — Adicionar seletor de cor
8. **`src/components/store/BannerCarousel.tsx`** — Adicionar swipe touch

### Banco de Dados

- Criar tabela `newsletter_subscribers` (email, created_at, source) com RLS pública para insert

