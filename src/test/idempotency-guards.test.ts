/**
 * PR7: Testes mínimos das regras de idempotência (PR2).
 * Réplica da lógica do process-payment (Appmax): não criar segunda cobrança se order já pago/processando ou com appmax_order_id.
 */
import { describe, it, expect } from "vitest";

const CHARGED_STATUSES = ["processing", "paid", "shipped", "delivered"] as const;

function orderAlreadyCharged(
  status: string,
  appmaxOrderId: string | null | undefined
): boolean {
  return (
    CHARGED_STATUSES.includes(status as (typeof CHARGED_STATUSES)[number]) ||
    !!appmaxOrderId
  );
}

describe("Idempotency guards (PR2)", () => {
  it("deve considerar já cobrado quando status é processing", () => {
    expect(orderAlreadyCharged("processing", null)).toBe(true);
  });

  it("deve considerar já cobrado quando status é paid, shipped ou delivered", () => {
    expect(orderAlreadyCharged("paid", null)).toBe(true);
    expect(orderAlreadyCharged("shipped", null)).toBe(true);
    expect(orderAlreadyCharged("delivered", null)).toBe(true);
  });

  it("deve considerar já cobrado quando appmax_order_id está preenchido", () => {
    expect(orderAlreadyCharged("pending", "appmax_123")).toBe(true);
    expect(orderAlreadyCharged("pending", "any")).toBe(true);
  });

  it("não deve considerar já cobrado quando status é pending e sem appmax_order_id", () => {
    expect(orderAlreadyCharged("pending", null)).toBe(false);
    expect(orderAlreadyCharged("pending", undefined)).toBe(false);
  });

  it("não deve considerar já cobrado quando status é cancelled ou failed", () => {
    expect(orderAlreadyCharged("cancelled", null)).toBe(false);
    expect(orderAlreadyCharged("failed", null)).toBe(false);
  });
});
