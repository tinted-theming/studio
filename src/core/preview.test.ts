import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PREVIEW_ROLES,
  palettePreviewKey,
  paletteEntriesInGridOrder,
  paletteGridShape,
  previewColor,
  wrapHex,
  type PreviewScheme,
} from "./preview";
import { computeEffectiveTinted8 } from "./derive";
import { extractTinted8BaseNormals, normalizeVariant } from "./schemes";
import type { SchemeEntry } from "./types";

const LIBRARY: SchemeEntry[] = JSON.parse(readFileSync("data/schemes.json", "utf8"));
const base16 = LIBRARY.find((s) => s.system === "base16")!;
const base24 = LIBRARY.find((s) => s.system === "base24")!;
const t8 = LIBRARY.find((s) => s.system === "tinted8")!;

describe("palettePreviewKey", () => {
  it("base16 maps roles to base slots", () => {
    const s: PreviewScheme = { system: "base16", variant: "dark", palette: {} };
    expect(palettePreviewKey(s, "keyword")).toBe("base0E");
    expect(palettePreviewKey(s, "ansi-bright-red")).toBe("base08");
  });
  it("base24 overlays bright-ANSI accents, falling back to base16 otherwise", () => {
    const s: PreviewScheme = { system: "base24", variant: "dark", palette: {} };
    expect(palettePreviewKey(s, "ansi-bright-red")).toBe("base12");
    expect(palettePreviewKey(s, "keyword")).toBe("base0E"); // fallback
  });
  it("tinted8 resolves ANSI via variant + shared maps", () => {
    const dark: PreviewScheme = { system: "tinted8", variant: "dark", palette: {} };
    const light: PreviewScheme = { system: "tinted8", variant: "light", palette: {} };
    expect(palettePreviewKey(dark, "bg")).toBe("black-normal");
    expect(palettePreviewKey(light, "bg")).toBe("white-normal");
    expect(palettePreviewKey(dark, "ansi-red")).toBe("red-normal");
  });
});

describe("previewColor", () => {
  it("resolves base16 roles from the snapshot palette", () => {
    const s: PreviewScheme = { system: "base16", variant: base16.variant, palette: base16.palette };
    expect(previewColor(s, "bg")).toBe(base16.palette.base00!.hex_str);
    expect(previewColor(s, "keyword")).toBe(base16.palette.base0E!.hex_str);
  });
  it("base24 uses bright accents from base12+", () => {
    const s: PreviewScheme = { system: "base24", variant: base24.variant, palette: base24.palette };
    expect(previewColor(s, "ansi-bright-red")).toBe(base24.palette.base12!.hex_str);
  });
  it("tinted8 non-ANSI roles resolve through ui/syntax token paths", () => {
    const palette = extractTinted8BaseNormals(t8);
    const variant = normalizeVariant(t8.variant);
    const eff = computeEffectiveTinted8(palette, { palette: {}, ui: {}, syntax: {} }, variant);
    const s: PreviewScheme = {
      system: "tinted8",
      variant,
      palette: wrapHex(eff.palette),
      ui: wrapHex(eff.ui),
      syntax: wrapHex(eff.syntax),
    };
    expect(previewColor(s, "bg")).toBe(eff.ui["global.background.normal"]);
    expect(previewColor(s, "keyword")).toBe(eff.syntax["keyword"]);
    expect(previewColor(s, "ansi-red")).toBe(eff.palette["red-normal"]);
  });
  it("falls back gracefully for an unknown palette key", () => {
    const s: PreviewScheme = { system: "base16", variant: "dark", palette: {} };
    expect(previewColor(s, "bg")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("palette grid", () => {
  it("shapes per system", () => {
    expect(paletteGridShape("tinted8")).toEqual({ cols: 11, rows: 3 });
    expect(paletteGridShape("base24")).toEqual({ cols: 8, rows: 3 });
    expect(paletteGridShape("base16")).toEqual({ cols: 8, rows: 2 });
  });
  it("orders tinted8 by variant then color", () => {
    const s: PreviewScheme = { system: "tinted8", variant: "dark", palette: t8.palette };
    const order = paletteEntriesInGridOrder(s).map(([k]) => k);
    // dim group first
    expect(order[0]!.endsWith("-dim")).toBe(true);
    expect(order[order.length - 1]!.endsWith("-bright")).toBe(true);
  });
});

describe("PREVIEW_ROLES", () => {
  it("covers the 13 semantic + 16 ANSI roles", () => {
    expect(PREVIEW_ROLES.length).toBe(29);
  });
});
