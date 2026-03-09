

# Auditoria de Bugs e Melhorias — Rodada 3

## Bugs Encontrados

### BUG 1 — MÉDIO: useEffect duplicado para limpar shipping no Checkout.tsx
Linhas 829-836 e 838-845 contêm dois `useEffect` com lógica idêntica (limpar shipping quando CEP do form difere do cart). O primeiro tem `setSelectedShipping` no dependency array, o segundo não. O segundo é redundante e executa a mesma ação sem a dependência correta. Gera execução dupla desnecessária.

**Correção:** Remover o segundo `useEffect` (linhas 838-845), mantendo apenas o primeiro que já tem o dependency array correto.

### BUG 2 — MÉDIO: CheckoutStart.tsx calcula `totalValue` localmente em vez de usar `total` do CartContext
Linha 24: `const totalValue = subtotal - discount + shippingCost;`
O CartContext já fornece `total` calculado corretamente (linha 212 do CartContext). O `CheckoutStart` ignora esse valor e recalcula localmente, criando a mesma inconsistência que foi corrigida no `Checkout.tsx`. Se a lógica de cálculo mudar no CartContext, o total enviado ao servidor estará errado.

**Correção:** Importar `total` do `useCart()` e usá-lo no lugar de `totalValue`.

### BUG 3 — BAIXO: PIX `finalTotal` no Checkout inclui frete duas vezes quando `pix_discount_applies_to_sale_products` é true
Linha 335: `finalTotal = total * (1 - pixDiscountPct);`
Aqui `total` já inclui `shippingCost` (do CartContext: `subtotal - discount + shippingCost`). Aplicar o desconto PIX sobre `total` aplica o desconto também sobre o frete. O correto seria aplicar o desconto PIX apenas sobre o valor dos produtos (subtotal - discount) e somar o frete depois.

**Correção:** Mudar para `finalTotal = (subtotal - discount) * (1 - pixDiscountPct) + shippingCost;` — aplicando desconto PIX somente sobre produtos, não sobre frete.

### BUG 4 — BAIXO: `ShippingCalculator` useEffect tem dependency array incompleto
Linha 23-27: O `useEffect` que auto-calcula frete quando há CEP salvo depende de `[shippingZip]` mas chama `calculateShipping` que usa `items` e `subtotal` do contexto. Se o carrinho mudar (items adicionados/removidos), o frete não é recalculado automaticamente. Não é um crash, mas pode exibir frete desatualizado.

**Correção:** Não alterar este efeito (recalcular frete a cada mudança de item seria ruim para UX). Apenas adicionar um comentário de documentação explicando que o recálculo é intencional apenas na mudança de CEP.

### BUG 5 — BAIXO: `integrations_checkout` query no Checkout.tsx pode falhar silenciosamente
Linha 114: `supabase.from('integrations_checkout')` — esta tabela não aparece no schema fornecido. Se a tabela não existir, a query retorna erro silenciosamente e `activeProvider` fica `undefined`, fazendo o checkout cair no fluxo Appmax por padrão. Funciona, mas mascara erros de configuração.

**Correção:** Adicionar `console.warn` quando a query falha para facilitar debugging.

## Melhorias Propostas

### MELHORIA 1 — Remover useEffect duplicado
Eliminar o efeito redundante das linhas 838-845 do Checkout.tsx.

### MELHORIA 2 — Unificar total no CheckoutStart
Usar `total` do CartContext em vez de recalcular `totalValue`.

### MELHORIA 3 — Corrigir desconto PIX sobre frete
Aplicar desconto PIX apenas sobre subtotal - discount, não sobre frete.

## Arquivos Modificados

- **`src/pages/Checkout.tsx`** — Remover useEffect duplicado, corrigir cálculo PIX sobre frete
- **`src/pages/CheckoutStart.tsx`** — Usar `total` do CartContext

## Sem alteração de regras de negócio
Todas as correções são defensivas. O fluxo de checkout, pagamento e processamento de pedidos permanece inalterado.

