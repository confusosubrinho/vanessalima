

# Auditoria UX — Rodada 8 (Somente grau ALTO)

## UX 1 — ALTO: Checkout usa logo estático local em vez do configurado no admin
`Checkout.tsx` linha 21 importa `import logo from '@/assets/logo.png'` e exibe na linha 926. O logo do checkout nunca reflete o logo configurado no painel admin. Diferente do Header e Footer que usam `store_settings_public`, o checkout mostra sempre o asset local antigo.

**Correção:** Usar `useStoreSettingsPublic()` para buscar o logo dinâmico, com fallback para o asset local.

## UX 2 — ALTO: Checkout sem Helmet/SEO — título da aba fica genérico
`Checkout.tsx` não possui `<Helmet>` em nenhum lugar do arquivo (1504 linhas). A aba do navegador fica com o título padrão do `index.html` durante todo o checkout, sem indicação de etapa.

**Correção:** Adicionar `<Helmet><title>Checkout — {step label} | Loja</title></Helmet>` dinâmico por step.

## UX 3 — ALTO: Checkout resumo do pedido não visível em mobile
O "Resumo do Pedido" (linha 1401-1498) está dentro de `lg:col-span-1` no grid `lg:grid-cols-3`. Em mobile, ele fica abaixo de todo o formulário, exigindo scroll longo. O usuário não vê o que está comprando durante as etapas de identificação/envio/pagamento.

**Correção:** Adicionar um resumo colapsável (Collapsible) fixo no topo do mobile, mostrando total + quantidade de itens com toggle para expandir detalhes.

## UX 4 — ALTO: Checkout step labels invisíveis em mobile
Linha 958: `<span className="hidden sm:inline font-medium">{step.label}</span>` — os nomes dos steps (Identificação, Entrega, Pagamento) ficam ocultos em mobile, mostrando apenas ícones pequenos. O usuário não sabe em qual etapa está.

**Correção:** Mostrar pelo menos o label do step ativo em mobile. Usar `sm:inline` nos inativos mas sempre mostrar o ativo.

## UX 5 — ALTO: Carrinho sidebar (Header) sem limite de estoque ao incrementar
Linha 396 no Header: o botão `+` no carrinho do header chama `updateQuantity(item.variant.id, item.quantity + 1)` sem verificar estoque. Diferente do Cart.tsx que verifica `freshStockData`, o mini-cart permite adicionar infinitamente.

**Correção:** Passar `stock_quantity` do variant e bloquear incremento quando `quantity >= stock_quantity`.

## UX 6 — ALTO: ProductCard preço PIX não mostra o valor final, só o percentual
Linhas 220-223 do ProductCard: quando há desconto PIX, mostra apenas `"{pixDiscountPercent}% off no PIX"` sem exibir o valor final com desconto. O cliente precisa calcular mentalmente. Concorrentes mostram `"R$ XX,XX no PIX"`.

**Correção:** Exibir `formatPrice(pixPrice)` junto com a indicação de desconto, ex: `"R$ 189,90 no PIX"`.

## UX 7 — ALTO: Checkout não salva progresso — refresh perde todos os dados
Ao atualizar a página durante o checkout (F5 ou conexão instável), todos os dados preenchidos (nome, email, CPF, endereço) são perdidos. O state é todo `useState` sem persistência. Em mobile, isso é especialmente comum.

**Correção:** Persistir `formData` e `currentStep` em `sessionStorage` com debounce. Restaurar ao montar o componente.

## UX 8 — ALTO: Checkout campo Estado é input livre em vez de Select
Linha 1115-1123: o campo "Estado" é um `<Input>` com `maxLength={2}` e placeholder "UF". Não há validação nem lista predefinida. Usuários podem digitar valores inválidos ("SS", "XX"), causando erros no processamento do pedido.

**Correção:** Substituir por `<Select>` com as 27 UFs brasileiras predefinidas.

## Arquivos Modificados

- **`src/pages/Checkout.tsx`** — Logo dinâmico, Helmet, resumo mobile colapsável, step labels mobile, persistência sessionStorage, Select para UF
- **`src/components/store/Header.tsx`** — Limite de estoque no mini-cart
- **`src/components/store/ProductCard.tsx`** — Valor PIX visível

## Sem alteração de regras de negócio
Todas as correções são visuais/UX. Nenhuma lógica de pagamento, precificação ou processamento existente será alterada.

