/**
 * Image → scheme extraction (SPEC §8 / IMAGE-EXTRACTION.md).
 *
 * A pure port of the Rust `tinted-scheme-extractor`, via the verified vanilla-JS
 * reference (tinty `feat/studio-image-extract`). Given the raw pixels of a
 * decoded image PLUS an injected dominant palette (the median-cut quantization,
 * produced by `colorthief` in the impure `src/ui` adapter), it maps the image's
 * colors onto a Base16/Base24 palette.
 *
 * This module is PURE: it imports nothing from React, Zustand, the DOM, or
 * `colorthief`. The quantizer's output is injected as plain data so the pipeline
 * stays deterministic and golden-testable (extract.test.ts).
 *
 * Units: pixel/scheme colors are 0..255 (`SchemeColor`); the fg/bg selection and
 * `fixColors` work in 0..1 sRGB (matching the Rust crate's `palette` math), and
 * only the base00..07 gradient converts back to 0..255.
 */

import { clamp01, hslToRgb, rgbToHsl, srgbToYxy, yxyToSrgb } from "./color";
import type { BasePalette, Rgb, Variant } from "./types";

/* ---------- Pure target hues ---------- */

const TARGET_NAMES = [
  "red",
  "yellow",
  "orange",
  "green",
  "cyan",
  "blue",
  "purple",
  "brown",
  "magenta",
  "azure",
  "spring_green",
  "light_cyan",
] as const;

type TargetName = (typeof TARGET_NAMES)[number];

const PURE_RGB: Record<TargetName, Rgb> = {
  red: { r: 255, g: 0, b: 0 },
  yellow: { r: 255, g: 255, b: 0 },
  orange: { r: 255, g: 165, b: 0 },
  green: { r: 0, g: 255, b: 0 },
  cyan: { r: 0, g: 255, b: 255 },
  blue: { r: 0, g: 0, b: 255 },
  purple: { r: 128, g: 0, b: 128 },
  brown: { r: 165, g: 42, b: 42 },
  magenta: { r: 255, g: 0, b: 255 },
  azure: { r: 0, g: 90, b: 255 },
  spring_green: { r: 127, g: 255, b: 127 },
  light_cyan: { r: 90, g: 213, b: 213 },
};

const INVERSE_NAME: Record<TargetName, TargetName> = {
  red: "cyan",
  yellow: "blue",
  orange: "azure",
  green: "magenta",
  cyan: "red",
  blue: "yellow",
  purple: "spring_green",
  magenta: "green",
  brown: "light_cyan",
  azure: "orange",
  spring_green: "purple",
  light_cyan: "brown",
};

const BASE_SLOT: Partial<Record<TargetName, string>> = {
  red: "base08",
  orange: "base09",
  yellow: "base0A",
  green: "base0B",
  cyan: "base0C",
  blue: "base0D",
  purple: "base0E",
  brown: "base0F",
};

const BASE24_SLOT: Partial<Record<TargetName, string>> = {
  red: "base10",
  orange: "base11",
  yellow: "base12",
  green: "base13",
  cyan: "base14",
  blue: "base15",
  purple: "base16",
  brown: "base17",
};

const MAX_COLOR_DISTANCE = 100;

/* ---------- Scheme color ---------- */

/** An RGB value (0..255) tagged with the pure hue it stands in for. */
interface SchemeColor {
  name: TargetName;
  r: number;
  g: number;
  b: number;
  /** Euclidean RGB distance from the hue's canonical PURE_RGB value. */
  distance: number;
}

function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r,
    dg = a.g - b.g,
    db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function mkColor(name: TargetName, rgb: Rgb): SchemeColor {
  return { name, r: rgb.r, g: rgb.g, b: rgb.b, distance: colorDistance(PURE_RGB[name], rgb) };
}

function inverseColor(c: SchemeColor): SchemeColor {
  return mkColor(INVERSE_NAME[c.name], { r: 255 - c.r, g: 255 - c.g, b: 255 - c.b });
}

function colorToHex(c: { r: number; g: number; b: number }): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return "#" + h(c.r) + h(c.g) + h(c.b);
}

/** Raise lightness by `value` (HSL), preserving hue/saturation and the tag. */
function addLightness(c: SchemeColor, value: number): SchemeColor {
  const hsl = rgbToHsl(c);
  const out = hslToRgb({ h: hsl.h, s: hsl.s, l: clamp01(hsl.l + clamp01(value)) });
  return { name: c.name, r: out.r, g: out.g, b: out.b, distance: c.distance };
}

/** Scale saturation by `pct²` (HSL), for the Base24 bright copies. */
function toSaturated(c: SchemeColor, pct: number): SchemeColor {
  pct = clamp01(pct);
  const hsl = rgbToHsl(c);
  const out = hslToRgb({ h: hsl.h, s: clamp01(hsl.s * pct * pct), l: hsl.l });
  return { name: c.name, r: out.r, g: out.g, b: out.b, distance: c.distance };
}

/** How much lightness to add so a color clears a visibility threshold. */
function lightnessWeightDiff(c: SchemeColor, threshold: number): number {
  const hsl = rgbToHsl(c);
  const visibility = 0.5 * hsl.s + 1.0 * hsl.l;
  return clamp01(threshold - visibility) / 2;
}

/* ---------- Stage 1: closest pixel per pure hue ---------- */

/**
 * For each of the 12 pure hues, the single closest pixel in the whole image
 * (Euclidean RGB). Compares squared distance for speed but stores the real
 * `sqrt` distance, because later steps test the literal `>100`/`<100`
 * thresholds on it.
 */
export function findClosestPalette(pixels: Uint8ClampedArray): SchemeColor[] {
  const n = TARGET_NAMES.length;
  const bestSq = new Array<number>(n).fill(Infinity);
  const best = TARGET_NAMES.map((name) => ({ name, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!,
      g = pixels[i + 1]!,
      b = pixels[i + 2]!;
    for (let k = 0; k < n; k++) {
      const t = PURE_RGB[TARGET_NAMES[k]!];
      const dr = t.r - r,
        dg = t.g - g,
        db = t.b - b;
      const sq = dr * dr + dg * dg + db * db;
      if (sq < bestSq[k]!) {
        bestSq[k] = sq;
        const bk = best[k]!;
        bk.r = r;
        bk.g = g;
        bk.b = b;
      }
    }
  }
  return best.map((c) => mkColor(c.name, c));
}

/** Pair each hue with the inverse of its complement; keep the better anchor. */
export function createPaletteWithInverse(
  palette: SchemeColor[],
  inverse: SchemeColor[],
): SchemeColor[] {
  return palette.map((color) => {
    const inv = inverse.find((c) => c.name === color.name);
    if (inv && color.distance > MAX_COLOR_DISTANCE && color.distance < inv.distance) return color;
    return inv || color;
  });
}

/**
 * Assign each dominant (color-thief) color to its nearest pure hue within 100,
 * keep the best per hue, then append curated fallbacks for any unfilled hue —
 * guaranteeing all eight Base slot families fill.
 */
export function createPaletteWithColorThief(
  palette: SchemeColor[],
  colorThief: Rgb[],
): SchemeColor[] {
  const byName = new Map<TargetName, SchemeColor>();
  for (const ct of colorThief) {
    let bestMatch: SchemeColor | null = null;
    for (const color of palette) {
      const attempt = mkColor(color.name, ct);
      if (
        attempt.distance < MAX_COLOR_DISTANCE &&
        (!bestMatch || attempt.distance < bestMatch.distance)
      ) {
        bestMatch = attempt;
      }
    }
    if (!bestMatch) continue;
    const existing = byName.get(bestMatch.name);
    if (!existing || bestMatch.distance < existing.distance) byName.set(bestMatch.name, bestMatch);
  }
  const combined = Array.from(byName.values());
  for (const color of palette) {
    if (!combined.some((c) => c.name === color.name)) combined.push(color);
  }
  return combined;
}

/* ---------- Stage 2: pick foreground / background ---------- */

type Rgb01 = { r: number; g: number; b: number };

/** Saturation (HSL, 0..1) and luminance (CIE Y, 0..1) of a 0..1 color. */
function satLuma01(rgb: Rgb01): { s: number; luma: number } {
  return {
    s: rgbToHsl({ r: rgb.r * 255, g: rgb.g * 255, b: rgb.b * 255 }).s,
    luma: srgbToYxy(rgb).Y,
  };
}

function setSat01(rgb: Rgb01, newS: number): Rgb01 {
  const hsl = rgbToHsl({ r: rgb.r * 255, g: rgb.g * 255, b: rgb.b * 255 });
  const out = hslToRgb({ h: hsl.h, s: newS, l: hsl.l });
  return { r: out.r / 255, g: out.g / 255, b: out.b / 255 };
}

/** First color passing the luma/saturation window, else null. */
function colorPass(
  colors: Rgb01[],
  minLuma: number | null,
  maxLuma: number | null,
  minSat: number | null,
  maxSat: number | null,
): Rgb01 | null {
  return (
    colors.find((c) => {
      const { s, luma } = satLuma01(c);
      const lumaOk = (minLuma == null || luma >= minLuma) && (maxLuma == null || luma <= maxLuma);
      const satOk = (minSat == null || s >= minSat) && (maxSat == null || s <= maxSat);
      return lumaOk && satOk;
    }) || null
  );
}

function lightColor(colors: Rgb01[]): Rgb01 | null {
  return (
    colorPass(colors, 0.6, null, null, 0.4) ||
    colorPass(colors, 0.7, null, null, 0.85) ||
    colorPass(colors, 0.5, null, null, 0.5) ||
    colorPass(colors, 0.6, null, null, 0.85) ||
    colorPass(colors, 0.32, null, null, 0.4) ||
    colorPass(colors, 0.4, null, null, null) ||
    colorPass(colors, 0.3, null, null, null) ||
    colors[0] ||
    null
  );
}

function darkColor(colors: Rgb01[]): Rgb01 | null {
  return (
    colorPass(colors, 0.012, 0.1, 0.18, 0.9) ||
    colorPass(colors, 0.012, 0.1, null, null) ||
    colorPass(colors, null, 0.1, null, null) ||
    colors[0] ||
    null
  );
}

/**
 * Nudge the chosen fg/bg pair toward usable luminance/saturation. Mirrors the
 * Rust `fix_colors`: luminance is set in xyY (preserving chromaticity),
 * saturation in HSL. Works in 0..1.
 */
export function fixColors(dark: Rgb01, light: Rgb01, variant: Variant): { bg: Rgb01; fg: Rgb01 } {
  const setLuma = (rgb: Rgb01, Y: number): Rgb01 => yxyToSrgb({ ...srgbToYxy(rgb), Y });
  if (variant === "light") {
    let fg = dark,
      bg = light;
    let { s, luma } = satLuma01(fg);
    if (luma > 0.015) fg = setLuma(fg, 0.015);
    if (s > 0.65) fg = setSat01(fg, 0.65);
    ({ s, luma } = satLuma01(bg));
    if (luma < 0.75) bg = setLuma(bg, 0.75);
    if (s > 0.12) bg = setSat01(bg, 0.15);
    return { bg, fg };
  }
  // dark
  let fg = light,
    bg = dark;
  let { s, luma } = satLuma01(fg);
  if (luma < 0.6) fg = setLuma(fg, 0.6);
  if (s > 0.15) fg = setSat01(fg, 0.15);
  ({ s, luma } = satLuma01(bg));
  if (luma > 0.02) bg = setLuma(bg, 0.02);
  if (s > 0.6) bg = setSat01(bg, 0.6);
  return { bg, fg };
}

function to255(rgb: Rgb01): Rgb {
  return {
    r: Math.round(clamp01(rgb.r) * 255),
    g: Math.round(clamp01(rgb.g) * 255),
    b: Math.round(clamp01(rgb.b) * 255),
  };
}

/** Linear u8 interpolation between two endpoints (truncating, like Rust `as u8`). */
export function generateGradient(a: Rgb, b: Rgb, steps: number): Rgb[] {
  const out: Rgb[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    out.push({
      r: Math.trunc(a.r + t * (b.r - a.r)),
      g: Math.trunc(a.g + t * (b.g - a.g)),
      b: Math.trunc(a.b + t * (b.b - a.b)),
    });
  }
  return out;
}

/* ---------- The pipeline ---------- */

export interface ExtractInput {
  /** RGBA, row-major (an ImageData.data buffer). */
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** Dominant palette from color-thief (0..255) — the injected quantization. */
  dominantPalette: Rgb[];
  system: "base16" | "base24";
  variant: Variant;
}

/**
 * Derive a Base16/Base24 palette from a decoded image and its dominant palette.
 * Throws if the image yields no usable colors.
 */
export function extractScheme(input: ExtractInput): BasePalette {
  const { pixels, dominantPalette, system, variant } = input;

  const initial = findClosestPalette(pixels);
  const inverse = initial.map(inverseColor);
  const curated = createPaletteWithInverse(initial, inverse);

  if (!dominantPalette.length) throw new Error("Couldn't find usable colors in this image.");
  const combined = createPaletteWithColorThief(curated, dominantPalette);
  const ct01: Rgb01[] = dominantPalette.map((c) => ({ r: c.r / 255, g: c.g / 255, b: c.b / 255 }));

  const light = lightColor(ct01);
  const dark = darkColor(ct01);
  if (!light || !dark) throw new Error("Couldn't find usable colors in this image.");
  const { bg, fg } = fixColors(dark, light, variant);

  const palette: BasePalette = {};
  generateGradient(to255(bg), to255(fg), 8).forEach((rgb, idx) => {
    palette["base0" + idx] = colorToHex(rgb);
  });

  for (const color of combined) {
    const lit = addLightness(color, lightnessWeightDiff(color, 0.7));
    const slot = BASE_SLOT[lit.name];
    if (slot && !palette[slot]) palette[slot] = colorToHex(lit);
    if (system === "base24") {
      const sat = toSaturated(lit, 0.7);
      const slot24 = BASE24_SLOT[sat.name];
      if (slot24 && !palette[slot24]) palette[slot24] = colorToHex(sat);
    }
  }
  return palette;
}
