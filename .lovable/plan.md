

# Auditoria de Bugs e Melhorias do Sistema

## Bugs Encontrados

### BUG 1 — ALTO: `payments` INSERT policy permite qualquer usuário autenticado inserir pagamentos
A tabela `payments` tem policy `"Service can insert payments"` com `WITH CHECK (true)`. Isso significa que qualquer usuário autenticado pode inserir registros de pagamento falsos, potencialmente causando fraude ou inconsistências no sistema financeiro. Edge functions usam service_role (bypassam RLS), então a policy deveria ser `WITH CHECK (is_admin())`.

**Arquivos afetados:** Migration SQL

### BUG 2 — MÉDIO: Checkout.tsx recalcula `total` localmente ignorando CartContext
Linha 312 em `Checkout.tsx`:
```ts
const total = subtotal - discount + shippingCost;
```
O `CartContext` já expõe `total` calculado corretamente (linha 212 no contexto). O Checkout ignora esse valor e calcula seu próprio, criando risco de inconsistência. O `Cart.tsx` usa corretamente `total` do contexto (linha 23), mas o Checkout não.

**Correção:** Usar `total` do CartContext e remover o cálculo duplicado.

### BUG 3 — MÉDIO: `store_settings_public` é SECURITY DEFINER view
O linter detectou que a view `store_settings_public` usa SECURITY DEFINER, o que pode expor dados inadvertidamente ao rodar com privilégios do criador da view em vez do usuário que consulta.

**Correção:** Alterar para SECURITY INVOKER ou revisar se os dados expostos são realmente públicos.

### BUG 4 — MÉDIO: `setSelectedShipping` no useEffect de Checkout.tsx sem dependência
Linha 834-836:
```ts
useEffect(() => {
  if (formCepClean.length === 8 && cartCepClean.length === 8 && formCepClean !== cartCepClean) {
    setSelectedShipping(null);
  }
}, [formData.cep, shippingZip]);
```
O `setSelectedShipping` é usado mas não está no dependency array. Embora seja uma função estável do contexto, o ESLint/React recomendam incluí-la para clareza.

**Correção:** Adicionar `setSelectedShipping` ao dependency array.

### BUG 5 — BAIXO: Coupon zip prefix validation compara apenas 5 dígitos
Em `couponDiscount.ts` linhas 98-99:
```ts
const zipDigits = (shippingZip || "").replace(/\D/g, "").slice(0, 5);
if (!zipDigits || !zipPrefixes.some((p) => (p || "").replace(/\D/g, "").slice(0, 5) === zipDigits))
```
CEPs brasileiros têm 8 dígitos. Comparar apenas 5 pode causar matches muito amplos (ex: cupom para CEP 01310-000 valeria para 01315-999).

**Correção:** Ajustar a lógica para comparar o prefixo configurado contra o início do CEP completo.

### BUG 6 — BAIXO: `admin_audit_log` INSERT policy permite qualquer um inserir
A policy `"System can insert audit log"` tem `WITH CHECK (true)`, permitindo que qualquer usuário (incluindo anon) insira logs de auditoria falsos.

**Correção:** Restringir para `is_admin()` ou remover a policy já que edge functions usam service_role.

### BUG 7 — BAIXO: `traffic_sessions` INSERT permite spam de sessões
Qualquer visitante pode inserir infinitas sessões de tráfego, potencialmente poluindo métricas ou estourando storage.

**Correção:** Considerar rate limiting ou validação adicional no frontend antes de inserir.

## Melhorias Propostas

### MELHORIA 1 — Hardening das RLS policies de INSERT
Restringir INSERT com `is_admin()` nas tabelas de serviço onde edge functions já usam service_role:
- `payments` (CRÍTICO)
- `admin_audit_log`
- Manter INSERT público apenas onde necessário: `contact_messages`, `newsletter_subscribers`, `stock_notifications`, `abandoned_carts`, `login_attempts`, `error_logs`

### MELHORIA 2 — Unificar cálculo de total no Checkout
Usar `total` do CartContext em vez de recalcular localmente.

### MELHORIA 3 — Corrigir validação de prefixo de CEP em cupons
Ajustar `isCouponValidForLocation` para usar `startsWith` em vez de comparar apenas 5 dígitos.

### MELHORIA 4 — Converter `store_settings_public` para SECURITY INVOKER
Remover SECURITY DEFINER da view para seguir best practices.

## Arquivos Modificados

- **`src/pages/Checkout.tsx`** — Usar `total` do CartContext, corrigir dependency array
- **`src/lib/couponDiscount.ts`** — Corrigir validação de CEP
- **1 migration SQL** — Restringir INSERT em `payments` e `admin_audit_log`, converter view

## Sem alteração de regras de negócio
Correções são defensivas. Nenhum fluxo de pagamento ou lógica existente será alterada.

