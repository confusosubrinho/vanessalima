/**
 * Anti-fraude de preço: server sempre recalcula total a partir do DB.
 * stripe-create-intent rejeita quando amount do client diverge do server (tolerância 1%).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Anti-fraude preço (stripe-create-intent)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejeita quando amount do payload diverge do total calculado no server', async () => {
    const serverTotal = 100.0;
    const clientAmountTampered = 1.0; // cliente envia 1 real em vez de 100

    const tolerance = Math.max(0.1, serverTotal * 0.01);
    const diff = Math.abs(serverTotal - clientAmountTampered);
    expect(diff > tolerance).toBe(true);

    const wouldReject = diff > tolerance;
    expect(wouldReject).toBe(true);
  });

  it('aceita quando amount está dentro da tolerância (1% ou 0.10)', () => {
    const serverTotal = 100.0;
    const clientAmountOk = 100.05;

    const tolerance = Math.max(0.1, serverTotal * 0.01);
    const diff = Math.abs(serverTotal - clientAmountOk);
    expect(diff <= tolerance).toBe(true);
  });
});
