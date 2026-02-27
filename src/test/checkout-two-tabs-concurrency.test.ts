/**
 * P0-1: Teste de integração — duas requisições concorrentes com mesmo cart_id resultam em 1 ordem.
 * Requer: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { describe, it, expect } from 'vitest';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const orderPayload = (cartId: string) => ({
  order_number: `TEMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  cart_id: cartId,
  idempotency_key: cartId,
  subtotal: 100,
  total_amount: 100,
  shipping_address: 'Rua Teste, 1',
  shipping_city: 'São Paulo',
  shipping_name: 'Test',
  shipping_state: 'SP',
  shipping_zip: '01310100',
  status: 'pending',
});

describe('checkout two tabs / cart_id uniqueness', () => {
  it('duas inserções paralelas com mesmo cart_id: 1 sucesso, 1 falha por constraint', async () => {
    if (!url || !key) return;

    const supabase = createClient(url, key);
    const cartId = `e2e-cart-${crypto.randomUUID()}`;

    const [r1, r2] = await Promise.all([
      supabase.from('orders').insert(orderPayload(cartId)).select('id').single(),
      supabase.from('orders').insert(orderPayload(cartId)).select('id').single(),
    ]);

    const oneSuccess = !r1.error || !r2.error;
    const oneFailure = r1.error?.code === '23505' || r2.error?.code === '23505';
    expect(oneSuccess).toBe(true);
    expect(oneFailure).toBe(true);

    const { data: rows } = await supabase
      .from('orders')
      .select('id')
      .eq('cart_id', cartId);
    expect(rows?.length).toBe(1);

    if (r1.data?.id) await supabase.from('orders').delete().eq('id', r1.data.id);
    if (r2.data?.id && r2.data.id !== r1.data?.id) await supabase.from('orders').delete().eq('id', r2.data.id);
  });
});
