# Otimização de velocidade — Vanessa Lima Shoes

Checklist e plano para Core Web Vitals (LCP, FID/INP, CLS) e experiência geral.

## Status atual (já implementado)

- **Rotas e componentes**: Rotas lazy com `React.lazy` + `Suspense`; admin e páginas secundárias em chunks separados.
- **Home**: Seções abaixo da dobra (Instagram, Newsletter, etc.) lazy; primeiro banner com `loading="eager"`, `fetchPriority="high"`, `decoding="sync"`.
- **Imagens**: `loading="lazy"` e `decoding="async"` em ProductCard, carrosséis, Footer; primeiro slide do banner otimizado para LCP.
- **Scripts de terceiros**: Appmax só em `/checkout` e `/carrinho`; Stripe carregado apenas na página de Checkout (lazy).
- **Fonts**: Carregamento não bloqueante (`media="print"` + `onload="this.media='all'"`); preconnect para Google Fonts e Supabase.
- **Build**: `manualChunks` para React, router, TanStack Query, Supabase, Zod, Recharts, XLSX; minificação esbuild e CSS.
- **Query cache**: React Query com persistência em localStorage e `staleTime` 5 min para menos refetch.

## Ações de otimização (aplicadas ou recomendadas)

| Item | Ação | Impacto |
|------|------|---------|
| Chunk Stripe | `manualChunks`: `@stripe/*` → `vendor-stripe` (só carrega no checkout) | Menor bundle inicial |
| Resource hints | `dns-prefetch` para Stripe e Yampi no `index.html` | Checkout mais rápido ao abrir |
| **Cache estático** | **`vercel.json`** com `Cache-Control: public, max-age=31536000, immutable` para `/assets/*` | **Economia ~651 KiB em visitas repetidas (LCP/FCP)** |
| **Entrega de imagens** | **Imagens Tray (tcdn.com.br)** redimensionadas via proxy (wsrv.nl) em CategoryGrid e Header; **logo** com width/height para CLS | **Economia ~1.670 KiB (LCP/FCP)** |
| **CLS – Navegue por Categorias** | **Skeleton com altura fixa (280px)** + classe `content-lazy-section-category` para reservar espaço; evita troca de layout quando a seção carrega | **Reduz CLS (meta &lt; 0,1)** |
| **LCP – preload do primeiro banner** | **`preloadLcpImage()`** em `main.tsx` busca o primeiro banner e injeta `<link rel="preload" as="image">` assim que o chunk carrega | **LCP mais cedo** |
| **Árvore de dependência** | **`product_reviews`**: query só habilitada quando o card entra no viewport (`useInView` em ProductCard) — evita 6+ requisições na cadeia crítica da home. **sessionRecovery**: carregamento adiado 4s + requestIdleCallback para sair do caminho crítico | **Menor latência do caminho crítico (LCP)** |
| **Reduzir JS não usado (Recharts)** | **Recharts** (~107 KiB): carregado só nas páginas admin que exibem gráficos. Em **Dashboard** e **SalesDashboard** o módulo é importado dinamicamente (`import('recharts')`) quando o componente de gráficos monta; **chart.tsx** documentado para não ser importado em páginas da loja | **Economia estimada ~86 KiB na loja (LCP/FCP)** |
| **Imagens com width/height** | **Logo no Header**: ambas as `<img>` do logo (principal e menu mobile) com `width` e `height` explícitos para evitar CLS | **CLS** |
| **Payload de rede (banners Tray)** | **BannerCarousel**: URLs de banner (Tray/tcdn) passam por `resolveImageUrl(..., { width, height })` para redimensionar via wsrv.nl; reduz transferência dos JPEGs grandes (ex.: 690+560 KiB) | **LCP / payload total** |
| LCP | Primeiro banner já com `fetchPriority="high"`, width/height | LCP estável |
| Imagens produto | width/height em ProductCard; lazy fora do viewport | CLS reduzido |
| Hosting | Garantir Brotli/gzip no servidor (Lovable/Vercel costumam ter) | Menor transferência |

## Métricas para acompanhar

- **LCP** (Largest Contentful Paint): &lt; 2,5 s — alvo primeiro banner ou hero.
- **INP** (Interaction to Next Paint): &lt; 200 ms — botões e navegação.
- **CLS** (Cumulative Layout Shift): &lt; 0,1 — width/height em imagens e reserva de espaço.

Ferramentas: [PageSpeed Insights](https://pagespeed.web.dev/), Chrome DevTools → Lighthouse, “Network” e “Performance”.

## Preview / Dev server (“100+ módulos”, página em branco)

O aviso **“servidor de desenvolvimento sobrecarregado (projeto com 100+ módulos)”** na preview (ex.: Lovable) não é bug do app — é limite de CPU/memória do ambiente de dev. Os “módulos” são o grafo de dependências (seu código + `node_modules`); não dá para “apagar” sem remover funcionalidade.

**O que fazer:**

1. **Imediato:** Fechar e reabrir a aba da preview; se usar Lovable, em **Settings → Cloud → Advanced Settings** aumentar o tamanho da instância.
2. **No projeto:** Foi configurado `optimizeDeps.include` no `vite.config.ts` para pre-bundlar as dependências mais pesadas no primeiro start; isso reduz trabalho sob demanda do dev server.
3. **Limpar instalação (só se suspeitar de node_modules corrompido):**  
   `Remove-Item -Recurse -Force node_modules; npm install`  
   Isso não reduz o número de módulos, apenas reinstala pacotes.
4. **Não remover dependências** só para “diminuir módulos”: o app usa React, Radix/shadcn, Supabase, Stripe, Recharts, etc.; removê-las quebra a aplicação. A contagem alta é esperada em um e-commerce com admin completo.

## Alterações do painel não aparecem para visitante (anon)

**Causa:** A view `store_settings_public` estava com `security_invoker = on`. Com RLS em `store_settings` permitindo apenas `is_admin()`, usuários anônimos que consultavam a view rodavam a query com suas próprias permissões e não viam nenhuma linha; só admin via as configurações atualizadas.

**Solução:** Migração `20260302160000_store_settings_public_anon_read.sql` recria a view com `security_invoker = false` (SECURITY DEFINER). A view passa a executar com os privilégios do dono, retornando as configurações públicas para qualquer um que tenha `SELECT` na view (anon e authenticated). A tabela `store_settings` continua restrita a admins.

Após aplicar a migração no Supabase (deploy ou `supabase db push`), visitantes passam a ver logo, header e demais dados públicos atualizados pelo painel.

## Próximos passos (opcional)

1. **Logo (~78 KiB)**: O logo em `src/assets/logo.png` é exibido a ~198×70px mas o arquivo está em 1426×504. Para reduzir o peso, substitua por uma versão redimensionada (ex.: 400×140px) e comprimida (TinyPNG ou similar).
2. **Hospedagem não-Vercel**: Se o site não estiver na Vercel (ex.: outro CDN ou painel que não lê `vercel.json`), configure no painel do host os headers para os estáticos: `Cache-Control: public, max-age=31536000, immutable` para URLs que contêm `/assets/` ou arquivos com hash no nome. Isso atende à recomendação do PageSpeed “Use efficient cache policies”.
3. **Imagens responsivas**: Se as imagens de produto vierem de CDN com resize (ex.: Supabase Storage com transform), usar `srcset`/`sizes` para enviar tamanhos adequados por viewport.
4. **Preload do primeiro banner**: Se o LCP for sempre o primeiro slide, considerar `<link rel="preload" as="image" href="…">` injetado pelo backend ou por script após saber a URL do primeiro banner.
5. **Service Worker / PWA**: Para repeat visits, cache de assets estáticos pode melhorar LCP em visitas subsequentes.
