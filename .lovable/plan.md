

# Melhorias e Correções de Bugs na Integração Yampi

Apos analise detalhada de todas as Edge Functions relacionadas a Yampi, identifiquei os seguintes problemas e melhorias:

---

## Bugs Encontrados

### 1. Catalog Sync ignora `custom_attribute_name/value` (recém-adicionados)
**Arquivo:** `yampi-catalog-sync/index.ts` (linha 204)
A query de variantes nao inclui `custom_attribute_name` nem `custom_attribute_value`. Quando existem variantes customizadas, o sistema nao consegue mapeá-las para variations na Yampi. O mesmo se aplica ao `checkout-create-session/index.ts` (linha 139) e ao `yampi-sync-sku/index.ts`.

### 2. Webhook: customer.data nao unwrap no bloco de cancelamento
**Arquivo:** `yampi-webhook/index.ts` (linhas 648-649)
No bloco de cancelamento (`cancelledEvents`), o customer nao faz unwrap de `.data`, ao contrario dos blocos de aprovacao. Isso faz com que emails de cancelamento possam nao ser enviados se o payload vier com `customer.data.email`.

### 3. Webhook: `order.status` never set to "paid"
**Arquivo:** `yampi-webhook/index.ts` (linhas 128-148)
Ao atualizar um pedido existente (by session), o status vai direto para `"processing"` sem nunca ter sido `"paid"`. Isso esta correto para o fluxo, porem o campo `payment_status` nunca e definido, diferente do `yampi-import-order` que define `payment_status: "approved"`.

### 4. Import order batch: falta `variant_info`, `title_snapshot`, `image_snapshot`
**Arquivo:** `yampi-import-order/index.ts` (linhas 603-608)
Na funcao `importSingleOrder` (batch), o insert de `order_items` nao inclui `variant_info`, `title_snapshot`, `image_snapshot` e `sku_snapshot`. Pedidos importados em lote ficam sem essas informacoes na tela de detalhes.

### 5. Webhook: `appmax_order_id` usado para gravar `yampiOrderId`
**Arquivo:** `yampi-webhook/index.ts` (linha 84)
Na gravacao do `order_events`, o campo `appmax_order_id` recebe o `yampiOrderId`. Isso e semanticamente errado e pode causar confusao em queries. O campo correto seria usar o `payload` ou um campo generico.

### 6. Catalog Sync: SKU duplicado quando custom attribute existe
**Arquivo:** `yampi-catalog-sync/index.ts` (linha 339)
O SKU gerado para a Yampi usa `size` e `color`, mas nao inclui `custom_attribute_value`, podendo gerar SKUs duplicados na Yampi quando ha variantes customizadas com mesmo tamanho/cor.

---

## Melhorias Propostas

### 7. Webhook: adicionar tratamento para `order.status.updated` com status "processing"
O mapeamento de `order.status.updated` nao inclui status como `"processing"` ou `"in_production"` que a Yampi pode enviar. Esses eventos sao silenciosamente ignorados.

### 8. Catalog Sync: sincronizar `custom_attribute` como variacao Yampi
Quando um produto tem `custom_attribute_name` e `custom_attribute_value`, esses devem ser mapeados para variações da Yampi (via `variation_value_map`) da mesma forma que `size` e `color`.

### 9. Import order: adicionar `shipping_neighborhood` e `shipping_complement`
O endereco importado concatena tudo em `shipping_address`, mas os campos individuais (bairro, complemento) sao perdidos. Seria util preservar em campos separados se existirem no schema.

---

## Plano de Implementacao

| Prioridade | Correcao | Arquivo |
|------------|----------|---------|
| ALTA | Fix #2: unwrap customer.data no cancelamento | `yampi-webhook/index.ts` |
| ALTA | Fix #4: batch import sem snapshots | `yampi-import-order/index.ts` |
| ALTA | Fix #1/#6: incluir custom_attribute no catalog sync e SKU | `yampi-catalog-sync/index.ts` |
| MEDIA | Fix #3: adicionar payment_status no webhook update | `yampi-webhook/index.ts` |
| MEDIA | Fix #5: remover uso errado de appmax_order_id | `yampi-webhook/index.ts` |
| BAIXA | Melhoria #7: mais status no order.status.updated | `yampi-webhook/index.ts` |
| BAIXA | Melhoria #8: custom_attribute como variacao Yampi | `yampi-catalog-sync/index.ts` |

### Detalhes Tecnicos

**Fix #2 (webhook cancelamento):**
```typescript
// Antes (bug):
const customerEmail = resourceData?.customer?.email || ...
// Depois (fix):
const rawCustomer = resourceData?.customer || resourceData?.buyer || {};
const customer = rawCustomer?.data || rawCustomer;
const customerEmail = customer?.email || resourceData?.email || null;
```

**Fix #4 (batch import snapshots):**
Adicionar lookup de variante local (size, color, sku), produto (name) e imagem primaria ao `importSingleOrder`, igual ao fluxo single.

**Fix #1/#6 (custom attribute no catalog sync):**
- Adicionar `custom_attribute_name, custom_attribute_value` ao select de variantes
- Incluir custom_attribute_value no SKU gerado para Yampi (evitar duplicatas)
- Mapear custom attributes via `variation_value_map` quando disponivel

**Fix #3 (payment_status no webhook):**
Adicionar `payment_status: "approved"` ao update do pedido por session.

**Fix #5 (appmax_order_id):**
Remover ou renomear o campo no insert de `order_events` para evitar confusao.

