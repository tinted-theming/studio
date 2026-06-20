import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractTinted8BaseNormals,
  indexSchemes,
  normalizeVariant,
  reconstructTinted8,
  schemesForFlavor,
} from "./schemes";
import { computeEffectiveTinted8 } from "./derive";
import type { SchemeEntry } from "./types";

const LIBRARY: SchemeEntry[] = JSON.parse(readFileSync("data/schemes.json", "utf8"));

describe("indexSchemes / schemesForFlavor", () => {
  it("indexes by id", () => {
    const idx = indexSchemes(LIBRARY);
    expect(idx.size).toBe(LIBRARY.length);
    const first = LIBRARY[0]!;
    expect(idx.get(first.id)?.id).toBe(first.id);
  });
  it("filters + name-sorts by system", () => {
    const b16 = schemesForFlavor(LIBRARY, "base16");
    expect(b16.every((s) => s.system === "base16")).toBe(true);
    const names = b16.map((s) => s.name.toLowerCase());
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("normalizeVariant", () => {
  it("coerces to the dark/light enum", () => {
    expect(normalizeVariant("light")).toBe("light");
    expect(normalizeVariant("LIGHT")).toBe("light");
    expect(normalizeVariant("dark")).toBe("dark");
    expect(normalizeVariant("anything")).toBe("dark");
    expect(normalizeVariant(undefined)).toBe("dark");
  });
});

describe("reconstructTinted8", () => {
  const t8 = LIBRARY.filter((s) => s.system === "tinted8");

  it("never reconstructs orange-dim (SPEC §10 builder bug)", () => {
    for (const entry of t8) {
      const palette = extractTinted8BaseNormals(entry);
      const ov = reconstructTinted8(palette, normalizeVariant(entry.variant), entry);
      expect(ov.palette["orange-dim"]).toBeUndefined();
    }
  });

  it("round-trips: derivation + reconstructed overrides reproduces the snapshot", () => {
    for (const entry of t8) {
      const palette = extractTinted8BaseNormals(entry);
      const variant = normalizeVariant(entry.variant);
      const ov = reconstructTinted8(palette, variant, entry);
      const eff = computeEffectiveTinted8(palette, ov, variant);
      for (const [k, v] of Object.entries(entry.palette)) {
        if (k === "orange-dim") continue;
        expect(eff.palette[k]?.toLowerCase()).toBe(v.hex_str.toLowerCase());
      }
      for (const [k, v] of Object.entries(entry.ui ?? {})) {
        expect(eff.ui[k]?.toLowerCase()).toBe(v.hex_str.toLowerCase());
      }
      for (const [k, v] of Object.entries(entry.syntax ?? {})) {
        expect(eff.syntax[k]?.toLowerCase()).toBe(v.hex_str.toLowerCase());
      }
    }
  });

  it("produces a clean (empty) override set when no library data is present", () => {
    const ov = reconstructTinted8(
      {
        black: "#181818",
        red: "#ab4642",
        green: "#a1b56c",
        yellow: "#f7ca88",
        blue: "#7cafc2",
        magenta: "#ba8baf",
        cyan: "#86c1b9",
        white: "#d8d8d8",
      },
      "dark",
      {
        id: "x",
        name: "x",
        author: "",
        system: "tinted8",
        variant: "dark",
        slug: "x",
        palette: {},
      },
    );
    expect(ov).toEqual({ palette: {}, ui: {}, syntax: {} });
  });
});
