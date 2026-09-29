# YAML Import (Paste + GitHub URL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users load any Base16/Base24/Tinted8 scheme YAML into the Studio — by pasting it into a modal or by giving a GitHub file URL (also shareable as `#url=…`).

**Architecture:** A pure, library-free normalizer in `src/core/import.ts` turns an already-parsed YAML document into an `ImportedScheme`; `src/core/githubUrl.ts` normalizes GitHub links to raw URLs. A UI-layer adapter (`src/ui/importYaml.ts`) owns I/O — lazy `js-yaml` parsing (FAILSAFE schema) and `fetch`. The store gains `loadImported` + a persisted per-workspace `baseline` so Reset returns to the imported scheme. A dialog (`ImportDialog`) and a `#url=` deep-link effect in `App.tsx` drive it.

**Tech Stack:** Vite, React 18, TypeScript (strict, `noUncheckedIndexedAccess`), Zustand 4, Vitest (node env), `js-yaml` 4 + `@types/js-yaml`.

**Spec:** `docs/superpowers/specs/2026-09-28-yaml-import-design.md`

## Global Constraints

- `src/core/` imports nothing from React, Zustand, the DOM, or `js-yaml`. It receives plain JS values.
- `variant` is exactly `"dark"` or `"light"`; anything else is an import **error**.
- Colors are solid `#rrggbb`, stored lowercase. 8-digit/alpha hex is an **error**.
- Accepted URLs: `github.com/<o>/<r>/blob|raw/<ref>/<path>`, `raw.githubusercontent.com/…`, `gist.githubusercontent.com/…` only.
- Fetch limits: 10 s timeout, 256 KB max body. Pasted text also capped at 256 KB.
- YAML is parsed with `js-yaml` 4 `FAILSAFE_SCHEMA` (all scalars are strings), loaded via dynamic `import()`.
- Tinted8 overrides are kept **as authored** (no diff against derivation); an explicit `orange-dim` is kept.
- Slug is always `slugify(name)`; a file's `slug:` is ignored (warning if it differs).
- Hash form: `#url=<encodeURIComponent(rawUrl)>`; `loadedFrom` for GitHub imports is `"url:<rawUrl>"`; pasted imports have `loadedFrom = null`.
- Git: stage files by explicit path only (never `git add -A`/`.`/`-u`, never `commit -a`). End every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verify with `npm run check` (= `tsc --noEmit` + `eslint .` + `vitest run`) before each commit.

## Review Focus

1. **Unquoted legacy hex** (`base00: 282828`, `base0A: 000e00`) must import as exactly `#282828` / `#000e00` — never number-mangled. → Task 4 test "keeps unquoted digit-only hex exact".
2. **Self-referential or exponential YAML anchors** in `ui`/`syntax` must not hang the tab; they yield a warning. → Task 2 test "survives self-referential maps", Task 4 test "survives alias bombs".
3. **Malformed percent-encoding in the hash** (`#url=%E0%A4%A`) must not throw; it is ignored. → Task 3 test "ignores malformed percent-encoding".
4. **Branch names with slashes / encoded paths** (`blob/feat/x/schemes/a%20b.yaml`) must map to the correct raw URL. → Task 3 test "keeps slashed refs and encoded paths".
5. **Real-world paste noise** — UTF-8 BOM, CRLF line endings, a leading `---`, trailing comments — must parse. → Task 4 test "tolerates BOM, CRLF, document marker and comments".

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/core/types.ts` | modify | Add `ImportedScheme`; add optional `baseline` to both workspace types. |
| `src/core/import.ts` | create | `parseSchemeDocument`, `coerceHex`, `isLightBackground`, `ImportResult`. |
| `src/core/import.test.ts` | create | Format detection, normalization, errors, warnings. |
| `src/core/githubUrl.ts` | create | `toGithubRawUrl`. |
| `src/core/githubUrl.test.ts` | create | URL normalization tests. |
| `src/core/index.ts` | modify | Export the two new modules. |
| `src/state/deeplink.ts` | modify | `parseHashString`, `parseHash`, `setUrlHash`, `restoreHash`, `buildShareLink`; remove `hashId`. |
| `src/state/deeplink.test.ts` | create | Hash parsing + share-link tests. |
| `src/ui/importYaml.ts` | create | `parseYamlText`, `fetchSchemeText`, `importFromUrl` (I/O adapter; no store). |
| `src/ui/importYaml.test.ts` | create | Pipeline, fetch, round-trip tests. |
| `src/state/store.ts` | modify | `loadImported`, `baseline` handling, Reset-to-baseline, `mergeData`. |
| `src/state/store.test.ts` | create | Store import/reset tests. |
| `src/ui/import.ts` | create | `useImport` dialog store, `applyImport`, `copyShareLink`. |
| `src/ui/components/ImportDialog.tsx` | create | The modal. |
| `src/ui/components/EditorToolbar.tsx` | modify | "From YAML" button; Reset uses baseline + `restoreHash`. |
| `src/ui/icons.tsx` | modify | `IconFile`. |
| `src/styles/studio.css` | modify | Import dialog styles. |
| `src/ui/App.tsx` | modify | Mount `ImportDialog`; `parseHash`; `#url=` deep-link effect. |
| `SPEC.md` | modify | Feature 14, new §16, §1 offline amendment. (Untracked today — commit it in Task 8.) |

---

### Task 1: Core import — types + Base16/Base24 (modern + legacy)

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/import.ts`
- Create: `src/core/import.test.ts`
- Modify: `src/core/index.ts`

**Interfaces:**
- Consumes: `normalizeHex`, `hexToRgb`, `luminance` (`src/core/color.ts`); `slugify` (`src/core/slug.ts`); `BASE16_SLOTS`, `BASE24_SLOTS`, `BASE24_EXTRA_SLOTS` (`src/core/tables.ts`).
- Produces:
  - `interface ImportedScheme { system: Flavor; meta: Meta; palette: Record<string, string>; overrides?: Tinted8Overrides }` (in `types.ts`)
  - `BaseWorkspace.baseline?: ImportedScheme | null`, `Tinted8Workspace.baseline?: ImportedScheme | null`
  - `type ImportResult = { ok: true; scheme: ImportedScheme; warnings: string[] } | { ok: false; errors: string[] }`
  - `parseSchemeDocument(doc: unknown): ImportResult`
  - `coerceHex(v: unknown): { hex: string } | { error: string }`
  - `isLightBackground(hex: string): boolean`
  - `MAX_WARNINGS: number` (= 12)

- [ ] **Step 1: Add the types**

In `src/core/types.ts`, add after the `Meta` interface:

```ts
/**
 * A scheme normalized from imported YAML (paste or GitHub URL). `palette` holds
 * the required slots (Base16/24) or the 8 base normals (Tinted8); `overrides`
 * is Tinted8-only and holds exactly what the file authored.
 */
export interface ImportedScheme {
  system: Flavor;
  meta: Meta;
  palette: Record<string, string>;
  overrides?: Tinted8Overrides;
}
```

Add this field to **both** `BaseWorkspace` and `Tinted8Workspace` (after `authorByUser`):

```ts
  /** The imported scheme this workspace was loaded from; Reset returns here. */
  baseline?: ImportedScheme | null;
```

- [ ] **Step 2: Write the failing tests**

Create `src/core/import.test.ts`:

```ts
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
      meta: { name: "My Scheme", author: "Me", slug: "my-scheme", description: "", variant: "dark" },
      palette: DEFAULT_BASE16,
    });
  });
  it("parses Base24 and requires all 24 slots", () => {
    const doc = { ...modern16(), system: "base24", palette: { ...DEFAULT_BASE24 } };
    expect(ok(parseSchemeDocument(doc)).scheme.palette).toEqual(DEFAULT_BASE24);
    const missing = { ...DEFAULT_BASE24 } as Record<string, string>;
    delete missing.base17;
    expect(errs(parseSchemeDocument({ ...doc, palette: missing }))).toContain("Missing slot: base17");
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/core/import.test.ts`
Expected: FAIL — `Failed to resolve import "./import"`.

- [ ] **Step 4: Implement `src/core/import.ts` (Base16/24 + dispatch)**

```ts
/**
 * Scheme import — normalize a parsed YAML document into Studio data
 * (docs/superpowers/specs/2026-09-28-yaml-import-design.md).
 *
 * Pure and library-free: the caller parses YAML text (js-yaml FAILSAFE schema,
 * so every scalar arrives as a string) and hands us plain JS values. We detect
 * the format — Tinted8 (`scheme:` wrapper), modern Base16/24 (`system:` +
 * `palette:`), or the legacy flat Base16/24 format — validate it, and return an
 * `ImportedScheme` the store can load plus human-readable warnings.
 */

import { hexToRgb, luminance, normalizeHex } from "./color";
import { slugify } from "./slug";
import { BASE16_SLOTS, BASE24_EXTRA_SLOTS, BASE24_SLOTS } from "./tables";
import type { ImportedScheme, Meta, Variant } from "./types";

export type ImportResult =
  | { ok: true; scheme: ImportedScheme; warnings: string[] }
  | { ok: false; errors: string[] };

/** Cap on listed warnings so a junk document can't flood the dialog. */
export const MAX_WARNINGS = 12;

type Doc = Record<string, unknown>;
type BaseFlavor = "base16" | "base24";

const SLOT_KEY = /^base[0-9a-f]{2}$/i;
const BASE_KEYS = new Set(["system", "name", "slug", "author", "variant", "description", "palette"]);
const LEGACY_KEYS = new Set(["scheme", "slug", "author", "variant", "description"]);
const LABELS: Record<BaseFlavor, string> = { base16: "Base16", base24: "Base24" };
const UNRECOGNIZED =
  "Unrecognized scheme format — expected Base16/Base24 (system + palette), " +
  "Tinted8 (a scheme: mapping), or legacy Base16 (top-level base00…).";

function isObj(v: unknown): v is Doc {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A scalar as trimmed text ("" for null/absent/non-scalars). */
function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** Collects errors (block the import) and warnings (shown, import allowed). */
class Report {
  errors: string[] = [];
  warnings: string[] = [];
  private dropped = 0;

  error(msg: string): void {
    this.errors.push(msg);
  }

  warn(msg: string): void {
    if (this.warnings.length < MAX_WARNINGS) this.warnings.push(msg);
    else this.dropped++;
  }

  result(scheme: ImportedScheme): ImportResult {
    if (this.errors.length) return { ok: false, errors: this.errors };
    const warnings = this.dropped
      ? [...this.warnings, `…and ${this.dropped} more warning(s)`]
      : this.warnings;
    return { ok: true, scheme, warnings };
  }
}

/** Parse one color value. Accepts "#rrggbb", "rrggbb" and "#rgb"; rejects alpha. */
export function coerceHex(v: unknown): { hex: string } | { error: string } {
  const s = text(v);
  if (!s) return { error: "missing value" };
  if (/^#?[0-9a-f]{8}$/i.test(s)) return { error: `"${s}" has an alpha channel — use #rrggbb` };
  const hex = normalizeHex(s);
  return hex ? { hex } : { error: `"${s}" is not a hex color` };
}

/**
 * Whether a background reads as a light theme. Threshold is relative luminance
 * 0.18 (≈ L* 50, the perceptual midpoint between black and white).
 */
export function isLightBackground(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return luminance({ r: r / 255, g: g / 255, b: b / 255 }) > 0.18;
}

function readVariant(raw: unknown, background: string | undefined, r: Report): Variant {
  const s = text(raw).toLowerCase();
  if (s === "dark" || s === "light") return s;
  if (s) {
    r.error(`variant must be "dark" or "light" (got "${text(raw)}")`);
    return "dark";
  }
  const inferred: Variant = background && isLightBackground(background) ? "light" : "dark";
  r.warn(`No variant given — inferred "${inferred}" from the background color.`);
  return inferred;
}

function requireName(name: string, r: Report): string {
  if (name) return name;
  r.warn('No name given — using "Untitled".');
  return "Untitled";
}

function readAuthor(raw: unknown, r: Report): string {
  const author = text(raw);
  if (!author) r.warn("No author given — add one before exporting.");
  return author;
}

function checkSlug(raw: unknown, name: string, r: Report): void {
  const slug = text(raw);
  if (slug && slug !== slugify(name)) {
    r.warn(`Slug "${slug}" ignored — the Studio derives "${slugify(name)}" from the name.`);
  }
}

/**
 * Read every Base16/24 slot from `src` (case-insensitive keys). Non-slot keys
 * are left to the caller; slot-shaped keys the flavor lacks are warned about.
 */
function readBaseSlots(src: Doc, flavor: BaseFlavor, r: Report): Record<string, string> {
  const slots = (flavor === "base16" ? BASE16_SLOTS : BASE24_SLOTS).map(([k]) => k);
  const byLower = new Map(slots.map((k) => [k.toLowerCase(), k]));
  const palette: Record<string, string> = {};
  const seen = new Set<string>();
  for (const key of Object.keys(src)) {
    if (!SLOT_KEY.test(key)) continue;
    const slot = byLower.get(key.toLowerCase());
    if (!slot) {
      r.warn(`Ignored ${key} — not a ${LABELS[flavor]} slot.`);
      continue;
    }
    seen.add(slot);
    const res = coerceHex(src[key]);
    if ("error" in res) r.error(`${slot}: ${res.error}`);
    else palette[slot] = res.hex;
  }
  const missing = slots.filter((k) => !seen.has(k));
  if (missing.length) {
    r.error(`Missing ${missing.length === 1 ? "slot" : "slots"}: ${missing.join(", ")}`);
  }
  return palette;
}

function baseMeta(name: string, doc: Doc, background: string | undefined, r: Report): Meta {
  const finalName = requireName(name, r);
  checkSlug(doc.slug, finalName, r);
  return {
    name: finalName,
    author: readAuthor(doc.author, r),
    slug: slugify(finalName),
    description: text(doc.description),
    variant: readVariant(doc.variant, background, r),
  };
}

function parseModernBase(doc: Doc, flavor: BaseFlavor): ImportResult {
  const r = new Report();
  const src = doc.palette as Doc;
  for (const k of Object.keys(doc)) if (!BASE_KEYS.has(k)) r.warn(`Ignored unknown key "${k}".`);
  for (const k of Object.keys(src)) {
    if (!SLOT_KEY.test(k)) r.warn(`Ignored unknown palette key "${k}".`);
  }
  const palette = readBaseSlots(src, flavor, r);
  const meta = baseMeta(text(doc.name), doc, palette.base00, r);
  return r.result({ system: flavor, meta, palette });
}

function parseLegacyBase(doc: Doc): ImportResult {
  const r = new Report();
  const keys = Object.keys(doc).map((k) => k.toLowerCase());
  const flavor: BaseFlavor = BASE24_EXTRA_SLOTS.some(([k]) => keys.includes(k.toLowerCase()))
    ? "base24"
    : "base16";
  for (const k of Object.keys(doc)) {
    if (!LEGACY_KEYS.has(k) && !SLOT_KEY.test(k)) r.warn(`Ignored unknown key "${k}".`);
  }
  const palette = readBaseSlots(doc, flavor, r);
  const meta = baseMeta(text(doc.scheme), doc, palette.base00, r);
  return r.result({ system: flavor, meta, palette });
}

/** Normalize a parsed YAML document into an importable scheme. */
export function parseSchemeDocument(doc: unknown): ImportResult {
  if (!isObj(doc)) {
    return { ok: false, errors: ["Expected a YAML mapping (key: value pairs) at the top level."] };
  }
  const system = text(doc.system).toLowerCase();
  if (system === "base16" || system === "base24") {
    if (!isObj(doc.palette)) return { ok: false, errors: ["Missing palette: mapping."] };
    return parseModernBase(doc, system);
  }
  if (system) {
    return {
      ok: false,
      errors: [`Unsupported system "${text(doc.system)}" — expected base16, base24 or tinted8.`],
    };
  }
  if (typeof doc.scheme === "string" || Object.keys(doc).some((k) => SLOT_KEY.test(k))) {
    return parseLegacyBase(doc);
  }
  return { ok: false, errors: [UNRECOGNIZED] };
}
```

- [ ] **Step 5: Export from the core barrel**

In `src/core/index.ts`, add after `export * from "./schemes";`:

```ts
export * from "./import";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/core/import.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Full check and commit**

Run: `npm run check`
Expected: typecheck, lint, and all tests pass.

```bash
git add src/core/types.ts src/core/import.ts src/core/import.test.ts src/core/index.ts
git commit -m "feat(core): normalize imported Base16/Base24 scheme documents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Core import — Tinted8

**Files:**
- Modify: `src/core/import.ts`
- Modify: `src/core/import.test.ts`

**Interfaces:**
- Consumes: Task 1's `Report`, `text`, `isObj`, `coerceHex`, `readVariant`, `requireName`, `readAuthor`, `checkSlug` (module-private in `import.ts`); `ALL11`, `BASE8`, `DERIVE_VARIANTS`, `SUPPLEMENTAL`, `UI_KEYS`, `SYNTAX_KEYS` from `tables.ts`.
- Produces: `parseSchemeDocument` now returns `{ system: "tinted8", meta (with family/style), palette (8 normals), overrides: { palette, ui, syntax } }` for Tinted8 docs.

- [ ] **Step 1: Write the failing tests**

Append to `src/core/import.test.ts` (add `DEFAULT_TINTED8` to the existing `./tables` import):

```ts
const t8 = (): Record<string, unknown> => ({
  scheme: {
    system: "tinted8",
    supports: { "styling-spec": "0.2.0" },
    author: "Me",
    name: "Tee Eight",
  },
  variant: "dark",
  palette: { ...DEFAULT_TINTED8 },
});

describe("parseSchemeDocument — Tinted8", () => {
  it("parses the minimal form with empty overrides", () => {
    const res = ok(parseSchemeDocument(t8()));
    expect(res.warnings).toEqual([]);
    expect(res.scheme).toEqual({
      system: "tinted8",
      meta: {
        name: "Tee Eight",
        author: "Me",
        slug: "tee-eight",
        description: "",
        variant: "dark",
        family: "",
        style: "",
      },
      palette: DEFAULT_TINTED8,
      overrides: { palette: {}, ui: {}, syntax: {} },
    });
  });

  it("maps supplementals and dim/bright to palette overrides, keeping orange-dim", () => {
    const doc = t8();
    Object.assign(doc.palette as object, {
      orange: "#FF8800",
      "gray-normal": "#777777",
      "red-dim": "#aa0000",
      "orange-dim": "#cc6600",
    });
    const res = ok(parseSchemeDocument(doc));
    expect(res.scheme.overrides!.palette).toEqual({
      orange: "#ff8800",
      gray: "#777777",
      "red-dim": "#aa0000",
      "orange-dim": "#cc6600",
    });
  });

  it("accepts <color>-normal for base colors", () => {
    const doc = t8();
    const pal = doc.palette as Record<string, string>;
    pal["black-normal"] = pal.black!;
    delete pal.black;
    expect(ok(parseSchemeDocument(doc)).scheme.palette.black).toBe(DEFAULT_TINTED8.black);
  });

  it("errors on a missing base color", () => {
    const doc = t8();
    delete (doc.palette as Record<string, string>).cyan;
    expect(errs(parseSchemeDocument(doc))).toContain("Missing base color: cyan");
  });

  it("reads flat and nested ui/syntax, mapping .default to the parent key", () => {
    const doc = t8();
    doc.ui = { global: { background: { normal: "#101010" } } };
    doc.syntax = {
      "entity.name.function": "#0000FF",
      string: { default: "#010101", regexp: "#020202" },
    };
    const ov = ok(parseSchemeDocument(doc)).scheme.overrides!;
    expect(ov.ui).toEqual({ "global.background.normal": "#101010" });
    expect(ov.syntax).toEqual({
      "entity.name.function": "#0000ff",
      string: "#010101",
      "string.regexp": "#020202",
    });
  });

  it("warns on unknown keys and errors on bad token values", () => {
    const doc = t8();
    (doc.scheme as Record<string, unknown>).mood = "happy";
    (doc.palette as Record<string, string>).teal = "#008080";
    doc.ui = { "not.a.key": "#000000" };
    doc.extra = 1;
    const w = ok(parseSchemeDocument(doc)).warnings.join("\n");
    expect(w).toMatch(/scheme\.mood/);
    expect(w).toMatch(/"teal"/);
    expect(w).toMatch(/ui key "not\.a\.key"/);
    expect(w).toMatch(/"extra"/);

    const bad = t8();
    bad.syntax = { string: "#nothex" };
    expect(errs(parseSchemeDocument(bad))[0]).toMatch(/^syntax\.string: /);
    const notMap = t8();
    notMap.ui = "red";
    expect(errs(parseSchemeDocument(notMap))[0]).toMatch(/ui: expected a mapping/);
  });

  it("falls back to family + style, then slug, for the name", () => {
    const doc = t8();
    const head = doc.scheme as Record<string, unknown>;
    delete head.name;
    head.family = "Ayu";
    head.style = "Mirage";
    const res = ok(parseSchemeDocument(doc));
    expect(res.scheme.meta).toMatchObject({ name: "Ayu Mirage", family: "Ayu", style: "Mirage" });
    delete head.family;
    delete head.style;
    head.slug = "ayu-mirage";
    expect(ok(parseSchemeDocument(doc)).scheme.meta.name).toBe("ayu-mirage");
  });

  it("infers variant from black when missing", () => {
    const doc = t8();
    delete doc.variant;
    (doc.palette as Record<string, string>).black = "#fafafa";
    expect(ok(parseSchemeDocument(doc)).scheme.meta.variant).toBe("light");
  });

  it("rejects other scheme.system values", () => {
    const doc = t8();
    (doc.scheme as Record<string, unknown>).system = "base16";
    expect(errs(parseSchemeDocument(doc))[0]).toMatch(/Unsupported scheme\.system/);
  });

  it("survives self-referential and wide-alias maps", () => {
    const self: Record<string, unknown> = {};
    self.global = self;
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 12; i++) wide[`k${i}`] = wide;
    const a = t8();
    a.ui = self;
    a.syntax = wide;
    const res = ok(parseSchemeDocument(a));
    expect(res.warnings.join("\n")).toMatch(/nested too deeply|too many entries/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/import.test.ts`
Expected: FAIL — Tinted8 tests fail with `Unrecognized scheme format` / `Unsupported scheme.system` messages (the dispatch doesn't know Tinted8 yet); Task 1 tests still pass.

- [ ] **Step 3: Implement Tinted8 parsing**

In `src/core/import.ts`, change the tables import to:

```ts
import {
  ALL11,
  BASE16_SLOTS,
  BASE24_EXTRA_SLOTS,
  BASE24_SLOTS,
  BASE8,
  DERIVE_VARIANTS,
  SUPPLEMENTAL,
  SYNTAX_KEYS,
  UI_KEYS,
} from "./tables";
import type { ImportedScheme, Meta, Tinted8Overrides, Variant } from "./types";
```

Add below the `UNRECOGNIZED` constant:

```ts
const T8_HEAD_KEYS = new Set([
  "system",
  "supports",
  "author",
  "name",
  "slug",
  "family",
  "style",
  "description",
]);
const T8_TOP_KEYS = new Set(["scheme", "variant", "palette", "syntax", "ui"]);
const UI_KEY_SET = new Set(UI_KEYS);
const SYNTAX_KEY_SET = new Set(SYNTAX_KEYS);
/** Nesting + size guards for ui/syntax maps (YAML anchors can self-reference). */
const MAX_DEPTH = 8;
const MAX_TOKEN_NODES = 2000;
```

Add these functions above `parseSchemeDocument`:

```ts
/**
 * Flatten nested token maps to dotted paths:
 * `{ global: { background: { normal: x } } }` → `[["global.background.normal", x]]`.
 * Bounded by depth and node count so self-referential anchors terminate.
 */
function flattenTokens(src: Doc): {
  entries: Array<[string, unknown]>;
  tooDeep: string[];
  truncated: boolean;
} {
  const entries: Array<[string, unknown]> = [];
  const tooDeep: string[] = [];
  let nodes = 0;
  let truncated = false;
  const walk = (node: Doc, prefix: string, depth: number): void => {
    for (const [k, v] of Object.entries(node)) {
      if (++nodes > MAX_TOKEN_NODES) {
        truncated = true;
        return;
      }
      const path = prefix ? `${prefix}.${k}` : k;
      if (!isObj(v)) entries.push([path, v]);
      else if (depth >= MAX_DEPTH) tooDeep.push(path);
      else walk(v, path, depth + 1);
    }
  };
  walk(src, "", 0);
  return { entries, tooDeep, truncated };
}

function readTokens(
  src: unknown,
  section: "ui" | "syntax",
  known: Set<string>,
  target: Record<string, string>,
  r: Report,
): void {
  if (src === undefined || src === null || src === "") return;
  if (!isObj(src)) {
    r.error(`${section}: expected a mapping.`);
    return;
  }
  const { entries, tooDeep, truncated } = flattenTokens(src);
  for (const path of tooDeep) r.warn(`Ignored ${section}.${path} — nested too deeply.`);
  if (truncated) r.warn(`Stopped reading ${section} — too many entries.`);
  for (const [path, value] of entries) {
    // A nested parent's own value may be written as `<key>.default`.
    const parent = path.endsWith(".default") ? path.slice(0, -".default".length) : null;
    const key = parent && known.has(parent) ? parent : path;
    if (!known.has(key)) {
      r.warn(`Ignored unknown ${section} key "${path}".`);
      continue;
    }
    const res = coerceHex(value);
    if ("error" in res) r.error(`${section}.${path}: ${res.error}`);
    else target[key] = res.hex;
  }
}

function readTinted8Palette(
  src: Doc,
  palette: Record<string, string>,
  overrides: Record<string, string>,
  r: Report,
): void {
  const used = new Set<string>();
  /** First present key wins; every present alias counts as used. */
  const take = (keys: string[]): unknown => {
    let value: unknown;
    for (const k of keys) {
      if (!Object.hasOwn(src, k)) continue;
      used.add(k);
      if (value === undefined) value = src[k];
    }
    return value;
  };
  const put = (key: string, raw: unknown, target: Record<string, string>): void => {
    const res = coerceHex(raw);
    if ("error" in res) r.error(`palette.${key}: ${res.error}`);
    else target[key] = res.hex;
  };

  const missing: string[] = [];
  for (const c of BASE8) {
    const v = take([c, `${c}-normal`]);
    if (v === undefined) missing.push(c);
    else put(c, v, palette);
  }
  if (missing.length) {
    r.error(`Missing base ${missing.length === 1 ? "color" : "colors"}: ${missing.join(", ")}`);
  }
  for (const c of SUPPLEMENTAL) {
    const v = take([c, `${c}-normal`]);
    if (v !== undefined) put(c, v, overrides);
  }
  // Authored dim/bright values are kept as-is — including orange-dim (the
  // SPEC §10 skip only applies to expanded snapshot data).
  for (const c of ALL11) {
    for (const dv of DERIVE_VARIANTS) {
      const key = `${c}-${dv}`;
      const v = take([key]);
      if (v !== undefined) put(key, v, overrides);
    }
  }
  for (const k of Object.keys(src)) {
    if (!used.has(k)) r.warn(`Ignored unknown palette key "${k}".`);
  }
}

function parseTinted8(doc: Doc): ImportResult {
  const r = new Report();
  const head = doc.scheme as Doc;
  for (const k of Object.keys(head)) {
    if (!T8_HEAD_KEYS.has(k)) r.warn(`Ignored unknown key "scheme.${k}".`);
  }
  for (const k of Object.keys(doc)) {
    if (!T8_TOP_KEYS.has(k)) r.warn(`Ignored unknown key "${k}".`);
  }

  const palette: Record<string, string> = {};
  const overrides: Tinted8Overrides = { palette: {}, ui: {}, syntax: {} };
  if (isObj(doc.palette)) readTinted8Palette(doc.palette, palette, overrides.palette, r);
  else r.error("Missing palette: mapping (the 8 base colors are required).");
  readTokens(doc.ui, "ui", UI_KEY_SET, overrides.ui, r);
  readTokens(doc.syntax, "syntax", SYNTAX_KEY_SET, overrides.syntax, r);

  const family = text(head.family);
  const style = text(head.style);
  const name = requireName(
    text(head.name) || [family, style].filter(Boolean).join(" ") || text(head.slug),
    r,
  );
  checkSlug(head.slug, name, r);
  const meta: Meta = {
    name,
    author: readAuthor(head.author, r),
    slug: slugify(name),
    description: text(head.description),
    variant: readVariant(doc.variant, palette.black, r),
    family,
    style,
  };
  return r.result({ system: "tinted8", meta, palette, overrides });
}
```

In `parseSchemeDocument`, insert right after the `isObj(doc)` guard:

```ts
  if (isObj(doc.scheme)) {
    if (text(doc.scheme.system).toLowerCase() === "tinted8") return parseTinted8(doc);
    return {
      ok: false,
      errors: [`Unsupported scheme.system "${text(doc.scheme.system)}" — expected "tinted8".`],
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/import.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check and commit**

Run: `npm run check`
Expected: all green.

```bash
git add src/core/import.ts src/core/import.test.ts
git commit -m "feat(core): normalize imported Tinted8 scheme documents

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: GitHub URL normalization + `#url=` hash helpers

**Files:**
- Create: `src/core/githubUrl.ts`
- Create: `src/core/githubUrl.test.ts`
- Modify: `src/core/index.ts`
- Modify: `src/state/deeplink.ts`
- Create: `src/state/deeplink.test.ts`
- Modify: `src/ui/App.tsx` (swap `hashId` → `parseHash`)
- Modify: `src/ui/components/EditorToolbar.tsx` (use `restoreHash`)

**Interfaces:**
- Produces:
  - `toGithubRawUrl(input: string): { ok: true; url: string } | { ok: false; error: string }` (core)
  - `type HashTarget = { kind: "id"; id: string } | { kind: "url"; url: string }`
  - `parseHashString(hash: string): HashTarget | null`, `parseHash(): HashTarget | null`
  - `setUrlHash(rawUrl: string): void`
  - `restoreHash(loadedFrom: string | null | undefined): void` — `"url:<raw>"` → `#url=…`, id → `#id`, else clears
  - `buildShareLink(pageUrl: string, rawUrl: string): string`
  - `URL_ORIGIN_PREFIX = "url:"`
- Removes: `hashId()` (only `App.tsx` used it).

- [ ] **Step 1: Write the failing tests**

Create `src/core/githubUrl.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toGithubRawUrl } from "./githubUrl";

const RAW = "https://raw.githubusercontent.com";

describe("toGithubRawUrl", () => {
  it("converts blob and raw file links to raw.githubusercontent.com", () => {
    expect(toGithubRawUrl("https://github.com/o/r/blob/main/base16/a.yaml")).toEqual({
      ok: true,
      url: `${RAW}/o/r/main/base16/a.yaml`,
    });
    expect(toGithubRawUrl("https://github.com/o/r/raw/main/a.yaml")).toEqual({
      ok: true,
      url: `${RAW}/o/r/main/a.yaml`,
    });
  });
  it("strips query and hash from blob links, upgrades http, trims input", () => {
    expect(toGithubRawUrl("  http://www.github.com/o/r/blob/main/a.yaml?plain=1#L3 ")).toEqual({
      ok: true,
      url: `${RAW}/o/r/main/a.yaml`,
    });
  });
  it("keeps slashed refs and encoded paths", () => {
    expect(toGithubRawUrl("https://github.com/o/r/blob/feat/x/schemes/a%20b.yaml")).toEqual({
      ok: true,
      url: `${RAW}/o/r/feat/x/schemes/a%20b.yaml`,
    });
  });
  it("passes raw and gist raw URLs through (minus the hash)", () => {
    expect(toGithubRawUrl(`${RAW}/o/r/main/a.yaml#x`)).toEqual({
      ok: true,
      url: `${RAW}/o/r/main/a.yaml`,
    });
    const gist = "https://gist.githubusercontent.com/u/abc123/raw/def/a.yaml";
    expect(toGithubRawUrl(gist)).toEqual({ ok: true, url: gist });
  });
  it("rejects non-URLs, other hosts, and non-file GitHub links", () => {
    for (const bad of [
      "not a url",
      "ftp://github.com/o/r/blob/main/a.yaml",
      "https://gitlab.com/o/r/-/blob/main/a.yaml",
      "https://github.com/o/r",
      "https://github.com/o/r/tree/main/base16",
      "https://github.com/o/r/pull/12/files",
      "https://github.com/o/r/blob/main",
    ]) {
      const res = toGithubRawUrl(bad);
      expect(res.ok, bad).toBe(false);
    }
  });
});
```

Create `src/state/deeplink.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildShareLink, parseHashString } from "./deeplink";

describe("parseHashString", () => {
  it("returns null for an empty hash", () => {
    expect(parseHashString("")).toBeNull();
    expect(parseHashString("#")).toBeNull();
    expect(parseHashString("#url=")).toBeNull();
  });
  it("parses scheme ids", () => {
    expect(parseHashString("#base16-ayu-dark")).toEqual({ kind: "id", id: "base16-ayu-dark" });
  });
  it("parses encoded url targets", () => {
    const raw = "https://raw.githubusercontent.com/o/r/main/a b.yaml";
    expect(parseHashString(`#url=${encodeURIComponent(raw)}`)).toEqual({ kind: "url", url: raw });
  });
  it("ignores malformed percent-encoding", () => {
    expect(parseHashString("#url=%E0%A4%A")).toBeNull();
    expect(parseHashString("#%E0%A4%A")).toBeNull();
  });
});

describe("buildShareLink", () => {
  it("replaces any existing hash with #url=<encoded raw url>", () => {
    const raw = "https://raw.githubusercontent.com/o/r/main/a.yaml";
    expect(buildShareLink("https://tinted-studio.bez.dev/#base16-x", raw)).toBe(
      `https://tinted-studio.bez.dev/#url=${encodeURIComponent(raw)}`,
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/githubUrl.test.ts src/state/deeplink.test.ts`
Expected: FAIL — `./githubUrl` unresolved; `parseHashString`/`buildShareLink` not exported.

- [ ] **Step 3: Implement `src/core/githubUrl.ts`**

```ts
/**
 * GitHub URL normalization for scheme import. Only GitHub file URLs are
 * accepted (an allowlist, so shared `#url=` links can't make a viewer's browser
 * hit arbitrary hosts). Blob/raw page links become raw.githubusercontent.com
 * URLs, which serve the file with permissive CORS.
 */

export type GithubUrlResult = { ok: true; url: string } | { ok: false; error: string };

const ACCEPTED =
  "Use a GitHub file link (github.com/<owner>/<repo>/blob/<branch>/<path>) or a " +
  "raw.githubusercontent.com / gist.githubusercontent.com URL.";

const RAW_HOSTS = new Set(["raw.githubusercontent.com", "gist.githubusercontent.com"]);
const PAGE_HOSTS = new Set(["github.com", "www.github.com"]);

export function toGithubRawUrl(input: string): GithubUrlResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error: `That isn't a valid URL. ${ACCEPTED}` };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: `Only https links are supported. ${ACCEPTED}` };
  }
  const host = url.hostname.toLowerCase();
  if (RAW_HOSTS.has(host)) {
    url.protocol = "https:";
    url.hash = "";
    return { ok: true, url: url.toString() };
  }
  if (PAGE_HOSTS.has(host)) {
    // /<owner>/<repo>/(blob|raw)/<ref…>/<path…> — at least one path segment after the ref.
    const parts = url.pathname.split("/").filter(Boolean);
    const [owner, repo, kind, ...rest] = parts;
    if (owner && repo && (kind === "blob" || kind === "raw") && rest.length >= 2) {
      return {
        ok: true,
        url: `https://raw.githubusercontent.com/${owner}/${repo}/${rest.join("/")}`,
      };
    }
    return { ok: false, error: `That GitHub link doesn't point to a file. ${ACCEPTED}` };
  }
  return { ok: false, error: `Only GitHub URLs are supported. ${ACCEPTED}` };
}
```

In `src/core/index.ts`, add after `export * from "./import";`:

```ts
export * from "./githubUrl";
```

- [ ] **Step 4: Rewrite `src/state/deeplink.ts`**

Replace the whole file with:

```ts
/**
 * Deep-linking helpers (SPEC §3.7). Two hash forms:
 *  - `#<scheme-id>` — load a scheme from the bundled snapshot.
 *  - `#url=<encoded raw GitHub URL>` — fetch + import a scheme (YAML import spec).
 * Editing clears the hash so a reload restores the user's own work.
 */

export type HashTarget = { kind: "id"; id: string } | { kind: "url"; url: string };

/** `loadedFrom` prefix marking a workspace imported from a GitHub URL. */
export const URL_ORIGIN_PREFIX = "url:";

const URL_HASH_PREFIX = "url=";

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** Parse a `location.hash` string. Malformed encodings are ignored (null). */
export function parseHashString(hash: string): HashTarget | null {
  const raw = hash.replace(/^#/, "");
  if (!raw) return null;
  if (raw.startsWith(URL_HASH_PREFIX)) {
    const url = safeDecode(raw.slice(URL_HASH_PREFIX.length))?.trim();
    return url ? { kind: "url", url } : null;
  }
  const id = safeDecode(raw)?.trim();
  return id ? { kind: "id", id } : null;
}

export function parseHash(): HashTarget | null {
  if (typeof location === "undefined") return null;
  return parseHashString(location.hash);
}

function replaceHash(fragment: string): void {
  if (typeof location === "undefined" || typeof history === "undefined") return;
  const url = new URL(location.href);
  url.hash = fragment;
  history.replaceState(null, "", url);
}

export function setHash(id: string): void {
  replaceHash(id ? encodeURIComponent(id) : "");
}

export function setUrlHash(rawUrl: string): void {
  replaceHash(URL_HASH_PREFIX + encodeURIComponent(rawUrl));
}

/** Point the hash at whatever a workspace was loaded from (or clear it). */
export function restoreHash(loadedFrom: string | null | undefined): void {
  if (loadedFrom?.startsWith(URL_ORIGIN_PREFIX)) {
    setUrlHash(loadedFrom.slice(URL_ORIGIN_PREFIX.length));
  } else {
    setHash(loadedFrom || "");
  }
}

/** A shareable Studio link that imports `rawUrl` on open. */
export function buildShareLink(pageUrl: string, rawUrl: string): string {
  const url = new URL(pageUrl);
  url.hash = URL_HASH_PREFIX + encodeURIComponent(rawUrl);
  return url.toString();
}
```

- [ ] **Step 5: Update callers**

In `src/ui/App.tsx`:
- Change the import to `import { parseHash, restoreHash, setHash } from "../state/deeplink";`
- In the library deep-link effect, replace

```ts
      const id = hashId();
      if (!id) return;
```

with

```ts
      const target = parseHash();
      if (target?.kind !== "id") return;
      const id = target.id;
```

- Replace the cancel branch

```ts
        setHash(useStore.getState()[useStore.getState().flavor].loadedFrom || "");
```

with

```ts
        restoreHash(useStore.getState()[useStore.getState().flavor].loadedFrom);
```

In `src/ui/components/EditorToolbar.tsx`:
- Change the import to `import { restoreHash, setHash } from "../../state/deeplink";`
- Replace `setHash(useStore.getState()[flavor].loadedFrom || "");` with `restoreHash(useStore.getState()[flavor].loadedFrom);`

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/core/githubUrl.test.ts src/state/deeplink.test.ts`
Expected: PASS.

- [ ] **Step 7: Full check and commit**

Run: `npm run check`
Expected: all green (no remaining `hashId` references — confirm with `grep -rn hashId src` → no output).

```bash
git add src/core/githubUrl.ts src/core/githubUrl.test.ts src/core/index.ts src/state/deeplink.ts src/state/deeplink.test.ts src/ui/App.tsx src/ui/components/EditorToolbar.tsx
git commit -m "feat: GitHub raw-URL normalization and #url= hash helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: YAML parse + fetch pipeline (`js-yaml`)

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)
- Modify: `vite.config.ts` (add `js-yaml` to third-party notices)
- Create: `src/ui/importYaml.ts`
- Create: `src/ui/importYaml.test.ts`

**Interfaces:**
- Consumes: `parseSchemeDocument`, `ImportResult` (Task 1–2); `toGithubRawUrl` (Task 3).
- Produces:
  - `MAX_IMPORT_BYTES = 256 * 1024`, `FETCH_TIMEOUT_MS = 10_000`
  - `parseYamlText(text: string): Promise<ImportResult>`
  - `fetchSchemeText(rawUrl: string, fetchImpl?: typeof fetch): Promise<{ ok: true; text: string } | { ok: false; error: string }>`
  - `importFromUrl(input: string, fetchImpl?: typeof fetch): Promise<{ rawUrl: string | null; result: ImportResult }>`

- [ ] **Step 1: Install the dependency**

Run: `npm i js-yaml@^4.1.0 && npm i -D @types/js-yaml@^4.0.9`
Expected: `package.json` gains `"js-yaml": "^4.x"` under dependencies and `"@types/js-yaml"` under devDependencies.

In `vite.config.ts`, change

```ts
  const deps = ["colorthief", "react", "react-dom", "zustand"];
```

to

```ts
  const deps = ["colorthief", "js-yaml", "react", "react-dom", "zustand"];
```

- [ ] **Step 2: Write the failing tests**

Create `src/ui/importYaml.test.ts`:

```ts
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
        meta: { name: 'Q "uoted" \\ name', author: "Me", slug: "", description: "d", variant: "light" },
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
          meta: { name: e.name, author: e.author, slug: "", description: "", variant: normalizeVariant(e.variant) },
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
    const body = await fetchSchemeText("https://x/a.yaml", fakeFetch("a".repeat(MAX_IMPORT_BYTES + 1)));
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/ui/importYaml.test.ts`
Expected: FAIL — `Failed to resolve import "./importYaml"`.

- [ ] **Step 4: Implement `src/ui/importYaml.ts`**

```ts
/**
 * YAML import I/O adapter (UI layer). Turns pasted text or a GitHub URL into an
 * `ImportResult`: fetch (bounded) → js-yaml (lazy, FAILSAFE schema) → the pure
 * `parseSchemeDocument`. No store access here — see `./import.ts` for applying.
 */

import { parseSchemeDocument, toGithubRawUrl, type ImportResult } from "../core";

export const MAX_IMPORT_BYTES = 256 * 1024;
export const FETCH_TIMEOUT_MS = 10_000;

const TOO_LARGE = `That file is too large (limit ${MAX_IMPORT_BYTES / 1024} KB).`;

/**
 * Parse scheme YAML text. FAILSAFE_SCHEMA keeps every scalar a string, so
 * unquoted legacy hex like `000e00` is never coerced to a number.
 */
export async function parseYamlText(text: string): Promise<ImportResult> {
  if (!text.trim()) return { ok: false, errors: ["Paste some scheme YAML."] };
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: [TOO_LARGE] };
  const { load, FAILSAFE_SCHEMA, YAMLException } = await import("js-yaml");
  let doc: unknown;
  try {
    doc = load(text, { schema: FAILSAFE_SCHEMA });
  } catch (e) {
    if (e instanceof YAMLException) {
      const { line, column } = e.mark;
      return {
        ok: false,
        errors: [`YAML syntax error at line ${line + 1}, column ${column + 1}: ${e.reason}`],
      };
    }
    return { ok: false, errors: [`Couldn't parse YAML: ${(e as Error)?.message ?? String(e)}`] };
  }
  return parseSchemeDocument(doc);
}

/** Fetch a raw scheme file with a timeout and size cap. */
export async function fetchSchemeText(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(rawUrl, { signal: controller.signal });
    if (res.status === 404) {
      return { ok: false, error: "File not found (404). Check the branch and path." };
    }
    if (!res.ok) {
      return { ok: false, error: `GitHub returned ${res.status}${res.statusText ? ` ${res.statusText}` : ""}.` };
    }
    if (Number(res.headers.get("content-length")) > MAX_IMPORT_BYTES) {
      return { ok: false, error: TOO_LARGE };
    }
    const text = await res.text();
    if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: TOO_LARGE };
    return { ok: true, text };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      return { ok: false, error: "Timed out fetching the file." };
    }
    return { ok: false, error: "Couldn't fetch the file (network error or blocked by the browser)." };
  } finally {
    clearTimeout(timer);
  }
}

/** Normalize a GitHub URL, fetch it, and parse it. `rawUrl` is null if the URL was rejected. */
export async function importFromUrl(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ rawUrl: string | null; result: ImportResult }> {
  const norm = toGithubRawUrl(input);
  if (!norm.ok) return { rawUrl: null, result: { ok: false, errors: [norm.error] } };
  const fetched = await fetchSchemeText(norm.url, fetchImpl);
  if (!fetched.ok) return { rawUrl: norm.url, result: { ok: false, errors: [fetched.error] } };
  return { rawUrl: norm.url, result: await parseYamlText(fetched.text) };
}
```

Note: `@types/js-yaml` types `YAMLException.mark` as `Mark` with 0-based `line`/`column`. If `tsc` reports `mark` as possibly undefined, use `const { line = 0, column = 0 } = e.mark ?? {};`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/ui/importYaml.test.ts`
Expected: PASS. If the alias-bomb test instead fails on a js-yaml error (e.g. an alias expansion limit), that is also acceptable behavior — change that test's assertion to accept either `res.ok === false` with a YAML error or the "too many entries" warning, and note it in the commit message.

- [ ] **Step 6: Full check and commit**

Run: `npm run check`
Expected: all green.

```bash
git add package.json package-lock.json vite.config.ts src/ui/importYaml.ts src/ui/importYaml.test.ts
git commit -m "feat: YAML text + GitHub fetch import pipeline (js-yaml, FAILSAFE)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Store — `loadImported`, `baseline`, Reset-to-baseline

**Files:**
- Modify: `src/state/store.ts`
- Create: `src/state/store.test.ts`
- Modify: `src/ui/components/EditorToolbar.tsx` (Reset prompt uses baseline)

**Interfaces:**
- Consumes: `ImportedScheme` (Task 1), `DEFAULT_TINTED8`.
- Produces: `StudioState.loadImported(scheme: ImportedScheme, origin: string | null): void`. `reset()` restores `baseline` when present. `loadScheme`/`applyExtractedScheme`/`clearAll` clear `baseline`. `mergeData` keeps a persisted `baseline` whose `system` matches its workspace.

- [ ] **Step 1: Write the failing tests**

Create `src/state/store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BASE16,
  DEFAULT_BASE24,
  DEFAULT_TINTED8,
  paletteRowDescriptors,
  type ImportedScheme,
  type SchemeEntry,
} from "../core";
import { freshData, mergeData, useStore } from "./store";

function resetStore() {
  useStore.setState({
    ...freshData(),
    undoStack: [],
    redoStack: [],
    coalesceKey: null,
    canUndo: false,
    canRedo: false,
    invalidSlots: new Set(),
  });
}

const imported24 = (): ImportedScheme => ({
  system: "base24",
  meta: { name: "Imported", author: "Ann", slug: "imported", description: "", variant: "light" },
  palette: { ...DEFAULT_BASE24, base08: "#ff0000" },
});

const importedT8 = (): ImportedScheme => ({
  system: "tinted8",
  meta: {
    name: "T8",
    author: "Ann",
    slug: "t8",
    description: "",
    variant: "dark",
    family: "F",
    style: "S",
  },
  palette: { ...DEFAULT_TINTED8, red: "#ee0000" },
  overrides: { palette: { "orange-dim": "#884400" }, ui: {}, syntax: { string: "#00ff00" } },
});

const base08 = () => paletteRowDescriptors("base24").find((d) => d.fullKey === "base08")!;

beforeEach(resetStore);

describe("loadImported", () => {
  it("loads into the matching workspace, switches to it, and records a baseline", () => {
    useStore.getState().loadImported(imported24(), "url:https://raw.githubusercontent.com/o/r/m/a.yaml");
    const st = useStore.getState();
    expect(st.flavor).toBe("base24");
    expect(st.base24.palette.base08).toBe("#ff0000");
    expect(st.base24.meta.name).toBe("Imported");
    expect(st.base24.touched).toBe(false);
    expect(st.base24.authorByUser).toBe(false);
    expect(st.base24.loadedFrom).toBe("url:https://raw.githubusercontent.com/o/r/m/a.yaml");
    expect(st.base24.baseline).toEqual(imported24());
    expect(st.canUndo).toBe(true);
  });

  it("loads Tinted8 overrides as authored", () => {
    useStore.getState().loadImported(importedT8(), null);
    const t8 = useStore.getState().tinted8;
    expect(t8.palette.red).toBe("#ee0000");
    expect(t8.overrides).toEqual(importedT8().overrides);
    expect(t8.meta).toMatchObject({ family: "F", style: "S" });
    expect(t8.loadedFrom).toBeNull();
  });

  it("is undoable", () => {
    useStore.getState().loadImported(imported24(), null);
    useStore.getState().undo();
    expect(useStore.getState().base24.palette).toEqual(DEFAULT_BASE24);
    expect(useStore.getState().flavor).toBe("base16");
  });

  it("does not share references with the passed scheme", () => {
    const scheme = imported24();
    useStore.getState().loadImported(scheme, null);
    scheme.palette.base00 = "#123456";
    expect(useStore.getState().base24.palette.base00).toBe(DEFAULT_BASE24.base00);
    expect(useStore.getState().base24.baseline!.palette.base00).toBe(DEFAULT_BASE24.base00);
  });
});

describe("reset with a baseline", () => {
  it("returns an edited import to the imported scheme, not stock", () => {
    useStore.getState().loadImported(imported24(), null);
    useStore.getState().commitSlot(base08(), "#00ff00");
    expect(useStore.getState().base24.touched).toBe(true);
    useStore.getState().reset();
    const ws = useStore.getState().base24;
    expect(ws.palette.base08).toBe("#ff0000");
    expect(ws.touched).toBe(false);
    expect(ws.baseline).toEqual(imported24());
  });

  it("restores Tinted8 overrides", () => {
    useStore.getState().loadImported(importedT8(), null);
    useStore.getState().setMeta("name", "Changed");
    useStore.getState().reset();
    expect(useStore.getState().tinted8.overrides).toEqual(importedT8().overrides);
    expect(useStore.getState().tinted8.meta.name).toBe("T8");
  });

  it("falls back to stock when there is no baseline", () => {
    useStore.getState().setFlavor("base24");
    useStore.getState().commitSlot(base08(), "#00ff00");
    useStore.getState().reset();
    expect(useStore.getState().base24.palette).toEqual(DEFAULT_BASE24);
  });
});

describe("baseline is cleared by other loads", () => {
  it("clearAll drops it", () => {
    useStore.getState().loadImported(imported24(), null);
    useStore.getState().clearAll();
    expect(useStore.getState().base24.baseline ?? null).toBeNull();
    expect(useStore.getState().base24.palette).toEqual(DEFAULT_BASE24);
  });

  it("loadScheme drops it", () => {
    useStore.getState().loadImported(imported24(), null);
    const entry: SchemeEntry = {
      id: "base24-x",
      name: "X",
      author: "Y",
      system: "base24",
      variant: "dark",
      slug: "x",
      palette: Object.fromEntries(
        Object.entries(DEFAULT_BASE24).map(([k, v]) => [k, { hex_str: v }]),
      ),
    };
    useStore.getState().loadScheme(entry);
    expect(useStore.getState().base24.baseline ?? null).toBeNull();
    expect(useStore.getState().base24.loadedFrom).toBe("base24-x");
  });
});

describe("mergeData", () => {
  it("keeps a persisted baseline whose system matches, drops a mismatched one", () => {
    const saved = freshData();
    saved.base24.baseline = imported24();
    saved.base16.baseline = imported24(); // wrong system for base16
    const merged = mergeData(JSON.parse(JSON.stringify(saved)));
    expect(merged.base24.baseline).toEqual(imported24());
    expect(merged.base16.baseline ?? null).toBeNull();
    expect(merged.base16.palette).toEqual(DEFAULT_BASE16);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state/store.test.ts`
Expected: FAIL — `loadImported is not a function` (and baseline assertions).

- [ ] **Step 3: Implement the store changes**

In `src/state/store.ts`:

(a) Add `DEFAULT_TINTED8` is already imported; add `type ImportedScheme` to the `../core` type imports.

(b) In `mergeData`, inside the `for (const flavor of …)` loop, after `target.authorByUser = Boolean(w.authorByUser);` add:

```ts
    const baseline = w.baseline as ImportedScheme | null | undefined;
    if (baseline && typeof baseline === "object" && baseline.system === flavor) {
      target.baseline = baseline;
    }
```

(c) In the `StudioState` interface, after `loadScheme`, add:

```ts
  /** Load an imported (pasted / fetched) scheme into its workspace; records it as the Reset baseline. */
  loadImported: (scheme: ImportedScheme, origin: string | null) => void;
```

(d) Replace the `reset` action with:

```ts
    reset: () => {
      const flavor = get().flavor;
      const baseline = get()[flavor].baseline;
      pushHistory(`reset:${flavor}`);
      mutateActive((data) => {
        // An imported workspace resets to what was imported, not to stock.
        if (baseline) applyImported(data, baseline, data[flavor].loadedFrom);
        else resetWorkspace(data, flavor);
      }, false);
      set({ invalidSlots: new Set() });
    },
```

(e) Add the action after `loadScheme`:

```ts
    loadImported: (scheme, origin) => {
      pushHistory(null);
      const data = clone(pickData(get()));
      applyImported(data, scheme, origin);
      saveData(data);
      set({ ...data, invalidSlots: new Set(), coalesceKey: null });
    },
```

(f) In `applyEntry`, clear the baseline in both branches: add `ws.baseline = null;` after `ws.authorByUser = false;` (Base16/24 branch) and `t8.baseline = null;` after `t8.authorByUser = false;` (Tinted8 branch).

(g) Add the helper after `applyEntry`:

```ts
/**
 * Replace a workspace with an imported scheme and make it active. Tinted8
 * overrides are kept exactly as authored. The scheme is deep-copied so the
 * workspace and its `baseline` never alias the caller's object.
 */
function applyImported(data: PersistData, scheme: ImportedScheme, origin: string | null): void {
  const s = JSON.parse(JSON.stringify(scheme)) as ImportedScheme;
  const common = { loadedFrom: origin, touched: false, authorByUser: false };
  if (s.system === "tinted8") {
    data.tinted8 = {
      ...common,
      meta: { ...s.meta },
      palette: { ...DEFAULT_TINTED8, ...s.palette },
      overrides: {
        palette: { ...s.overrides?.palette },
        ui: { ...s.overrides?.ui },
        syntax: { ...s.overrides?.syntax },
      },
      baseline: s,
    };
  } else {
    data[s.system] = { ...common, meta: { ...s.meta }, palette: { ...s.palette }, baseline: s };
  }
  data.flavor = s.system;
}
```

- [ ] **Step 4: Update the toolbar Reset prompt**

In `src/ui/components/EditorToolbar.tsx`, replace the body of `onReset` up to (not including) the `window.confirm` call:

```ts
    const loadedId = useStore.getState()[flavor].loadedFrom;
    const entry = loadedId ? byId.get(loadedId) : null;
    const target = entry ? `“${entry.name}”` : "the default starting colors";
```

with:

```ts
    const ws = useStore.getState()[flavor];
    // An imported workspace resets to its import; else to its library entry or stock.
    const entry = !ws.baseline && ws.loadedFrom ? byId.get(ws.loadedFrom) : null;
    const target = ws.baseline
      ? `“${ws.baseline.meta.name}”`
      : entry
        ? `“${entry.name}”`
        : "the default starting colors";
```

(The rest — `if (entry) loadScheme(entry); else reset(); restoreHash(…)` — stays as updated in Task 3.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/state/store.test.ts`
Expected: PASS.

- [ ] **Step 6: Full check and commit**

Run: `npm run check`
Expected: all green.

```bash
git add src/state/store.ts src/state/store.test.ts src/ui/components/EditorToolbar.tsx
git commit -m "feat(state): load imported schemes with a Reset baseline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Import dialog UI

**Files:**
- Create: `src/ui/import.ts`
- Create: `src/ui/components/ImportDialog.tsx`
- Modify: `src/ui/icons.tsx`
- Modify: `src/ui/components/EditorToolbar.tsx`
- Modify: `src/styles/studio.css`
- Modify: `src/ui/App.tsx` (mount the dialog)

**Interfaces:**
- Consumes: `parseYamlText`, `importFromUrl` (Task 4); `useStore().loadImported` (Task 5); `restoreHash`, `buildShareLink`, `URL_ORIGIN_PREFIX` (Task 3); `useToast`.
- Produces:
  - `applyImport(scheme: ImportedScheme, origin: string | null): boolean` — confirms if the target workspace is edited, loads, sets the hash, toasts. Returns false if the user cancelled.
  - `copyShareLink(rawUrl: string): Promise<void>`
  - `useImport` Zustand store: `{ open, tab, text, pasteResult, urlInput, rawUrl, urlResult, fetching, openDialog(tab?), close(), setTab(tab), setText(text), setUrlInput(v), fetchUrl(), load() }`
  - `SYSTEM_LABELS: Record<Flavor, string>`

No unit tests for this task (DOM/React; the test env is node) — verified in the browser in Step 6.

- [ ] **Step 1: Add the icon**

Append to `src/ui/icons.tsx`:

```tsx
export const IconFile = () => (
  <Svg>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Svg>
);
```

- [ ] **Step 2: Create `src/ui/import.ts`**

```ts
/**
 * YAML-import dialog state + applying an import (UI layer). Parsing/fetching
 * lives in `./importYaml.ts`; this file owns the dialog form, stale-result
 * guards, the confirm-before-replace prompt, the hash, and toasts.
 */

import { create } from "zustand";
import type { Flavor, ImportedScheme, ImportResult } from "../core";
import { buildShareLink, restoreHash, URL_ORIGIN_PREFIX } from "../state/deeplink";
import { useStore } from "../state/store";
import { useToast } from "./toast";
import { importFromUrl, parseYamlText } from "./importYaml";

export type ImportTab = "paste" | "url";

export const SYSTEM_LABELS: Record<Flavor, string> = {
  base16: "Base16",
  base24: "Base24",
  tinted8: "Tinted8",
};

const PARSE_DEBOUNCE_MS = 200;

/**
 * Load an imported scheme into its workspace, confirming first if that
 * workspace has edits. Returns false if the user cancelled.
 */
export function applyImport(scheme: ImportedScheme, origin: string | null): boolean {
  const st = useStore.getState();
  const label = SYSTEM_LABELS[scheme.system];
  if (
    st[scheme.system].touched &&
    !window.confirm(`Load “${scheme.meta.name}”? This replaces your current ${label} scheme.`)
  ) {
    return false;
  }
  st.loadImported(scheme, origin);
  restoreHash(origin);
  useToast.getState().show(`Loaded “${scheme.meta.name}” into ${label}`);
  return true;
}

export async function copyShareLink(rawUrl: string): Promise<void> {
  const link = buildShareLink(location.href, rawUrl);
  try {
    await navigator.clipboard.writeText(link);
    useToast.getState().show("Share link copied");
  } catch {
    useToast.getState().show("Copy failed — the link is in the address bar after loading");
  }
}

interface ImportState {
  open: boolean;
  tab: ImportTab;
  text: string;
  pasteResult: ImportResult | null;
  urlInput: string;
  rawUrl: string | null;
  urlResult: ImportResult | null;
  fetching: boolean;
  openDialog: (tab?: ImportTab) => void;
  close: () => void;
  setTab: (tab: ImportTab) => void;
  setText: (text: string) => void;
  setUrlInput: (value: string) => void;
  fetchUrl: () => Promise<void>;
  load: () => void;
}

// Sequence numbers drop results that arrive after newer input (or after close).
let parseTimer: ReturnType<typeof setTimeout> | null = null;
let parseSeq = 0;
let fetchSeq = 0;

const INITIAL = {
  open: false,
  tab: "paste" as ImportTab,
  text: "",
  pasteResult: null,
  urlInput: "",
  rawUrl: null,
  urlResult: null,
  fetching: false,
};

export const useImport = create<ImportState>((set, get) => ({
  ...INITIAL,

  openDialog: (tab = "paste") => set({ ...INITIAL, open: true, tab }),

  close: () => {
    if (parseTimer) clearTimeout(parseTimer);
    parseSeq++;
    fetchSeq++;
    set({ ...INITIAL });
  },

  setTab: (tab) => set({ tab }),

  setText: (text) => {
    set({ text });
    if (parseTimer) clearTimeout(parseTimer);
    const seq = ++parseSeq;
    if (!text.trim()) {
      set({ pasteResult: null });
      return;
    }
    parseTimer = setTimeout(() => {
      void parseYamlText(text).then((pasteResult) => {
        if (seq === parseSeq) set({ pasteResult });
      });
    }, PARSE_DEBOUNCE_MS);
  },

  setUrlInput: (urlInput) => {
    fetchSeq++;
    set({ urlInput, rawUrl: null, urlResult: null, fetching: false });
  },

  fetchUrl: async () => {
    const input = get().urlInput.trim();
    if (!input) return;
    const seq = ++fetchSeq;
    set({ fetching: true, rawUrl: null, urlResult: null });
    const { rawUrl, result } = await importFromUrl(input);
    if (seq !== fetchSeq) return;
    set({ fetching: false, rawUrl, urlResult: result });
  },

  load: () => {
    const s = get();
    const result = s.tab === "paste" ? s.pasteResult : s.urlResult;
    if (!result?.ok) return;
    const origin = s.tab === "url" && s.rawUrl ? URL_ORIGIN_PREFIX + s.rawUrl : null;
    if (applyImport(result.scheme, origin)) get().close();
  },
}));
```

- [ ] **Step 3: Create `src/ui/components/ImportDialog.tsx`**

```tsx
import { useEffect } from "react";
import type { ImportResult } from "../../core";
import { copyShareLink, SYSTEM_LABELS, useImport, type ImportTab } from "../import";

const TABS: Array<[ImportTab, string]> = [
  ["paste", "Paste YAML"],
  ["url", "GitHub URL"],
];

/** Parse outcome: detected scheme + warnings, or the error list. */
function ResultSummary({ result }: { result: ImportResult | null }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <ul className="import-messages is-error" aria-live="polite">
        {result.errors.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    );
  }
  const { system, meta } = result.scheme;
  return (
    <div aria-live="polite">
      <p className="import-summary">
        {SYSTEM_LABELS[system]} · {meta.name} · {meta.variant}
      </p>
      {result.warnings.length > 0 && (
        <ul className="import-messages">
          {result.warnings.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Modal for loading a scheme from pasted YAML or a GitHub file URL
 * (docs/superpowers/specs/2026-09-28-yaml-import-design.md). Load stays
 * disabled until the active tab has a successful parse.
 */
export function ImportDialog() {
  const s = useImport();

  useEffect(() => {
    if (!s.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") s.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [s.open, s]);

  if (!s.open) return null;

  const result = s.tab === "paste" ? s.pasteResult : s.urlResult;
  const canLoad = Boolean(result?.ok) && !(s.tab === "url" && s.fetching);

  return (
    <div
      className="extract-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) s.close();
      }}
    >
      <div
        className="extract-dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Load scheme from YAML"
      >
        <div className="plate-head">
          <h2 className="section-label">From YAML</h2>
          <span className="plate-rule" />
        </div>

        <div className="field-variant import-tabs" role="tablist">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={s.tab === value}
              className={"chip" + (s.tab === value ? " active" : "")}
              onClick={() => s.setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {s.tab === "paste" ? (
          <textarea
            className="import-textarea"
            aria-label="Scheme YAML"
            placeholder={'system: "base16"\nname: "My Scheme"\nauthor: "Me"\nvariant: "dark"\npalette:\n  base00: "#181818"\n  …'}
            spellCheck={false}
            autoFocus
            value={s.text}
            onChange={(e) => s.setText(e.target.value)}
          />
        ) : (
          <form
            className="import-url-row"
            onSubmit={(e) => {
              e.preventDefault();
              void s.fetchUrl();
            }}
          >
            <div className="field">
              <label htmlFor="import-url">GitHub file URL</label>
              <input
                id="import-url"
                type="url"
                placeholder="https://github.com/<owner>/<repo>/blob/<branch>/<path>.yaml"
                spellCheck={false}
                autoFocus
                value={s.urlInput}
                onChange={(e) => s.setUrlInput(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="button button-ghost"
              disabled={!s.urlInput.trim() || s.fetching}
            >
              {s.fetching ? "Fetching…" : "Fetch"}
            </button>
          </form>
        )}

        {s.tab === "url" && s.rawUrl && <p className="import-raw">{s.rawUrl}</p>}

        <ResultSummary result={result} />

        <p className="extract-note">
          {s.tab === "paste"
            ? "Parsed in your browser — nothing is uploaded."
            : "Fetched directly from GitHub by your browser."}
        </p>

        <div className="extract-actions">
          {s.tab === "url" && s.rawUrl && s.urlResult?.ok && (
            <button className="button button-ghost" onClick={() => void copyShareLink(s.rawUrl!)}>
              Copy share link
            </button>
          )}
          <button className="button button-ghost" onClick={s.close}>
            Cancel
          </button>
          <button className="button button-primary" disabled={!canLoad} onClick={s.load}>
            Load
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Toolbar button, CSS, mount**

In `src/ui/components/EditorToolbar.tsx`:
- Change the icons import to `import { IconFile, IconImage, IconRedo, IconReset, IconTrash, IconUndo } from "../icons";`
- Add `import { useImport } from "../import";` and, inside the component, `const openImport = useImport((s) => s.openDialog);`
- Insert right after the "From image" `</button>`:

```tsx
        <button
          className="button button-ghost reset-button"
          title="Load a scheme from YAML (paste or GitHub URL)"
          onClick={() => openImport()}
        >
          <IconFile />
          <span>From YAML</span>
        </button>
```

In `src/styles/studio.css`, insert right before the `@media (max-width: 520px) {` block that follows `.extract-actions`:

```css
.import-dialog {
  width: min(640px, 100%);
}

.import-tabs {
  margin: 6px 0 14px;
}

.import-textarea {
  display: block;
  width: 100%;
  min-height: 240px;
  resize: vertical;
  padding: 10px 12px;
  font: 12px/1.6 var(--font-mono);
  color: var(--ink-1);
  background: color-mix(in oklab, var(--ink-1) 2.5%, transparent);
  border: 1px solid var(--rule);
}

.import-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.import-url-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.import-url-row .field {
  flex: 1;
  min-width: 0;
}

.import-raw {
  margin: 8px 0 0;
  font: 500 10.5px/1.4 var(--font-mono);
  color: var(--ink-4);
  word-break: break-all;
}

.import-summary {
  margin: 14px 0 0;
  font: 500 11px/1.4 var(--font-mono);
  letter-spacing: 0.03em;
  color: var(--ink-2);
}

.import-messages {
  margin: 8px 0 0;
  padding-left: 18px;
  max-height: 140px;
  overflow: auto;
  font: 11px/1.5 var(--font-mono);
  color: var(--ink-3);
}

.import-messages.is-error {
  margin-top: 14px;
  color: var(--invalid);
}
```

In `src/ui/App.tsx`: add `import { ImportDialog } from "./components/ImportDialog";` and render `<ImportDialog />` directly after `<ExtractDialog />`.

- [ ] **Step 5: Full check**

Run: `npm run check`
Expected: all green.

- [ ] **Step 6: Verify in the browser**

Run `npm run dev` (background) and open the printed URL. Verify:
1. "From YAML" appears in the toolbar; opens the dialog on the Paste tab with focus in the textarea; Esc and backdrop-click close it.
2. Paste the Export YAML from the Base24 tab (after changing one color) into the dialog on the Base16 tab → summary reads `Base24 · <name> · dark`; Load switches to the Base24 tab with the pasted colors; toast shows.
3. Paste `system: "base16"\nvariant: "dim"` → red error list; Load disabled.
4. Edit a slot, then import again into the same system → confirm prompt appears; Cancel leaves the edit intact.
5. After an import, edit a color, click Reset → confirm names the imported scheme; colors return to the import.
6. GitHub URL tab: enter `https://github.com/tinted-theming/schemes/blob/spec-0.11/base16/ayu-dark.yaml` (or any existing scheme file on the default branch — check the repo for the current path) → Fetch shows the raw URL + summary; "Copy share link" copies a `#url=` link; Load sets the address bar hash to `#url=…`.
7. Enter `https://example.com/a.yaml` → inline "Only GitHub URLs" error; Fetch does not hit the network (DevTools Network tab).
8. Toggle page theme to dark — dialog, textarea and error colors read correctly.

- [ ] **Step 7: Commit**

```bash
git add src/ui/import.ts src/ui/components/ImportDialog.tsx src/ui/icons.tsx src/ui/components/EditorToolbar.tsx src/styles/studio.css src/ui/App.tsx
git commit -m "feat(ui): From YAML dialog — paste or GitHub URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `#url=` deep-link on open

**Files:**
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: `parseHash`, `restoreHash`, `URL_ORIGIN_PREFIX` (Task 3); `toGithubRawUrl` (Task 3); `importFromUrl` (Task 4); `applyImport`, `SYSTEM_LABELS` (Task 6); `useToast`.
- Produces: opening `/#url=<encoded raw URL>` fetches, parses, and loads the scheme (confirming if the target workspace is edited). Independent of the snapshot library load.

- [ ] **Step 1: Add the effect**

In `src/ui/App.tsx`:
- Add imports: `import { toGithubRawUrl } from "../core";`, `import { URL_ORIGIN_PREFIX } from "../state/deeplink";` (merge into the existing deeplink import), `import { applyImport } from "./import";`, `import { importFromUrl } from "./importYaml";`, `import { useToast } from "./toast";`.
- Add a module-level guard above `export function App()`:

```ts
/** The `#url=` import currently in flight (StrictMode runs effects twice in dev). */
let urlImportInFlight: string | null = null;
```

- Add this effect after the library deep-link effect:

```ts
  // `#url=<raw GitHub URL>` deep-links: fetch + import on open and on hash change.
  // Independent of the snapshot library, which it doesn't need.
  useEffect(() => {
    const apply = () => {
      const target = parseHash();
      if (target?.kind !== "url") return;
      const toast = useToast.getState().show;
      const norm = toGithubRawUrl(target.url);
      if (!norm.ok) {
        toast(norm.error);
        const st = useStore.getState();
        restoreHash(st[st.flavor].loadedFrom);
        return;
      }
      const origin = URL_ORIGIN_PREFIX + norm.url;
      const st = useStore.getState();
      // Already showing this exact import, unedited — nothing to do.
      if (st[st.flavor].loadedFrom === origin && !st[st.flavor].touched) return;
      if (urlImportInFlight === origin) return;
      urlImportInFlight = origin;
      void importFromUrl(norm.url).then(({ result }) => {
        urlImportInFlight = null;
        if (result.ok && applyImport(result.scheme, origin)) return;
        if (!result.ok) toast(`Couldn't load scheme: ${result.errors[0]}`);
        const now = useStore.getState();
        restoreHash(now[now.flavor].loadedFrom);
      });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
```

- [ ] **Step 2: Full check**

Run: `npm run check`
Expected: all green.

- [ ] **Step 3: Verify in the browser**

With `npm run dev` running:
1. Use the share link copied in Task 6 Step 6 in a fresh tab → the scheme loads into its workspace; toast shows; hash stays `#url=…`.
2. Reload that tab → no refetch-and-confirm loop (the "already showing" guard); the scheme is still shown.
3. Edit a color → the hash clears (existing behavior). Paste the share link into the address bar again → confirm prompt; Cancel restores the previous hash state and keeps the edit.
4. Open `/#url=https%3A%2F%2Fexample.com%2Fa.yaml` → toast "Only GitHub URLs…"; hash is cleared/restored; nothing fetched.
5. Open a `#url=` link to a nonexistent GitHub file → toast "Couldn't load scheme: File not found (404)…".
6. A library deep-link `/#base16-3024` still works as before.

- [ ] **Step 4: Commit**

```bash
git add src/ui/App.tsx
git commit -m "feat: open #url= links by fetching and importing the scheme

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs + final verification

**Files:**
- Modify: `SPEC.md` (currently untracked — this commit adds it)

- [ ] **Step 1: Update SPEC.md**

(a) In §1, replace the "Offline-capable" bullet with:

```md
- **Offline-capable** — fonts, images, snippets, the scheme snapshot, and the
  tree-sitter grammars + highlight queries (§13) are bundled; nothing is fetched
  from third parties at runtime, **except** a user-initiated GitHub fetch when
  importing a scheme by URL (the dialog, or opening a `#url=` link — §16).
```

(b) In §3, add after item 13:

```md
14. **Import from YAML** — load any Base16/Base24/Tinted8 scheme by pasting its
    YAML or giving a GitHub file URL; GitHub imports are shareable as
    `#url=<raw URL>` links (§16).
```

(c) Append a new §16 at the very end of the file (after "## 15. Non-goals"; no renumbering):

```md
---

## 16. Import from YAML (paste / GitHub URL)

Design: `docs/superpowers/specs/2026-09-28-yaml-import-design.md`.

- **Entry points:** the "From YAML" toolbar button (Paste / GitHub URL tabs) and
  `#url=<encodeURIComponent(raw URL)>` deep-links.
- **Formats:** modern Base16/Base24 (`system:` + `palette:`), Tinted8 (`scheme:`
  wrapper; flat or nested `ui`/`syntax`; `<key>.default` → parent key), and the
  legacy flat Base16/24 format (`scheme: "Name"`, top-level `base00: "282c34"`).
  YAML is parsed with js-yaml 4's FAILSAFE schema so unquoted hex stays a string.
- **Normalization:** `src/core/import.ts` (`parseSchemeDocument`) — errors block
  the load (missing/invalid/alpha slots, non-enum variant, unknown format);
  warnings don't (unknown keys, inferred variant, missing author/name, slug
  mismatch). Tinted8 overrides are kept as authored, including `orange-dim`.
- **URLs:** GitHub only — `github.com/…/blob|raw/…` is rewritten to
  `raw.githubusercontent.com`; raw and gist-raw URLs pass through
  (`src/core/githubUrl.ts`). 10 s timeout, 256 KB cap.
- **Loading:** like a library load (switches workspace, undoable, confirm if
  edited), plus a persisted `baseline` so **Reset** returns to the import.
  GitHub imports record `loadedFrom = "url:<raw URL>"`.
```

- [ ] **Step 2: Final verification**

Run: `npm run check && npm run build`
Expected: typecheck, lint, all tests green; build succeeds and `dist/THIRD-PARTY-NOTICES.txt` contains `js-yaml@`. Confirm js-yaml is a separate chunk: `ls dist/assets | grep -i yaml` shows a `js-yaml-*.js` chunk (not inlined into the main `index-*.js`).

- [ ] **Step 3: Commit**

```bash
git add SPEC.md
git commit -m "doc: SPEC — YAML import feature, GitHub fetch exception

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
