import { describe, expect, it } from "vitest";
import { buildBaseYaml, buildTinted8Yaml, yamlStr } from "./yaml";
import { DEFAULT_BASE16, DEFAULT_BASE24, DEFAULT_TINTED8 } from "./tables";
import type { BaseWorkspace, Tinted8Workspace } from "./types";

function baseWs(overrides: Partial<BaseWorkspace> = {}): BaseWorkspace {
  return {
    meta: { name: "My Scheme", author: "Me", slug: "", description: "", variant: "dark" },
    palette: { ...DEFAULT_BASE16 },
    loadedFrom: null,
    touched: false,
    ...overrides,
  };
}

describe("yamlStr", () => {
  it("always quotes and escapes", () => {
    expect(yamlStr("#abc")).toBe('"#abc"');
    expect(yamlStr('a"b')).toBe('"a\\"b"');
    expect(yamlStr("a\\b")).toBe('"a\\\\b"');
    expect(yamlStr(null)).toBe('""');
  });
});

describe("buildBaseYaml (base16)", () => {
  const yaml = buildBaseYaml("base16", baseWs());
  it("emits flat top-level keys with quoted hex", () => {
    expect(yaml).toContain('system: "base16"');
    expect(yaml).toContain('name: "My Scheme"');
    expect(yaml).toContain('slug: "my-scheme"');
    expect(yaml).toContain('author: "Me"');
    expect(yaml).toContain('variant: "dark"');
    expect(yaml).toContain('  base00: "#181818"');
    expect(yaml).not.toContain("scheme:");
  });
  it("emits all 16 base slots", () => {
    for (const [k] of Object.entries(DEFAULT_BASE16)) expect(yaml).toContain(`  ${k}: `);
  });
  it("omits slug when name is empty, omits description when blank", () => {
    const y = buildBaseYaml(
      "base16",
      baseWs({ meta: { name: "", author: "Me", slug: "", description: "", variant: "dark" } }),
    );
    expect(y).not.toContain("slug:");
    expect(y).not.toContain("description:");
    expect(y).toContain('name: "Untitled"');
  });
});

describe("buildBaseYaml (base24)", () => {
  it("emits all 24 slots including base10–base17", () => {
    const y = buildBaseYaml("base24", baseWs({ palette: { ...DEFAULT_BASE24 } }));
    expect(y).toContain('system: "base24"');
    for (const k of ["base10", "base11", "base17"]) expect(y).toContain(`  ${k}: `);
  });
});

function t8Ws(overrides: Partial<Tinted8Workspace> = {}): Tinted8Workspace {
  return {
    meta: {
      name: "Tint",
      author: "Me",
      slug: "",
      description: "",
      variant: "dark",
      family: "",
      style: "",
    },
    palette: { ...DEFAULT_TINTED8 },
    overrides: { palette: {}, ui: {}, syntax: {} },
    loadedFrom: null,
    touched: false,
    ...overrides,
  };
}

describe("buildTinted8Yaml", () => {
  it("uses the nested scheme: wrapper and emits only the 8 base colors when no overrides", () => {
    const y = buildTinted8Yaml(t8Ws());
    expect(y).toContain("scheme:");
    expect(y).toContain('  system: "tinted8"');
    expect(y).toContain("  supports:");
    expect(y).toContain('    styling-spec: "0.2.0"');
    expect(y).toMatch(/\nvariant: "dark"/);
    // exactly the 8 base normals under palette, nothing derived
    expect(y).toContain('  black: "#181818"');
    expect(y).toContain('  white: "#d8d8d8"');
    expect(y).not.toContain("black-dim");
    expect(y).not.toContain("orange");
    expect(y).not.toMatch(/\nsyntax:/);
    expect(y).not.toMatch(/\nui:/);
  });

  it("emits overridden derived slots in canonical order, plus ui/syntax sections", () => {
    const y = buildTinted8Yaml(
      t8Ws({
        overrides: {
          palette: { orange: "#ff8800", "red-dim": "#aa0000", "black-bright": "#333333" },
          ui: { "accent.normal": "#00ffff" },
          syntax: { keyword: "#ff00ff" },
        },
      }),
    );
    expect(y).toContain('  orange: "#ff8800"');
    expect(y).toContain('  red-dim: "#aa0000"');
    expect(y).toContain('  black-bright: "#333333"');
    expect(y).toContain("syntax:");
    expect(y).toContain('  keyword: "#ff00ff"');
    expect(y).toContain("ui:");
    expect(y).toContain('  accent.normal: "#00ffff"');
    // black-bright (base color 'black') comes before orange (supplemental)
    expect(y.indexOf("black-bright")).toBeLessThan(y.indexOf("orange:"));
  });

  it("omits optional meta fields when blank and includes them when set", () => {
    const blank = buildTinted8Yaml(t8Ws());
    expect(blank).not.toContain("family:");
    expect(blank).not.toContain("style:");
    const filled = buildTinted8Yaml(
      t8Ws({
        meta: {
          name: "Tint",
          author: "Me",
          slug: "",
          description: "Nice",
          variant: "light",
          family: "Fam",
          style: "Sty",
        },
      }),
    );
    expect(filled).toContain('  family: "Fam"');
    expect(filled).toContain('  style: "Sty"');
    expect(filled).toContain('  description: "Nice"');
    expect(filled).toContain('variant: "light"');
  });
});
