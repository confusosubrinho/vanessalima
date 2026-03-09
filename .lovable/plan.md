

# Auditoria UX Completa — Rodada 7

## Problemas de UX Identificados

### UX 1 — ALTO: Página "Minha Conta" sem Helmet/SEO e sem loading state
`MyAccount.tsx` linha 141: quando `loading` é true, retorna `null` — tela em branco sem skeleton ou spinner. Além disso, não há `<Helmet>` para definir título da página. O usuário vê uma tela completamente vazia enquanto a sessão é verificada.

**Correção:** Adicionar skeleton/spinner durante o loading. Adicionar `<Helmet>` com título "Minha Conta | Loja".

### UX 2 — ALTO: Auth.tsx não mostra "Esqueci minha senha"
A página de login (Auth.tsx) não oferece opção de recuperação de senha. Usuários que esqueceram a senha ficam sem alternativa, causando abandono. Nenhum link ou botão para reset.

**Correção:** Adicionar link "Esqueci minha senha" abaixo do campo de senha no formulário de login, com fluxo que chama `supabase.auth.resetPasswordForEmail()`.

### UX 3 — MÉDIO: SearchPreview sem navegação por teclado
O dropdown de resultados de busca (SearchPreview.tsx) não suporta navegação por setas do teclado. Usuários de desktop não conseguem navegar pelos resultados sem usar o mouse. Este item foi identificado na rodada anterior mas não implementado.

**Correção:** Adicionar state `highlightedIndex`, listener `onKeyDown` no input para ArrowUp/ArrowDown/Enter, e highlight visual no item selecionado.

### UX 4 — MÉDIO: MyAccount pedidos sem detalhes expandíveis
Os pedidos em "Minha Conta" (linha 228-252) mostram apenas número, data, status e total. Não há como ver os itens do pedido sem sair da página. Os `order_items` são carregados mas não exibidos.

**Correção:** Adicionar um Collapsible/Accordion em cada pedido que expande para mostrar os itens (nome, quantidade, preço unitário).

### UX 5 — MÉDIO: Cart.tsx carrinho vazio sem sugestões de produtos
O carrinho vazio (linhas 57-69) mostra apenas ícone + texto + botão "Continuar Comprando". Não aproveita a oportunidade de exibir produtos vistos recentemente ou populares para reconversão. Identificado na rodada anterior mas não implementado.

**Correção:** Adicionar `CartProductSuggestions` ou um carrossel de "Mais vendidos" abaixo da mensagem de carrinho vazio.

### UX 6 — BAIXO: Auth.tsx não tem Helmet
A página de autenticação não define `<title>` via Helmet, ficando com o título padrão do `index.html`.

**Correção:** Adicionar `<Helmet><title>Entrar | Loja</title></Helmet>`.

### UX 7 — BAIXO: MyAccount endereço sem auto-preenchimento por CEP
Na aba "Endereço" do MyAccount (linhas 259-311), o campo CEP não tem auto-preenchimento via API de CEP, ao contrário do Checkout que usa `lookupCEP`. O usuário precisa preencher tudo manualmente.

**Correção:** Adicionar `onBlur` no campo CEP que chama `lookupCEP` e preenche cidade, estado e endereço automaticamente.

## Melhorias para Implementação

### MELHORIA 1 — Loading state e Helmet no MyAccount
Adicionar spinner/skeleton enquanto verifica sessão + `<Helmet>`.

### MELHORIA 2 — "Esqueci minha senha" no Auth.tsx
Adicionar link + dialog com input de email + chamada `resetPasswordForEmail`.

### MELHORIA 3 — Navegação por teclado no SearchPreview
`highlightedIndex` + `onKeyDown` (ArrowUp/Down/Enter/Escape).

### MELHORIA 4 — Detalhes expandíveis nos pedidos do MyAccount
Collapsible com lista de itens do pedido.

### MELHORIA 5 — Sugestões no carrinho vazio
Reutilizar `CartProductSuggestions` quando `items.length === 0`.

### MELHORIA 6 — Helmet no Auth.tsx
Adicionar meta tags de título.

### MELHORIA 7 — Auto-preenchimento de endereço por CEP no MyAccount
Reutilizar `lookupCEP` no campo de CEP da aba Endereço.

## Arquivos Modificados

- **`src/pages/MyAccount.tsx`** — Loading skeleton, Helmet, detalhes de pedidos expandíveis, auto-preenchimento CEP
- **`src/pages/Auth.tsx`** — Esqueci minha senha + Helmet
- **`src/components/store/SearchPreview.tsx`** — Navegação por teclado
- **`src/pages/Cart.tsx`** — Sugestões no carrinho vazio

## Sem alteração de regras de negócio
Todas as correções são visuais/UX. Nenhuma lógica de pagamento, autenticação ou processamento existente será alterada.

