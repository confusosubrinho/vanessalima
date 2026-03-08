

## Auditoria: Sistema de Cache e Versionamento

### Bug 1 (Crítico): `lazyRetry` protege apenas 2 de ~30 componentes lazy

Apenas `WhatsAppFloat` e `CookieConsent` usam o wrapper `lazyRetry`. Todas as demais páginas (ProductDetail, Cart, Checkout, CategoryPage, etc.) usam `lazy()` puro. Se um deploy gerar novos hashes de chunk e um visitante já tiver o `index.html` antigo em cache, a navegação para qualquer página que não seja a Home resultará em erro de import não tratado — tela branca.

**Fix**: Envolver todos os `lazy()` com `lazyRetry`.

---

### Bug 2 (Médio): `lazyRetry` nunca limpa o flag de reload

O `sessionStorage.setItem('lazy-retry-reloaded', '1')` é definido na primeira falha e nunca removido. Se houver dois deploys durante a mesma sessão do visitante, o segundo chunk com hash novo **não** será retentado — o usuário verá erro. O flag deveria ser limpo após carregamento bem-sucedido ou usar uma chave versionada.

**Fix**: Após reload bem-sucedido (na inicialização do app), limpar o flag. Ou usar a versão do build na key para que cada deploy tenha seu próprio guard.

---

### Bug 3 (Médio): Persist cache não é invalidado entre deploys

O `PersistQueryClientProvider` armazena queries em `localStorage` com `maxAge: 24h`. Após um deploy, dados de produtos, categorias e banners podem vir do cache persistido (stale) enquanto o `staleTime` não expira. Apenas `store-settings-public` é filtrado na deserialização. Se um admin atualizar um produto e forçar deploy, visitantes com cache persistido podem ver dados antigos por até 5 minutos (staleTime do produto).

**Fix**: Incluir `APP_VERSION` na key do persister (`VANESSA_LIMA_QUERY_CACHE_v{version}`). Quando a versão muda, o cache antigo é ignorado automaticamente.

---

### Bug 4 (Baixo): `VersionChecker` e `lazyRetry` não se coordenam

`VersionChecker` limpa `caches` (Service Worker/Cache API) e faz reload, mas não limpa o `lazy-retry-reloaded` de `sessionStorage`. Se um lazy load falhou antes do version check, o flag está setado. Após o reload do VersionChecker, se outro lazy load falhar (cenário raro), o retry não acontece.

**Fix**: No VersionChecker, antes do reload, limpar também `sessionStorage.removeItem('lazy-retry-reloaded')`.

---

### Bug 5 (Baixo): `vercel.json` não define Cache-Control para `index.html`

Apenas `/assets/(.*)` tem `Cache-Control: immutable`. O `index.html` depende do default do Vercel (que é `s-maxage=0, must-revalidate` na CDN), mas não há header explícito para impedir caching intermediário (CDN de terceiros, proxies corporativos). Isso pode causar visitantes servindo `index.html` antigo por mais tempo.

**Fix**: Adicionar regra para `source: "/(.*)"` (ou apenas `/`) com `Cache-Control: public, max-age=0, must-revalidate` para garantir.

---

### Melhoria 1: Limpeza periódica do localStorage persist cache

O cache persistido pode crescer indefinidamente (cada query key gera uma entrada). Não há limite de tamanho. Se o `localStorage` encher (~5MB), writes silenciosamente falham. Adicionar `buster` (versão) no persister já resolve isso indiretamente — cache antigo fica órfão. Adicionar limpeza de keys antigas do persister.

---

### Arquivos a Modificar

1. **`src/App.tsx`** — Envolver todos os `lazy()` com `lazyRetry`; versionar a key do persister; limpar flag no boot
2. **`src/components/store/VersionChecker.tsx`** — Limpar `lazy-retry-reloaded` antes do reload; limpar persist cache antigo
3. **`vercel.json`** — Adicionar Cache-Control para HTML

