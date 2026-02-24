
# Corrigir Fluxo de Checkout: Carrinho Abandonado vs Pedido

## Problema Atual
Toda vez que alguém clica em "Finalizar Compra", o sistema cria imediatamente um **pedido completo** na tabela `orders` com status `pending` -- mesmo antes do cliente efetuar qualquer pagamento. Isso gera dezenas de pedidos falsos no painel administrativo (já existem 8+ pedidos pendentes sem email de cliente).

O fluxo correto de um e-commerce profissional é:
1. Cliente vai para o checkout --> **carrinho abandonado** (sem pedido)
2. Cliente conclui o pagamento no Yampi --> Yampi envia webhook --> **aí sim o pedido é criado**

## Solução

### 1. Refatorar a Edge Function `checkout-create-session`
**Arquivo:** `supabase/functions/checkout-create-session/index.ts`

Mudancas:
- **Remover** toda a criacao de pedido (`orders` + `order_items` + `inventory_movements`)
- Manter apenas: validar estoque, montar o link de pagamento Yampi, e retornar a URL de redirect
- **Adicionar** registro de carrinho abandonado na tabela `abandoned_carts` com os dados do carrinho e um `session_id` unico
- Incluir o `session_id` como metadata no link Yampi para rastreabilidade

### 2. Refatorar a Edge Function `yampi-webhook`
**Arquivo:** `supabase/functions/yampi-webhook/index.ts`

Mudancas:
- Quando receber evento `payment.approved` / `payment.paid` / `order.paid`:
  - **Criar o pedido** na tabela `orders` com status `processing` (ja pago)
  - Inserir os `order_items` com base nos dados do payload do Yampi
  - Debitar estoque via `decrement_stock`
  - Marcar o carrinho abandonado correspondente como `recovered`
- Quando receber cancelamento/recusa: apenas logar, sem criar pedido

### 3. Limpar Pedidos Fantasma Existentes
- Executar UPDATE/DELETE nos 8+ pedidos pendentes que foram criados erroneamente (sem `customer_email`, provider `yampi`, status `pending`)

### 4. Ajustar `CheckoutStart.tsx`
**Arquivo:** `src/pages/CheckoutStart.tsx`

- Salvar carrinho abandonado antes de redirecionar ao Yampi
- Nao esperar `order_id` no retorno (ja que pedido nao sera criado neste momento)

### 5. Ajustar Pagina de Pedidos Admin
**Arquivo:** `src/pages/admin/Orders.tsx`

- Garantir que pedidos so aparecem quando realmente existem (com pagamento confirmado)
- O filtro de status `pending` pode ser usado apenas para pedidos do checkout nativo (Appmax)

---

## Resumo do Fluxo Correto

```text
Cliente clica "Finalizar Compra"
         |
         v
  [checkout-create-session]
  - Valida estoque
  - Salva carrinho abandonado
  - Gera link Yampi
  - Retorna URL redirect
         |
         v
  Cliente e redirecionado para Yampi
  (carrinho fica como "abandonado")
         |
    +---------+---------+
    |                   |
  Nao paga            Paga
    |                   |
    v                   v
  Fica como         [yampi-webhook]
  abandonado        - Cria pedido com status "processing"
                    - Insere order_items
                    - Debita estoque
                    - Marca carrinho como "recovered"
```

## Detalhes Tecnicos

### checkout-create-session (reescrita)
- Remove: insert em `orders`, `order_items`, `inventory_movements`
- Mantem: validacao de estoque, calculo de totais, criacao de link Yampi
- Adiciona: upsert em `abandoned_carts` com `cart_data` contendo variant_ids e quantidades
- Passa metadata para o Yampi com `session_id` para vincular depois

### yampi-webhook (expansao)
- No evento de pagamento aprovado:
  - Buscar dados dos SKUs do payload Yampi
  - Mapear `yampi_sku_id` -> `product_variants` locais
  - Criar pedido completo com todos os dados
  - Debitar estoque
  - Buscar e marcar `abandoned_carts` como recovered

### Limpeza de dados
- DELETE dos pedidos pendentes Yampi sem pagamento (os 8 registros atuais)
