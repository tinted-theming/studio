import { describe, expect, it } from "vitest";
import { requiredSlotKeys, validateScheme } from "./validate";
import { DEFAULT_BASE16, DEFAULT_TINTED8 } from "./tables";
import type { Meta } from "./types";

const meta = (o: Partial<Meta> = {}): Meta => ({
  name: "X",
  author: "Y",
  slug: "",
  description: "",
  variant: "dark",
  ...o,
});

describe("requiredSlotKeys", () => {
  it("returns the right count per flavor", () => {
    expect(requiredSlotKeys("base16").length).toBe(16);
    expect(requiredSlotKeys("base24").length).toBe(24);
    expect(requiredSlotKeys("tinted8")).toEqual([
      "black",
      "red",
      "green",
      "yellow",
      "blue",
      "magenta",
      "cyan",
      "white",
    ]);
  });
});

describe("validateScheme", () => {
  it("passes a complete base16 scheme", () => {
    expect(validateScheme("base16", meta(), DEFAULT_BASE16).ok).toBe(true);
  });
  it("flags missing name/author", () => {
    const r = validateScheme("base16", meta({ name: "", author: "" }), DEFAULT_BASE16);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["name", "author"]);
  });
  it("treats whitespace-only props as missing", () => {
    expect(validateScheme("base16", meta({ name: "   " }), DEFAULT_BASE16).missing).toContain(
      "name",
    );
  });
  it("flags invalid/missing required slots", () => {
    const bad = { ...DEFAULT_BASE16, base00: "nothex" };
    delete (bad as Record<string, string>).base05;
    const r = validateScheme("base16", meta(), bad);
    expect(r.ok).toBe(false);
    expect(r.invalidSlots).toEqual(expect.arrayContaining(["base00", "base05"]));
    expect(r.invalidCount).toBe(2);
  });
  it("only requires the 8 base normals for tinted8 (derived slots ignored)", () => {
    expect(validateScheme("tinted8", meta(), DEFAULT_TINTED8).ok).toBe(true);
    const bad = { ...DEFAULT_TINTED8, yellow: "" };
    expect(validateScheme("tinted8", meta(), bad).ok).toBe(false);
  });
});
