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
