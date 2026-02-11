
# Plano de Melhorias - Admin, Cache, Banners e Ordenacao

## 1. Sistema de Versionamento e Cache Busting Automatico

**Problema:** Usuarios podem ver versoes antigas do site apos atualizacoes.

**Solucao:**
- Criar um arquivo `src/lib/appVersion.ts` com uma constante de versao baseada em timestamp de build
- No `vite.config.ts`, injetar `VITE_APP_VERSION` com timestamp do build
- Criar componente `VersionChecker` que consulta a tabela `store_settings` (campo `app_version`) periodicamente (a cada 60s)
- Quando detectar versao diferente, exibir um banner fixo com botao "Atualizar" que forca `window.location.reload(true)`
- Ao montar o app, registrar a versao atual no `localStorage`

## 2. Botao Purge Cache no Painel de Configuracoes

**Arquivo:** `src/pages/admin/Settings.tsx`

- Adicionar nova aba "Cache" com botao "Limpar Cache de Todos"
- Ao clicar, atualiza o campo `app_version` na tabela `store_settings` com timestamp atual
- Isso dispara o `VersionChecker` em todos os clientes, forcando atualizacao
- Mostrar confirmacao visual apos a acao

## 3. Correcao do Bug do Banner Carousel

**Arquivo:** `src/components/store/BannerCarousel.tsx`

**Problema:** O `useEffect` do autoplay nao reseta ao clicar manualmente, causando conflito de timers.

**Solucao:**
- Usar `useRef` para armazenar o timer do `setInterval`
- Nas funcoes `goToPrevious`, `goToNext` e no clique dos indicadores, limpar e recriar o timer
- Isso evita que o timer antigo mude o slide logo apos uma interacao manual

## 4. Mobile Responsivo do Painel Admin

**Arquivo:** `src/pages/admin/AdminLayout.tsx`

- Reduzir padding do `main` de `p-6` para `p-3 sm:p-6`
- Garantir que o header tenha elementos ajustados para mobile
- Sidebar ja usa collapsible, mas garantir que inicie colapsada em mobile

**Arquivos diversos do admin:**
- `Integrations.tsx`: Mudar grids de `grid-cols-2` para `grid-cols-1 sm:grid-cols-2` nos formularios de credenciais (e-Rede, Bling), botoes de sync de `grid-cols-4` para `grid-cols-2 sm:grid-cols-4`
- `Settings.tsx`: Mudar grids `grid-cols-2` para `grid-cols-1 sm:grid-cols-2`, TabsList com `flex-wrap` (ja tem)
- `Categories.tsx`: Tabela com scroll horizontal, dialog com `max-h-[90vh] overflow-y-auto` (ja tem)
- `Banners.tsx`: Ajustar card de banner para layout vertical em mobile
- Todos os titulos `text-3xl` para `text-xl sm:text-3xl`
- Inputs e labels com tamanhos menores em mobile

## 5. Remover Integracoes "Em Breve" e Popup

**Arquivo:** `src/pages/admin/Integrations.tsx`

- Remover do array `simpleIntegrations` todos os itens com `status: 'coming_soon'` (Tiny, Omie, PagSeguro, Stripe, Correios)
- Remover o card "Precisa de outra integracao?" (linhas 1117-1130) com o popup de WhatsApp

## 6. Banners Mobile - Padrao 600x800 com Crop

**Arquivo:** `src/pages/admin/Banners.tsx` e `src/pages/admin/Personalization.tsx`

- Alterar o texto de recomendacao mobile de "750x900" para "600x800"
- Ao fazer upload de imagem mobile, verificar as dimensoes da imagem
- Se a proporcao for compativel (3:4 ou similar como 1200:1600), aceitar diretamente
- Se a proporcao for incompativel, abrir um modal de crop usando canvas nativo (sem lib externa):
  - Mostrar a imagem com overlay de area de corte 600x800
  - Permitir arrastar para posicionar o corte
  - Botao "Cortar e Enviar" que gera o crop via canvas e faz upload

## 7. Mover Banners Destaque para Personalizacao

**Arquivos:**
- `src/pages/admin/Personalization.tsx`: Adicionar nova aba "Banners Destaque" que renderiza o conteudo do `HighlightBannersAdmin`
- `src/pages/admin/AdminLayout.tsx`: Remover "Banners Destaque" do menu lateral (item `/admin/banners-destaque` dentro de Marketing)
- `src/App.tsx`: Manter a rota para nao quebrar, mas redirecionar para personalizacao

## 8. Drag-and-Drop com Reordenacao Visual

**Arquivos:** `src/pages/admin/Banners.tsx`, `src/pages/admin/Categories.tsx`, `src/pages/admin/HighlightBanners.tsx`, `src/pages/admin/Personalization.tsx`

**Implementacao sem lib externa** (HTML5 Drag and Drop API nativa):
- Adicionar `draggable="true"` nos itens com `GripVertical`
- Handlers: `onDragStart`, `onDragOver`, `onDragEnd`, `onDrop`
- State local `dragIndex` e `hoverIndex` para feedback visual (linha indicadora de posicao)
- Ao soltar, recalcular `display_order` e salvar em batch via `supabase.from(table).update({display_order}).eq('id', id)` para cada item reordenado
- Feedback visual: item arrastado fica com opacidade reduzida, posicao de destino mostra linha azul

---

## Detalhes Tecnicos

### Migracao de Banco
- Adicionar coluna `app_version` (text, default '') na tabela `store_settings` se nao existir

### Arquivos a criar
- `src/components/store/VersionChecker.tsx` - componente que verifica versao
- `src/components/admin/MobileBannerCropper.tsx` - modal de crop para banners mobile

### Arquivos a modificar
- `vite.config.ts` - injetar VITE_APP_VERSION
- `src/App.tsx` - adicionar VersionChecker, ajustar rotas
- `src/pages/admin/AdminLayout.tsx` - mobile responsive, remover menu Banners Destaque
- `src/pages/admin/Settings.tsx` - aba Cache/Purge
- `src/pages/admin/Integrations.tsx` - remover "em breve" e popup, responsive
- `src/pages/admin/Banners.tsx` - drag-and-drop, mobile responsive, crop mobile
- `src/pages/admin/Categories.tsx` - drag-and-drop, mobile responsive
- `src/pages/admin/HighlightBanners.tsx` - drag-and-drop
- `src/pages/admin/Personalization.tsx` - integrar Banners Destaque, drag-and-drop
- `src/components/store/BannerCarousel.tsx` - fix timer reset
