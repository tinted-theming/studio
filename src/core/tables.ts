/**
 * Slot/token definition tables — ported VERBATIM from
 * `reference/legacy/legacy-studio.js`.
 *
 * `UI_DEFAULTS` (45) and `SYNTAX_DEFAULTS` (105) are byte-verified against
 * `tinted-builder` (Rust). DO NOT regenerate or "tidy" them by hand — golden
 * tests in derive.test.ts lock them against the snapshot (SPEC §6).
 */

import type { DeriveVariant } from "./types";

/** Base16 slots: [key, human-readable description]. */
export const BASE16_SLOTS: ReadonlyArray<readonly [string, string]> = [
  ["base00", "Default background"],
  ["base01", "Lighter background"],
  ["base02", "Selection background"],
  ["base03", "Comments, invisibles"],
  ["base04", "Dark foreground"],
  ["base05", "Default foreground"],
  ["base06", "Light foreground"],
  ["base07", "Lightest foreground"],
  ["base08", "Red — variables, errors"],
  ["base09", "Orange — integers, constants"],
  ["base0A", "Yellow — classes, search"],
  ["base0B", "Green — strings"],
  ["base0C", "Cyan — support, escapes"],
  ["base0D", "Blue — functions"],
  ["base0E", "Magenta — keywords"],
  ["base0F", "Brown — deprecated"],
];

export const BASE24_EXTRA_SLOTS: ReadonlyArray<readonly [string, string]> = [
  ["base10", "Darker black"],
  ["base11", "Brighter white"],
  ["base12", "Bright red"],
  ["base13", "Bright yellow"],
  ["base14", "Bright green"],
  ["base15", "Bright cyan"],
  ["base16", "Bright blue"],
  ["base17", "Bright magenta"],
];

export const BASE24_SLOTS: ReadonlyArray<readonly [string, string]> =
  BASE16_SLOTS.concat(BASE24_EXTRA_SLOTS);

export const BASE8 = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
] as const;
export const SUPPLEMENTAL = ["orange", "brown", "gray"] as const;
export const ALL11: readonly string[] = [...BASE8, ...SUPPLEMENTAL];
export const VARIANTS = ["normal", "dim", "bright"] as const;

export const TINTED8_COLOR_DESC: Record<string, string> = {
  black: "ANSI 0 — default background",
  red: "ANSI 1 — errors",
  green: "ANSI 2 — strings, success",
  yellow: "ANSI 3 — constants, warnings",
  blue: "ANSI 4 — functions",
  magenta: "ANSI 5 — keywords",
  cyan: "ANSI 6 — support, regex",
  white: "ANSI 7 — text, light backgrounds",
  orange: "Supplemental — derived from yellow",
  brown: "Supplemental — derived from yellow",
  gray: "Supplemental — derived from black + white",
};

/**
 * Tinted8 UI token defaults (variant-aware).
 * key -> { dark: "<color>-<variant>", light: "<color>-<variant>" }
 */
export const UI_DEFAULTS: Record<string, { dark: string; light: string }> = {
  "global.background.normal": { dark: "black-normal", light: "white-normal" },
  "global.background.dark": { dark: "black-dim", light: "white-dim" },
  "global.background.light": { dark: "black-bright", light: "white-bright" },
  "global.foreground.normal": { dark: "white-normal", light: "black-normal" },
  "global.foreground.dark": { dark: "white-dim", light: "black-bright" },
  "global.foreground.light": { dark: "white-bright", light: "black-dim" },
  "chrome.background.normal": { dark: "black-bright", light: "white-dim" },
  "chrome.background.dark": { dark: "black-dim", light: "gray-bright" },
  "chrome.background.light": { dark: "gray-dim", light: "white-normal" },
  "chrome.foreground.normal": { dark: "white-normal", light: "black-normal" },
  "chrome.foreground.dark": { dark: "white-dim", light: "black-dim" },
  "chrome.foreground.light": { dark: "white-bright", light: "black-bright" },
  "accent.normal": { dark: "cyan-normal", light: "cyan-normal" },
  "border.normal": { dark: "gray-dim", light: "gray-dim" },
  "cursor.normal.background": { dark: "white-normal", light: "black-normal" },
  "cursor.normal.foreground": { dark: "black-normal", light: "white-normal" },
  "cursor.muted.background": { dark: "gray-bright", light: "gray-dim" },
  "cursor.muted.foreground": { dark: "gray-dim", light: "gray-bright" },
  "gutter.background": { dark: "black-normal", light: "white-normal" },
  "gutter.foreground": { dark: "white-dim", light: "black-bright" },
  "highlight.text.background": { dark: "gray-dim", light: "white-dim" },
  "highlight.text.foreground": { dark: "white-normal", light: "black-normal" },
  "highlight.text.active-background": { dark: "gray-normal", light: "gray-normal" },
  "highlight.text.active-foreground": { dark: "white-normal", light: "black-normal" },
  "highlight.button.background": { dark: "black-bright", light: "white-dim" },
  "highlight.button.foreground": { dark: "white-normal", light: "black-normal" },
  "highlight.line.background": { dark: "gray-dim", light: "white-dim" },
  "highlight.line.foreground": { dark: "white-dim", light: "black-bright" },
  "highlight.search.background": { dark: "black-bright", light: "white-dim" },
  "highlight.search.foreground": { dark: "yellow-normal", light: "yellow-normal" },
  "indent-guide.background": { dark: "black-bright", light: "white-dim" },
  "indent-guide.active-background": { dark: "gray-dim", light: "gray-bright" },
  "link.normal.background": { dark: "black-normal", light: "white-normal" },
  "link.normal.foreground": { dark: "cyan-normal", light: "cyan-normal" },
  "selection.background": { dark: "black-bright", light: "white-dim" },
  "selection.foreground": { dark: "white-normal", light: "black-normal" },
  "selection.inactive-background": { dark: "black-bright", light: "white-dim" },
  "status.error": { dark: "red-normal", light: "red-normal" },
  "status.warning": { dark: "yellow-normal", light: "yellow-normal" },
  "status.info": { dark: "orange-normal", light: "orange-normal" },
  "status.success": { dark: "green-normal", light: "green-normal" },
  "tooltip.background": { dark: "black-dim", light: "white-bright" },
  "tooltip.foreground": { dark: "white-normal", light: "black-normal" },
  "whitespace.foreground": { dark: "gray-normal", light: "gray-normal" },
  deprecated: { dark: "brown-normal", light: "brown-normal" },
};

/**
 * Tinted8 syntax token defaults.
 * key -> "<color>-<variant>" (dark-oriented; white<->black swapped for light).
 */
export const SYNTAX_DEFAULTS: Record<string, string> = {
  comment: "gray-dim",
  "comment.line": "gray-dim",
  "comment.block": "gray-dim",
  "comment.documentation": "gray-dim",
  invalid: "red-bright",
  "invalid.deprecated": "yellow-bright",
  "invalid.illegal": "red-bright",
  string: "green-normal",
  "string.quoted": "green-normal",
  "string.quoted.single": "green-normal",
  "string.quoted.double": "green-normal",
  "string.regexp": "red-normal",
  "string.template": "green-normal",
  "string.interpolated": "green-normal",
  "string.unquoted": "green-normal",
  "string.other": "green-normal",
  constant: "orange-normal",
  "constant.numeric": "orange-normal",
  "constant.numeric.integer": "orange-normal",
  "constant.numeric.float": "orange-normal",
  "constant.numeric.hex": "orange-normal",
  "constant.language": "orange-normal",
  "constant.character": "orange-normal",
  "constant.character.escape": "orange-normal",
  "constant.character.entity": "orange-normal",
  "constant.other": "orange-normal",
  entity: "white-normal",
  "entity.name": "white-normal",
  "entity.name.class": "yellow-normal",
  "entity.name.function": "blue-normal",
  "entity.name.function.constructor": "blue-normal",
  "entity.name.label": "white-normal",
  "entity.name.tag": "white-normal",
  "entity.name.type": "cyan-normal",
  "entity.name.type.class": "cyan-normal",
  "entity.name.type.enum": "cyan-normal",
  "entity.name.type.struct": "cyan-normal",
  "entity.name.namespace": "yellow-dim",
  "entity.name.section": "cyan-normal",
  "entity.other": "white-normal",
  "entity.other.attribute-name": "magenta-normal",
  "entity.other.inherited-class": "white-normal",
  keyword: "magenta-normal",
  "keyword.control": "magenta-normal",
  "keyword.control.import": "magenta-normal",
  "keyword.control.flow": "magenta-normal",
  "keyword.declaration": "magenta-normal",
  "keyword.operator": "magenta-normal",
  "keyword.other": "magenta-normal",
  storage: "magenta-normal",
  "storage.type": "magenta-normal",
  "storage.modifier": "magenta-normal",
  support: "blue-normal",
  "support.function": "blue-normal",
  "support.function.builtin": "blue-bright",
  "support.class": "blue-normal",
  "support.type": "blue-normal",
  "support.constant": "magenta-normal",
  "support.variable": "cyan-normal",
  "support.other": "blue-normal",
  variable: "white-normal",
  "variable.parameter": "cyan-bright",
  "variable.language": "magenta-normal",
  "variable.other": "white-normal",
  "variable.other.constant": "white-normal",
  "variable.other.property": "white-normal",
  "variable.other.object": "white-normal",
  punctuation: "white-dim",
  "punctuation.separator": "white-normal",
  "punctuation.definition": "white-normal",
  "punctuation.definition.string": "green-normal",
  "punctuation.definition.comment": "gray-dim",
  "punctuation.section": "orange-normal",
  "punctuation.brackets": "orange-normal",
  "punctuation.brackets.angle": "orange-normal",
  "punctuation.brackets.curly": "orange-normal",
  "punctuation.brackets.round": "orange-normal",
  "punctuation.brackets.square": "orange-normal",
  markup: "orange-normal",
  "markup.bold": "orange-normal",
  "markup.italic": "orange-normal",
  "markup.quote": "orange-normal",
  "markup.underline": "orange-normal",
  "markup.heading": "magenta-normal",
  "markup.list": "orange-normal",
  "markup.list.numbered": "cyan-normal",
  "markup.list.unnumbered": "cyan-normal",
  "markup.link": "yellow-normal",
  "markup.raw": "orange-normal",
  "markup.inserted": "green-bright",
  "markup.changed": "yellow-bright",
  "markup.deleted": "red-bright",
  source: "white-normal",
  text: "white-normal",
  meta: "white-normal",
  "meta.annotation": "orange-normal",
  "meta.function": "white-normal",
  "meta.class": "white-normal",
  "meta.block": "white-normal",
  "meta.tag": "white-normal",
  "meta.type": "white-normal",
  "meta.import": "white-normal",
  "meta.preprocessor": "white-normal",
  "meta.embedded": "white-normal",
  "meta.object": "orange-normal",
};

export const UI_KEYS = Object.keys(UI_DEFAULTS);
export const SYNTAX_KEYS = Object.keys(SYNTAX_DEFAULTS);

export const TINTED8_VARIANT_ORDER: Record<string, number> = { dim: 0, normal: 1, bright: 2 };

/** Order used when emitting overridden dim/bright slots in YAML. */
export const DERIVE_VARIANTS: readonly DeriveVariant[] = ["dim", "bright"];

/* ---------- Default starter palettes ---------- */

export const DEFAULT_BASE16: Record<string, string> = {
  base00: "#181818",
  base01: "#282828",
  base02: "#383838",
  base03: "#585858",
  base04: "#b8b8b8",
  base05: "#d8d8d8",
  base06: "#e8e8e8",
  base07: "#f8f8f8",
  base08: "#ab4642",
  base09: "#dc9656",
  base0A: "#f7ca88",
  base0B: "#a1b56c",
  base0C: "#86c1b9",
  base0D: "#7cafc2",
  base0E: "#ba8baf",
  base0F: "#a16946",
};

export const DEFAULT_BASE24: Record<string, string> = {
  ...DEFAULT_BASE16,
  base10: "#0f0f0f",
  base11: "#ffffff",
  base12: "#ab4642",
  base13: "#f7ca88",
  base14: "#a1b56c",
  base15: "#86c1b9",
  base16: "#7cafc2",
  base17: "#ba8baf",
};

export const DEFAULT_TINTED8: Record<string, string> = {
  black: "#181818",
  red: "#ab4642",
  green: "#a1b56c",
  yellow: "#f7ca88",
  blue: "#7cafc2",
  magenta: "#ba8baf",
  cyan: "#86c1b9",
  white: "#d8d8d8",
};

export const STYLING_SPEC = "0.2.0";
