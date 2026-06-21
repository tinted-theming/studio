import { describe, expect, it } from "vitest";
import {
  clamp01,
  hexToHsl,
  hexToRgb,
  hslToHex,
  hslToRgb,
  luminance,
  normalizeHex,
  rgbToHex,
  rgbToHsl,
  srgbToYxy,
  yxyToSrgb,
} from "./color";

describe("normalizeHex", () => {
  it("expands shorthand and lowercases", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("abc")).toBe("#aabbcc");
    expect(normalizeHex("  #1B1F25 ")).toBe("#1b1f25");
  });
  it("rejects invalid input", () => {
    expect(normalizeHex("#12")).toBeNull();
    expect(normalizeHex("nothex")).toBeNull();
    expect(normalizeHex(123)).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

describe("clamp01", () => {
  it("clamps to [0,1]", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
});

describe("rgb/hex round-trip", () => {
  it("hexToRgb then rgbToHex is identity", () => {
    for (const hex of ["#000000", "#ffffff", "#ab4642", "#7cafc2", "#181818"]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });
  it("defaults malformed hex to black", () => {
    expect(hexToRgb("garbage")).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe("hsl conversions", () => {
  it("grayscale has zero saturation", () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 }).s).toBe(0);
  });
  it("pure colors convert as expected", () => {
    expect(hslToRgb({ h: 0, s: 1, l: 0.5 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hslToRgb({ h: 120, s: 1, l: 0.5 })).toEqual({ r: 0, g: 255, b: 0 });
    expect(hslToRgb({ h: 240, s: 1, l: 0.5 })).toEqual({ r: 0, g: 0, b: 255 });
  });
  it("hex→hsl→hex round-trips common colors", () => {
    for (const hex of ["#ab4642", "#a1b56c", "#f7ca88", "#7cafc2", "#ba8baf"]) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex);
    }
  });
  it("s=0 path produces neutral gray regardless of hue", () => {
    expect(hslToRgb({ h: 200, s: 0, l: 0.5 })).toEqual({ r: 128, g: 128, b: 128 });
  });
});

describe("CIE luminance (Yxy) — image-extraction helpers", () => {
  it("luminance of pure primaries matches the CIE-Y coefficients", () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 10);
    // The standard coefficients sum to 1.0000001, so white is ~1 (not exactly).
    expect(luminance({ r: 1, g: 1, b: 1 })).toBeCloseTo(1, 6);
    expect(luminance({ r: 1, g: 0, b: 0 })).toBeCloseTo(0.2126729, 6);
    expect(luminance({ r: 0, g: 1, b: 0 })).toBeCloseTo(0.7151522, 6);
    expect(luminance({ r: 0, g: 0, b: 1 })).toBeCloseTo(0.072175, 6);
  });
  it("srgbToYxy.Y equals luminance", () => {
    for (const c of [
      { r: 0.1, g: 0.5, b: 0.9 },
      { r: 0.8, g: 0.2, b: 0.3 },
    ]) {
      expect(srgbToYxy(c).Y).toBeCloseTo(luminance(c), 10);
    }
  });
  it("yxyToSrgb(srgbToYxy(c)) round-trips", () => {
    for (const c of [
      { r: 0.2, g: 0.6, b: 0.4 },
      { r: 0.95, g: 0.1, b: 0.7 },
      { r: 0.05, g: 0.05, b: 0.05 },
    ]) {
      const back = yxyToSrgb(srgbToYxy(c));
      // The forward/inverse sRGB↔XYZ matrices are rounded constants, not exact
      // inverses, so the round-trip carries a ~1e-6 residual.
      expect(back.r).toBeCloseTo(c.r, 5);
      expect(back.g).toBeCloseTo(c.g, 5);
      expect(back.b).toBeCloseTo(c.b, 5);
    }
  });
  it("black maps to the D65 white point so re-luminance yields neutral gray", () => {
    const yxy = srgbToYxy({ r: 0, g: 0, b: 0 });
    expect(yxy.x).toBeCloseTo(0.3127, 4);
    expect(yxy.y).toBeCloseTo(0.329, 4);
    const gray = yxyToSrgb({ ...yxy, Y: 0.5 });
    expect(gray.r).toBeCloseTo(gray.g, 3);
    expect(gray.g).toBeCloseTo(gray.b, 3);
  });
});
