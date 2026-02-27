# Migration payments UNIQUE — Aplicar e verificar

O projeto não está linkado ao Supabase (`supabase link`). Aplique a migration manualmente no **Supabase Dashboard → SQL Editor**.

## 1) Aplicar a migration

Cole e execute no SQL Editor:

```sql
-- Idempotência: evitar duplicar registro de pagamento para o mesmo transaction_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_transaction_id
  ON public.payments (provider, transaction_id)
  WHERE transaction_id IS NOT NULL;
```

## 2) Verificar índice no banco

Execute e guarde o resultado (nome e definição do índice):

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'payments'
  AND indexname = 'idx_payments_provider_transaction_id';
```

**Resultado esperado:** uma linha com `indexname = 'idx_payments_provider_transaction_id'` e `indexdef` contendo `UNIQUE` e `(provider, transaction_id)` com `WHERE (transaction_id IS NOT NULL)`.

Exemplo de saída:

| indexname | indexdef |
|-----------|----------|
| idx_payments_provider_transaction_id | CREATE UNIQUE INDEX idx_payments_provider_transaction_id ON public.payments USING btree (provider, transaction_id) WHERE (transaction_id IS NOT NULL) |
