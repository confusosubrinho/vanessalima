/**
 * P0-2: Teste de integração — release_expired_reservations restaura estoque e cancela pedido.
 * Requer: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e Edge Function deployada (ou mock).
 */
import { createClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe('release_expired_reservations', () => {
  it('pedido pending com created_at no passado: após cleanup, status cancelled e estoque restaurado', async () => {
    if (!url || !key) return;

    const supabase = createClient(url, key);
    const cartId = `e2e-ttl-${crypto.randomUUID()}`;

    const { data: variant } = await supabase
      .from('product_variants')
      .select('id, product_id, stock_quantity')
      .eq('sku', 'QA-E2E-38')
      .maybeSingle();
    if (!variant) return;

    const initialStock = Number(variant.stock_quantity ?? 0);

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        order_number: `TEMP-TTL-${Date.now()}`,
        cart_id: cartId,
        idempotency_key: cartId,
        status: 'pending',
        subtotal: 50,
        total_amount: 50,
        shipping_address: 'Rua TTL, 1',
        shipping_city: 'SP',
        shipping_name: 'TTL Test',
        shipping_state: 'SP',
        shipping_zip: '01310100',
      })
      .select('id')
      .single();
    if (orderErr || !order) {
      expect(orderErr?.code).toBeFalsy();
      return;
    }

    await supabase.from('order_items').insert({
      order_id: order.id,
      product_id: variant.product_id,
      product_variant_id: variant.id,
      product_name: 'Test',
      variant_info: '38',
      quantity: 1,
      unit_price: 50,
      total_price: 50,
    });

    await supabase.rpc('decrement_stock', { p_variant_id: variant.id, p_quantity: 1 });
    await supabase
      .from('orders')
      .update({ created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() })
      .eq('id', order.id);

    const functionsUrl = url.replace(/\/$/, '') + '/functions/v1/release-expired-reservations';
    const res = await fetch(functionsUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    expect(res.ok).toBe(true);
    expect(data.released).toBeGreaterThanOrEqual(1);

    const { data: orderAfter } = await supabase.from('orders').select('status').eq('id', order.id).single();
    expect(orderAfter?.status).toBe('cancelled');

    const { data: varAfter } = await supabase.from('product_variants').select('stock_quantity').eq('id', variant.id).single();
    expect(Number(varAfter?.stock_quantity)).toBe(initialStock);

    await supabase.from('order_items').delete().eq('order_id', order.id);
    await supabase.from('orders').delete().eq('id', order.id);
  });
});
