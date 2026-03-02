import { describe, it, expect } from "vitest";
import { hslToHex } from "../lib/colorUtils";

describe("hslToHex", () => {
  it("converts basic colors correctly", () => {
    // Red
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
    // Green
    expect(hslToHex(120, 100, 50)).toBe("#00ff00");
    // Blue
    expect(hslToHex(240, 100, 50)).toBe("#0000ff");
  });

  it("handles black and white correctly", () => {
    // Black
    expect(hslToHex(0, 0, 0)).toBe("#000000");
    expect(hslToHex(120, 50, 0)).toBe("#000000");

    // White
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
    expect(hslToHex(240, 80, 100)).toBe("#ffffff");
  });

  it("handles gray tones correctly", () => {
    // Gray tones are when saturation is 0
    expect(hslToHex(0, 0, 50)).toBe("#808080");
    expect(hslToHex(180, 0, 25)).toBe("#404040");
    expect(hslToHex(300, 0, 75)).toBe("#bfbfbf");
  });

  it("handles out of bounds hue values", () => {
    // Negative hue should wrap around
    expect(hslToHex(-120, 100, 50)).toBe(hslToHex(240, 100, 50));
    // > 360 hue should wrap around
    expect(hslToHex(480, 100, 50)).toBe(hslToHex(120, 100, 50));
  });

  it("clamps saturation between 0 and 100", () => {
    // Negative saturation becomes 0 (gray)
    expect(hslToHex(0, -50, 50)).toBe(hslToHex(0, 0, 50));
    // > 100 saturation becomes 100
    expect(hslToHex(0, 150, 50)).toBe(hslToHex(0, 100, 50));
  });

  it("clamps lightness between 0 and 100", () => {
    // Negative lightness becomes 0 (black)
    expect(hslToHex(0, 100, -50)).toBe(hslToHex(0, 100, 0));
    // > 100 lightness becomes 100 (white)
    expect(hslToHex(0, 100, 150)).toBe(hslToHex(0, 100, 100));
  });

  it("handles intermediate colors correctly", () => {
    // Yellow
    expect(hslToHex(60, 100, 50)).toBe("#ffff00");
    // Cyan
    expect(hslToHex(180, 100, 50)).toBe("#00ffff");
    // Magenta
    expect(hslToHex(300, 100, 50)).toBe("#ff00ff");
    // Orange
    expect(hslToHex(30, 100, 50)).toBe("#ff8000");
    // Pinkish
    expect(hslToHex(330, 100, 50)).toBe("#ff0080");
  });
});
