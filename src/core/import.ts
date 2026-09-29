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
