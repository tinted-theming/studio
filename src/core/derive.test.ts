import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computeEffectiveTinted8,
  deriveBrown,
  deriveGray,
  deriveOrange,
  deriveVariant,
} from "./derive";
import { hexToHsl, hslToHex } from "./color";
import { extractTinted8BaseNormals, normalizeVariant, reconstructTinted8 } from "./schemes";
import type { SchemeEntry } from "./types";

const LIBRARY: SchemeEntry[] = JSON.parse(readFileSync("data/schemes.json", "utf8"));
const TINTED8 = LIBRARY.filter((s) => String(s.system).toLowerCase() === "tinted8");

// SPEC §10: orange-dim disagrees with the builder by design (builder bug); skip
// it everywhere we compare against snapshot data.
const SKIP = new Set(["orange-dim"]);

describe("derive math (direct, against HSL)", () => {
  it("deriveVariant dim/bright follow the documented k/ΔL rules", () => {
    // L=0.5, S=1, H=200: dim → L 0.38, S clamp(1*1.07); bright → L 0.62, S 1*1.0
    const hsl = { h: 200, s: 1, l: 0.5 };
    const dim = deriveVariant(hsl, "dim");
    expect(dim.l).toBeCloseTo(0.38, 10);
    expect(dim.s).toBeCloseTo(1, 10); // clamp(1.07) === 1
    const bright = deriveVariant(hsl, "bright");
    expect(bright.l).toBeCloseTo(0.62, 10);
    expect(bright.s).toBeCloseTo(1, 10);
  });
  it("deriveVariant clamps ΔL near the extremes", () => {
    expect(deriveVariant({ h: 0, s: 0.5, l: 0.05 }, "dim").l).toBe(0); // min(0.12,0.05)
    expect(deriveVariant({ h: 0, s: 0.5, l: 0.95 }, "bright").l).toBeCloseTo(1, 10);
  });
  it("orange/brown rotate yellow's hue", () => {
    const y = { h: 50, s: 0.8, l: 0.6 };
    expect(deriveOrange(y)).toEqual({ h: 40, s: 0.8, l: 0.6 });
    expect(deriveBrown(y).h).toBe(35);
    expect(deriveBrown(y).s).toBeCloseTo(0.52, 10);
    expect(deriveBrown(y).l).toBeCloseTo(0.3, 10);
  });
  it("orange/brown hue wraps below zero", () => {
    expect(deriveOrange({ h: 5, s: 1, l: 0.5 }).h).toBe(355);
  });
  it("gray is desaturated, lightness midway between black and white", () => {
    const g = deriveGray({ h: 0, s: 0, l: 0.1 }, { h: 0, s: 0, l: 0.9 });
    expect(g.s).toBe(0);
    expect(g.l).toBeCloseTo(0.5, 10);
  });
});

describe("snapshot fixtures present", () => {
  it("has both dark and light Tinted8 entries", () => {
    expect(TINTED8.length).toBeGreaterThanOrEqual(2);
    const variants = new Set(TINTED8.map((e) => normalizeVariant(e.variant)));
    expect(variants.has("dark")).toBe(true);
    expect(variants.has("light")).toBe(true);
  });
});

/**
 * The math lock: pure derivation from the 8 base normals (NO overrides) must
 * reproduce the builder's expanded snapshot for every non-overridden slot.
 * We verify the round-trip (reconstruct → recompute === snapshot) AND record how
 * many slots needed an override, so a regression in the math surfaces as either
 * a round-trip failure or a spike in the override count.
 */
describe.each(TINTED8.map((e) => [e.id, e] as const))("golden: %s", (_id, entry) => {
  const palette = extractTinted8BaseNormals(entry);
  const variant = normalizeVariant(entry.variant);
  const overrides = reconstructTinted8(palette, variant, entry);
  const eff = computeEffectiveTinted8(palette, overrides, variant);

  it("has all 8 base normals", () => {
    expect(Object.keys(palette).length).toBe(8);
  });

  it("effective palette matches snapshot (excl orange-dim)", () => {
    for (const [key, val] of Object.entries(entry.palette)) {
      if (SKIP.has(key)) continue;
      expect(`${key}=${eff.palette[key]?.toLowerCase()}`).toBe(
        `${key}=${val.hex_str.toLowerCase()}`,
      );
    }
  });

  it("effective ui matches snapshot", () => {
    for (const [key, val] of Object.entries(entry.ui ?? {})) {
      expect(`${key}=${eff.ui[key]?.toLowerCase()}`).toBe(`${key}=${val.hex_str.toLowerCase()}`);
    }
  });

  it("effective syntax matches snapshot", () => {
    for (const [key, val] of Object.entries(entry.syntax ?? {})) {
      expect(`${key}=${eff.syntax[key]?.toLowerCase()}`).toBe(
        `${key}=${val.hex_str.toLowerCase()}`,
      );
    }
  });

  it("derivation does the heavy lifting — overrides stay below half of every tree", () => {
    // A non-circular sanity check: reconstruct never has to override more than
    // half of any token tree to reproduce the snapshot, i.e. the derivation
    // math genuinely carries the majority of the result (rather than the
    // overrides papering over a broken table). Author-tuned schemes like
    // gruvbox sit highest but still well under half.
    expect(Object.keys(overrides.palette).length).toBeLessThan(33 / 2);
    expect(Object.keys(overrides.ui).length).toBeLessThan(45 / 2);
    expect(Object.keys(overrides.syntax).length).toBeLessThan(105 / 2);
  });
});

// A scheme that needs ZERO UI overrides proves the entire 45-key UI_DEFAULTS
// table + variant mapping + palette-override cascade reproduce the builder's UI
// tokens by derivation alone — independent of reconstruct's diff. Catppuccin
// (both variants) is such a scheme in the current snapshot.
describe("UI table derives cleanly (no overrides) for at least one scheme", () => {
  it("some Tinted8 snapshot needs no UI overrides", () => {
    const zeroUi = TINTED8.filter((entry) => {
      const palette = extractTinted8BaseNormals(entry);
      const variant = normalizeVariant(entry.variant);
      return Object.keys(reconstructTinted8(palette, variant, entry).ui).length === 0;
    });
    expect(zeroUi.length).toBeGreaterThan(0);
  });
});

describe("orange-dim known bug (SPEC §10)", () => {
  it("our orange-dim is true-dim, derived from orange-normal", () => {
    for (const entry of TINTED8) {
      const palette = extractTinted8BaseNormals(entry);
      const variant = normalizeVariant(entry.variant);
      const overrides = reconstructTinted8(palette, variant, entry);
      // orange-dim is never reconstructed as an override (we skip it), so it
      // always reflects pure derivation from the effective orange-normal.
      expect(overrides.palette["orange-dim"]).toBeUndefined();
      const eff = computeEffectiveTinted8(palette, overrides, variant);
      const orangeNormal = eff.palette["orange-normal"]!;
      const expected = hslToHex(deriveVariant(hexToHsl(orangeNormal), "dim"));
      expect(eff.palette["orange-dim"]).toBe(expected);
    }
  });
});
