/**
 * Palette-slot aliases, ported verbatim from tinted-nvim's `lua/tinted-nvim/aliases.lua`.
 *
 * Each alias maps to an ordered list of base slots; the first slot present in the
 * palette wins. This is how Base24 "bright" colors (base12–base17) take precedence
 * over their Base16 fallbacks (base08–base0E) when available.
 */

import type { BaseSlots } from "./baseSlots";

export const ALIAS_MAP: Record<string, readonly string[]> = {
  background: ["base00"],
  darkest_grey: ["base01"],
  dark_grey: ["base02"],
  grey: ["base03"],
  bright_grey: ["base04"],
  foreground: ["base05"],
  bright_white: ["base06"],
  brightest_white: ["base07"],

  red: ["base08"],
  bright_red: ["base12", "base08"],

  orange: ["base09"],

  yellow: ["base0A"],
  bright_yellow: ["base13", "base0A"],

  green: ["base0B"],
  bright_green: ["base14", "base0B"],

  cyan: ["base0C"],
  bright_cyan: ["base15", "base0C"],

  blue: ["base0D"],
  bright_blue: ["base16", "base0D"],

  purple: ["base0E"],
  bright_purple: ["base17", "base0E"],

  dark_red: ["base0F"],
};

/** Resolve a single alias to a hex color, trying each base slot in order. */
export function resolveAlias(name: string, slots: BaseSlots): string | undefined {
  const keys = ALIAS_MAP[name];
  if (!keys) return undefined;
  for (const base of keys) {
    const color = slots[base];
    if (color) return color;
  }
  return undefined;
}

/** Build the full alias → hex lookup for a palette. */
export function buildAliases(slots: BaseSlots): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name in ALIAS_MAP) {
    const color = resolveAlias(name, slots);
    if (color) out[name] = color;
  }
  return out;
}
