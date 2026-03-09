

# Melhoria Visual do Popup de Pedidos (Desktop) + Remoção de Duplicatas

## Problemas Identificados

1. **Yampi ID redundante**: Linhas 81-87 mostram `yampi_order_number` OU `external_reference`, mas o `external_reference` já aparece indiretamente nos botões de ação (linha 251). Além disso, essa info pode ser redundante com o `order_number` no título do dialog.

2. **"Valor pago" duplicado**: O InfoCard "Valor pago" (linha 91) mostra o mesmo valor que o "Total" no Resumo (linha 218). Informação repetida.

3. **Desktop visualmente pobre**: O dialog usa apenas `max-w-2xl` sem estrutura visual clara — sem separação de seções, sem cabeçalho destacado, sem agrupamento lógico.

4. **Ações sem hierarquia visual**: Botões de sincronização, conciliação e exclusão estão todos com `variant="outline"` sem distinção clara.

## Plano de Correções

### No `OrderDetailContent.tsx`:

**1. Remover duplicatas**
- Remover o InfoCard "Valor pago" do grid de pagamento (já aparece no Resumo)
- Manter grid de pagamento com 3 itens: Método, Gateway, Parcelas
- Desktop: `grid-cols-3`, Mobile: `grid-cols-2` (terceiro item ocupa a linha seguinte)

**2. Consolidar info Yampi no header**
- Mover o Yampi order number para junto dos badges no topo, como um badge discreto em vez de parágrafo separado
- Remover a exibição redundante do `external_reference` (já é usado internamente pelos botões)

**3. Melhorar visual desktop**
- Adicionar seções com títulos e separadores visuais claros
- Usar cards com fundo sutil para agrupar: Pagamento, Itens, Endereço+Resumo
- Melhorar o header com nome do cliente em destaque + badges ao lado
- Tabela de itens desktop: adicionar hover e alternating rows

**4. Melhorar ações**
- Agrupar botões de sync/reconcile horizontalmente no desktop (flex-row)
- Botão de excluir visualmente separado com `variant="destructive"` outline
- Remover textos descritivos redundantes sob cada botão no desktop (manter tooltip ou manter só no mobile)

### No `Orders.tsx`:
- Aumentar `max-w-2xl` para `max-w-3xl` no desktop para dar mais respiro ao conteúdo

## Arquivo modificado
- `src/components/admin/OrderDetailContent.tsx`
- `src/pages/admin/Orders.tsx` (apenas ajuste do max-width do dialog)

