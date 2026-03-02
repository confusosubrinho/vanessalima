/**
 * PR7: Testes mínimos do cliente de checkout (PR1/PR4).
 * - request_id (UUID), timeout padrão 20s (P0-2).
 */
import { describe, it, expect } from "vitest";
import { generateRequestId, DEFAULT_CHECKOUT_TIMEOUT_MS } from "@/lib/checkoutClient";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("Checkout client (PR1/PR4)", () => {
  it("generateRequestId retorna string no formato UUID", () => {
    const id = generateRequestId();
    expect(typeof id).toBe("string");
    expect(id).toMatch(UUID_REGEX);
    expect(generateRequestId()).not.toBe(generateRequestId());
  });

  it("DEFAULT_CHECKOUT_TIMEOUT_MS é 20000 (P0-2 mitigação)", () => {
    expect(DEFAULT_CHECKOUT_TIMEOUT_MS).toBe(20000);
  });
});
