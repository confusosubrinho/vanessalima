-- Idempotência: evitar duplicar registro de pagamento para o mesmo transaction_id (ex: retry do webhook)
-- Stripe: transaction_id = payment_intent.id (único por intent)
-- NULL transaction_id permanece permitido em múltiplas linhas (ex: outros gateways)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_transaction_id
  ON public.payments (provider, transaction_id)
  WHERE transaction_id IS NOT NULL;
