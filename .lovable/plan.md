

# Plano: Adicionar seção Blog ao Construtor da Home

## O que será feito

Integrar o blog como uma seção disponível no construtor da home page, permitindo ativar/desativar e reordenar junto com as demais seções. Criar um componente visual bonito que exibe os posts publicados do blog diretamente na home.

## Alterações

### 1. Novo componente `src/components/store/BlogSection.tsx`
Seção visual que consome `useBlogPosts` e `useBlogSettings` para exibir os últimos posts publicados. Layout:
- Título + subtítulo + botão "Ver todos" linkando para `/blog`
- Cards com imagem, data, autor, título, excerpt
- Mobile: scroll horizontal com snap (similar aos carrosséis existentes)
- Desktop: grid de 3 colunas
- Respeita `blog_settings.is_active` — se blog desativado, não renderiza nada
- Config suporta `max_posts` (padrão 6)

### 2. Atualizar `src/pages/Index.tsx`
- Importar `BlogSection` como lazy component
- Adicionar `blog` ao mapa `SECTION_COMPONENTS`

### 3. Atualizar `src/components/admin/HomePageBuilder.tsx`
- Adicionar `blog` ao `SECTION_META` com ícone `BookOpen` e descrição
- Adicionar template `blog` ao `ALL_TEMPLATES` na categoria "Social & Engajamento"
- Adicionar config redirect para a aba Blog no `SectionConfigSheet`

### 4. Atualizar `src/hooks/useHomePageSections.ts`
- Adicionar `'blog'` ao `NATIVE_SECTION_KEYS` (opcional — pode ser não-nativo para permitir exclusão)

## Detalhes técnicos
- O componente reutiliza o hook `useBlogPosts(true)` já existente
- Não requer migração de banco — usa as tabelas `blog_posts` e `blog_settings` existentes
- A seção é adicionada via galeria de templates do construtor, como qualquer outra

