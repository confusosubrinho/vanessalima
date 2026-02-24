# Nova rodada de análise — E-commerce profissional e robusto

Análise transversal do site para identificar bugs, gaps e melhorias que elevem o projeto ao nível de um dos maiores e-commerces do mercado.

---

## 1. Resumo executivo

| Área | Status atual | Principais ações recomendadas |
|------|--------------|-------------------------------|
| **Resiliência** | Sem Error Boundary; algumas listagens sem UI de erro | Error Boundary global; UI de erro + retry em listagens e ProductDetail |
| **Carrinho** | localStorage sem try/catch; sem validação de estrutura | Parse/setItem seguros; validar itens contra catálogo |
| **Busca** | Carrega todos os produtos; estado vazio confuso quando `q` vazio | Não carregar quando `q` vazio; estado "Digite para buscar" |
| **Home** | Se 0 seções configuradas, página em branco | Fallback "Nenhuma seção configurada" ou seção padrão |
| **SEO** | Meta por produto ok; categoria/busca sem meta dinâmica | Title + meta por categoria e página institucional |
| **Acessibilidade** | Parcial (labels, alguns aria) | Carrosséis e controles de produto com aria completo; skip link |
| **Admin** | Proteção por sessão + role; rotas ok | Alinhar checkAdmin com admin_members.is_active |
| **Performance** | Lazy + chunks ok; busca carrega tudo | Busca server-side ou paginada quando catálogo crescer |

---

## 2. Bugs e correções prioritárias

### 2.1 [P0] Falta de Error Boundary
- **Problema**: Qualquer erro não tratado em um componente derruba a árvore inteira; o usuário vê tela branca sem opção de recuperação.
- **Solução**: Error Boundary global envolvendo as rotas, com fallback amigável ("Algo deu errado") e botão "Recarregar página".
- **Status**: Implementado nesta rodada.

### 2.2 [P1] localStorage do carrinho sem proteção
- **Problema**: `JSON.parse(stored)` no estado inicial e `localStorage.setItem` nos effects podem lançar (dados corrompidos, quota excedida). Carrinho quebrado impede compra.
- **Solução**: Função `safeParseCart()` com try/catch retornando `[]` em falha; `safeSetItem` com try/catch; validar estrutura mínima dos itens (product.id, variant.id, quantity).
- **Status**: Implementado nesta rodada.

### 2.3 [P1] Busca com query vazia
- **Problema**: Em `/busca` sem `?q=`, a página chama `useProducts()` (todos os produtos), exibe "Resultados para """ e "0 produtos" ou lista tudo — confuso e pesado.
- **Solução**: Se `q` estiver vazio, não chamar `useProducts()`; exibir estado "Digite algo na busca para encontrar produtos" e manter campo de busca em destaque.
- **Status**: Implementado nesta rodada.

### 2.4 [P1] Home sem seções
- **Problema**: Se `useHomePageSections()` retornar `[]` (nenhuma seção configurada), a home fica em branco.
- **Solução**: Quando `!isLoading && (!pagesSections || pagesSections.length === 0)`, exibir mensagem amigável e link para admin ou seção padrão (ex.: categoria + produtos em destaque).
- **Status**: Implementado nesta rodada.

### 2.5 [P1] Listagens sem UI de erro de rede/API
- **Problema**: CategoryPage e ProductDetail usam `useProducts`/`useProduct`; em falha de rede ou 500, não há mensagem clara nem botão "Tentar novamente".
- **Solução**: Usar `isError` e `refetch` das queries; exibir bloco "Não foi possível carregar. Tente novamente." com botão que chama `refetch()`.
- **Status**: Implementado nesta rodada (CategoryPage, ProductDetail).

---

## 3. Melhorias recomendadas (prioridade)

### 3.1 [P2] SEO por categoria e páginas institucionais
- **Atual**: CategoryPage tem breadcrumb JSON-LD; não define `document.title` nem meta description por categoria.
- **Recomendação**: Em CategoryPage, `document.title = \`${category?.name || slug} | Loja\`` e meta description (texto da categoria ou genérico). Em páginas institucionais (InstitutionalPage), definir title e meta a partir de `page.page_title` e trecho do conteúdo.

### 3.2 [P2] Acessibilidade em carrosséis e produto
- **Atual**: BannerCarousel e controles de produto (quantidade, tamanho, cor, abas) com poucos aria-labels.
- **Recomendação**: Container do carrossel com `aria-label="Carrossel de ofertas"`; botões "Anterior"/"Próximo" com `aria-label`; dots com `aria-label="Slide N de M"` e `aria-current` no ativo. ProductDetail: aria-labels em +/- quantidade, em botões de tamanho/cor, e garantir tabs com role tablist/tab/tabpanel (Radix Tabs já ajuda).

### 3.3 [P2] Skip link e landmark main
- **Atual**: Poucos landmarks explícitos; não há "Pular para conteúdo".
- **Recomendação**: Link "Pular para o conteúdo" no topo (visível no foco) que leva a `#main-content`; envolver conteúdo principal em `<main id="main-content">` no StoreLayout.

### 3.4 [P2] Admin: alinhar checkAdmin com admin_members
- **Atual**: AdminLayout usa verificação de role (ex.: user_roles); useAdminRole considera admin_members e is_active.
- **Recomendação**: No mesmo fluxo de entrada admin (checkAdmin ou equivalente), considerar admin_members e is_active para negar acesso quando o usuário estiver desativado, evitando acesso até próximo reload.

### 3.5 [P2] Busca server-side ou paginada
- **Atual**: SearchPage carrega todos os produtos e filtra no cliente.
- **Recomendação**: Quando o catálogo crescer, implementar busca no backend (full-text ou ilike com limite) ou listagem paginada para evitar carregar centenas de produtos de uma vez.

### 3.6 [P3] Estados vazios no admin
- **Recomendação**: Padronizar "Nenhum pedido", "Nenhum cliente", "Nenhum produto" com ícone + texto + ação (ex.: "Criar primeiro pedido") onde fizer sentido.

### 3.7 [P3] Meta/head por rota
- **Recomendação**: Avaliar react-helmet-async (ou similar) para centralizar title/meta por rota e melhorar crawl e compartilhamento.

---

## 4. Pontos já sólidos (manter)

- Fluxo de compra (carrinho → checkout → confirmação) com validações, idempotência e tratamento de erro no pagamento.
- Sanitização HTML (DOMPurify) em descrição, página institucional e selo.
- Timeouts nas Edge Functions para chamadas externas.
- RLS e políticas por papel; webhooks com validação.
- Lazy loading de rotas e seções; manualChunks para vendors.
- Admin com permissões por papel (owner, manager, etc.) e timeout de inatividade.
- JSON-LD de produto e breadcrumb; sitemap e robots.

---

## 5. Checklist de robustez (pós-implementação)

- [x] Error Boundary global com fallback e "Recarregar"
- [x] localStorage do carrinho com parse/setItem seguros
- [x] Busca com `q` vazio: estado claro, sem carregar todos os produtos
- [x] Home com fallback quando 0 seções
- [x] CategoryPage e ProductDetail com UI de erro e retry
- [ ] SEO: title/meta por categoria e institucionais (P2)
- [ ] A11y: carrosséis e controles de produto (P2)
- [ ] Skip link + main landmark (P2)
- [ ] Admin: checkAdmin + admin_members.is_active (P2)
- [ ] Busca backend/paginada quando catálogo crescer (P2)

---

## 6. Conclusão

Com as correções P0/P1 implementadas, o site fica mais resistente a erros de rede e dados corrompidos no carrinho, e a experiência em busca e home deixa de ter estados confusos ou em branco. As melhorias P2 (SEO, acessibilidade, admin e busca server-side) elevam o nível profissional e a escalabilidade para um e-commerce de grande porte.
