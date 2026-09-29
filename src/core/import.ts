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

export type ImportResult =
  | { ok: true; scheme: ImportedScheme; warnings: string[] }
  | { ok: false; errors: string[] };

/** Cap on listed warnings so a junk document can't flood the dialog. */
export const MAX_WARNINGS = 12;

type Doc = Record<string, unknown>;
type BaseFlavor = "base16" | "base24";

const SLOT_KEY = /^base[0-9a-f]{2}$/i;
const BASE_KEYS = new Set([
  "system",
  "name",
  "slug",
  "author",
  "variant",
  "description",
  "palette",
]);
const LEGACY_KEYS = new Set(["scheme", "slug", "author", "variant", "description"]);
const LABELS: Record<BaseFlavor, string> = { base16: "Base16", base24: "Base24" };
const UNRECOGNIZED =
  "Unrecognized scheme format — expected Base16/Base24 (system + palette), " +
  "Tinted8 (a scheme: mapping), or legacy Base16 (top-level base00…).";

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

/** Normalize a parsed YAML document into an importable scheme. */
export function parseSchemeDocument(doc: unknown): ImportResult {
  if (!isObj(doc)) {
    return { ok: false, errors: ["Expected a YAML mapping (key: value pairs) at the top level."] };
  }
  if (isObj(doc.scheme)) {
    if (text(doc.scheme.system).toLowerCase() === "tinted8") return parseTinted8(doc);
    return {
      ok: false,
      errors: [`Unsupported scheme.system "${text(doc.scheme.system)}" — expected "tinted8".`],
    };
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
