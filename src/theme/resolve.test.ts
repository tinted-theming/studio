import { describe, expect, it } from "vitest";
import { buildHighlightTable, styleForCapture } from "./resolve";
import type { BaseSlots } from "./baseSlots";

// base16-default-dark slots (Base16, so no base12–17).
const DEFAULT_DARK: BaseSlots = {
  base00: "#181818",
  base01: "#282828",
  base02: "#383838",
  base03: "#585858",
  base04: "#b8b8b8",
  base05: "#d8d8d8",
  base06: "#e8e8e8",
  base07: "#f8f8f8",
  base08: "#ab4642",
  base09: "#dc9656",
  base0A: "#f7ca88",
  base0B: "#a1b56c",
  base0C: "#86c1b9",
  base0D: "#7cafc2",
  base0E: "#ba8baf",
  base0F: "#a16946",
};

describe("buildHighlightTable", () => {
  const t = buildHighlightTable(DEFAULT_DARK);

  it("resolves Normal fg/bg", () => {
    expect(t.fg).toBe("#d8d8d8");
    expect(t.bg).toBe("#181818");
  });

  it("resolves CursorLine (blend base01→base00) and Visual (base01)", () => {
    expect(t.selection).toBe("#282828"); // base01
    expect(t.cursorLine).toBe("#1e1e1e"); // blend(#282828, #181818, 0.6)
  });

  it("maps captures to tinted-nvim colors", () => {
    expect(t.groups["@keyword"]?.fg).toBe("#ba8baf"); // purple, via Keyword link
    expect(t.groups["@string"]?.fg).toBe("#a1b56c"); // green
    expect(t.groups["@function"]?.fg).toBe("#7cafc2"); // blue, via Function link
    expect(t.groups["@number"]?.fg).toBe("#dc9656"); // orange
    expect(t.groups["@type"]?.fg).toBe("#f7ca88"); // yellow, via Type link
    expect(t.groups["@variable"]?.fg).toBe("#d8d8d8"); // foreground
  });

  it("carries styles (comment italic)", () => {
    expect(t.groups["@comment"]?.fg).toBe("#585858"); // grey, via Comment link
    expect(t.groups["@comment"]?.italic).toBe(true);
  });
});

describe("styleForCapture dotted fallback", () => {
  const t = buildHighlightTable(DEFAULT_DARK);

  it("uses the exact group when present", () => {
    expect(styleForCapture("keyword.function", t)?.fg).toBe("#ba8baf"); // → @keyword
  });

  it("falls back to a parent segment", () => {
    expect(styleForCapture("string.regexp", t)?.fg).toBe("#a1b56c"); // → @string
  });

  it("returns null for non-visual captures", () => {
    expect(styleForCapture("spell", t)).toBeNull();
    expect(styleForCapture("_internal", t)).toBeNull();
  });
});

describe("Base24 bright-slot precedence", () => {
  it("prefers base12 for bright_red (@markup.danger)", () => {
    const b24: BaseSlots = { ...DEFAULT_DARK, base12: "#ff5555" };
    const t = buildHighlightTable(b24);
    expect(t.groups["@markup.danger"]?.fg).toBe("#ff5555");
    // Without base12 it falls back to base08.
    expect(buildHighlightTable(DEFAULT_DARK).groups["@markup.danger"]?.fg).toBe("#ab4642");
  });
});
