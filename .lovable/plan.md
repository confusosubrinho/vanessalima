

# Plano: Imagem da variante com fallback para imagem principal na Yampi

## Problema Atual

A função `yampi-sync-images` agrupa variantes por produto e envia imagens apenas para **um SKU por produto**. Ela ignora completamente a coluna `product_variant_id` da tabela `product_images`, que permite vincular imagens específicas a variantes.

Resultado: todos os SKUs ficam sem imagem ou recebem a mesma imagem genérica do produto.

## Solução

Mudar a lógica para enviar imagens **por SKU (variante)**, não por produto:

1. Para cada variante com `yampi_sku_id`, buscar imagens onde `product_variant_id = variant.id`
2. Se não encontrar nenhuma, usar como fallback a imagem principal do produto (`is_primary = true`)
3. Se nem a principal existir, usar qualquer imagem do produto (ordenada por `display_order`)

## Mudanças no Código

### `supabase/functions/yampi-sync-images/index.ts`

**Query de variantes (linha ~271):**
- Adicionar `id` ao select para ter o UUID da variante
- Remover o `seen` Map que agrupava por produto — iterar sobre **todas** as variantes

**Query de imagens (linha ~323):**
- Primeiro buscar imagens com `product_variant_id = variant.id`
- Se vazio, buscar imagens do produto ordenadas por `is_primary` desc + `display_order` asc (comportamento atual, mas agora como fallback explícito)

**Lógica resumida:**
```
Para cada variante com yampi_sku_id:
  1. Buscar imagens WHERE product_variant_id = variant.id
  2. Se vazio → buscar imagens WHERE product_id = variant.product_id (is_primary primeiro)
  3. Converter WebP se necessário
  4. POST para /catalog/skus/{yampi_sku_id}/images
```

### Arquivo afetado
| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/yampi-sync-images/index.ts` | Enviar imagens por SKU com fallback para imagem principal |

### Impacto
- Variantes com imagem vinculada recebem sua imagem específica na Yampi
- Variantes sem imagem vinculada recebem a imagem principal do produto (nunca ficam sem imagem)
- Rate limit mantido (delay de 2.1s entre requests)

