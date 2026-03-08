

## Auditoria UI/UX — Correções de Bugs

Após análise dos componentes, console logs e screenshot, identifiquei os seguintes problemas:

---

### Bug 1 (Alto): Setas de navegação do ProductCarousel invisíveis no mobile

O `ProductCarousel` (usado em "Mais Vendidos", "Lançamentos", etc.) tem as setas com classe `hidden md:flex` — elas simplesmente não aparecem em telas menores que 768px. No mobile, o único indicador de que é possível rolar é o overflow, mas não há nenhuma indicação visual. Isso é exatamente o que o screenshot mostra.

**Fix**: Adicionar indicadores de navegação (dots) no mobile abaixo do carrossel, similares ao BannerCarousel. Opcionalmente, exibir setas menores nas laterais em mobile.

---

### Bug 2 (Médio): Console warnings — "Function components cannot be given refs"

Três warnings no console:
- `WhatsAppFloat` recebe ref via `lazy()` mas não usa `forwardRef`
- `WhatsAppIcon` (componente interno) mesmo problema
- `CookieConsent` mesmo problema

Isso gera warnings poluindo o console em dev e pode causar problemas futuros.

**Fix**: Envolver `WhatsAppFloat` e `CookieConsent` com `React.forwardRef` (ou exportar um wrapper compatível).

---

### Bug 3 (Médio): ContactForm usa `setTimeout` fake — mensagem nunca é salva

O `ContactForm.tsx` (página de Atendimento) simula envio com `setTimeout` de 800ms — idêntico ao bug da Newsletter que já corrigimos. Mensagens de contato são perdidas.

**Fix**: Criar tabela `contact_messages` e persistir no banco. Ou enviar via WhatsApp redirect como alternativa simples.

---

### Bug 4 (Baixo): Dots do BannerCarousel com baixo contraste sobre imagens escuras

Os dots usam `bg-secondary` e `bg-secondary/40`. Dependendo da cor do `--secondary` e da imagem do banner, ficam invisíveis. O screenshot mostra um dot branco grande que parece deslocado — pode ser o dot ativo sobre fundo escuro sem contraste suficiente.

**Fix**: Adicionar `ring` ou `shadow` nos dots para garantir visibilidade independente do fundo. Usar `bg-white` e `bg-white/50` com `ring-1 ring-black/20` como padrão universal.

---

### Bug 5 (Baixo): CategoryGrid sem indicadores de scroll no mobile

Mesmo problema do ProductCarousel: as setas são `hidden md:flex`. No mobile não há indicação visual de que há mais categorias para rolar.

**Fix**: Adicionar gradient fade nas bordas no mobile para indicar conteúdo scrollável.

---

### Arquivos a Modificar

1. **`src/components/store/ProductCarousel.tsx`** — Adicionar dots de navegação no mobile; manter setas em desktop
2. **`src/components/store/WhatsAppFloat.tsx`** — Adicionar `forwardRef` para eliminar warning
3. **`src/components/store/CookieConsent.tsx`** — Adicionar `forwardRef` para eliminar warning
4. **`src/components/store/ContactForm.tsx`** — Persistir mensagens no banco
5. **`src/components/store/BannerCarousel.tsx`** — Melhorar contraste dos dots
6. **`src/components/store/CategoryGrid.tsx`** — Adicionar fade gradient mobile

### Banco de Dados

- Criar tabela `contact_messages` (name, email, phone, subject, message, created_at) com RLS pública para insert

