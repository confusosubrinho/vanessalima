

# Auditoria de Bugs e Melhorias do Sistema

## Bugs Encontrados

### BUG 1 — ALTO: Checkout calcula `total` duplicado e inconsistente com CartContext
Em `Checkout.tsx` linha 312, o total é recalculado localmente:
```ts
const total = subtotal - discount + shippingCost;
```
Porém `useCart()` já expõe `total` que inclui shipping e discount. O Checkout **não usa** o `total` do CartContext — calcula seu próprio. Isso gera inconsistência: se a lógica de desconto ou frete mudar no CartContext, o Checkout pode cobrar valores diferentes do exibido no carrinho. Além disso, `finalTotal` para PIX aplica desconto sobre esse `total` local, mas o resumo no `CheckoutStart.tsx` usa `subtotal - discount + shippingCost` diretamente (linha 24), duplicando a lógica.

**Correção:** Usar `total` do CartContext como fonte única e derivar `finalTotal` a partir dele.

### BUG 2 — MÉDIO: `ShippingCalculator` auto-seleciona frete grátis mas ignora o `id` do ShippingOption
Em `ShippingCalculator.tsx` linhas 84-88, quando auto-seleciona frete grátis, cria um objeto `ShippingOption` sem campo `id`:
```ts
setSelectedShipping({ name: cheapest.name, price: 0, deadline: cheapest.deadline, company: cheapest.company });
```
A interface `ShippingOption` requer `id: string` (conforme `safeParseShipping` no CartContext que valida `typeof o.id === 'string'`). Se o usuário recarregar a página, o shipping será descartado pela validação e o frete selecionado desaparece.

**Correção:** Incluir `id` ao criar `ShippingOption` (ex: `id: cheapest.name || crypto.randomUUID()`).

### BUG 3 — MÉDIO: `useEffect` no Checkout referencia `shippingZip` sem dependency array correto
Em `Checkout.tsx` linhas 821-825:
```ts
useEffect(() => {
    if (shippingZip && !formData.cep) {
      setFormData(prev => ({ ...prev, cep: shippingZip }));
    }
  }, [shippingZip]);
```
`formData.cep` é lido dentro do efeito mas não está nas dependências. Se `formData.cep` mudar entre renders (ex: usuário digita e apaga), o efeito pode sobrescrever indevidamente. React exige completude de deps ou memoização explícita.

**Correção:** Adicionar `formData.cep` à dependency array ou usar ref para rastrear se o CEP já foi preenchido pelo usuário.

### BUG 4 — MÉDIO: `useProducts` retry após JWT expired re-executa query stale
Em `useProducts.ts` linhas 44-48:
```ts
if (error.message?.includes('JWT expired')) {
  await supabase.auth.signOut();
  const { data: retryData, error: retryError } = await query;
  // ...
}
```
Após `signOut()`, a variável `query` é o mesmo PostgREST query builder que já foi `await`'ed. PostgREST builders do `supabase-js` são **imutáveis snapshots** — chamar `await query` novamente reexecuta, mas se o builder capturou o token anterior (JWT header), a request pode falhar de novo. O correto seria reconstruir a query.

**Correção:** Reconstruir a query do zero após signOut, ou simplesmente `throw error` e deixar o retry do React Query lidar (que já recria a queryFn).

### BUG 5 — BAIXO: `ProductDetail` hooks condicionais violam Rules of Hooks implicitamente
`ProductDetail.tsx` chama `useEffect` antes dos early returns (linhas 92-173), mas tem early returns no meio do componente (linhas 176-236). Hooks como `useQuery` para `buyTogetherProducts` (linha 130) são chamados antes desses returns, o que está correto. Porém a variável `product` é usada em hooks com `enabled: !!product?.id` — se `product` é null, hooks não disparam mas não há violação. Sem bug real, mas o padrão é frágil.

### BUG 6 — BAIXO: `sessionRecovery.ts` `setInterval` nunca é limpo
Em `sessionRecovery.ts` linha 23, `setInterval` roda a cada 30s sem nenhum cleanup. Isso é intencional (singleton de vida longa), mas se `initSessionRecovery()` for chamado mais de uma vez (improvável mas possível em HMR/dev), cria intervalos duplicados.

**Correção:** Guardar o interval ID e limpar antes de criar novo.

### BUG 7 — BAIXO: `ErrorBoundary` não reporta erro ao `logError`
`ErrorBoundary.tsx` no `componentDidCatch` apenas faz `console.error`. Deveria chamar `logError()` para persistir no banco e aparecer no painel admin.

**Correção:** Importar e chamar `logError` em `componentDidCatch`.

### BUG 8 — BAIXO: `CheckoutStart` dependency array incompleto
Em `CheckoutStart.tsx` linha 125, o `useEffect` depende de `[items.length, navigate, retryTrigger]` mas acessa `subtotal`, `discount`, `selectedShipping`, `appliedCoupon`, `cartId`, `shippingZip` — todos excluídos do array. Se o usuário voltar ao carrinho, alterar o cupom, e retornar ao CheckoutStart, os valores antigos serão enviados ao servidor.

**Correção:** Adicionar as variáveis utilizadas ao dependency array ou capturá-las via ref no momento correto.

## Melhorias Propostas

### MELHORIA 1 — Unificar cálculo de total entre CartContext e Checkout
Criar uma função `computeFinalTotal(paymentMethod, pricingConfig, items, subtotal, discount, shippingCost)` reutilizável em `cartPricing.ts` para eliminar duplicação.

### MELHORIA 2 — ErrorBoundary reportar ao error_logs
Adicionar `logError({ type: 'render_error', ... })` no `componentDidCatch`.

### MELHORIA 3 — Guard contra `initSessionRecovery` duplo
Adicionar flag `let initialized = false` para evitar intervalos duplicados.

### MELHORIA 4 — Remover retry manual no `useProducts` após JWT expired
Simplificar: apenas `throw error` e deixar React Query retry com a queryFn recriada automaticamente.

## Arquivos Modificados

- **`src/components/store/ShippingCalculator.tsx`** — Adicionar `id` ao `ShippingOption`
- **`src/components/store/ErrorBoundary.tsx`** — Reportar erros via `logError`
- **`src/lib/sessionRecovery.ts`** — Guard contra inicialização dupla
- **`src/hooks/useProducts.ts`** — Remover retry manual após JWT expired
- **`src/pages/Checkout.tsx`** — Corrigir dependency array do useEffect do CEP
- **`src/pages/CheckoutStart.tsx`** — Corrigir dependency array do useEffect principal

## Sem alteração de regras de negócio
Todas as correções são defensivas. Nenhuma regra de preço, fluxo de pagamento ou lógica de negócio existente será alterada.

