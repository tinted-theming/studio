/**
 * A Base16/Base24-shaped palette: hex per slot (base00–base17). Every scheme
 * system is normalized to this shape so the tinted-nvim alias resolver can drive
 * highlight colors uniformly.
 */
export type BaseSlots = Record<string, string>;

/** Minimal scheme shape this module needs (a subset of `PreviewScheme`). */
export interface SchemeForSlots {
  system: string;
  /** wrapped palette: slot/key → { hex_str } */
  palette: Record<string, { hex_str: string } | undefined>;
  /** tinted8 only: ui token → { hex_str } */
  ui?: Record<string, { hex_str: string } | undefined>;
}

const hex = (v: { hex_str: string } | undefined): string | undefined => v?.hex_str;

/**
 * Tinted8 → Base16/24 slot synthesis (the inverse of tinted-nvim's tinted8
 * translation; see docs/tinted8-design.md). Editorial routing: each base slot is
 * filled from the tinted8 tree so a base16/24-shaped highlighter renders correctly.
 * `*-bright` variants populate base12–17 so the alias resolver prefers them.
 */
function tinted8ToSlots(scheme: SchemeForSlots): BaseSlots {
  const p = scheme.palette;
  const ui = scheme.ui ?? {};
  const get = (k: string) => hex(p[k]);
  const slots: BaseSlots = {
    base00: hex(ui["global.background.normal"]) ?? get("black-normal") ?? "#000000",
    base01: get("gray-dim") ?? "#1a1a1a",
    base02: get("gray-dim") ?? "#2a2a2a",
    base03: get("gray-normal") ?? "#5a5a5a",
    base04: get("gray-bright") ?? "#8a8a8a",
    base05: hex(ui["global.foreground.normal"]) ?? get("white-normal") ?? "#d8d8d8",
    base06: get("white-normal") ?? "#e8e8e8",
    base07: get("white-bright") ?? "#f8f8f8",
    base08: get("red-normal") ?? "#d35f5f",
    base09: get("orange-normal") ?? "#d08f4f",
    base0A: get("yellow-normal") ?? "#c6a84f",
    base0B: get("green-normal") ?? "#72a65a",
    base0C: get("cyan-normal") ?? "#5aa6a6",
    base0D: get("blue-normal") ?? "#5f8fd3",
    base0E: get("magenta-normal") ?? "#9f7ad3",
    base0F: get("brown-normal") ?? "#8f6f4f",
    base12: get("red-bright") ?? "",
    base13: get("yellow-bright") ?? "",
    base14: get("green-bright") ?? "",
    base15: get("cyan-bright") ?? "",
    base16: get("blue-bright") ?? "",
    base17: get("magenta-bright") ?? "",
  };
  // Drop empty bright slots so the alias resolver falls back to the base16 color.
  for (const k of Object.keys(slots)) if (!slots[k]) delete slots[k];
  return slots;
}

/**
 * Normalize any scheme (base16/base24/tinted8) to a Base16/24 slot map that the
 * alias resolver can consume.
 */
export function schemeToBaseSlots(scheme: SchemeForSlots): BaseSlots {
  if (scheme.system === "tinted8") return tinted8ToSlots(scheme);
  const out: BaseSlots = {};
  for (const k in scheme.palette) {
    const v = hex(scheme.palette[k]);
    if (v) out[k] = v;
  }
  return out;
}
