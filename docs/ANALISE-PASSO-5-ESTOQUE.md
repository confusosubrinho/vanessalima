# Passo 5 — Fluxo de estoque (site, Bling, Yampi, cancelamentos)

## 1. Visão geral

O estoque é mantido em **`product_variants.stock_quantity`**. Ele é **lido** na loja (ProductDetail, Cart, Checkout), **validado** em checkout-create-session e process-payment, **decrementado** no pagamento (checkout nativo ou webhook Yampi) e **devolvido** em cancelamentos (apenas no fluxo Yampi hoje). O Bling **sobrescreve** esse valor via sync/webhook conforme configuração.

---

## 2. Quando o estoque é lido

| Onde | O que faz |
|------|-----------|
| **ProductDetail** | Usa `variant.stock_quantity`; bloqueia compra e avisa se insuficiente. |
| **Cart** | Query `cart-stock` (product_variants) para itens do carrinho; exibe aviso de estoque insuficiente. |
| **Checkout** | Quantidades vêm do carrinho; process-payment valida no servidor. |
| **checkout-create-session** | Valida `variant.stock_quantity >= item.quantity` antes de criar link Yampi; **não** reserva nem debita. |
| **process-payment** | Após validar valor, chama `decrement_stock` por item (com rollback se falhar). |
| **yampi-webhook** (payment approved) | Chama `decrement_stock` por item e insere `inventory_movements` (tipo `debit`). |

---

## 3. Quando o estoque é decrementado

### 3.1 Checkout nativo (Appmax)

1. **Checkout.tsx**: Cria `orders` (status `pending`) e `order_items`; em seguida chama process-payment com `action: 'create_transaction'`.
2. **process-payment**:
   - Valida valor (servidor) e cupom.
   - Para cada item, chama `decrement_stock(p_variant_id, qty)`.
   - Se `decrement_stock` falhar (erro RPC ou `success: false`): faz rollback com `increment_stock` nos já debitados e retorna 400.
   - Se pagamento Appmax falhar (após criar pedido na Appmax): faz rollback com `increment_stock` em todos os itens.
   - **Não** insere em `inventory_movements`.

Consequência: pedidos nativos **não** geram movimentação de estoque em `inventory_movements`. O estoque é apenas debitado via `decrement_stock`.

### 3.2 Checkout Yampi

1. **checkout-create-session**: Apenas valida estoque e cria link de pagamento; **não** reserva nem debita.
2. **yampi-webhook** (eventos `payment.approved` / `order.paid` etc.):
   - Cria `orders` e `order_items`.
   - Para cada item com `localVariant.id`: chama `decrement_stock` e insere `inventory_movements` (tipo `debit`, `order_id`, `variant_id`, `quantity`).

Ou seja: no fluxo Yampi a baixa de estoque ocorre **só** no webhook, após pagamento aprovado, e fica registrada em `inventory_movements`.

---

## 4. Quando o estoque é devolvido (cancelamentos)

### 4.1 Yampi

- **yampi-webhook** (eventos de cancelamento/estorno): Busca o pedido por `external_reference`; atualiza status para `cancelled`; lê `inventory_movements` com `type IN ('debit', 'reserve')` para esse pedido; para cada movimento ainda não “devolvido” (sem `release`/`refund` correspondente), chama `increment_stock` e insere movimento de `release` ou `refund`. **Comportamento correto.**

### 4.2 Checkout nativo (Appmax)

- **appmax-webhook** (ex.: `order_refund`, `order_pix_expired`, `order_billet_overdue`): Apenas atualiza o status do pedido para `cancelled`. **Não** devolve estoque (não há `inventory_movements` para pedidos nativos).
- **Admin (Pedidos)**: Ao alterar status para “Cancelado”, apenas atualiza `orders.status`. **Não** devolve estoque.

**Consequência**: Para pedidos **nativos (Appmax)**, ao cancelar (pelo admin ou por webhook da Appmax), o estoque **nunca** é devolvido. É uma **lacuna de regra de negócio**.

---

## 5. Bling

- **bling-webhook** e **bling-sync** (cron): Atualizam `product_variants.stock_quantity` com o valor vindo do Bling (ou da API de saldos). Não criam pedidos; apenas sobrescrevem o estoque conforme `bling_sync_config` (ex.: `sync_stock`).
- Produto inativo no site é ignorado (não atualiza estoque).
- Conflito possível: se um pedido for cancelado e o estoque for devolvido no site, e em seguida o Bling enviar um webhook com saldo antigo, o valor do Bling pode sobrescrever a devolução. Isso depende da ordem e da frequência das integrações; o desenho atual é “Bling como fonte de verdade de estoque” quando o sync está ativo.

---

## 6. Resumo dos fluxos

| Fluxo | Onde debita | Registra em inventory_movements? | Cancelamento devolve estoque? |
|-------|-------------|----------------------------------|--------------------------------|
| **Checkout nativo (Appmax)** | process-payment | Não | **Não** (nem admin nem appmax-webhook) |
| **Checkout Yampi** | yampi-webhook (payment approved) | Sim (debit) | Sim (yampi-webhook cancelled) |
| **Bling** | — | — | N/A (só atualiza saldo) |

---

## 7. Achados e recomendações

### 7.1 [P1] Cancelamento de pedido nativo não devolve estoque — **Implementado**

- **Onde**: Pedidos criados pelo checkout nativo (Appmax); cancelamento feito pelo **admin** (alterar status para “Cancelado”) ou pelo **appmax-webhook** (ex.: order_refund, order_pix_expired).
- **Implementado**: RPC `cancel_order_return_stock(p_order_id)` devolve estoque a partir de `order_items`, insere `inventory_movements` (refund) e marca pedido como cancelado. Usada no admin e no appmax-webhook.
- **Recomendação** (já aplicada):  
  - **Opção A**: No **process-payment**, após cada `decrement_stock` bem-sucedido, inserir em `inventory_movements` com `type: 'debit'`, `order_id`, `variant_id`, `quantity`. Ao cancelar (admin ou appmax-webhook), usar a mesma lógica do yampi-webhook: ler movimentos de débito desse pedido, chamar `increment_stock` e inserir `refund`/`release`.  
  - **Opção B**: Ao marcar pedido como cancelado (no admin ou no appmax-webhook), carregar `order_items` desse pedido e, para cada item, chamar `increment_stock(product_variant_id, quantity)` (e opcionalmente inserir em `inventory_movements` tipo `refund`).  
  A Opção B é mais simples de implementar sem alterar o process-payment; a Opção A alinha o comportamento ao do Yampi e facilita auditoria.

### 7.2 [P2] Consistência Bling × cancelamentos

- Se o Bling estiver como fonte de verdade de estoque, após devolver estoque de um cancelamento no site, um sync ou webhook do Bling pode sobrescrever com valor desatualizado. Mitigação: garantir que o Bling seja atualizado (ex.: integração nativa Yampi→Bling ou processo manual) quando houver cancelamento, ou aceitar que o próximo sync do Bling reflita o saldo do ERP.

**Processo recomendado (quando o Bling é fonte de verdade de estoque):**

1. **Ao cancelar no admin ou via appmax-webhook**: A RPC `cancel_order_return_stock` já devolve o estoque no banco da loja. O saldo no Bling continua desatualizado até o próximo sync.
2. **Opções para manter Bling alinhado**: **(A)** Atualizar manualmente no Bling (ou via integração Yampi→Bling) as quantidades dos itens devolvidos após cada cancelamento; **(B)** Aceitar que o próximo sync de estoque (cron ou webhook do Bling) sobrescreva o saldo local com o valor do ERP — o Bling é a fonte de verdade.
3. **Recomendação**: Definir se cancelamentos são feitos preferencialmente no Bling (sync traz o saldo) ou no site (processo manual ou integração para avisar o Bling) e documentar a escolha no time.

### 7.3 Pontos positivos

- **decrement_stock**: Uso de `FOR UPDATE` na função SQL evita condição de corrida na baixa.
- **process-payment**: Rollback completo (increment_stock em todos os itens) em caso de falha de estoque ou de pagamento.
- **yampi-webhook**: Idempotência por `external_reference`; débito + `inventory_movements`; cancelamento devolve estoque com base nos movimentos.
- **checkout-create-session**: Apenas valida estoque; não reserva nem debita antes do pagamento Yampi.

---

## 8. Conclusão

O fluxo de estoque no **Yampi** está consistente: baixa no webhook de pagamento aprovado e devolução no webhook de cancelamento. No **checkout nativo (Appmax)** a devolução de estoque ao cancelar foi implementada: a RPC `cancel_order_return_stock` é usada no admin e no appmax-webhook, devolvendo as quantidades a partir de `order_items` e registrando `inventory_movements` (refund).
