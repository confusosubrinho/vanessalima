/**
 * P0-3 / PR7: Testes de segurança de webhooks — assinatura obrigatória.
 * Stripe: sem assinatura ou inválida → 400/401.
 * Reconcile: sem Bearer → 401.
 * Reprocess webhook (PR6): sem Bearer → 401.
 */
import { describe, it, expect } from 'vitest';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe('Webhook security', () => {
  it('Stripe webhook sem stripe-signature retorna 400', async () => {
    if (!url) return;
    const functionsUrl = url.replace(/\/$/, '') + '/functions/v1/stripe-webhook';
    const res = await fetch(functionsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'payment_intent.succeeded', data: {} }),
    });
    expect(res.status).toBe(400);
  });

  it('Stripe webhook com assinatura inválida retorna 400', async () => {
    if (!url) return;
    const functionsUrl = url.replace(/\/$/, '') + '/functions/v1/stripe-webhook';
    const res = await fetch(functionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=1,v0=invalid',
      },
      body: JSON.stringify({ type: 'payment_intent.succeeded', data: {} }),
    });
    expect(res.status).toBe(400);
  });

  it('reconcile-order sem Authorization retorna 401 ou 404', async () => {
    if (!url) return;
    const functionsUrl = url.replace(/\/$/, '') + '/functions/v1/reconcile-order';
    const res = await fetch(functionsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect([401, 404]).toContain(res.status);
  });

  it('reconcile-order com Bearer válido não retorna 401', async () => {
    if (!url || !key) return;
    const functionsUrl = url.replace(/\/$/, '') + '/functions/v1/reconcile-order';
    const res = await fetch(functionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ order_id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).not.toBe(401);
  });

  it('reprocess-stripe-webhook sem Authorization retorna 401 (PR6/PR7)', async () => {
    if (!url) return;
    const functionsUrl = url.replace(/\/$/, '') + '/functions/v1/reprocess-stripe-webhook';
    const res = await fetch(functionsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: 'evt_00000000000000' }),
    });
    expect(res.status).toBe(401);
  });
});
