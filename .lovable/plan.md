

# Contador de caracteres em Conteúdo/Resumo + Melhorias

## 1. Contadores de caracteres

Reutilizar o componente `SeoCounter` já existente para adicionar contadores abaixo dos campos:
- **Resumo**: max 300 caracteres (bom para cards e meta fallback)
- **Conteúdo**: contador livre sem limite (exibe apenas a contagem, sem barra de progresso)

Ambos no Content tab, logo abaixo de cada `Textarea`.

## 2. Melhorias propostas

### A. Preview ao vivo do post (Content tab)
Adicionar botão "Pré-visualizar" que abre o conteúdo renderizado em um Dialog, simulando como ficará no front-end — útil já que o campo aceita HTML.

### B. Duplicar post
Botão na lista de posts para duplicar um post existente como rascunho, acelerando criação de conteúdo similar.

### C. Ordenação e filtro na lista
Adicionar filtro por status (Todos / Publicados / Rascunhos) acima da lista de posts e ordenação por data.

### D. Contagem de palavras
Exibir contagem de palavras do conteúdo ao lado do contador de caracteres — métrica mais útil para redatores.

### E. Auto-save visual
Indicador discreto de "alterações não salvas" no formulário (dot ou texto) para evitar perda de dados ao fechar o dialog sem querer.

## Arquivos modificados

- **`src/pages/admin/BlogAdmin.tsx`**:
  - Adicionar `SeoCounter` abaixo do campo Resumo (max 300)
  - Adicionar contador de caracteres + palavras abaixo do campo Conteúdo (sem limite, apenas exibição)
  - Adicionar filtro por status na lista de posts
  - Adicionar botão "Duplicar" em cada post
  - Adicionar botão "Pré-visualizar" no Content tab
  - Indicador de alterações não salvas no header do dialog

