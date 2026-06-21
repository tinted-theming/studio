/**
 * Resolve the highlight-group specs (groups.ts) against a concrete palette into a
 * flat table of final styles, then look up a tree-sitter capture's style via the
 * `.`-segment fallback chain Neovim uses.
 */

import { buildAliases } from "./aliases";
import type { BaseSlots } from "./baseSlots";
import { blend } from "./color";
import { GROUPS, type HiSpec } from "./groups";

export interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

/**
 * Editor-chrome colors for CodeMirror surfaces, ported from tinted-nvim
 * `core.lua` (LineNr, MatchParen, Search/IncSearch, Pmenu, NonText, …). Consumed
 * as CSS custom properties by the CM6 theme.
 */
export interface UiColors {
  lineNr: string; // LineNr → dark_grey (base02)
  cursorLineNr: string; // CursorLineNr → LineNr
  gutterBg: string; // gutter background → Normal bg
  matchParen: string; // MatchParen bg → dark_grey
  searchBg: string; // Search bg → yellow
  searchFg: string; // Search fg → darkest_grey
  incSearchBg: string; // IncSearch bg → orange
  incSearchFg: string; // IncSearch fg → darkest_grey
  selectionMatch: string; // occurrence highlight → dark_grey
  whitespace: string; // Whitespace/NonText (lifted to base02 for legibility)
  indentGuide: string; // dark_grey
  indentGuideActive: string; // grey
  panelBg: string; // Pmenu/StatusLine surface → darkest_grey
  panelFg: string; // foreground
}

export interface HighlightTable {
  /** group name → resolved style (only groups that resolve to a color/style) */
  groups: Record<string, Style>;
  /** convenience: editor default fg/bg from Normal */
  fg: string;
  bg: string;
  /** CursorLine bg: blend(base01, base00, 0.6) — a subtle band above the background. */
  cursorLine: string;
  /** Visual bg: base01 (darkest_grey). */
  selection: string;
  /** Editor-chrome colors for CM6 surfaces (gutter, search, brackets, …). */
  ui: UiColors;
}

function withoutLink(spec: HiSpec): HiSpec {
  const copy = { ...spec };
  delete copy.link;
  return copy;
}

/** Follow `link` chains (cycle guard) and merge own fg/bg/styles over the target. */
function resolveSpec(name: string, seen = new Set<string>()): HiSpec {
  const spec = GROUPS[name];
  if (!spec) return {};
  if (!spec.link || seen.has(name)) return withoutLink(spec);
  seen.add(name);
  const base = resolveSpec(spec.link, seen);
  // own attributes win over the linked target's
  return { ...base, ...withoutLink(spec) };
}

/** Build the full resolved highlight table for a palette. */
export function buildHighlightTable(slots: BaseSlots): HighlightTable {
  const aliases = buildAliases(slots);
  const groups: Record<string, Style> = {};
  for (const name in GROUPS) {
    const spec = resolveSpec(name);
    const style: Style = {};
    if (spec.fg) {
      const c = aliases[spec.fg];
      if (c) style.fg = c;
    }
    if (spec.bg) {
      const c = aliases[spec.bg];
      if (c) style.bg = c;
    }
    if (spec.bold) style.bold = true;
    if (spec.italic) style.italic = true;
    if (spec.underline) style.underline = true;
    if (spec.strikethrough) style.strikethrough = true;
    // keep a group only if it carries any rendering effect
    if (style.fg || style.bg || style.bold || style.italic || style.underline || style.strikethrough)
      groups[name] = style;
  }
  const normal = groups.Normal ?? {};
  const bg = normal.bg ?? "#181818";
  const fg = normal.fg ?? "#d8d8d8";
  // CursorLine / Visual groups (tinted-nvim core.lua).
  const base01 = aliases.darkest_grey ?? bg;
  const base00 = aliases.background ?? bg;
  const base02 = aliases.dark_grey ?? base01;
  const base03 = aliases.grey ?? base02;
  const ui: UiColors = {
    lineNr: base02,
    cursorLineNr: base02,
    gutterBg: base00,
    matchParen: base02,
    searchBg: aliases.yellow ?? fg,
    searchFg: base01,
    incSearchBg: aliases.orange ?? fg,
    incSearchFg: base01,
    selectionMatch: base02,
    whitespace: base02,
    indentGuide: base02,
    indentGuideActive: base03,
    panelBg: base01,
    panelFg: fg,
  };
  return {
    groups,
    fg,
    bg,
    cursorLine: blend(base01, base00, 0.6),
    selection: base01,
    ui,
  };
}

/**
 * Resolve a tree-sitter capture name to a style using Neovim's fallback:
 * `@a.b.c` → `@a.b` → `@a`. Captures map directly to `@`-prefixed groups.
 * Returns null for captures with no visual style (e.g. @spell, @none-of-table),
 * so callers can skip them rather than blanking real colors.
 */
export function styleForCapture(capture: string, table: HighlightTable): Style | null {
  let name = "@" + capture;
  while (name) {
    const s = table.groups[name];
    if (s) return s;
    const i = name.lastIndexOf(".");
    if (i <= 0) break;
    name = name.slice(0, i);
  }
  return null;
}
