import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BASE16,
  DEFAULT_BASE24,
  DEFAULT_TINTED8,
  buildBaseYaml,
  buildTinted8Yaml,
  extractTinted8BaseNormals,
  normalizeVariant,
  reconstructTinted8,
  type BaseWorkspace,
  type ImportResult,
  type SchemeEntry,
  type Tinted8Workspace,
} from "../core";
import {
  FETCH_TIMEOUT_MS,
  MAX_IMPORT_BYTES,
  fetchSchemeText,
  importFromUrl,
  parseYamlText,
} from "./importYaml";

const LIBRARY: SchemeEntry[] = JSON.parse(readFileSync("data/schemes.json", "utf8"));

function ok(res: ImportResult) {
  if (!res.ok) throw new Error(`expected ok, got: ${res.errors.join("; ")}`);
  return res;
}

const MODERN = `system: "base16"
name: "My Scheme"
author: "Me"
variant: "dark"
palette:
${Object.entries(DEFAULT_BASE16)
  .map(([k, v]) => `  ${k}: "${v}"`)
  .join("\n")}
`;

describe("parseYamlText", () => {
  it("parses a modern Base16 document", async () => {
    const res = ok(await parseYamlText(MODERN));
    expect(res.scheme.palette).toEqual(DEFAULT_BASE16);
  });

  it("keeps unquoted digit-only hex exact (legacy files)", async () => {
    const lines = Object.keys(DEFAULT_BASE16).map((k) => `${k}: 282828`);
    lines[10] = "base0A: 000e00";
    lines[11] = "base0B: 001100";
    const res = ok(await parseYamlText(`scheme: "Legacy"\nauthor: "A"\n${lines.join("\n")}\n`));
    expect(res.scheme.palette.base00).toBe("#282828");
    expect(res.scheme.palette.base0A).toBe("#000e00");
    expect(res.scheme.palette.base0B).toBe("#001100");
  });

  it("tolerates BOM, CRLF, document marker and comments", async () => {
    const noisy = "﻿---\r\n# a scheme\r\n" + MODERN.replace(/\n/g, "\r\n") + "# end\r\n";
    expect(ok(await parseYamlText(noisy)).scheme.meta.name).toBe("My Scheme");
  });

  it("reports YAML syntax errors with line and column", async () => {
    const res = await parseYamlText('system: "base16"\npalette: [unclosed\n');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toMatch(/YAML syntax error at line \d+, column \d+/);
  });

  it("rejects empty and oversized input", async () => {
    expect(await parseYamlText("   ")).toEqual({ ok: false, errors: ["Paste some scheme YAML."] });
    const big = await parseYamlText("a".repeat(MAX_IMPORT_BYTES + 1));
    expect(big.ok).toBe(false);
  });

  it("survives alias bombs", async () => {
    const bomb = [
      'scheme: { system: "tinted8", author: "A", name: "B" }',
      "variant: dark",
      `palette: { ${Object.entries(DEFAULT_TINTED8)
        .map(([k, v]) => `${k}: "${v}"`)
        .join(", ")} }`,
      "a: &a { x: 1, y: 1, z: 1, w: 1, v: 1, u: 1, t: 1, s: 1 }",
      "b: &b { x: *a, y: *a, z: *a, w: *a, v: *a, u: *a, t: *a, s: *a }",
      "c: &c { x: *b, y: *b, z: *b, w: *b, v: *b, u: *b, t: *b, s: *b }",
      "d: &d { x: *c, y: *c, z: *c, w: *c, v: *c, u: *c, t: *c, s: *c }",
      "ui: { x: *d, y: *d, z: *d, w: *d, v: *d, u: *d, t: *d, s: *d }",
    ].join("\n");
    const res = ok(await parseYamlText(bomb));
    expect(res.warnings.join("\n")).toMatch(/too many entries/);
  });
});

describe("round-trip: export → YAML → import", () => {
  it("round-trips the stock Base16 and Base24 workspaces", async () => {
    for (const [flavor, palette] of [
      ["base16", DEFAULT_BASE16],
      ["base24", DEFAULT_BASE24],
    ] as const) {
      const ws: BaseWorkspace = {
        meta: {
          name: 'Q "uoted" \\ name',
          author: "Me",
          slug: "",
          description: "d",
          variant: "light",
        },
        palette: { ...palette },
        loadedFrom: null,
        touched: false,
      };
      const res = ok(await parseYamlText(buildBaseYaml(flavor, ws)));
      expect(res.scheme.system).toBe(flavor);
      expect(res.scheme.palette).toEqual(palette);
      expect(res.scheme.meta).toMatchObject({
        name: ws.meta.name,
        author: "Me",
        description: "d",
        variant: "light",
      });
    }
  });

  it("round-trips every Tinted8 snapshot scheme's reconstructed overrides", async () => {
    const entries = LIBRARY.filter((e) => e.system === "tinted8");
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      const variant = normalizeVariant(e.variant);
      const palette = { ...DEFAULT_TINTED8, ...extractTinted8BaseNormals(e) };
      const ws: Tinted8Workspace = {
        meta: {
          name: e.name,
          author: e.author,
          slug: "",
          description: e.description ?? "",
          variant,
          family: e.family ?? "",
          style: e.style ?? "",
        },
        palette,
        overrides: reconstructTinted8(palette, variant, e),
        loadedFrom: null,
        touched: false,
      };
      const res = ok(await parseYamlText(buildTinted8Yaml(ws)));
      expect(res.scheme.palette, e.id).toEqual(palette);
      expect(res.scheme.overrides, e.id).toEqual(ws.overrides);
      expect(res.scheme.meta.variant, e.id).toBe(variant);
    }
  });

  it("round-trips a sample of Base16/Base24 snapshot schemes", async () => {
    for (const flavor of ["base16", "base24"] as const) {
      for (const e of LIBRARY.filter((s) => s.system === flavor).slice(0, 25)) {
        const palette: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.palette)) palette[k] = v.hex_str.toLowerCase();
        const ws: BaseWorkspace = {
          meta: {
            name: e.name,
            author: e.author,
            slug: "",
            description: "",
            variant: normalizeVariant(e.variant),
          },
          palette,
          loadedFrom: null,
          touched: false,
        };
        expect(ok(await parseYamlText(buildBaseYaml(flavor, ws))).scheme.palette, e.id).toEqual(
          palette,
        );
      }
    }
  });
});

function fakeFetch(body: string, init: ResponseInit = { status: 200 }): typeof fetch {
  return vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;
}

describe("fetchSchemeText", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the body on 200", async () => {
    expect(await fetchSchemeText("https://x/a.yaml", fakeFetch("hello"))).toEqual({
      ok: true,
      text: "hello",
    });
  });
  it("maps 404 and other statuses to friendly errors", async () => {
    const nf = await fetchSchemeText("https://x/a.yaml", fakeFetch("", { status: 404 }));
    expect(nf).toEqual({ ok: false, error: expect.stringMatching(/File not found/) });
    const se = await fetchSchemeText("https://x/a.yaml", fakeFetch("", { status: 503 }));
    expect(se).toEqual({ ok: false, error: expect.stringMatching(/503/) });
  });
  it("rejects oversized bodies by header and by length", async () => {
    // A hand-rolled Response: runtimes may drop content-length set via `new Response`.
    const bigHeader = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "",
      headers: new Headers({ "content-length": String(MAX_IMPORT_BYTES + 1) }),
      text: async () => "small",
    })) as unknown as typeof fetch;
    const hdr = await fetchSchemeText("https://x/a.yaml", bigHeader);
    expect(hdr).toEqual({ ok: false, error: expect.stringMatching(/too large/) });
    const body = await fetchSchemeText(
      "https://x/a.yaml",
      fakeFetch("a".repeat(MAX_IMPORT_BYTES + 1)),
    );
    expect(body).toEqual({ ok: false, error: expect.stringMatching(/too large/) });
  });
  it("maps network failures", async () => {
    const boom = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await fetchSchemeText("https://x/a.yaml", boom)).toEqual({
      ok: false,
      error: expect.stringMatching(/Couldn't fetch/),
    });
  });
  it("times out", async () => {
    vi.useFakeTimers();
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    ) as unknown as typeof fetch;
    const pending = fetchSchemeText("https://x/a.yaml", hang);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 1);
    expect(await pending).toEqual({ ok: false, error: expect.stringMatching(/Timed out/) });
  });
});

describe("importFromUrl", () => {
  it("rejects non-GitHub URLs without fetching", async () => {
    const f = fakeFetch(MODERN);
    const res = await importFromUrl("https://example.com/a.yaml", f);
    expect(res.rawUrl).toBeNull();
    expect(res.result.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("normalizes, fetches the raw URL, and parses", async () => {
    const f = fakeFetch(MODERN);
    const res = await importFromUrl("https://github.com/o/r/blob/main/a.yaml", f);
    expect(f).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/o/r/main/a.yaml",
      expect.anything(),
    );
    expect(res.rawUrl).toBe("https://raw.githubusercontent.com/o/r/main/a.yaml");
    expect(ok(res.result).scheme.meta.name).toBe("My Scheme");
  });
  it("surfaces fetch errors as import errors", async () => {
    const res = await importFromUrl(
      "https://github.com/o/r/blob/main/a.yaml",
      fakeFetch("", { status: 404 }),
    );
    expect(res.result).toEqual({ ok: false, errors: [expect.stringMatching(/File not found/)] });
  });
});
