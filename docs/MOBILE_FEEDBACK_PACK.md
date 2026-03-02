# Mobile Feedback Pack

Feedback tátil (vibração), animação de pressão e som opcional em ações-chave. Tudo centralizado em `src/lib/feedback.ts`, `src/hooks/useFeedback.ts` e `src/components/ui/Pressable.tsx`.

## Onde foi aplicado

| Ação | Onde | Padrão |
|------|------|--------|
| Adicionar ao carrinho | `ProductDetail.tsx` — botão "Adicionar ao Carrinho" | `light` |
| Remover item do carrinho | `Cart.tsx` — botão lixeira por item | `selection` |
| Finalizar compra / Ir para checkout | `Cart.tsx` — botão "Finalizar Compra" | `selection` |
| Copiar código PIX | `Checkout.tsx` e `OrderConfirmation.tsx` — botão "Copiar código PIX" | `light` |
| Finalizar pedido / Pagar | `Checkout.tsx` — botão "Finalizar Pedido" | `selection` |
| Erro de validação / pagamento | `Checkout.tsx` — toasts destrutivos (handler) | `error` |
| Confirmação de pedido pago | `CheckoutReturn.tsx` (1x por retorno) e `OrderConfirmation.tsx` (1x por pedido quando status paid/processing) | `success` |

Não foi aplicado em: links de navegação do menu, inputs, botões secundários desnecessários.

## Habilitar / desabilitar

- **localStorage**
  - `mobile_feedback_enabled`: `"true"` | `"false"` — feedback tátil e visual (padrão: `true`).
  - `mobile_feedback_sound_enabled`: `"true"` | `"false"` — som de clique opcional (padrão: `false`).

- **UI**
  - Footer (Ajuda) → "Preferências".
  - Menu mobile (Header) → "Preferências".
  - No modal: toggle "Feedback tátil (mobile)" e "Som de feedback (opcional)".

Se o sistema tiver **preferir menos movimento** ativado, vibração e animação de escala são desativados (apenas highlight leve em `Pressable`).

## Padrões de vibração

- `light`: 12 ms  
- `selection`: 8 ms  
- `success`: 20 ms  
- `error`: [30, 40, 30] ms  

## Acessibilidade

- Respeito a `prefers-reduced-motion`: não vibra e não aplica scale; usa só outline no `Pressable`.
- Respeito a `prefers-reduced-transparency` (disponível na API para futuros ajustes).
- Toggle de feedback desativado quando `prefers-reduced-motion` está ativo.

## Checklist manual rápido (mobile)

- [ ] Android Chrome: ao tocar em "Adicionar ao carrinho", "Finalizar compra", "Copiar código PIX" → vibração curta.
- [ ] iPhone Safari: sem vibração; ao tocar nos mesmos botões → animação de pressão (scale 0.98).
- [ ] Página de confirmação (obrigado / pedido confirmado): feedback `success` apenas 1 vez por sessão/pedido.
- [ ] Erro de validação no checkout: feedback `error` (vibração padrão longo).
- [ ] Footer ou menu mobile → Preferências: desligar "Feedback tátil" → novos toques não vibram/não animam; ligar som → clique discreto ao tocar.
- [ ] Com "reduzir movimento" ativado no SO: sem scale e sem vibração; opção de feedback tátil desabilitada no modal.
