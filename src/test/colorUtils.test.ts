import { describe, it, expect } from "vitest";
import { hexToHsl } from "../lib/colorUtils";

describe("hexToHsl", () => {
  it("should convert 6-digit hex values correctly", () => {
    // Red
    expect(hexToHsl("#ff0000")).toEqual({ h: 0, s: 100, l: 50 });
    // Green
    expect(hexToHsl("#00ff00")).toEqual({ h: 120, s: 100, l: 50 });
    // Blue
    expect(hexToHsl("#0000ff")).toEqual({ h: 240, s: 100, l: 50 });
  });

  it("should convert 3-digit hex values correctly", () => {
    // Red
    expect(hexToHsl("#f00")).toEqual({ h: 0, s: 100, l: 50 });
    // Green
    expect(hexToHsl("#0f0")).toEqual({ h: 120, s: 100, l: 50 });
    // Blue
    expect(hexToHsl("#00f")).toEqual({ h: 240, s: 100, l: 50 });
  });

  it("should work without the # prefix", () => {
    expect(hexToHsl("ff0000")).toEqual({ h: 0, s: 100, l: 50 });
    expect(hexToHsl("0f0")).toEqual({ h: 120, s: 100, l: 50 });
  });

  it("should correctly calculate grayscale values", () => {
    // Black
    expect(hexToHsl("#000000")).toEqual({ h: 0, s: 0, l: 0 });
    // White
    expect(hexToHsl("#ffffff")).toEqual({ h: 0, s: 0, l: 100 });
    // Middle gray
    // Note: #808080 mathematically maps to ~50.2% lightness with standard rounding. Let's do #7f7f7f which is exactly ~49.8
    // The exact match isn't super crucial, we just want to verify s is 0.
    const gray = hexToHsl("#808080");
    expect(gray.h).toBe(0);
    expect(gray.s).toBe(0);
    expect(gray.l).toBeCloseTo(50.196, 2);
  });

  it("should handle complex colors correctly", () => {
    // Yellow
    expect(hexToHsl("#ffff00")).toEqual({ h: 60, s: 100, l: 50 });
    // Cyan
    expect(hexToHsl("#00ffff")).toEqual({ h: 180, s: 100, l: 50 });
    // Magenta
    expect(hexToHsl("#ff00ff")).toEqual({ h: 300, s: 100, l: 50 });

    // A random specific color: #3498db (roughly h: 204, s: 69.8, l: 53.1)
    const bluey = hexToHsl("#3498db");
    expect(bluey.h).toBeCloseTo(204, 0);
    expect(bluey.s).toBeCloseTo(69.9, 1);
    expect(bluey.l).toBeCloseTo(53.1, 1);
  });

  it("should handle invalid lengths by returning a default value", () => {
    const defaultHsl = { h: 0, s: 0, l: 50 };
    expect(hexToHsl("")).toEqual(defaultHsl);
    expect(hexToHsl("#")).toEqual(defaultHsl);
    expect(hexToHsl("#ff")).toEqual(defaultHsl);
    expect(hexToHsl("#ffff")).toEqual(defaultHsl);
    expect(hexToHsl("#ff00ff00")).toEqual(defaultHsl);
  });

  it("should handle completely malformed non-hex string safely", () => {
    // JS parseInt("xx", 16) returns NaN.
    // The max/min/etc will propagate NaN.
    const result = hexToHsl("#xxxxxx");
    expect(Number.isNaN(result.h)).toBe(true);
    expect(Number.isNaN(result.s)).toBe(true);
    expect(Number.isNaN(result.l)).toBe(true);
  });
});
