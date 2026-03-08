

## Auditoria do Sistema de Avaliações (Parte 2) — Bugs Remanescentes

---

### Bug 1 (Alto): Tipo `ProductReview` em `database.ts` desatualizado — falta `status`, `admin_reply`, `replied_at`

O tipo `ProductReview` (src/types/database.ts linhas 199-211) não tem os campos `status`, `admin_reply` e `replied_at` que existem na tabela real. Isso causa:
- O cast `as ProductReview[]` em `ProductReviews.tsx` silencia os campos ausentes
- O acesso a `(review as any).admin_reply` no frontend (linha 264) usa `as any` para contornar a tipagem
- O campo `is_approved` (legado) ainda consta no tipo mas deveria ser removido

**Fix**: Atualizar a interface `ProductReview` adicionando `status`, `admin_reply`, `replied_at` e removendo `is_approved`.

---

### Bug 2 (Médio): Resposta da loja no frontend usa `(review as any).admin_reply`

Em `ProductReviews.tsx` linhas 264-269, a resposta do admin é acessada via `(review as any).admin_reply` porque o tipo não tem esse campo. Após corrigir o tipo (Bug 1), remover os casts `as any`.

---

### Bug 3 (Médio): Trigger `notify_new_review` dispara para TODAS as avaliações, incluindo pendentes

O trigger `on_new_review` dispara `AFTER INSERT` sem filtrar status. Toda avaliação submetida (status=pending) gera uma notificação dizendo "Nova avaliação publicada", mesmo sem ter sido publicada. O texto é enganoso.

**Fix**: Alterar o texto da notificação para "Nova avaliação recebida" (em vez de "publicada") já que o trigger dispara na submissão, não na publicação.

---

### Bug 4 (Baixo): Admin Reviews — `as any` desnecessários nas mutations

Em `Reviews.tsx` linhas 88 e 102, `.update({ status } as any)` e `.update({ admin_reply, replied_at } as any)` usam casts porque o tipo gerado já suporta esses campos. Esses casts podem ser removidos para melhor type-safety.

---

### Bug 5 (Baixo): Avaliação sem rate-limit — spam possível

O formulário de avaliação em `ProductReviews.tsx` não tem proteção contra submissões repetidas além do `isSubmitting` durante a request. Um usuário pode enviar dezenas de avaliações para o mesmo produto.

**Fix**: Após submissão bem-sucedida, desabilitar o botão "Escrever Avaliação" por alguns segundos e/ou verificar se já existe uma avaliação do mesmo `user_id` para o produto.

---

### Arquivos a Modificar

1. **`src/types/database.ts`** — Adicionar `status`, `admin_reply`, `replied_at` ao tipo `ProductReview`; remover `is_approved`
2. **`src/components/store/ProductReviews.tsx`** — Remover casts `as any` para `admin_reply`; adicionar cooldown anti-spam
3. **`src/pages/admin/Reviews.tsx`** — Remover casts `as any` das mutations
4. **Migration SQL** — Alterar texto do trigger `notify_new_review` de "publicada" para "recebida"

