import { describe, expect, it } from "vitest";
import {
  clamp01,
  hexToHsl,
  hexToRgb,
  hslToHex,
  hslToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsl,
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
