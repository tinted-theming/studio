import { describe, expect, it } from "vitest";
import { extractScheme } from "./extract";
import { normalizeHex } from "./color";
import { DOMINANT_PALETTE, RUST_GOLDEN, TS_GOLDEN, genParityImage } from "./extract.fixture";
import { BASE16_SLOTS, BASE24_SLOTS } from "./tables";
import type { Variant } from "./types";

const { width, height, pixels } = genParityImage();

const COMBOS: Array<{ system: "base16" | "base24"; variant: Variant }> = [
  { system: "base16", variant: "dark" },
  { system: "base16", variant: "light" },
  { system: "base24", variant: "dark" },
  { system: "base24", variant: "light" },
];

function run(system: "base16" | "base24", variant: Variant) {
  return extractScheme({
    pixels,
    width,
    height,
    dominantPalette: DOMINANT_PALETTE,
    system,
    variant,
  });
}

function channels(hex: string): [number, number, number] {
  const h = normalizeHex(hex)!;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

describe("extractScheme — completeness", () => {
  it("fills every required slot with valid hex for all systems/variants", () => {
    for (const { system, variant } of COMBOS) {
      const palette = run(system, variant);
      const slots = (system === "base16" ? BASE16_SLOTS : BASE24_SLOTS).map(([k]) => k);
      for (const key of slots) {
        expect(normalizeHex(palette[key]), `${system}/${variant} ${key}`).toBeTruthy();
      }
      expect(Object.keys(palette).length).toBe(slots.length);
    }
  });

  it("throws when the dominant palette is empty", () => {
    expect(() =>
      extractScheme({
        pixels,
        width,
        height,
        dominantPalette: [],
        system: "base16",
        variant: "dark",
      }),
    ).toThrow(/usable colors/);
  });
});

describe("extractScheme — deterministic golden (locks the pure pipeline)", () => {
  it.each(COMBOS)(
    "$system/$variant matches the frozen TS golden exactly",
    ({ system, variant }) => {
      expect(run(system, variant)).toEqual(TS_GOLDEN[system][variant]);
    },
  );
});

describe("extractScheme — Rust CLI parity (IMAGE-EXTRACTION.md §8)", () => {
  // Aggregate drift of the pure TS pipeline vs tinted-scheme-extractor 0.11.0 on
  // the same fixture image. colorthief@3's RGB quantizer is a rewrite of the
  // Rust crate's color-thief, so small per-channel drift is expected; the
  // closest-hue anchors bound it. Aim is "visually equivalent", not byte-exact.
  const TOLERANCE = 10; // max per-channel difference allowed on any slot

  it.each(COMBOS)(
    "$system/$variant stays within tolerance of the Rust golden",
    ({ system, variant }) => {
      const ts = run(system, variant);
      const rust = RUST_GOLDEN[system][variant];
      for (const key of Object.keys(rust)) {
        const a = channels(ts[key]!);
        const b = channels(rust[key]!);
        for (let i = 0; i < 3; i++) {
          expect(Math.abs(a[i]! - b[i]!), `${system}/${variant} ${key} ch${i}`).toBeLessThanOrEqual(
            TOLERANCE,
          );
        }
      }
    },
  );

  it("aggregate drift across all 80 slots is small (recorded in §8)", () => {
    let totalChannels = 0;
    let totalDiff = 0;
    let maxDiff = 0;
    let exactSlots = 0;
    let totalSlots = 0;
    for (const { system, variant } of COMBOS) {
      const ts = run(system, variant);
      const rust = RUST_GOLDEN[system][variant];
      for (const key of Object.keys(rust)) {
        totalSlots++;
        const a = channels(ts[key]!);
        const b = channels(rust[key]!);
        let slotExact = true;
        for (let i = 0; i < 3; i++) {
          const d = Math.abs(a[i]! - b[i]!);
          totalChannels++;
          totalDiff += d;
          if (d > maxDiff) maxDiff = d;
          if (d !== 0) slotExact = false;
        }
        if (slotExact) exactSlots++;
      }
    }
    const mean = totalDiff / totalChannels;
    // Recorded measurement (see IMAGE-EXTRACTION.md §8): 8/80 exact, mean ≈ 1.10,
    // max 9. Guard against regressions in the documented parity envelope.
    expect(totalSlots).toBe(80);
    expect(exactSlots).toBeGreaterThanOrEqual(8);
    expect(mean).toBeLessThan(1.5);
    expect(maxDiff).toBeLessThanOrEqual(TOLERANCE);
  });
});
