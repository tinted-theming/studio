/**
 * Snapshot library: indexing + Tinted8 override reconstruction (SPEC §6, §9, §10).
 *
 * When loading a known Tinted8 scheme, its palette/ui/syntax are fully expanded.
 * We reconstruct the minimal override set by diffing those expanded values
 * against fresh derivation: anything that differs was an explicit author choice.
 * `orange-dim` is intentionally skipped — upstream `tinted-builder` 0.16.0 emits
 * a buggy value for it (SPEC §10). Ported from the reference.
 */

import { effectivePaletteFull, effectiveSyntax, effectiveUi } from "./derive";
import { ALL11, BASE8, DERIVE_VARIANTS, SUPPLEMENTAL, SYNTAX_KEYS, UI_KEYS } from "./tables";
import type { SchemeEntry, Tinted8Overrides, Variant } from "./types";

/** Index the snapshot by id for O(1) lookup. */
export function indexSchemes(library: SchemeEntry[]): Map<string, SchemeEntry> {
  const map = new Map<string, SchemeEntry>();
  for (const entry of library) map.set(entry.id, entry);
  return map;
}

/** Filter (and name-sort) the library to one system, for the picker. */
export function schemesForFlavor(library: SchemeEntry[], flavor: string): SchemeEntry[] {
  return library
    .filter((s) => String(s.system).toLowerCase() === flavor)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Pull the 8 Tinted8 base normals out of an expanded snapshot entry. */
export function extractTinted8BaseNormals(entry: SchemeEntry): Record<string, string> {
  const palette: Record<string, string> = {};
  BASE8.forEach((c) => {
    const v = entry.palette?.[`${c}-normal`]?.hex_str;
    if (v) palette[c] = v.toLowerCase();
  });
  return palette;
}

export function normalizeVariant(variant: unknown): Variant {
  return String(variant || "dark").toLowerCase() === "light" ? "light" : "dark";
}

/**
 * Reconstruct Tinted8 overrides from a fully-expanded library entry. `palette`
 * is the 8 base normals (already extracted from the entry). Returns the minimal
 * override set whose values differ from derivation.
 */
export function reconstructTinted8(
  palette: Record<string, string>,
  variant: Variant,
  entry: SchemeEntry,
): Tinted8Overrides {
  const overrides: Tinted8Overrides = { palette: {}, ui: {}, syntax: {} };

  // Pass 1: supplemental normals (orange/brown/gray) — they feed their own
  // dim/bright derivation, so resolve them before the variants.
  SUPPLEMENTAL.forEach((c) => {
    const ev = entry.palette?.[`${c}-normal`]?.hex_str;
    if (!ev) return;
    const derived = effectivePaletteFull(palette, overrides.palette)[`${c}-normal`]!;
    if (ev.toLowerCase() !== derived.toLowerCase()) overrides.palette[c] = ev.toLowerCase();
  });

  // Pass 2: dim/bright for every color, against the (now supplemental-aware)
  // derivation. `orange-dim` is intentionally skipped (SPEC §10 — builder bug).
  let pf = effectivePaletteFull(palette, overrides.palette);
  ALL11.forEach((c) => {
    DERIVE_VARIANTS.forEach((v) => {
      if (c === "orange" && v === "dim") return;
      const ev = entry.palette?.[`${c}-${v}`]?.hex_str;
      if (!ev) return;
      if (ev.toLowerCase() !== pf[`${c}-${v}`]!.toLowerCase())
        overrides.palette[`${c}-${v}`] = ev.toLowerCase();
    });
  });

  // Pass 3: ui + syntax, against the full (override-aware) palette.
  pf = effectivePaletteFull(palette, overrides.palette);
  const ui = effectiveUi(pf, {}, variant);
  const syn = effectiveSyntax(pf, {}, variant);
  if (entry.ui) {
    UI_KEYS.forEach((k) => {
      const ev = entry.ui![k]?.hex_str;
      if (ev && ev.toLowerCase() !== ui[k]!.toLowerCase()) overrides.ui[k] = ev.toLowerCase();
    });
  }
  if (entry.syntax) {
    SYNTAX_KEYS.forEach((k) => {
      const ev = entry.syntax![k]?.hex_str;
      if (ev && ev.toLowerCase() !== syn[k]!.toLowerCase()) overrides.syntax[k] = ev.toLowerCase();
    });
  }
  return overrides;
}
