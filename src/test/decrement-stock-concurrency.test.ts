/**
 * Teste de integração: concorrência de decrement_stock.
 * Com estoque=1, N chamadas paralelas: exatamente 1 sucesso, resto falha, estoque final 0.
 * Requer: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe('decrement_stock concurrency', () => {
  let supabase: ReturnType<typeof createClient>;
  let variantId: string;
  const PARALLEL = 5;

  beforeAll(async () => {
    if (!url || !key) {
      return;
    }
    supabase = createClient(url, key);
    const { data: v } = await supabase
      .from('product_variants')
      .select('id')
      .eq('sku', 'QA-E2E-38')
      .maybeSingle();
    if (v) {
      variantId = v.id;
      await supabase.from('product_variants').update({ stock_quantity: 1 }).eq('id', variantId);
    } else {
      const { data: p } = await supabase.from('products').select('id').eq('slug', 'qa-prod-e2e').maybeSingle();
      if (p) {
        const { data: ins } = await supabase.from('product_variants').insert({
          product_id: p.id,
          size: '39',
          color: 'Test',
          stock_quantity: 1,
          is_active: true,
          sku: 'QA-CONCURRENCY',
        }).select('id').single();
        if (ins) variantId = ins.id;
      }
    }
  });

  afterAll(async () => {
    if (variantId && supabase) {
      await supabase.from('product_variants').update({ stock_quantity: 10 }).eq('id', variantId);
    }
  });

  it('com estoque=1, N chamadas paralelas: 1 sucesso, resto falha, estoque final 0', async () => {
    if (!url || !key) {
      return;
    }
    if (!variantId) {
      return;
    }

    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        supabase.rpc('decrement_stock', { p_variant_id: variantId, p_quantity: 1 })
      )
    );

    const parsed = results.map((r) => {
      const data = r.data as { success?: boolean } | null;
      if (typeof data === 'string') {
        try {
          return JSON.parse(data) as { success?: boolean };
        } catch {
          return { success: false };
        }
      }
      return data || { success: false };
    });

    const successes = parsed.filter((p) => p?.success === true).length;
    const failures = parsed.filter((p) => p?.success === false).length;

    expect(successes).toBe(1);
    expect(failures).toBe(PARALLEL - 1);

    const { data: row } = await supabase
      .from('product_variants')
      .select('stock_quantity')
      .eq('id', variantId)
      .single();

    expect(Number(row?.stock_quantity)).toBe(0);
  });
});
