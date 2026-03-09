

# Sincronização Completa de Pedidos com a Yampi

## Situação Atual

A função `yampi-sync-order-status` atualiza apenas:
- Status do pedido e status de pagamento
- Código de rastreamento e método de envio
- Dados da transação (método, gateway, parcelas)
- Custo de frete

**Campos que NÃO são atualizados:**
- Dados do cliente (nome, email, CPF, telefone)
- Endereço de entrega (rua, cidade, estado, CEP)
- Valores (subtotal, total, desconto)
- Items do pedido (produto, variante, SKU, preço, imagem)

## Correções

### No `yampi-sync-order-status/index.ts`:

**1. Extrair dados do cliente do payload Yampi:**
```typescript
const customer = (yampiOrder.customer?.data || yampiOrder.customer) || {};
const customerName = customer.name || `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
const customerEmail = customer.email;
const customerCpf = customer.cpf || customer.document;
const customerPhone = customer.phone?.full_number || customer.phone;
```

**2. Extrair endereço de entrega:**
```typescript
const shipping = yampiOrder.shipping_address?.data || yampiOrder.shipping_address || customer.address || {};
```

**3. Extrair valores financeiros:**
```typescript
const subtotal = yampiOrder.value_products || yampiOrder.subtotal;
const totalAmount = yampiOrder.value_total || yampiOrder.total;
const discountAmount = yampiOrder.value_discount || yampiOrder.discount;
```

**4. Adicionar todos os campos ao `updatePayload`:**
- `shipping_name`, `shipping_address`, `shipping_city`, `shipping_state`, `shipping_zip`, `shipping_phone`
- `customer_email`, `customer_cpf`
- `subtotal`, `total_amount`, `discount_amount`

**5. Enriquecer `order_items` com dados do payload Yampi:**
- Iterar pelos items do pedido Yampi (`yampiOrder.items.data`)
- Para cada item, atualizar o `order_item` correspondente com `product_name`, `variant_info`, `sku_snapshot`, `image_snapshot`, `unit_price`, `total_price`, `quantity`
- Fazer match por `yampi_sku_id` ou pela posição

**6. Upsert de pagamento na tabela `payments`:**
- Se a transação Yampi existe, criar/atualizar registro em `payments` com provider, status, método, gateway, parcelas e transaction_id

## Arquivo modificado
- `supabase/functions/yampi-sync-order-status/index.ts`

