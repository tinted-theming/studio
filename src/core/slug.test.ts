import { describe, expect, it } from "vitest";
import { effectiveSlug, slugify } from "./slug";

describe("slugify", () => {
  it("lowercases, folds accents, collapses non-alphanumerics", () => {
    expect(slugify("Solarized Café")).toBe("solarized-cafe");
    expect(slugify("  Hello---World!! ")).toBe("hello-world");
    expect(slugify("0x96f")).toBe("0x96f");
  });
  it("trims leading/trailing dashes", () => {
    expect(slugify("--Foo--")).toBe("foo");
    expect(slugify("!!!")).toBe("");
  });
  it("handles empty/nullish input", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
  });
});

describe("effectiveSlug", () => {
  it("falls back to 'scheme' when the slug would be empty", () => {
    expect(effectiveSlug("")).toBe("scheme");
    expect(effectiveSlug("!!!")).toBe("scheme");
    expect(effectiveSlug("Gruvbox Dark")).toBe("gruvbox-dark");
  });
});
