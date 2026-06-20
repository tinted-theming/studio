/**
 * Preview role mappings (SPEC §7). Maps preview roles (bg, fg, comment, keyword,
 * …, and 16 ANSI roles) to colors for the syntax-snippet / palette-grid preview.
 * Ported from the reference.
 */

import type { Flavor, SchemeColor } from "./types";

export const PALETTE_LANGUAGE = "palette";
export const FALLBACK_LANGUAGE = "rust";

export const PREVIEW_LANGUAGES = [
  "rust",
  "kotlin",
  "lisp",
  "elixir",
  "haskell",
  "diff",
  "terminal",
] as const;

const fallbackPalette: Record<string, string> = {
  base00: "#101418",
  base03: "#5f6b76",
  base05: "#d8dee9",
  base08: "#d35f5f",
  base09: "#d08f4f",
  base0A: "#c6a84f",
  base0B: "#72a65a",
  base0C: "#5aa6a6",
  base0D: "#5f8fd3",
  base0E: "#9f7ad3",
};

/** Tinted8 non-ANSI roles resolve through ui/syntax token paths. */
export const TINTED8_ROLE_PATHS: Record<string, [keyof PreviewScheme & ("ui" | "syntax"), string]> =
  {
    bg: ["ui", "global.background.normal"],
    fg: ["ui", "global.foreground.normal"],
    muted: ["ui", "global.foreground.dark"],
    comment: ["syntax", "comment"],
    keyword: ["syntax", "keyword"],
    function: ["syntax", "entity.name.function"],
    string: ["syntax", "string"],
    number: ["syntax", "constant.numeric"],
    type: ["syntax", "entity.name.type"],
    builtin: ["syntax", "support.function.builtin"],
    parameter: ["syntax", "variable.parameter"],
    added: ["syntax", "markup.inserted"],
    deleted: ["syntax", "markup.deleted"],
  };

export const PREVIEW_ROLE_KEYS = {
  base16: {
    bg: "base00",
    fg: "base05",
    muted: "base04",
    comment: "base03",
    keyword: "base0E",
    function: "base0D",
    string: "base0B",
    number: "base09",
    deleted: "base08",
    added: "base0B",
    type: "base0A",
    builtin: "base0D",
    parameter: "base0C",
    "ansi-black": "base00",
    "ansi-red": "base08",
    "ansi-green": "base0B",
    "ansi-yellow": "base0A",
    "ansi-blue": "base0D",
    "ansi-magenta": "base0E",
    "ansi-cyan": "base0C",
    "ansi-white": "base05",
    "ansi-bright-black": "base03",
    "ansi-bright-red": "base08",
    "ansi-bright-green": "base0B",
    "ansi-bright-yellow": "base0A",
    "ansi-bright-blue": "base0D",
    "ansi-bright-magenta": "base0E",
    "ansi-bright-cyan": "base0C",
    "ansi-bright-white": "base07",
  } as Record<string, string>,
  base24: {
    "ansi-bright-red": "base12",
    "ansi-bright-yellow": "base13",
    "ansi-bright-green": "base14",
    "ansi-bright-cyan": "base15",
    "ansi-bright-blue": "base16",
    "ansi-bright-magenta": "base17",
  } as Record<string, string>,
  tinted8: {
    dark: { bg: "black-normal", fg: "white-normal", muted: "white-dim" } as Record<string, string>,
    light: { bg: "white-normal", fg: "black-normal", muted: "black-dim" } as Record<string, string>,
    shared: {
      comment: "gray-dim",
      keyword: "magenta-normal",
      function: "blue-normal",
      string: "green-normal",
      number: "orange-normal",
      deleted: "red-bright",
      added: "green-bright",
      type: "yellow-normal",
      builtin: "blue-bright",
      parameter: "cyan-bright",
      "ansi-black": "black-normal",
      "ansi-red": "red-normal",
      "ansi-green": "green-normal",
      "ansi-yellow": "yellow-normal",
      "ansi-blue": "blue-normal",
      "ansi-magenta": "magenta-normal",
      "ansi-cyan": "cyan-normal",
      "ansi-white": "white-normal",
      "ansi-bright-black": "black-bright",
      "ansi-bright-red": "red-bright",
      "ansi-bright-green": "green-bright",
      "ansi-bright-yellow": "yellow-bright",
      "ansi-bright-blue": "blue-bright",
      "ansi-bright-magenta": "magenta-bright",
      "ansi-bright-cyan": "cyan-bright",
      "ansi-bright-white": "white-bright",
    } as Record<string, string>,
  },
};

export const PREVIEW_ROLES = [
  "bg",
  "fg",
  "muted",
  "comment",
  "keyword",
  "function",
  "string",
  "number",
  "deleted",
  "added",
  "type",
  "builtin",
  "parameter",
  "ansi-black",
  "ansi-red",
  "ansi-green",
  "ansi-yellow",
  "ansi-blue",
  "ansi-magenta",
  "ansi-cyan",
  "ansi-white",
  "ansi-bright-black",
  "ansi-bright-red",
  "ansi-bright-green",
  "ansi-bright-yellow",
  "ansi-bright-blue",
  "ansi-bright-magenta",
  "ansi-bright-cyan",
  "ansi-bright-white",
] as const;

/**
 * A preview-shaped scheme: palette/ui/syntax values wrapped as `{ hex_str }`,
 * mirroring the snapshot shape so the same role logic serves both live editing
 * and library entries.
 */
export interface PreviewScheme {
  system: string;
  variant: string;
  palette: Record<string, SchemeColor>;
  ui?: Record<string, SchemeColor>;
  syntax?: Record<string, SchemeColor>;
}

/** Wrap a plain key→hex map into the snapshot's `{ hex_str }` shape. */
export function wrapHex(map: Record<string, string>): Record<string, SchemeColor> {
  const out: Record<string, SchemeColor> = {};
  for (const k in map) out[k] = { hex_str: map[k]! };
  return out;
}

/** Which palette slot key backs a role, for non-token (ANSI/base) resolution. */
export function palettePreviewKey(scheme: PreviewScheme, role: string): string | undefined {
  const system = String(scheme.system).toLowerCase();
  if (system === "tinted8") {
    const variant = String(scheme.variant || "").toLowerCase() === "light" ? "light" : "dark";
    const t8 = PREVIEW_ROLE_KEYS.tinted8;
    return t8[variant][role] ?? t8.shared[role];
  }
  if (system === "base24") {
    return PREVIEW_ROLE_KEYS.base24[role] ?? PREVIEW_ROLE_KEYS.base16[role];
  }
  return PREVIEW_ROLE_KEYS.base16[role];
}

/** Resolve a role to a hex color for the preview. */
export function previewColor(scheme: PreviewScheme, role: string): string {
  if (String(scheme.system).toLowerCase() === "tinted8") {
    const path = TINTED8_ROLE_PATHS[role];
    if (path) {
      const entry = scheme[path[0]]?.[path[1]];
      if (entry?.hex_str) return entry.hex_str;
    }
  }
  const key = palettePreviewKey(scheme, role);
  return (
    (key && scheme.palette[key]?.hex_str) ||
    (key && fallbackPalette[key]) ||
    fallbackPalette.base05!
  );
}

export interface PaletteGridShape {
  cols: number;
  rows: number;
}

export function paletteGridShape(system: string): PaletteGridShape {
  const s = system.toLowerCase();
  if (s === "tinted8") return { cols: 11, rows: 3 };
  if (s === "base24") return { cols: 8, rows: 3 };
  return { cols: 8, rows: 2 };
}

import { TINTED8_VARIANT_ORDER } from "./tables";

/** Palette entries sorted for the swatch grid (Tinted8 by variant then color). */
export function paletteEntriesInGridOrder(scheme: PreviewScheme): Array<[string, SchemeColor]> {
  const all = Object.entries(scheme.palette);
  if (String(scheme.system).toLowerCase() === "tinted8") {
    return all.sort(([a], [b]) => {
      const [aColor, aVariant] = a.split("-");
      const [bColor, bVariant] = b.split("-");
      const vd = TINTED8_VARIANT_ORDER[aVariant!]! - TINTED8_VARIANT_ORDER[bVariant!]!;
      if (vd !== 0) return vd;
      return aColor!.localeCompare(bColor!);
    });
  }
  return all.sort(([a], [b]) => a.localeCompare(b));
}

export type { Flavor };
