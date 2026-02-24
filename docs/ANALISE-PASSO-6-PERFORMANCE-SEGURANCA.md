# Passo 6 — Performance (bundle, waterfalls) e checklist de segurança

## 1. Performance

### 1.1 Build e bundle (Vite)

- **Config**: `vite.config.ts` com `manualChunks` para `vendor-react`, `vendor-router`, `vendor-query`, `vendor-supabase`; `chunkSizeWarningLimit: 600`; `target: es2020`; `cssMinify: true`.
- **Build** (executado em ambiente local): concluído com sucesso; nenhum chunk ultrapassou o limite de 600 kB.
- **Principais chunks** (aprox. do build):
  - `index-*.js` ~269 kB (gzip ~82 kB) — entry + app
  - `vendor-supabase-*.js` ~171 kB (gzip ~46 kB)
  - `vendor-react-*.js` ~141 kB (gzip ~45 kB)
  - `Products-*.js` ~378 kB, `PieChart-*.js` ~393 kB — abaixo do warning
  - `Integrations-*.js` ~73 kB, `AdminLayout-*.js` ~50 kB
- **Aviso do Vite**: `errorLogger.ts` — **corrigido**: uso de import estático em `main.tsx` para `initGlobalErrorHandlers`, eliminando o aviso (dynamic + static).
- **Browserslist**: aviso de que os dados estão desatualizados; rodar `npx update-browserslist-db@latest` quando conveniente (pode exigir bun em algumas versões do script).

### 1.2 Code splitting e lazy loading

- **Rotas**: Todas as páginas (store e admin) são carregadas com `lazy()`; há `Suspense` com fallback (ex.: `PageFallback`, `null`).
- **Home**: Seções (HighlightBanners, InstagramFeed, ShopBySize, Newsletter, CustomerTestimonials) em lazy com `Suspense` por seção.
- **Componentes**: WhatsAppFloat, CookieConsent, AdminErrorIndicator, SetupWizard em lazy.
- **Efeito**: Reduz o bundle inicial; rotas e seções pesadas carregam sob demanda.

### 1.3 Waterfalls (requisições em sequência)

- **Dashboard**: KPIs usam `Promise.all` (4 queries em paralelo); gráfico de receita e top produtos são duas `useQuery` independentes (também em paralelo entre si). Sem waterfall crítico.
- **Checkout**: Ordem de chamadas é coerente (criar pedido → itens → process-payment); não há paralelização óbvia a fazer ali.
- **ProductDetail / Cart**: Dependem de dados do produto/carrinho; fluxo sequencial é esperado. Cart refaz query de estoque com `refetchInterval` e `refetchOnWindowFocus`.
- **Recomendação**: Manter padrão de `Promise.all` ou múltiplas `useQuery` sem dependência cruzada onde fizer sentido (ex.: outras telas admin com várias listas).

### 1.4 Resumo performance

| Item | Status |
|------|--------|
| ManualChunks (vendor) | OK |
| Lazy de rotas e seções | OK |
| Chunk size warning | Nenhum chunk > 600 kB |
| Dashboard / paralelo | Promise.all nos KPIs |
| Aviso errorLogger | Baixo impacto; opcional corrigir import |

---

## 2. Segurança

### 2.1 Variáveis de ambiente (frontend)

- Apenas prefixo **`VITE_`** é usado no cliente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `VITE_APP_VERSION`.
- **Anon key** do Supabase é pública por design; segredos (service role, APPMAX_CLIENT_SECRET, YAMPI_WEBHOOK_SECRET, etc.) ficam apenas no backend (Edge Functions / Supabase secrets). **OK.**

### 2.2 Edge Functions (config e CORS)

- **verify_jwt = false** em funções chamadas por webhooks (yampi-webhook, appmax-webhook, bling-webhook) ou por fluxos sem JWT (process-payment, checkout-create-session, appmax-healthcheck, bling-oauth, etc.). Documentado e intencional.
- **CORS**: Uso de `Access-Control-Allow-Origin: "*"` nas respostas das Edge Functions é aceitável para APIs e webhooks públicos; a autenticação é feita por token na URL (webhooks) ou por corpo/header (process-payment, etc.).
- **Webhooks**: Yampi e Appmax validam segredo (`?token=` ou equivalente); Bling valida HMAC quando `X-Bling-Signature-256` está presente. Cron do Bling pode ser protegido com `BLING_CRON_SECRET` (Passo 3).

### 2.3 RLS (Row Level Security)

- Várias tabelas com RLS e políticas por papel (ex.: `is_admin()`, “Users can view own…”, “Service can insert…”). Tabelas sensíveis (orders, customers, store_settings, etc.) com políticas que restringem leitura/escrita. **Consistente** com modelo admin + loja.
- Funções sensíveis (ex.: `cancel_order_return_stock`) usam **SECURITY DEFINER** e checagem de `is_admin()` quando `auth.uid()` está definido.

### 2.4 XSS e conteúdo HTML (dangerouslySetInnerHTML)

- **Uso atual**:
  - **ProductDetail**: `product.description` (HTML do produto).
  - **InstitutionalPage**: `page.content` (conteúdo de página institucional).
  - **Footer**: `seal.html_code` (código de selo).
  - **CategoryPage / ProductDetail**: JSON-LD em `<script type="application/ld+json">` (dados gerados no código, não arbitrários).
  - **chart.tsx**: Uso interno do componente (Recharts).
- **Risco**: Descrição de produto, conteúdo de página e selo vêm do banco e são controlados pelo admin. Se um atacante obtiver acesso admin ou houver falha de validação, HTML malicioso (ex.: `<script>`) poderia ser executado.
- **Recomendação (P2)**: Sanitizar HTML antes de renderizar (ex.: **DOMPurify** ou lib equivalente) para `product.description`, `page.content` e `seal.html_code`. JSON-LD pode permanecer como está por ser estruturado e gerado no código.

### 2.5 Outros

- **index.html**: Preconnect/dns-prefetch para Supabase e fonts; script Appmax em `async`; sem inline scripts inseguros.
- **Auth**: Supabase Auth com persistência em `localStorage`; refresh de token. Fluxo de convidado com `order_access_token` já revisado em passos anteriores.
- **CSP**: Não há Content-Security-Policy explícita no projeto. Introduzir CSP em produção pode ser um reforço futuro (bloquear inline scripts não assinados, restringir origens de script, etc.).

### 2.6 Checklist de segurança (resumo)

| Item | Status |
|------|--------|
| Segredos só no backend | OK (VITE_* no frontend) |
| Webhooks com validação | OK (Yampi, Appmax, Bling HMAC opcional) |
| RLS nas tabelas | OK (políticas por papel) |
| verify_jwt em Edge Functions | Intencional onde JWT não é usado |
| dangerouslySetInnerHTML | Risco moderado; recomenda-se sanitizar HTML do admin |
| CSP | Não implementada (melhoria futura) |

---

## 3. Conclusão

- **Performance**: Bundle com split de vendors e lazy de rotas/seções; build sem chunks acima do limite; Dashboard com requisições em paralelo. Aviso do `errorLogger` e atualização do Browserslist são melhorias opcionais.
- **Segurança**: Uso de env, webhooks e RLS está alinhado ao modelo do projeto. A principal recomendação é **sanitizar HTML** em descrição de produto, conteúdo de páginas institucionais e código de selo (ex.: DOMPurify) para mitigar XSS em conteúdo administrável.
