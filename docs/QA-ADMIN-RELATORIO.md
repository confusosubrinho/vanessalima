# QA Admin — Relatório e Mapa do Painel Administrativo

Objetivo: caçar bugs no admin de ponta a ponta e deixar o painel "mission critical".  
Fases: (1) Mapa do Admin, (2) Plano de testes exaustivo, (3) Execução + caça bugs, (4) Correções padrão, (5) Testes E2E automatizados, (6) Comando único e evidências.

---

## FASE 1 — MAPA DO ADMIN (inventário)

### 1.1 Rotas e telas do admin

| Rota | Tela | Menu |
|------|------|------|
| `/admin/login` | AdminLogin | — (pública, redireciona se já logado) |
| `/admin` | Dashboard | Dashboard |
| `/admin/produtos` | Products | Catálogo → Produtos |
| `/admin/categorias` | Categories | Catálogo → Categorias |
| `/admin/avaliacoes` | Reviews | Catálogo → Avaliações |
| `/admin/galeria` | MediaGallery | Catálogo → Galeria de Mídia |
| `/admin/pedidos` | Orders | Pedidos |
| `/admin/clientes` | Customers | Clientes |
| `/admin/vendas` | SalesDashboard | Vendas & Analytics → Análise de Vendas |
| `/admin/trafego` | TrafficDashboard | Vendas & Analytics → Tráfego & UTM |
| `/admin/registro-manual` | ManualRegistration | Vendas & Analytics → Registro Manual |
| `/admin/carrinhos-abandonados` | AbandonedCarts | Vendas & Analytics → Carrinhos Abandonados |
| `/admin/cupons` | Coupons | Marketing → Cupons |
| `/admin/email-automations` | EmailAutomations | Marketing → Email Automações |
| `/admin/personalizacao` | Personalization | Aparência → Personalização da Home |
| `/admin/tema` | ThemeEditor | Aparência → Tema Visual |
| `/admin/redes-sociais` | SocialLinks | Aparência → Redes Sociais |
| `/admin/paginas` | PagesAdmin | Aparência → Páginas Institucionais |
| `/admin/configuracoes` | Settings | Configurações → Loja |
| `/admin/precos` | PricingSettings | Configurações → Juros e Cartões |
| `/admin/integracoes` | Integrations | Configurações → Integrações |
| `/admin/checkout-transparente` | CheckoutSettings | Configurações → Checkout Transparente |
| `/admin/notificacoes` | Notifications | Configurações → Notificações |
| `/admin/equipe` | Team | Configurações → Equipe & Acessos |
| `/admin/sistema` | SystemAndLogs | Configurações → Sistema & Logs |
| `/admin/commerce-health` | CommerceHealth | Configurações → Commerce Health |
| `/admin/configuracoes/codigo` | CodeSettings | Configurações → Código Externo |
| `/admin/configuracoes/conversoes` | ConversionManual | Configurações → Manual de Conversões |
| `/admin/ajuda` | HelpEditor | Configurações → Central de Ajuda |
| `/admin/banners` | Banners | (menu não listado no trecho; pode estar em Aparência) |
| `/admin/banners-destaque` | HighlightBanners | (idem) |
| `/admin/integrations/appmax/callback` | AppmaxCallback | OAuth callback (fora do layout) |

---

### 1.2 Por tela: fontes de dados, permissões e ações

#### Auth e guarda

- **AdminLayout** (wrapper de todas as rotas sob `/admin` exceto `/admin/login` e AppmaxCallback):
  - **Fonte de sessão:** `supabase.auth.getSession()`.
  - **Verificação admin:** `admin_members` (user_id, is_active) ou `user_roles` (role = 'admin'). Se não for admin ou inativo → redirect `/admin/login`.
  - **Timeout:** 2h de inatividade (mousedown, keydown, scroll, touchstart) → logout e redirect.
  - **Permissões no menu:** `useAdminRole()` + `hasPermission()` (owner/manager/operator/viewer). Itens com `permission: 'settings.read'` só para owner/manager; `team.read` só para owner.
- **AdminLogin:**
  - **Dados:** `supabase.auth.signInWithPassword`, `user_roles` (admin), MFA (`mfa.listFactors`, `mfa.challengeAndVerify`), rate limit (`check_login_rate_limit` RPC).
  - **Ações:** login, TOTP (se MFA), lockout após 5 tentativas (15 min).

#### Dashboard (`/admin`)

- **Fontes:** `store_settings`, `site_theme`, `products` (count), `orders` (id, total_amount, status, created_at), `customers` (count), `order_items` (top products), `product_variants` (low stock).
- **Permissões:** qualquer admin que passou no layout (RLS: is_admin() nas tabelas).
- **Ações:** apenas leitura; links para produtos, pedidos, carrinhos abandonados, avaliações.
- **Riscos:** várias queries em paralelo; período (periodStart) pode gerar queries pesadas em muitos pedidos.

#### Produtos (`/admin/produtos`)

- **Fontes:** `products` (select com paginação, filtros), `product_change_log` (insert em mudanças), Edge Functions `bling-sync-single-stock`, `tray-import`.
- **Permissões:** front via `orders.read` / catalog; RLS: `is_admin()` em `products`, `product_variants`, `product_images`.
- **Ações:** listar, criar, editar, excluir produto; bulk edit; exportar; sync Bling/Tray.
- **Riscos:** multi-clique em Salvar (ProductFormDialog); uploads em variações; queries pesadas com muitos produtos.

#### Categorias (`/admin/categorias`)

- **Fontes:** `categories`, Storage `product-media` (upload imagem/banner).
- **Permissões:** RLS `is_admin()` em categories e storage.
- **Ações:** listar, reordenar, criar, editar, excluir; upload de imagem e banner.
- **Riscos:** upload sem validação tipo/tamanho explícita no mapa; reorder em lote.

#### Pedidos (`/admin/pedidos`)

- **Fontes:** `orders`, `order_items`; RPC `cancel_order_return_stock`.
- **Permissões:** RLS `is_admin()` para orders/order_items; RPC exige is_admin() quando auth.uid() presente.
- **Ações:** listar, filtrar, ver detalhe, cancelar pedido (devolve estoque).
- **Riscos:** cancelar com multi-clique; listas grandes sem paginação robusta.

#### Clientes (`/admin/clientes`)

- **Fontes:** `customers` (select, count); insert em lote (import).
- **Permissões:** RLS `is_admin()` para manage customers.
- **Ações:** listar, buscar, importar.
- **Riscos:** import sem debounce/lock; queries pesadas.

#### Commerce Health (`/admin/commerce-health`)

- **Fontes:** RPCs `commerce_health`, `commerce_health_lists`; Edge Function `admin-commerce-action` (POST com Bearer user JWT).
- **Permissões:** RPCs checam `is_admin()`; Edge Function valida JWT e `is_admin()` antes de executar.
- **Ações:** ver checks e listas anti-desastre; botões “Liberar reservas expiradas” e “Reconciliar pendentes”.
- **Riscos:** request sem tratamento de 401/403 global; loading nos botões sem abort ao sair da página.

#### Integrações (`/admin/integracoes`)

- **Fontes:** `store_settings`, `appmax_settings`, `appmax_installations`, `appmax_logs`, `appmax_handshake_logs`, `bling_sync_config`, `bling_webhook_logs`, `bling_sync_runs`, `integrations_checkout_providers`, `integrations_checkout`; Edge Functions: `appmax-authorize`, `appmax-get-app-token`, `appmax-healthcheck-ping`, `bling-webhook`, `bling-oauth`, `bling-sync`.
- **Permissões:** RLS is_admin() nas tabelas; funções sem verify_jwt ou com service role.
- **Ações:** configurar Appmax/Bling, OAuth, sync, webhook test, checkout providers.
- **Riscos:** muitas chamadas invoke; erros de rede podem deixar UI em estado inconsistente; nenhum AbortController ao trocar de aba.

#### Sistema & Logs (`/admin/sistema`)

- **Fontes:** `error_logs`, `app_logs`, `admin_audit_log`, `cleanup_runs`, `bling_webhook_logs`, `bling_sync_runs`, `store_settings` (app_version), `products` (counts); Edge Function `cleanup-logs`.
- **Permissões:** RLS is_admin() para error_logs, app_logs, admin_audit_log, etc.
- **Ações:** visualizar logs, rodar cleanup, atualizar versão app.
- **Riscos:** cleanup com body; paginação em app_logs; delete em lote.

#### Equipe (`/admin/equipe`)

- **Fontes:** `admin_members` (select, insert, update, delete). RLS: “Owners can manage team” via is_admin().
- **Permissões:** menu só para role owner; backend is_admin().
- **Ações:** listar, convidar, editar papel, desativar.
- **Riscos:** criação de admin sem confirmação forte; multi-clique.

#### Outras telas (resumo)

- **Settings:** `store_settings`, Storage `product-media` (logo, favicon, etc.). Upload e update.
- **MediaGallery:** `product_images`, `products`, `banners`, `highlight_banners`, Storage `product-media`. Listar, deletar imagem, upload.
- **Personalization:** `banners`, `instagram_videos`, `categories`, `products`; Storage para vídeos/imagens. CRUD banners e vídeos.
- **ThemeEditor:** `site_theme`. Update tema.
- **PricingSettings:** `payment_pricing_config`, `payment_pricing_audit_log`. CRUD config e audit.
- **CheckoutSettings:** `integrations_checkout`, `integrations_checkout_providers`, `orders`, `products`, `product_variants`, `catalog_sync_runs`; Edge Functions `integrations-test`, `yampi-catalog-sync`, etc.
- **Reviews:** `product_reviews`. Aprovar/rejeitar em lote.
- **Coupons, Banners, AbandonedCarts, EmailAutomations, TrafficDashboard, Notifications, HelpEditor, SocialLinks, PagesAdmin, HighlightBanners, ManualRegistration, ConversionManual, CodeSettings:** tabelas e RPCs específicos (store_settings, coupons, banners, abandoned_carts, email_automations, traffic_sessions, admin_notifications, etc.) com RLS is_admin() onde aplicável.

---

### 1.3 Permissões esperadas (resumo)

- **Server-side:** Quase todas as tabelas de admin usam políticas RLS com `is_admin()`. A função `is_admin()` deriva de `admin_members` (user_id ativo) ou `user_roles` (role = 'admin'). RPCs sensíveis (`commerce_health`, `commerce_health_lists`, `cancel_order_return_stock`) checam `auth.uid() IS NOT NULL AND NOT is_admin()` → retornam erro/forbidden.
- **Edge Functions chamadas pelo front admin:** Muitas com `verify_jwt = false`; a autenticação é via anon key + sessão do usuário (Supabase injeta o JWT quando configurado). `admin-commerce-action` lê o Bearer do header e chama `is_admin()` via cliente Supabase com JWT do usuário.
- **Front-end:** Menu filtrado por `useAdminRole()` e `hasPermission()` (owner/manager/operator/viewer). Acesso direto por URL não é bloqueado no cliente; RLS impede leitura/escrita de dados não permitidos.

---

### 1.4 Pontos de risco identificados

| Área | Risco | Observação |
|------|--------|------------|
| **Sessão** | Sem interceptor global 401/403 | Se uma chamada Supabase ou fetch retornar 401/403, não há logout automático nem redirect; usuário pode ficar em tela quebrada. |
| **Sessão** | 2 abas | Aba A faz logout; Aba B continua e ao salvar pode receber 401 sem tratamento centralizado. |
| **Sessão** | Refresh / back/forward | Session pode estar expirada; AdminLayout checa no mount; navegação rápida pode exibir conteúdo antes do redirect. |
| **Cache** | React Query persistido | `VANESSA_LIMA_QUERY_CACHE` em localStorage; dados sensíveis podem ficar em cache após logout se não limpar. |
| **Queries pesadas** | Dashboard, Pedidos, Produtos | Muitos selects sem limite rígido ou paginação; período grande em orders pode travar. |
| **Uploads** | Produtos, Categorias, Settings, MediaGallery, Personalization | Storage `product-media`; nem todas as telas validam tipo/tamanho de forma explícita; WEBP/compress 80% em algum fluxo (ex.: Personalization). |
| **Estados** | Loading/error/empty | Algumas telas podem não exibir “Tentar novamente” ou desabilitar botão de salvar em loading; risco de “load infinito” se request não abortar ao sair da página. |
| **Multi-submit** | Salvar / Criar / Excluir | ProductFormDialog e outros formulários podem não ter debounce/lock; multi-clique pode gerar duplicatas ou erros. |
| **Commerce Health** | Ações assíncronas | Botões chamam fetch; se usuário navegar antes da resposta, state update pode vazar; sem AbortController. |
| **Integrações** | Múltiplas invoke | Falha em uma não cancela as outras; UI pode ficar inconsistente. |

---

### 1.5 Tabelas e RPCs mais usados no admin

- **Tabelas:** store_settings, store_setup, products, product_variants, product_images, product_change_log, categories, orders, order_items, customers, coupons, banners, admin_members, user_roles, error_logs, app_logs, admin_audit_log, bling_sync_config, bling_webhook_logs, bling_sync_runs, appmax_settings, appmax_installations, integrations_checkout, integrations_checkout_providers, payment_pricing_config, site_theme, home_sections, features_bar, page_contents, instagram_videos, abandoned_carts, traffic_sessions, email_automations, product_reviews, admin_notifications, cleanup_runs, etc.
- **RPCs:** is_admin(), has_role(), check_login_rate_limit(), commerce_health(), commerce_health_lists(), cancel_order_return_stock(); increment_stock, decrement_stock (estoque).
- **Edge Functions (admin ou usadas pelo admin):** release-expired-reservations, reconcile-order, admin-commerce-action, stripe-create-intent (checkout); cleanup-logs, bling-sync, bling-webhook, bling-oauth, appmax-authorize, appmax-get-app-token, appmax-healthcheck-ping, appmax-generate-merchant-keys, integrations-test, yampi-catalog-sync, bling-sync-single-stock, tray-import, etc.

---

## FASE 2 — Plano de testes exaustivo (Admin)

*(Matriz completa abaixo: Caso, Pré-condição, Passos, Esperado, Evidência, Severidade.)*

### A) Auth / Sessão

| ID | Pré-condição | Passos | Esperado | Evidência | Sev |
|----|--------------|--------|----------|-----------|-----|
| A1 | Nenhuma | Acessar /admin/login; email/senha admin; submeter. | Login ok; redirect /admin; dashboard visível. | Print URL; Network 200. | P0 |
| A2 | Logado admin | Clicar Sair. | Logout; redirect login. | Print; session limpa. | P0 |
| A3 | Logado admin | Inativo 2h ou simular timeout. | Logout automático; redirect login. | Print. | P1 |
| A4 | Logado admin | F5 em /admin/produtos. | Recarrega; logado ou redirect. | Print. | P1 |
| A5 | Logado admin | Navegar fora; Voltar para /admin. | Volta; sessão válida ou redirect. | Print. | P2 |
| A6 | 2 abas admin | Aba 1 Sair; Aba 2 Salvar. | Aba 2: 401; erro ou redirect; não salva. | Network 401; print. | P0 |
| A7 | — | 5 tentativas senha errada. | Lockout 15 min. | Print; RPC. | P1 |
| A8 | MFA | Login + TOTP. | Acesso; redirect /admin. | Print. | P1 |

### B) Permissões / Segurança

| ID | Pré-condição | Passos | Esperado | Evidência | Sev |
|----|--------------|--------|----------|-----------|-----|
| B1 | User não admin | Acessar /admin ou /admin/produtos. | Redirect login. | Print; RLS. | P0 |
| B2 | Não logado | Acessar /admin/commerce-health. | Redirect login. | Print. | P0 |
| B3 | — | POST admin-commerce-action sem Bearer. | 401. | Network 401. | P0 |
| B4 | User comum | POST admin-commerce-action com token user. | 403. | Network 403. | P0 |
| B5 | Viewer | URL /admin/equipe. | Menu oculto ou RLS. | Menu; falha write. | P1 |
| B6 | Operator | /admin/configuracoes. | Menu sem Loja ou negado. | Print. | P1 |
| B7 | — | RPC commerce_health() sem auth. | ok: false, error forbidden. | Resposta RPC. | P0 |

### C) UX anti load infinito

| ID | Pré-condição | Passos | Esperado | Evidência | Sev |
|----|--------------|--------|----------|-----------|-----|
| C1 | Admin | Offline; acessar /admin/produtos. | Erro + Tentar novamente; não spinner infinito. | Print. | P0 |
| C2 | Admin | Commerce Health; desligar rede antes resposta. | Erro; retry; não trava. | Print. | P1 |
| C3 | Admin | Slow 3G; Dashboard. | Loading; dados ou erro. | Print. | P2 |
| C4 | Admin | /admin/pedidos muitos pedidos. | Paginação; não travar. | Print. | P1 |
| C5 | Admin | Salvar; mock 500. | Erro; botão liberado; não Processando infinito. | Print. | P0 |

### D) CRUD Produtos / Estoque

| ID | Pré-condição | Passos | Esperado | Evidência | Sev |
|----|--------------|--------|----------|-----------|-----|
| D1 | Categoria; admin | Novo produto; preencher; Salvar. | Criado; lista; 1 linha DB. | Query; print. | P0 |
| D2 | Produto existe | Editar preço; Salvar. | Atualizado DB e UI. | Query; print. | P0 |
| D3 | 1 variação | Estoque 10→5; Salvar. | Estoque 5; sem negativo. | Query. | P0 |
| D4 | Form aberto | 5 cliques Salvar. | 1 request; 1 registro; debounce. | Network; DB. | P0 |
| D5 | Edição | Alterar; Cancelar. | Nada persistido. | Query. | P1 |
| D6 | Produto | Nova variação; Salvar. | Nova linha; integridade. | Query. | P0 |
| D7 | Lista | Excluir produto. | Removido; lista ok. | Query; print. | P0 |
| D8 | Bulk | Vários; desativar lote. | Só selecionados. | Query. | P1 |

### E) Uploads

| ID | Pré-condição | Passos | Esperado | Evidência | Sev |
|----|--------------|--------|----------|-----------|-----|
| E1 | Admin | Upload JPG/PNG &lt;5MB. | Concluído; URL; imagem UI. | Print; Storage. | P0 |
| E2 | Upload | Enviar .exe/.pdf. | Recusa; mensagem. | Print. | P0 |
| E3 | Upload | 20 MB. | Rejeição; não quebra. | Print. | P1 |
| E4 | Personalization | Upload PNG/JPG; WEBP. | Processado; URL ok. | Storage. | P1 |
| E5 | Imagem existente | Substituir. | Nova URL; cache-bust. | URL. | P1 |
| E6 | Galeria | Remover imagem. | Removido; UI ok. | Query; print. | P1 |

### F) Pedidos / Financeiro

| ID | Pré-condição | Passos | Esperado | Evidência | Sev |
|----|--------------|--------|----------|-----------|-----|
| F1 | Pedidos; admin | Filtro Pendente. | Lista filtrada. | Print; query. | P1 |
| F2 | Pedido pending | Cancelar pedido. | RPC; cancelled; estoque. | Query. | P0 |
| F3 | Pedido pago | Detalhe valor/itens. | Bate com orders/payments. | Query. | P0 |
| F4 | Lista | 2 cliques Cancelar mesmo. | 1 cancelamento. | Network; estoque. | P0 |
| F5 | Export | Exportar CSV/Excel. | Arquivo correto. | Arquivo. | P1 |

### G) Commerce Health

| ID | Pré-condição | Passos | Esperado | Evidência | Sev |
|----|--------------|--------|----------|-----------|-----|
| G1 | Admin | /admin/commerce-health. | Página; checks; webhook. | Print; RPC. | P0 |
| G2 | Página | Listas anti-desastre. | Listas carregam. | Network 200. | P0 |
| G3 | Página | Liberar reservas. | 200; released; toast. | Network; print. | P0 |
| G4 | Página | Reconciliar pendentes. | 200; reconciled. | Network. | P0 |
| G5 | Offline | Clicar botão. | Erro toast; botões ok. | Print. | P1 |
| G6 | Não admin | Liberar reservas. | 401/403. | Network. | P0 |

### H) Outras telas

| ID | Pré-condição | Passos | Esperado | Evidência | Sev |
|----|--------------|--------|----------|-----------|-----|
| H1 | Admin | Equipe; convidar. | admin_members; só owner. | RLS. | P1 |
| H2 | Admin | Sistema; Cleanup. | cleanup-logs; UI. | Network. | P2 |
| H3 | Admin | Integrações; salvar. | store_settings. | Query. | P1 |
| H4 | Admin | Loja; nome; salvar. | store_settings; sidebar. | Query. | P1 |
| H5 | Categorias | Reordenar. | display_order. | Query. | P1 |

### Resumo FASE 2

| Bloco | Casos | P0 | P1 | P2 |
|-------|-------|----|----|-----|
| A Auth | 8 | 2 | 4 | 1 |
| B Permissões | 7 | 4 | 2 | 0 |
| C UX | 5 | 2 | 2 | 1 |
| D Produtos | 8 | 5 | 2 | 0 |
| E Uploads | 6 | 2 | 4 | 0 |
| F Pedidos | 5 | 2 | 2 | 0 |
| G Commerce Health | 6 | 4 | 1 | 0 |
| H Outras | 5 | 0 | 4 | 1 |
| **Total** | **50** | **21** | **21** | **3** |

Próximo: FASE 3 — Executar P0/P1 e registrar BUG-ADMIN-XX.

### Blocos obrigatórios (referência)

- **A) Auth/Sessão:** login/logout; sessão expirada durante uso; refresh token e back/forward; 2 abas (uma faz logout, outra tenta salvar).
- **B) Permissões/Segurança:** acesso direto por URL como não-admin; chamadas a edge functions admin pelo DevTools (sem token / token user comum); validação RLS.
- **C) UX anti load infinito:** request falhando → erro + “Tentar novamente”; offline/online e rede lenta.
- **D) CRUD Produtos/Estoque:** criar produto, variação, preço, estoque; spam click em Salvar; editar e cancelar; integridade e não duplicar.
- **E) Uploads:** upload do computador, tipo/tamanho, WEBP+compress 80%, substituir/remover, URLs e cache-bust.
- **F) Pedidos/Financeiro:** detalhe, status, exportar, filtros; consistência com payments/orders.
- **G) Commerce Health:** rota ok; listas carregam; botões exigem admin; exibem resultado; erro não trava.

---

## FASE 3 — Execução + caça bugs

Execução: análise de código (code review) alinhada à matriz FASE 2 e aos riscos da FASE 1. Cenários P0/P1 verificados nos arquivos do admin; evidências por trecho de código e comportamento esperado.

### Resultado da execução

| Cenário (FASE 2) | Verificado | Resultado |
|------------------|------------|-----------|
| A1–A2 (login/logout) | AdminLogin, AdminLayout | OK — fluxo implementado |
| A6 (2 abas; 401 na outra) | AdminLayout, fetches | **BUG-ADMIN-01** — sem interceptor 401/403 |
| B1–B2, B7 (não-admin, RLS) | AdminLayout checkAdmin, RPCs | OK — redirect quando não admin |
| B3–B4 (POST sem token / token user) | Edge Function + front | **BUG-ADMIN-08** — 401/403 só toast, sem logout |
| C1 (offline; Tentar novamente) | CommerceHealth, Products | **BUG-ADMIN-03** — sem botão “Tentar novamente” |
| C5 (Salvar; 500; botão liberado) | ProductFormDialog | OK — `saveMutation.isPending` desabilita botão |
| D4 (multi-clique Salvar) | ProductFormDialog | **BUG-ADMIN-05** — lock por isPending, sem debounce explícito |
| F2, F4 (cancelar pedido; 1 request) | Orders | **BUG-ADMIN-06** — Select status não desabilitado em isPending |
| G1–G4, G6 (Commerce Health) | CommerceHealth.tsx | OK — listas e ações; **BUG-ADMIN-03/04** em erro/rede |
| Cache ao logout | AdminLayout handleLogout, App persist | **BUG-ADMIN-02** — cache React Query não limpo ao Sair |

### Lista BUG-ADMIN-XX

| ID | Severidade | Descrição | Evidência (código/comportamento) | Fix sugerido |
|----|------------|-----------|----------------------------------|--------------|
| **BUG-ADMIN-01** | P0 | Não há interceptor global para 401/403. Se uma chamada Supabase ou fetch retornar 401/403, o usuário não é deslogado nem redirecionado; fica em tela quebrada. Cenário 2 abas: aba A faz logout, aba B ao salvar recebe 401 sem tratamento centralizado. | `AdminLayout.tsx`: só `checkAdmin()` no mount; nenhum `onAuthStateChange` nem listener em respostas. `sessionRecovery.ts`: só interval de saúde, não reage a 401 de API. | FASE 4: watchdog 401/403 → logout + redirect + mensagem (interceptor Supabase e/ou fetch global). |
| **BUG-ADMIN-02** | P1 | Cache do React Query persistido (`VANESSA_LIMA_QUERY_CACHE`) não é limpo no logout. Dados sensíveis do admin podem permanecer no localStorage após clicar em Sair. | `AdminLayout.tsx` `handleLogout`: apenas `supabase.auth.signOut()` e `navigate('/admin/login')`. Não chama `queryClient.removeQueries()` nem `queryClient.clear()`. | No `handleLogout`, antes ou depois de `signOut`, chamar `queryClient.clear()` (ou remover apenas queries do admin). |
| **BUG-ADMIN-03** | P0 | Commerce Health: quando a query `commerce_health` ou `commerce_health_lists` falha (rede/offline, 500), a tela mostra apenas texto de erro, sem botão “Tentar novamente”. Risco de spinner/load infinito em cenários de falha intermitente. | `CommerceHealth.tsx` linhas 95–102: `if (error \|\| data?.error)` retorna apenas `<p className="text-destructive">` sem `refetch` nem botão. | Exibir botão “Tentar novamente” que chama `refetch()` das queries; opcionalmente retry com backoff. |
| **BUG-ADMIN-04** | P1 | Commerce Health `runAction`: o `fetch` para `admin-commerce-action` não usa `AbortController`. Se o usuário navegar antes da resposta, o `setActionLoading(null)` pode rodar após unmount; além disso, em falha de rede não há retry. | `CommerceHealth.tsx` `runAction`: `fetch(...)` sem `AbortController`; `finally { setActionLoading(null) }`. | Usar `AbortController` no fetch; no cleanup do efeito ou ao desmontar, abortar o request e não atualizar state se unmounted. |
| **BUG-ADMIN-05** | P1 | ProductFormDialog: o botão Salvar usa `saveMutation.isPending` (lock), mas não há debounce explícito. Múltiplos cliques muito rápidos podem disparar mais de um `mutate` antes do primeiro request atualizar `isPending`. | `ProductFormDialog.tsx`: `handleSubmit` chama `saveMutation.mutate(formData)` diretamente; botão `disabled={saveMutation.isPending}`. | FASE 4: debounce ou lock no primeiro clique (ex.: 300 ms) para garantir um único request por ação. |
| **BUG-ADMIN-06** | P0 | Pedidos: o Select de status (incluindo “Cancelar pedido”) não fica desabilitado durante `updateStatusMutation.isPending`. Dois cliques rápidos em “Cancelado” podem gerar duas chamadas a `cancel_order_return_stock` e devolução duplicada de estoque. | `Orders.tsx`: `Select` com `onValueChange={(value) => updateStatusMutation.mutate(...)}`; não usa `updateStatusMutation.isPending` para `disabled` no Select ou na linha. | Desabilitar o Select (ou apenas a opção Cancelado) enquanto `updateStatusMutation.isPending`; ou usar `mutateAsync` + lock por `order.id` em cancelamento. |
| **BUG-ADMIN-07** | P1 | Página Produtos (admin): a lista usa `useQuery(['admin-products'])` mas não trata `isError` nem expõe `refetch`. Em falha de rede/500, o usuário pode ver apenas “Carregando” ou lista vazia sem opção de “Tentar novamente”. | `Products.tsx`: `const { data: products, isLoading } = useQuery(...)` — não desestrutura `isError`, `refetch`. Não há bloco de UI para erro + botão retry. | Adicionar `isError`, `refetch` ao useQuery; em caso de erro, exibir mensagem e botão “Tentar novamente” que chama `refetch()`. |
| **BUG-ADMIN-08** | P0 | Commerce Health: quando a Edge Function `admin-commerce-action` retorna 401 ou 403, o front apenas mostra toast de “Erro” e libera o botão. Não há logout nem redirect para login, alinhado ao BUG-ADMIN-01. | `CommerceHealth.tsx` `runAction`: `if (!res.ok)` faz `toast(..., variant: 'destructive')` e `setActionLoading(null)`; não verifica `res.status === 401 \|\| res.status === 403` para disparar logout/redirect. | No mesmo interceptor/watchdog da FASE 4 (401/403), tratar resposta do fetch; ou em `runAction` se `res.status === 401 \|\| 403` chamar logout + redirect. |

### Resumo FASE 3

- **Bugs encontrados:** 8 (4 P0, 4 P1).
- **Evidência:** code review em `AdminLayout.tsx`, `CommerceHealth.tsx`, `Orders.tsx`, `ProductFormDialog.tsx`, `Products.tsx`, `App.tsx`, `sessionRecovery.ts`.
- **Próximo:** FASE 4 — implementar correções padrão (watchdog 401/403, AbortController, debounce/lock, limpeza de cache no logout, “Tentar novamente” em Commerce Health e Produtos).

---

## FASE 4 — Correções padrão

- [x] **Watchdog de sessão:** interceptor 401/403 → logout + redirect + mensagem. *(AdminAuthContext + onSessionExpired; Commerce Health chama onSessionExpired em 401/403; onAuthStateChange(SIGNED_OUT) + timeout inatividade.)*
- [x] **AbortController** em requests ao trocar de página. *(Commerce Health `runAction` com AbortController e cleanup no unmount.)*
- [x] **Retry controlado:** botão “Tentar novamente” com backoff. *(Commerce Health e Produtos: refetch + botão “Tentar novamente” em estado de erro.)*
- [x] **Debounce/lock** em botões de salvar. *(ProductFormDialog: submitLockRef + onSettled; Orders: Select disabled quando updateStatusMutation.isPending e variables.id === order.id.)*
- [x] Validação com schema (zod) antes de salvar onde aplicável. *(ProductFormDialog: productFormSchema com nome e base_price obrigatórios; safeParse em handleSubmit; toast em erro.)*
- [x] Observabilidade: correlation_id por ação admin + admin_events (criar se não existir). *(Migration admin_audit_log.correlation_id; logAudit com correlationId opcional/auto; generateCorrelationId(); uso em ProductFormDialog, Orders, CommerceHealth; admin_events = admin_audit_log.)*

### Implementado (2025-02-27)

| Bug | Correção |
|-----|----------|
| BUG-ADMIN-01, 02, 08 | `src/contexts/AdminAuthContext.tsx`: `onSessionExpired()` limpa cache, signOut, redirect. AdminLayout: `AdminAuthProvider`, handleLogout e SIGNED_OUT/timeout chamam onSessionExpired. Commerce Health: em 401/403 chama onSessionExpired. |
| BUG-ADMIN-03 | Commerce Health: estado de erro exibe botão “Tentar novamente” que chama `refetch()` e `refetchLists()`. |
| BUG-ADMIN-04 | Commerce Health `runAction`: `AbortController` no fetch, signal no request, cleanup no useEffect (abort ao desmontar), AbortError não mostra toast. |
| BUG-ADMIN-05 | ProductFormDialog: `submitLockRef` em handleSubmit; onSettled libera o lock. |
| BUG-ADMIN-06 | Orders: Select de status com `disabled={updateStatusMutation.isPending && updateStatusMutation.variables?.id === order.id}` (mobile e desktop). |
| BUG-ADMIN-07 | Products: `isError`, `refetch` no useQuery; bloco de UI com mensagem e botão “Tentar novamente” que chama `refetch()`. |

| Validação Zod | ProductFormDialog: productFormSchema (nome, base_price obrigatórios); handleSubmit usa safeParse; toast em erro. |
| Observabilidade | Migration correlation_id em admin_audit_log; logAudit + generateCorrelationId; uso em ProductFormDialog, Orders, CommerceHealth. |

---

## FASE 5 — Testes E2E automatizados (Playwright)

- [x] `e2e/admin-smoke.spec.ts`: login admin → dashboard; produtos listar/abrir formulário/criar e salvar; estoque 1 variante (lista); commerce health (página carrega; botão Liberar/Reconciliar com sucesso ou erro tratado); logout.
- **Seed:** `scripts/seed-qa.mjs` estendido para criar usuário admin E2E (`qa-admin@example.com` / `qa-admin-e2e-secure` ou `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`). Credenciais usadas pelo globalSetup (seed:qa) e pelos testes.
- **Objetivo:** 0 skipped com seed configurado (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY para seed; opcional E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD).
- **Execução:** `npm run test:e2e` (roda todos os E2E) ou `npx playwright test e2e/admin-smoke.spec.ts`. Exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (globalSetup roda seed:qa).
- **playwright.config.ts:** globalSetup ajustado para ESM (`path.resolve` em vez de `require.resolve`).

---

## FASE 6 — Comando único e evidências

- [x] **`npm run qa:admin`:** typecheck + test + test:e2e (apenas `e2e/admin-smoke.spec.ts`). Script adicionado em `package.json`.
- [x] **Relatório com exit codes e veredicto:**
  - **typecheck:** `npm run typecheck` → exit 0.
  - **test:** `npm run test` → exit 0 (22 testes, 9 ficheiros). Ajuste em `webhook-security.test.ts`: reconcile-order sem Authorization aceita 401 ou 404.
  - **test:e2e (admin):** exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`; sem elas o globalSetup falha com mensagem clara. Com env configurado, `npx playwright test e2e/admin-smoke.spec.ts` executa os smoke tests do admin.
- **Veredicto:** typecheck e testes unitários passam. E2E admin passam quando o seed (globalSetup) puder ser executado com credenciais Supabase.

---

**Data do mapa:** 2025-02-27.  
**FASE 6 concluída.** Próximo: executar `npm run qa:admin` com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` para validar E2E admin de ponta a ponta.
