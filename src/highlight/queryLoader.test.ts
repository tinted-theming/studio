import { describe, expect, it } from "vitest";
import { luaPatternToRegex, loadQuerySource } from "./queryLoader";

describe("luaPatternToRegex", () => {
  const cases: Array<[string, string, string[], string[]]> = [
    // pattern, expectedRegex, shouldMatch[], shouldNotMatch[]
    ["^[A-Z]", "^[A-Z]", ["Foo", "BAR"], ["foo"]],
    ["^[A-Z][A-Z_0-9]*$", "^[A-Z][A-Z_0-9]*$", ["MAX", "A1_B"], ["Max", "max"]],
    ["^_*[A-Z][A-Z%d_]*$", "^_*[A-Z][A-Z0-9_]*$", ["_FOO", "BAR2"], ["foo", "Bar"]],
    ["^%u", "^[A-Z]", ["New"], ["new"]],
    ["^[%l_].*$", "^[a-z_].*$", ["foo", "_bar"], ["Foo"]],
    ["^__[a-zA-Z0-9_]*__$", "^__[a-zA-Z0-9_]*__$", ["__init__"], ["init"]],
  ];
  for (const [pat, expected, yes, no] of cases) {
    it(`translates ${pat}`, () => {
      const re = luaPatternToRegex(pat);
      expect(re).toBe(expected);
      const rx = new RegExp(re);
      for (const s of yes) expect(rx.test(s), `${s} should match ${re}`).toBe(true);
      for (const s of no) expect(rx.test(s), `${s} should not match ${re}`).toBe(false);
    });
  }
});

describe("loadQuerySource", () => {
  const files: Record<string, string> = {
    ecma: `; comment\n(identifier) @variable`,
    typescript: `; inherits: ecma\n((identifier) @constant (#lua-match? @constant "^%u"))`,
    go: `((x) @spell (#not-has-parent? @spell import_spec))`,
  };
  const fetch = async (l: string) => files[l] ?? null;

  it("prepends inherited queries (inherited first)", async () => {
    const out = await loadQuerySource("typescript", fetch);
    expect(out.indexOf("@variable")).toBeLessThan(out.indexOf("@constant"));
  });

  it("rewrites #lua-match? to #match? with a JS regex", async () => {
    const out = await loadQuerySource("typescript", fetch);
    expect(out).toContain('(#match? @constant "^[A-Z]")');
    expect(out).not.toContain("lua-match");
  });

  it("drops unsupported predicates", async () => {
    const out = await loadQuerySource("go", fetch);
    expect(out).not.toContain("not-has-parent");
    expect(out).toContain("@spell"); // capture kept, predicate gone
  });
});
