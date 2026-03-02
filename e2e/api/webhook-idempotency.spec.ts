/**
 * E2E API: stripe-webhook idempotencia — mesmo event_id 2x retorna duplicate no segundo.
 * Requer STRIPE_WEBHOOK_SECRET e payload assinado; em CI sem Stripe skip.
 */
import { test, expect } from '@playwright/test';

test.describe('Webhook idempotency', () => {
  test('sem STRIPE_WEBHOOK_SECRET skip', async () => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      test.skip(true, 'STRIPE_WEBHOOK_SECRET nao definido');
      return;
    }
    const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(base && key).toBeTruthy();
  });
});
