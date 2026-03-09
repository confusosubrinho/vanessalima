

# Auditoria UX — Rodada 10 (Somente grau ALTO)

## UX 1 — ALTO: MyAccount campo Estado é input livre (mesmo bug já corrigido no Checkout)
`MyAccount.tsx` linha 383-386: o campo "Estado" no endereço é um `<Input maxLength={2}>`. O Checkout já foi corrigido com `<Select>` das 27 UFs na rodada anterior, mas MyAccount continua aceitando valores inválidos.

**Correção:** Substituir por `<Select>` com as 27 UFs, idêntico ao Checkout.

## UX 2 — ALTO: MyAccount telefone sem máscara
`MyAccount.tsx` linha 248-252: o campo "Telefone" é um `<Input>` sem formatação. O Checkout aplica `formatPhone` para máscara `(00) 00000-0000`, mas o perfil aceita qualquer texto. Dados inconsistentes no banco.

**Correção:** Aplicar `formatPhone` do `@/lib/validators` no onChange.

## UX 3 — ALTO: Imagens no resumo do Checkout usam URL crua (imagens quebradas)
`Checkout.tsx` linhas 1038 e 1501: `item.product.images?.[0]?.url` é usado diretamente como `src` sem passar por `resolveImageUrl()`. Imagens com caminhos relativos ou de CDN externo ficam quebradas no resumo do pedido.

**Correção:** Importar e aplicar `resolveImageUrl()` nas duas ocorrências.

## UX 4 — ALTO: Checkout carrinho vazio mostra página sem layout/branding
`Checkout.tsx` linha 947-958: quando o carrinho está vazio, retorna uma `<div>` sem header, footer ou logo. O usuário vê uma tela branca com texto centralizado, sem identidade visual ou navegação.

**Correção:** Envolver o estado vazio em layout mínimo com logo e link para home, consistente com o header do checkout.

## UX 5 — ALTO: WhatsApp float sobrepõe sticky bar e bottom bar no mobile
`WhatsAppFloat.tsx` linha 40: posição `bottom-24` no mobile. Com a `StickyAddToCart` (ProductDetail) e o fixed bottom bar (Cart), o botão do WhatsApp fica sobreposto ou inacessível.

**Correção:** Detectar se está em `/carrinho` ou `/produto/*` e ajustar `bottom` dinamicamente para evitar sobreposição com as barras fixas.

## UX 6 — ALTO: MyAccount não permite trocar senha
`MyAccount.tsx`: nenhuma funcionalidade de alteração de senha. O formulário só contém nome, email (disabled) e telefone. Usuários que querem trocar a senha precisam fazer logout e usar "esqueci minha senha".

**Correção:** Adicionar seção "Alterar Senha" na aba "Meus Dados" com campos senha atual + nova senha + confirmação, usando `supabase.auth.updateUser()`.

## UX 7 — ALTO: Checkout não pré-preenche dados do perfil do usuário logado
`Checkout.tsx`: o formulário restaura dados do `sessionStorage`, mas nunca consulta a tabela `profiles` do usuário logado. Clientes recorrentes precisam digitar nome, telefone, CPF e endereço toda vez.

**Correção:** Verificar sessão do usuário e buscar `profiles` para pré-preencher `formData` (nome, telefone, endereço, cidade, estado, CEP) com fallback para sessionStorage.

## UX 8 — ALTO: Itens do carrinho não linkam para a página do produto
`Cart.tsx`: a imagem e o nome do produto no carrinho não são clicáveis. O usuário não consegue revisar detalhes do produto (descrição, outras variantes) sem navegar manualmente.

**Correção:** Envolver imagem + nome do produto em `<Link to={/produto/${item.product.slug}}>` em cada item do carrinho.

---

## Arquivos Modificados

- **`src/pages/MyAccount.tsx`** — Select para UF, máscara de telefone, seção de alteração de senha
- **`src/pages/Checkout.tsx`** — resolveImageUrl no resumo, empty state com branding, prefill de perfil
- **`src/pages/Cart.tsx`** — Links para produto nos itens do carrinho
- **`src/components/store/WhatsAppFloat.tsx`** — Posicionamento dinâmico para evitar sobreposição

## Sem alteração de regras de negócio
Todas as correções são visuais/UX. Nenhuma lógica de pagamento, precificação ou processamento existente será alterada.

