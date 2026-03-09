

# Auditoria UX Completa — Rodada 5

## Problemas de UX Identificados

### UX 1 — ALTO: Carrinho lateral no mobile sem botão de ir ao carrinho sem frete
No carrinho lateral (Header Sheet), quando o usuário não calculou frete, o botão exibe "Calcule o frete no carrinho" com `variant="secondary"`. Porém, se o usuário tem frete já selecionado e vai ao checkout, não há indicação visual de que o frete pode mudar. Além disso, o carrinho lateral no mobile não mostra a cor da variante — mostra apenas "Tam: X" (linha 378), omitindo informação que o Cart.tsx completo exibe (linha 130-132).

**Correção:** Adicionar a cor da variante no carrinho lateral, exibindo `{item.variant.color && <span> · {item.variant.color}</span>}` junto ao tamanho. Garante paridade de informações entre carrinho lateral e página de carrinho.

### UX 2 — ALTO: ProductCard botão de compra só aparece no hover (desktop) — invisível em touch
O botão de compra rápida no ProductCard (linha 183-193) usa `opacity-0 group-hover:opacity-100`, que funciona em desktop mas é inacessível em dispositivos touch. Usuários mobile/tablet precisam clicar no card e ir à página do produto para comprar, sem indicação visual de que podem fazer compra rápida.

**Correção:** Tornar o botão sempre visível em mobile (`opacity-100` em telas pequenas, mantendo hover behavior em desktop). Usar `opacity-0 md:group-hover:opacity-100 max-md:opacity-100`.

### UX 3 — MÉDIO: Carrinho vazio sem animação ou sugestão de produtos
Quando o carrinho está vazio (Cart.tsx linhas 57-68 e Header linhas 331-338), mostra apenas ícone + texto + botão. Não oferece sugestões de produtos populares ou recentes, perdendo oportunidade de reconversão.

**Correção:** Adicionar um componente de "Produtos em alta" ou "Vistos recentemente" abaixo da mensagem de carrinho vazio, tanto na página Cart quanto no carrinho lateral.

### UX 4 — MÉDIO: Newsletter hardcoded "5% de desconto" sem relação com cupons reais
O componente Newsletter (linhas 56-60) promete "cupom exclusivo de 5%" mas o sistema não gera cupom automaticamente ao cadastrar. Se o cupom não existir no banco, o usuário se frustra.

**Correção:** Tornar o texto da newsletter configurável via `store_settings` (campo `newsletter_headline` e `newsletter_description`). Se não configurado, usar texto genérico sem prometer desconto específico.

### UX 5 — MÉDIO: Toque no WhatsApp float sobrepõe StickyAddToCart no mobile
O WhatsAppFloat (linha 40) posiciona-se em `bottom-24 right-4` no mobile e o StickyAddToCart ocupa `bottom-0`. Os dois coexistem, mas o WhatsApp fica muito próximo da barra sticky, causando toque acidental. A barra sticky tem `z-40`, o WhatsApp tem `z-50`.

**Correção:** Quando `StickyAddToCart` está visível, elevar o WhatsApp float para `bottom-[calc(5rem+env(safe-area-inset-bottom))]` em mobile, garantindo espaçamento adequado. Passar `showStickyBar` como contexto ou CSS variable.

### UX 6 — MÉDIO: CookieConsent posicionado no canto inferior pode sobrepor WhatsApp e StickyAddToCart
O CookieConsent (linha 31) usa `fixed bottom-4 left-4 right-4` no mobile, colidindo com WhatsApp e StickyAddToCart. Três elementos fixos competem pelo mesmo espaço.

**Correção:** No mobile, posicionar o CookieConsent na parte superior da tela (`top-0`) ou em um modal central para evitar colisão. Em desktop, manter posição inferior.

### UX 7 — BAIXO: Checkout bloqueia "Finalizar Compra" sem frete mas não foca automaticamente no calculador
No Cart.tsx (linhas 255-258), o botão "Finalizar Compra" fica desabilitado com texto "Calcule o frete primeiro", mas não há scroll automático ou destaque visual no ShippingCalculator para guiar o usuário.

**Correção:** Ao renderizar com frete não selecionado, adicionar um `pulse` ou `ring` no ShippingCalculator para chamar atenção, e ao clicar no botão desabilitado, fazer scroll suave até o componente de frete.

### UX 8 — BAIXO: OG meta tags geradas com DOM manipulation direto em vez de Helmet
No ProductDetail (linhas 618-633), meta tags OG são geradas com `document.querySelector/createElement` diretamente no render. Isso é frágil, pode criar duplicatas e não limpa ao desmontar.

**Correção:** Mover todas as meta tags OG para dentro do `<Helmet>` que já existe (linha 609-612), usando `<meta property="og:title" content={...} />` etc. O react-helmet-async gerencia o ciclo de vida corretamente.

## Melhorias Propostas

### MELHORIA 1 — Exibir cor da variante no carrinho lateral
Adicionar `item.variant.color` na exibição do carrinho lateral no Header.tsx.

### MELHORIA 2 — Botão de compra rápida visível em mobile
Alterar classes do botão de compra no ProductCard para ser sempre visível em telas touch.

### MELHORIA 3 — Mover OG meta tags para Helmet
Refatorar ProductDetail para usar `<Helmet>` para todas as meta tags OG, removendo manipulação direta do DOM.

### MELHORIA 4 — CookieConsent mobile reposicionado
Alterar posição do CookieConsent para `top-0` em mobile, evitando colisão com elementos fixos inferiores.

### MELHORIA 5 — Scroll to frete no botão desabilitado do carrinho
Adicionar `onClick` no botão desabilitado que faz scroll suave até o ShippingCalculator.

## Arquivos Modificados

- **`src/components/store/Header.tsx`** — Exibir cor da variante no carrinho lateral
- **`src/components/store/ProductCard.tsx`** — Botão de compra rápida visível em mobile
- **`src/pages/ProductDetail.tsx`** — Mover OG meta tags para Helmet
- **`src/components/store/CookieConsent.tsx`** — Reposicionar em mobile para evitar colisão
- **`src/pages/Cart.tsx`** — Scroll to frete ao clicar botão desabilitado

## Sem alteração de regras de negócio
Todas as correções são visuais/UX. Nenhuma lógica de pagamento, autenticação ou processamento de dados será alterada.

