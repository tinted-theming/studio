/**
 * Color math — HSL conversions matching `tinted-builder`'s derivation.
 *
 * Ported verbatim from `reference/legacy/legacy-studio.js`. The exact rounding
 * (`round(c * 255)`) and clamp behavior are part of the byte-for-byte contract
 * with the Rust builder (SPEC §6) — do not "clean up" the arithmetic.
 */

import type { Hsl, Rgb } from "./types";

export function clamp01(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}

/**
 * Normalize a hex string to lowercase "#rrggbb", expanding 3-digit shorthand.
 * Returns null for anything that isn't a valid 3- or 6-digit hex color.
 */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) {
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (/^[0-9a-f]{6}$/.test(s)) return "#" + s;
  return null;
}

export function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex) || "#000000";
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (n: number) =>
    Math.round(clamp01(n / 255) * 255)
      .toString(16)
      .padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hue = ((h % 360) + 360) % 360;
  if (s === 0) {
    const v = Math.round(clamp01(l) * 255);
    return { r: v, g: v, b: v };
  }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0,
    gp = 0,
    bp = 0;
  if (hue < 60) {
    rp = c;
    gp = x;
  } else if (hue < 120) {
    rp = x;
    gp = c;
  } else if (hue < 180) {
    gp = c;
    bp = x;
  } else if (hue < 240) {
    gp = x;
    bp = c;
  } else if (hue < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: Math.round(clamp01(rp + m) * 255),
    g: Math.round(clamp01(gp + m) * 255),
    b: Math.round(clamp01(bp + m) * 255),
  };
}

export function hexToHsl(hex: string): Hsl {
  return rgbToHsl(hexToRgb(hex));
}

export function hslToHex(hsl: Hsl): string {
  return rgbToHex(hslToRgb(hsl));
}

/* ---------- sRGB ↔ linear ↔ XYZ ↔ Yxy (mirrors the Rust `palette` crate) ----------
 *
 * Used only by image extraction (SPEC §8 / IMAGE-EXTRACTION.md §4): the Rust
 * `tinted-scheme-extractor` measures "luma" as CIE Y (linear-light luminance),
 * NOT HSL lightness, and sets luminance in xyY while preserving chromaticity.
 * These operate on sRGB channels normalized to 0..1 (not the 0..255 used by the
 * RGB helpers above). Ported verbatim from the verified reference. */

/** A point in CIE xyY: Y is luminance (0..1), x/y are chromaticity. */
export interface Yxy {
  Y: number;
  x: number;
  y: number;
}

type Rgb01 = { r: number; g: number; b: number };

/** sRGB-encoded channel (0..1) → linear-light (0..1). */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear-light channel (0..1) → sRGB-encoded (0..1), clamped. */
export function linearToSrgb(c: number): number {
  c = clamp01(c);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * sRGB (0..1 channels) → CIE xyY. For black (X+Y+Z ≤ 0) x/y fall back to the
 * D65 white point so that re-setting a new luminance yields a neutral gray
 * rather than NaN.
 */
export function srgbToYxy(rgb: Rgb01): Yxy {
  const rl = srgbToLinear(rgb.r),
    gl = srgbToLinear(rgb.g),
    bl = srgbToLinear(rgb.b);
  const X = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
  const Y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const Z = 0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl;
  const sum = X + Y + Z;
  if (sum <= 0) return { Y: 0, x: 0.3127, y: 0.329 };
  return { Y, x: X / sum, y: Y / sum };
}

/** CIE xyY → sRGB (0..1 channels). y ≤ 0 yields black. */
export function yxyToSrgb({ Y, x, y }: Yxy): Rgb01 {
  if (y <= 0) return { r: 0, g: 0, b: 0 };
  const X = (x / y) * Y;
  const Z = ((1 - x - y) / y) * Y;
  const rl = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const gl = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const bl = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return { r: linearToSrgb(rl), g: linearToSrgb(gl), b: linearToSrgb(bl) };
}

/** CIE relative luminance (Y) of an sRGB color with channels in 0..1. */
export function luminance(rgb: Rgb01): number {
  return (
    0.2126729 * srgbToLinear(rgb.r) +
    0.7151522 * srgbToLinear(rgb.g) +
    0.072175 * srgbToLinear(rgb.b)
  );
}
