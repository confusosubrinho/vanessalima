/**
 * E2E helper: cliente Supabase com service role (apenas para uso local/staging).
 * Não usar em produção.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseServiceRole() {
  if (!url || !key) {
    throw new Error('E2E: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  }
  return createClient(url, key);
}

export { getSupabaseServiceRole };

const E2E_PREFIX = 'e2e_';

export function e2eRequestId(): string {
  return E2E_PREFIX + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

/**
 * Remove orders/order_items/payments criados por testes E2E (cart_id ou idempotency_key começando com e2e_).
 */
export async function cleanupE2EOrders(supabase: ReturnType<typeof createClient>) {
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .or('cart_id.like.' + E2E_PREFIX + '%,idempotency_key.like.' + E2E_PREFIX + '%');
  if (!orders?.length) return;
  const ids = orders.map((o) => o.id);
  await supabase.from('order_items').delete().in('order_id', ids);
  await supabase.from('payments').delete().in('order_id', ids);
  await supabase.from('orders').delete().in('id', ids);
}

/**
 * Remove eventos stripe_webhook_events com event_id começando com e2e_.
 */
export async function cleanupE2EWebhookEvents(supabase: ReturnType<typeof createClient>) {
  const { data: rows } = await supabase
    .from('stripe_webhook_events')
    .select('id')
    .like('event_id', E2E_PREFIX + '%');
  if (rows?.length) {
    await supabase.from('stripe_webhook_events').delete().in('id', rows.map((r) => r.id));
  }
}
