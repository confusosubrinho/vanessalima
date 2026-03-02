/**
 * E2E assertions: order status, payments, webhook events (via Supabase service role).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function assertOrderStatus(
  supabase: SupabaseClient,
  orderId: string,
  expectedStatus: string
): Promise<{ ok: boolean; actual?: string }> {
  const { data, error } = await supabase.from('orders').select('status').eq('id', orderId).single();
  if (error) return { ok: false };
  const actual = data?.status;
  return { ok: actual === expectedStatus, actual };
}

export async function assertOrderExists(supabase: SupabaseClient, orderId: string): Promise<boolean> {
  const { data } = await supabase.from('orders').select('id').eq('id', orderId).maybeSingle();
  return !!data?.id;
}

export async function assertPaymentsForOrder(
  supabase: SupabaseClient,
  orderId: string,
  minCount: number = 1
): Promise<{ ok: boolean; count: number }> {
  const { data, error } = await supabase.from('payments').select('id').eq('order_id', orderId);
  if (error) return { ok: false, count: 0 };
  const count = data?.length ?? 0;
  return { ok: count >= minCount, count };
}

export async function assertStripeWebhookEventProcessed(
  supabase: SupabaseClient,
  eventId: string,
  expectErrorNull: boolean = true
): Promise<{ ok: boolean; error_message?: string | null }> {
  const { data, error } = await supabase
    .from('stripe_webhook_events')
    .select('id, error_message, processed_at')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error || !data) return { ok: false };
  const ok = expectErrorNull ? data.error_message == null : true;
  return { ok, error_message: data.error_message };
}

export async function countOrdersByCartId(supabase: SupabaseClient, cartId: string): Promise<number> {
  const { data } = await supabase.from('orders').select('id').eq('cart_id', cartId);
  return data?.length ?? 0;
}
