import { describe, it, expect } from "vitest";
import { validateCPF, formatCPF, formatCEP, formatPhone } from "../lib/validators";

describe("validators", () => {
  describe("validateCPF", () => {
    it("should return true for valid CPFs", () => {
      expect(validateCPF("12345678909")).toBe(true);
      expect(validateCPF("52998224725")).toBe(true);
      expect(validateCPF("123.456.789-09")).toBe(true); // Should handle masks
    });

    it("should return false for CPFs with all same digits", () => {
      expect(validateCPF("00000000000")).toBe(false);
      expect(validateCPF("11111111111")).toBe(false);
      expect(validateCPF("99999999999")).toBe(false);
    });

    it("should return false for CPFs with wrong length", () => {
      expect(validateCPF("123")).toBe(false);
      expect(validateCPF("1234567890")).toBe(false);
      expect(validateCPF("123456789012")).toBe(false);
    });

    it("should return false for CPFs with invalid check digits", () => {
      expect(validateCPF("12345678900")).toBe(false);
      expect(validateCPF("12345678908")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(validateCPF("")).toBe(false);
    });
  });

  describe("formatCPF", () => {
    it("should format CPF correctly", () => {
      expect(formatCPF("12345678909")).toBe("123.456.789-09");
    });

    it("should handle partial CPF", () => {
      expect(formatCPF("123")).toBe("123");
      expect(formatCPF("1234")).toBe("123.4");
      expect(formatCPF("123456")).toBe("123.456");
      expect(formatCPF("1234567")).toBe("123.456.7");
    });

    it("should limit to 11 characters", () => {
      expect(formatCPF("12345678909123")).toBe("123.456.789-09");
    });
  });

  describe("formatCEP", () => {
    it("should format CEP correctly", () => {
      expect(formatCEP("12345678")).toBe("12345-678");
    });

    it("should handle partial CEP", () => {
      expect(formatCEP("12345")).toBe("12345");
      expect(formatCEP("123456")).toBe("12345-6");
    });

    it("should limit to 8 characters", () => {
      expect(formatCEP("1234567890")).toBe("12345-678");
    });
  });

  describe("formatPhone", () => {
    it("should format mobile phone correctly", () => {
      expect(formatPhone("11999999999")).toBe("(11) 99999-9999");
    });

    it("should handle partial phone", () => {
      expect(formatPhone("1")).toBe("(1");
      expect(formatPhone("11")).toBe("(11");
      expect(formatPhone("119")).toBe("(11) 9");
      expect(formatPhone("1199999")).toBe("(11) 99999");
      expect(formatPhone("11999999")).toBe("(11) 99999-9");
    });

    it("should limit to 11 characters", () => {
      expect(formatPhone("1199999999999")).toBe("(11) 99999-9999");
    });

    it("should return empty string for empty input", () => {
      expect(formatPhone("")).toBe("");
    });
  });
});
