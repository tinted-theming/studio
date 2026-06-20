/**
 * Tinted8 derivation engine — the crown jewel (SPEC §6).
 *
 * Ported from `reference/legacy/legacy-studio.js`. The legacy code read a global
 * `state`; here the functions are PURE — they take the 8 base normals, the
 * override maps, and the variant as explicit arguments. The math is unchanged
 * and byte-verified against `tinted-builder` (golden tests in derive.test.ts).
 */

import { clamp01, hexToHsl, hslToHex, normalizeHex } from "./color";
import { ALL11, BASE8, SYNTAX_DEFAULTS, SYNTAX_KEYS, UI_DEFAULTS, UI_KEYS } from "./tables";
import type { DeriveVariant, Hsl, Tinted8Overrides, Variant } from "./types";

const DL = 0.12;

/** Derive a dim/bright variant of a normal color (hue fixed, ΔL = 0.12). */
export function deriveVariant(hsl: Hsl, variant: DeriveVariant): Hsl {
  let k: number, deltaL: number, l: number;
  if (variant === "dim") {
    k = hsl.l < 0.4 ? 1.04 : hsl.l < 0.7 ? 1.07 : 1.1;
    deltaL = Math.min(DL, hsl.l);
    l = clamp01(hsl.l - deltaL);
  } else {
    k = hsl.l < 0.5 ? 1.08 : hsl.l < 0.8 ? 1.0 : 0.9;
    deltaL = Math.min(DL, 1 - hsl.l);
    l = clamp01(hsl.l + deltaL);
  }
  return { h: hsl.h, s: clamp01(hsl.s * k), l };
}

/** orange = yellow rotated −10° (S, L unchanged). */
export function deriveOrange(yellowHsl: Hsl): Hsl {
  return { h: (((yellowHsl.h - 10) % 360) + 360) % 360, s: yellowHsl.s, l: yellowHsl.l };
}

/** brown = yellow rotated −15°, S·0.65, L−0.30. */
export function deriveBrown(yellowHsl: Hsl): Hsl {
  return {
    h: (((yellowHsl.h - 15) % 360) + 360) % 360,
    s: clamp01(yellowHsl.s * 0.65),
    l: clamp01(yellowHsl.l - 0.3),
  };
}

/** gray = desaturated, lightness midway between black and white. */
export function deriveGray(blackHsl: Hsl, whiteHsl: Hsl): Hsl {
  const d = ((blackHsl.h - whiteHsl.h + 540) % 360) - 180;
  return {
    h: (((whiteHsl.h + 0.5 * d) % 360) + 360) % 360,
    s: 0,
    l: 0.5 * (blackHsl.l + whiteHsl.l),
  };
}

export function isLightVariant(variant: unknown): boolean {
  return (
    String(variant || "")
      .trim()
      .toLowerCase() === "light"
  );
}

/**
 * For a "light" variant, swap white<->black in a "<color>-<variant>" slot name;
 * otherwise return it unchanged (SPEC §6).
 */
export function swapForLight(colorVariant: string, variant: Variant): string {
  if (!isLightVariant(variant)) return colorVariant;
  const dash = colorVariant.indexOf("-");
  const color = colorVariant.slice(0, dash);
  const v = colorVariant.slice(dash + 1);
  if (color === "white") return `black-${v}`;
  if (color === "black") return `white-${v}`;
  return colorVariant;
}

/**
 * Resolve the 11 normal colors: the 8 stored base normals plus the supplemental
 * orange/brown/gray (derived from yellow / black+white, or taken from an
 * override when present).
 */
export function t8Normals(
  palette: Record<string, string>,
  overridesPalette: Record<string, string>,
): Record<string, string> {
  const normals: Record<string, string> = {};
  BASE8.forEach((c) => {
    normals[c] = normalizeHex(palette[c]) || "#000000";
  });
  const yellowHsl = hexToHsl(normals.yellow!);
  normals.orange = overridesPalette.orange || hslToHex(deriveOrange(yellowHsl));
  normals.brown = overridesPalette.brown || hslToHex(deriveBrown(yellowHsl));
  normals.gray =
    overridesPalette.gray ||
    hslToHex(deriveGray(hexToHsl(normals.black!), hexToHsl(normals.white!)));
  return normals;
}

/** Full 33-entry palette keyed "<color>-<variant>". */
export function effectivePaletteFull(
  palette: Record<string, string>,
  overridesPalette: Record<string, string>,
): Record<string, string> {
  const normals = t8Normals(palette, overridesPalette);
  const out: Record<string, string> = {};
  ALL11.forEach((c) => {
    const n = normals[c]!;
    out[`${c}-normal`] = n;
    const nhsl = hexToHsl(n);
    out[`${c}-dim`] = overridesPalette[`${c}-dim`] || hslToHex(deriveVariant(nhsl, "dim"));
    out[`${c}-bright`] = overridesPalette[`${c}-bright`] || hslToHex(deriveVariant(nhsl, "bright"));
  });
  return out;
}

/** Resolve the 45 UI tokens for a variant against the full palette. */
export function effectiveUi(
  paletteFull: Record<string, string>,
  overridesUi: Record<string, string>,
  variant: Variant,
): Record<string, string> {
  const light = isLightVariant(variant);
  const out: Record<string, string> = {};
  UI_KEYS.forEach((key) => {
    const def = UI_DEFAULTS[key]!;
    out[key] = overridesUi[key] || paletteFull[light ? def.light : def.dark]!;
  });
  return out;
}

/** Resolve the 105 syntax tokens for a variant against the full palette. */
export function effectiveSyntax(
  paletteFull: Record<string, string>,
  overridesSyntax: Record<string, string>,
  variant: Variant,
): Record<string, string> {
  const out: Record<string, string> = {};
  SYNTAX_KEYS.forEach((key) => {
    out[key] = overridesSyntax[key] || paletteFull[swapForLight(SYNTAX_DEFAULTS[key]!, variant)]!;
  });
  return out;
}

/** Convenience: resolve all three Tinted8 token trees at once. */
export function computeEffectiveTinted8(
  palette: Record<string, string>,
  overrides: Tinted8Overrides,
  variant: Variant,
): { palette: Record<string, string>; ui: Record<string, string>; syntax: Record<string, string> } {
  const paletteFull = effectivePaletteFull(palette, overrides.palette);
  return {
    palette: paletteFull,
    ui: effectiveUi(paletteFull, overrides.ui, variant),
    syntax: effectiveSyntax(paletteFull, overrides.syntax, variant),
  };
}
