/**
 * Deterministic fixture for image-extraction parity tests.
 *
 * `genParityImage()` builds a fixed RGBA image in code (no decoding), so the
 * exact same pixels feed three consumers:
 *   1. the pure golden test (`extractScheme` over `pixels`),
 *   2. the `colorthief` quantizer (run once by scripts/parity/run.mts → DOMINANT_PALETTE),
 *   3. the Rust `tinted-scheme-extractor` CLI (the PNG of these pixels → RUST_GOLDEN).
 *
 * The baked constants below are produced by `npm run parity:extract` and pasted
 * back here; the test asserts the pure pipeline against them (see IMAGE-EXTRACTION.md §8).
 */

import type { Rgb } from "./types";

export const FIXTURE_WIDTH = 64;
export const FIXTURE_HEIGHT = 64;

/**
 * A palette of distinct blocks spanning all eight hue families plus a near-black
 * (background candidate) and near-white (foreground candidate), so both the
 * closest-hue anchors and color-thief's dominant palette are well-populated.
 */
const BLOCK_COLORS: Rgb[] = [
  { r: 24, g: 25, b: 33 }, // near-black
  { r: 233, g: 231, b: 223 }, // near-white
  { r: 209, g: 66, b: 47 }, // red
  { r: 219, g: 138, b: 58 }, // orange
  { r: 218, g: 196, b: 73 }, // yellow
  { r: 96, g: 170, b: 84 }, // green
  { r: 84, g: 194, b: 187 }, // cyan
  { r: 84, g: 138, b: 202 }, // blue
  { r: 151, g: 99, b: 186 }, // purple
  { r: 141, g: 81, b: 52 }, // brown
  { r: 196, g: 78, b: 160 }, // magenta
  { r: 60, g: 64, b: 78 }, // slate
  { r: 178, g: 180, b: 173 }, // light gray
  { r: 40, g: 44, b: 40 }, // dark olive
];

/**
 * Build the fixture image as an 8×8 grid of 8px blocks; each block's color is a
 * deterministic function of its grid position. Returns a row-major RGBA buffer.
 */
export function genParityImage(): {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
} {
  const w = FIXTURE_WIDTH;
  const h = FIXTURE_HEIGHT;
  const block = 8;
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const by = Math.floor(y / block);
    for (let x = 0; x < w; x++) {
      const bx = Math.floor(x / block);
      // Deterministic, well-mixed index across the 14 block colors.
      const idx = (bx * 5 + by * 3 + bx * by) % BLOCK_COLORS.length;
      const c = BLOCK_COLORS[idx]!;
      const o = (y * w + x) * 4;
      pixels[o] = c.r;
      pixels[o + 1] = c.g;
      pixels[o + 2] = c.b;
      pixels[o + 3] = 255;
    }
  }
  return { width: w, height: h, pixels };
}

/**
 * Dominant palette (0..255) produced by colorthief@3.3.1 on the fixture image
 * with `{ colorCount: 15, quality: 1, colorSpace: "rgb" }`.
 * Baked by scripts/parity/run.mts — DO NOT hand-edit.
 */
export const DOMINANT_PALETTE: Rgb[] = [
  { r: 24, g: 25, b: 33 },
  { r: 96, g: 170, b: 84 },
  { r: 196, g: 78, b: 160 },
  { r: 233, g: 231, b: 223 },
  { r: 84, g: 194, b: 187 },
  { r: 60, g: 64, b: 78 },
  { r: 209, g: 66, b: 47 },
  { r: 84, g: 138, b: 202 },
  { r: 219, g: 138, b: 58 },
  { r: 141, g: 81, b: 52 },
  { r: 40, g: 44, b: 40 },
  { r: 178, g: 180, b: 173 },
  { r: 218, g: 196, b: 73 },
];

/**
 * Ground-truth Base16/Base24 palettes from the Rust `tinted-scheme-extractor`
 * 0.11.0 on the PNG of the fixture image. Baked by the parity harness.
 */
export const RUST_GOLDEN: Record<
  "base16" | "base24",
  Record<"dark" | "light", Record<string, string>>
> = {
  base16: {
    dark: {
      base00: "#22272d",
      base01: "#3e4246",
      base02: "#5a5d60",
      base03: "#767879",
      base04: "#939393",
      base05: "#afaeac",
      base06: "#cbc9c6",
      base07: "#e8e4e0",
      base08: "#ac3d44",
      base09: "#dc933d",
      base0A: "#dac449",
      base0B: "#3bb15f",
      base0C: "#2dbdd0",
      base0D: "#243ab6",
      base0E: "#ac3d44",
      base0F: "#9d5e3a",
    },
    light: {
      base00: "#e8e4e0",
      base01: "#cbc8c5",
      base02: "#aeacaa",
      base03: "#919090",
      base04: "#737475",
      base05: "#57585b",
      base06: "#3a3c40",
      base07: "#1d2126",
      base08: "#ac3d44",
      base09: "#dc933d",
      base0A: "#dac449",
      base0B: "#3bb15f",
      base0C: "#2dbdd0",
      base0D: "#243ab6",
      base0E: "#ac3d44",
      base0F: "#9d5e3a",
    },
  },
  base24: {
    dark: {
      base00: "#22272d",
      base01: "#3e4246",
      base02: "#5a5d60",
      base03: "#767879",
      base04: "#939393",
      base05: "#afaeac",
      base06: "#cbc9c6",
      base07: "#e8e4e0",
      base08: "#ac3d44",
      base09: "#dc933d",
      base0A: "#dac449",
      base0B: "#3bb15f",
      base0C: "#2dbdd0",
      base0D: "#243ab6",
      base0E: "#ac3d44",
      base0F: "#9d5e3a",
      base10: "#8f595c",
      base11: "#b38f65",
      base12: "#b5aa6d",
      base13: "#59926a",
      base14: "#569da6",
      base15: "#495490",
      base16: "#8f595c",
      base17: "#836453",
    },
    light: {
      base00: "#e8e4e0",
      base01: "#cbc8c5",
      base02: "#aeacaa",
      base03: "#919090",
      base04: "#737475",
      base05: "#57585b",
      base06: "#3a3c40",
      base07: "#1d2126",
      base08: "#ac3d44",
      base09: "#dc933d",
      base0A: "#dac449",
      base0B: "#3bb15f",
      base0C: "#2dbdd0",
      base0D: "#243ab6",
      base0E: "#ac3d44",
      base0F: "#9d5e3a",
      base10: "#8f595c",
      base11: "#b38f65",
      base12: "#b5aa6d",
      base13: "#59926a",
      base14: "#569da6",
      base15: "#495490",
      base16: "#8f595c",
      base17: "#836453",
    },
  },
};

/**
 * The pure TS pipeline's exact output for the fixture (deterministic lock).
 * Regenerate with `npm run parity:extract` if the algorithm or fixture changes.
 * Differs from RUST_GOLDEN only within the documented tolerance (§8) — the
 * colorthief@3 quantizer is a rewrite of the Rust crate's color-thief.
 */
export const TS_GOLDEN: Record<
  "base16" | "base24",
  Record<"dark" | "light", Record<string, string>>
> = {
  base16: {
    dark: {
      base00: "#242630",
      base01: "#404149",
      base02: "#5c5c62",
      base03: "#78787b",
      base04: "#949394",
      base05: "#b0afad",
      base06: "#cccac6",
      base07: "#e8e6e0",
      base08: "#ad3e45",
      base09: "#db8a3a",
      base0A: "#dac449",
      base0B: "#3bb15f",
      base0C: "#2ebdd0",
      base0D: "#253bb6",
      base0E: "#ad3e45",
      base0F: "#9e5b3a",
    },
    light: {
      base00: "#e8e6e0",
      base01: "#cbc9c5",
      base02: "#aeadab",
      base03: "#919191",
      base04: "#747577",
      base05: "#57595d",
      base06: "#3a3d43",
      base07: "#1e2129",
      base08: "#ad3e45",
      base09: "#db8a3a",
      base0A: "#dac449",
      base0B: "#3bb15f",
      base0C: "#2ebdd0",
      base0D: "#253bb6",
      base0E: "#ad3e45",
      base0F: "#9e5b3a",
    },
  },
  base24: {
    dark: {
      base00: "#242630",
      base01: "#404149",
      base02: "#5c5c62",
      base03: "#78787b",
      base04: "#949394",
      base05: "#b0afad",
      base06: "#cccac6",
      base07: "#e8e6e0",
      base08: "#ad3e45",
      base09: "#db8a3a",
      base0A: "#dac449",
      base0B: "#3bb15f",
      base0C: "#2ebdd0",
      base0D: "#253bb6",
      base0E: "#ad3e45",
      base0F: "#9e5b3a",
      base10: "#915a5e",
      base11: "#b28a63",
      base12: "#b5aa6e",
      base13: "#59936b",
      base14: "#579da7",
      base15: "#4a5591",
      base16: "#915a5e",
      base17: "#846454",
    },
    light: {
      base00: "#e8e6e0",
      base01: "#cbc9c5",
      base02: "#aeadab",
      base03: "#919191",
      base04: "#747577",
      base05: "#57595d",
      base06: "#3a3d43",
      base07: "#1e2129",
      base08: "#ad3e45",
      base09: "#db8a3a",
      base0A: "#dac449",
      base0B: "#3bb15f",
      base0C: "#2ebdd0",
      base0D: "#253bb6",
      base0E: "#ad3e45",
      base0F: "#9e5b3a",
      base10: "#915a5e",
      base11: "#b28a63",
      base12: "#b5aa6e",
      base13: "#59936b",
      base14: "#579da7",
      base15: "#4a5591",
      base16: "#915a5e",
      base17: "#846454",
    },
  },
};
