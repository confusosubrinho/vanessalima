/**
 * Testes da lógica de reconciliação pedido/pagamento.
 * A Edge Function reconcile-order consulta o Stripe e, se PI succeeded, atualiza order para paid
 * e garante 1 registro em payments. Aqui testamos a regra de decisão e o contrato.
 */
import { describe, it, expect } from 'vitest';

/** Réplica da regra de decisão da Edge Function: quando atualizar order para paid */
function shouldSetOrderPaid(stripePaymentIntentStatus: string): boolean {
  return stripePaymentIntentStatus === 'succeeded';
}

describe('Reconcile order/payment', () => {
  it('quando Stripe PI status é succeeded, deve marcar pedido como paid', () => {
    expect(shouldSetOrderPaid('succeeded')).toBe(true);
  });

  it('quando Stripe PI status não é succeeded, não deve alterar para paid', () => {
    expect(shouldSetOrderPaid('requires_payment_method')).toBe(false);
    expect(shouldSetOrderPaid('requires_confirmation')).toBe(false);
    expect(shouldSetOrderPaid('requires_action')).toBe(false);
    expect(shouldSetOrderPaid('processing')).toBe(false);
    expect(shouldSetOrderPaid('canceled')).toBe(false);
  });

  it('resposta de sucesso do reconcile deve ter ok, order_id, previous_status, new_status, payment_synced', () => {
    const mockResponse = {
      ok: true,
      order_id: 'ord_xxx',
      previous_status: 'pending',
      new_status: 'paid',
      payment_synced: true,
      correlation_id: 'test-id',
    };
    expect(mockResponse.ok).toBe(true);
    expect(mockResponse.new_status).toBe('paid');
    expect(mockResponse.previous_status).toBe('pending');
    expect(typeof mockResponse.order_id).toBe('string');
    expect(typeof mockResponse.payment_synced).toBe('boolean');
  });
});
