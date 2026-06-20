/**
 * Core domain types for Tinted Studio.
 *
 * `core/` is framework-agnostic and pure — it imports nothing from React,
 * Zustand, or the DOM. These types describe the scheme documents the editor
 * manipulates and the snapshot library it can start from (see SPEC §4–§9).
 */

/** The three independent scheme systems / workspaces. */
export type Flavor = "base16" | "base24" | "tinted8";

/**
 * Scheme variant. Enum-only: the builder types this as an enum, so anything
 * other than these two literals fails to parse (SPEC §11 / HANDOFF gotchas).
 */
export type Variant = "dark" | "light";

/** A dim/bright derivation target for a Tinted8 normal color. */
export type DeriveVariant = "dim" | "bright";

/** RGB channels, each 0–255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** HSL: h in degrees (may exceed [0,360) before normalization), s/l in [0,1]. */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Base16/Base24 palette: slot key (e.g. "base00") → hex string. */
export type BasePalette = Record<string, string>;

/** Tinted8 stores only the 8 base normals; everything else is derived. */
export type Tinted8Palette = Record<string, string>;

/**
 * Explicit Tinted8 overrides, separate from derivation. `palette` keys are
 * either a supplemental normal ("orange"/"brown"/"gray") or a "<color>-<variant>"
 * dim/bright slot; `ui`/`syntax` keys are dotted token paths.
 */
export interface Tinted8Overrides {
  palette: Record<string, string>;
  ui: Record<string, string>;
  syntax: Record<string, string>;
}

/** Per-workspace scheme metadata. family/style are Tinted8-only. */
export interface Meta {
  name: string;
  author: string;
  slug: string;
  description: string;
  variant: Variant;
  family?: string;
  style?: string;
}

/** A Base16/Base24 workspace document. */
export interface BaseWorkspace {
  meta: Meta;
  palette: BasePalette;
  loadedFrom: string | null;
  touched: boolean;
}

/** The Tinted8 workspace document (adds overrides). */
export interface Tinted8Workspace {
  meta: Meta;
  palette: Tinted8Palette;
  overrides: Tinted8Overrides;
  loadedFrom: string | null;
  touched: boolean;
}

/** A fully-resolved Tinted8 scheme: 33 palette slots + 45 ui + 105 syntax. */
export interface EffectiveTinted8 {
  palette: Record<string, string>;
  ui: Record<string, string>;
  syntax: Record<string, string>;
}

/** One color value as it appears in the snapshot library (`data/schemes.json`). */
export interface SchemeColor {
  hex_str: string;
  hex?: [string, string, string];
  rgb?: [number, number, number];
  dec?: [number, number, number];
}

/**
 * One entry in the known-scheme snapshot. For Tinted8, palette keys are
 * "<color>-<variant>" and ui/syntax are fully-expanded dotted-path maps
 * (SPEC §9).
 */
export interface SchemeEntry {
  id: string;
  name: string;
  author: string;
  system: string;
  variant: string;
  slug: string;
  palette: Record<string, SchemeColor>;
  lightness?: { foreground: number; background: number } | null;
  ui?: Record<string, SchemeColor>;
  syntax?: Record<string, SchemeColor>;
  family?: string;
  style?: string;
  description?: string;
}
