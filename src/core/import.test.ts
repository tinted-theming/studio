import { describe, expect, it } from "vitest";
import { coerceHex, isLightBackground, parseSchemeDocument, type ImportResult } from "./import";
import { DEFAULT_BASE16, DEFAULT_BASE24 } from "./tables";

function ok(res: ImportResult) {
  if (!res.ok) throw new Error(`expected ok, got: ${res.errors.join("; ")}`);
  return res;
}
function errs(res: ImportResult): string[] {
  if (res.ok) throw new Error("expected errors, got ok");
  return res.errors;
}

const modern16 = (): Record<string, unknown> => ({
  system: "base16",
  name: "My Scheme",
  author: "Me",
  variant: "dark",
  palette: { ...DEFAULT_BASE16 },
});

/** Legacy flat format: `scheme:` name, top-level slots, no `#`, no variant. */
const legacy = (slots: Record<string, string>): Record<string, unknown> => {
  const doc: Record<string, unknown> = { scheme: "Old School", author: "Chris" };
  for (const [k, v] of Object.entries(slots)) doc[k] = v.slice(1).toUpperCase();
  return doc;
};

describe("coerceHex", () => {
  it("normalizes case, adds #, expands shorthand", () => {
    expect(coerceHex("#AbCdEf")).toEqual({ hex: "#abcdef" });
    expect(coerceHex("abcdef")).toEqual({ hex: "#abcdef" });
    expect(coerceHex(" #abc ")).toEqual({ hex: "#aabbcc" });
  });
  it("rejects alpha, garbage and missing values", () => {
    expect(coerceHex("#aabbccdd")).toEqual({ error: expect.stringMatching(/alpha/) });
    expect(coerceHex("zzz")).toEqual({ error: expect.stringMatching(/not a hex color/) });
    expect(coerceHex(null)).toEqual({ error: "missing value" });
  });
});

describe("isLightBackground", () => {
  it("classifies by relative luminance", () => {
    expect(isLightBackground("#fdf6e3")).toBe(true);
    expect(isLightBackground("#ffffff")).toBe(true);
    expect(isLightBackground("#282c34")).toBe(false);
    expect(isLightBackground("#000000")).toBe(false);
  });
});

describe("parseSchemeDocument — dispatch", () => {
  it("rejects non-mappings", () => {
    expect(errs(parseSchemeDocument("hello"))[0]).toMatch(/mapping/);
    expect(errs(parseSchemeDocument([1, 2]))[0]).toMatch(/mapping/);
    expect(errs(parseSchemeDocument(null))[0]).toMatch(/mapping/);
  });
  it("rejects unknown systems and unrecognized shapes", () => {
    expect(errs(parseSchemeDocument({ system: "base32", palette: {} }))[0]).toMatch(/base32/);
    expect(errs(parseSchemeDocument({ foo: "bar" }))[0]).toMatch(/Unrecognized/);
    expect(errs(parseSchemeDocument({ system: "base16" }))[0]).toMatch(/palette/);
  });
});

describe("parseSchemeDocument — modern Base16/Base24", () => {
  it("parses a complete Base16 scheme with no warnings", () => {
    const res = ok(parseSchemeDocument(modern16()));
    expect(res.warnings).toEqual([]);
    expect(res.scheme).toEqual({
      system: "base16",
      meta: {
        name: "My Scheme",
        author: "Me",
        slug: "my-scheme",
        description: "",
        variant: "dark",
      },
      palette: DEFAULT_BASE16,
    });
  });
  it("parses Base24 and requires all 24 slots", () => {
    const doc = { ...modern16(), system: "base24", palette: { ...DEFAULT_BASE24 } };
    expect(ok(parseSchemeDocument(doc)).scheme.palette).toEqual(DEFAULT_BASE24);
    const missing = { ...DEFAULT_BASE24 } as Record<string, string>;
    delete missing.base17;
    expect(errs(parseSchemeDocument({ ...doc, palette: missing }))).toContain(
      "Missing slot: base17",
    );
  });
  it("normalizes hex and accepts case-insensitive variant", () => {
    const doc = modern16();
    (doc.palette as Record<string, string>).base00 = "#ABCDEF";
    doc.variant = "Light";
    const res = ok(parseSchemeDocument(doc));
    expect(res.scheme.palette.base00).toBe("#abcdef");
    expect(res.scheme.meta.variant).toBe("light");
  });
  it("reports missing, invalid and alpha slots", () => {
    const doc = modern16();
    const pal = doc.palette as Record<string, string>;
    delete pal.base0F;
    pal.base08 = "#12345";
    pal.base00 = "#11223344";
    const e = errs(parseSchemeDocument(doc));
    expect(e).toContain("Missing slot: base0F");
    expect(e.some((m) => /^base08: .*not a hex color/.test(m))).toBe(true);
    expect(e.some((m) => /^base00: .*alpha/.test(m))).toBe(true);
  });
  it("rejects a non-enum variant", () => {
    expect(errs(parseSchemeDocument({ ...modern16(), variant: "dim" }))[0]).toMatch(
      /variant must be "dark" or "light"/,
    );
  });
  it("infers a missing variant from base00, with a warning", () => {
    const doc = modern16();
    delete doc.variant;
    (doc.palette as Record<string, string>).base00 = "#fdf6e3";
    const res = ok(parseSchemeDocument(doc));
    expect(res.scheme.meta.variant).toBe("light");
    expect(res.warnings.some((w) => /inferred "light"/.test(w))).toBe(true);
  });
  it("warns (not errors) on unknown keys, slug mismatch, missing author/name", () => {
    const doc = modern16();
    doc.extra = "x";
    doc.slug = "something-else";
    (doc.palette as Record<string, string>).accent = "#ffffff";
    (doc.palette as Record<string, string>).base10 = "#000000";
    delete doc.author;
    delete doc.name;
    const res = ok(parseSchemeDocument(doc));
    expect(res.scheme.meta.name).toBe("Untitled");
    expect(res.scheme.meta.author).toBe("");
    const w = res.warnings.join("\n");
    expect(w).toMatch(/"extra"/);
    expect(w).toMatch(/"accent"/);
    expect(w).toMatch(/base10 — not a Base16 slot/);
    expect(w).toMatch(/Slug "something-else" ignored/);
    expect(w).toMatch(/No author/);
    expect(w).toMatch(/No name/);
  });
  it("keeps description", () => {
    const res = ok(parseSchemeDocument({ ...modern16(), description: "  Nice  " }));
    expect(res.scheme.meta.description).toBe("Nice");
  });
});

describe("parseSchemeDocument — legacy flat format", () => {
  it("parses legacy Base16 (no #, uppercase, inferred variant)", () => {
    const res = ok(parseSchemeDocument(legacy(DEFAULT_BASE16)));
    expect(res.scheme.system).toBe("base16");
    expect(res.scheme.meta.name).toBe("Old School");
    expect(res.scheme.meta.author).toBe("Chris");
    expect(res.scheme.meta.variant).toBe("dark");
    expect(res.scheme.palette).toEqual(DEFAULT_BASE16);
    expect(res.warnings.some((w) => /inferred "dark"/.test(w))).toBe(true);
  });
  it("detects Base24 from base10–base17", () => {
    const res = ok(parseSchemeDocument(legacy(DEFAULT_BASE24)));
    expect(res.scheme.system).toBe("base24");
    expect(res.scheme.palette).toEqual(DEFAULT_BASE24);
  });
  it("matches slot keys case-insensitively", () => {
    const doc = legacy(DEFAULT_BASE16);
    doc.base0a = doc.base0A;
    delete doc.base0A;
    expect(ok(parseSchemeDocument(doc)).scheme.palette.base0A).toBe(DEFAULT_BASE16.base0A);
  });
});
