/**
 * Highlight-group → palette-alias specs, ported from tinted-nvim:
 *   - `highlights/syntax.lua`      (traditional groups: Function, Keyword, …)
 *   - `highlights/treesitter.lua`  (modern `@` captures, the nvim-0.10 markup branch)
 *   - `highlights/core.lua`        (Normal — editor fg/bg)
 *   - `highlights/diagnostics.lua` (Diagnostic{Error,Warn,Info,Hint} — link targets)
 *
 * `fg`/`bg` are alias names (resolved against a palette in resolve.ts); `link`
 * defers to another group. Styles (bold/italic/underline/strikethrough) carry through.
 * The few `@diff.*` captures used by tree-sitter-diff queries (not present in
 * tinted-nvim, which predates them) are mapped here to match Neovim's Added/Removed
 * conventions and tinted-nvim's DiffAdd/DiffDelete intent (green/red).
 */

export interface HiSpec {
  fg?: string;
  bg?: string;
  link?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export const GROUPS: Record<string, HiSpec> = {
  // ── core ───────────────────────────────────────────────────────────────
  Normal: { fg: "foreground", bg: "background" },

  // ── diagnostics (link targets for @comment.*) ──────────────────────────
  DiagnosticError: { fg: "red" },
  DiagnosticWarn: { fg: "orange" },
  DiagnosticInfo: { fg: "yellow" },
  DiagnosticHint: { fg: "blue" },

  // ── traditional syntax groups ──────────────────────────────────────────
  Boolean: { fg: "orange" },
  Character: { fg: "red" },
  Comment: { fg: "grey", italic: true },
  Conditional: { fg: "purple" },
  Constant: { fg: "orange" },
  Define: { fg: "purple" },
  Delimiter: { fg: "dark_red" },
  Debug: { fg: "red" },
  Exception: { fg: "red" },
  Float: { fg: "orange" },
  Function: { fg: "blue" },
  Identifier: { fg: "red" },
  Include: { fg: "blue" },
  Keyword: { fg: "purple" },
  Label: { fg: "yellow" },
  Number: { fg: "orange" },
  Operator: { fg: "purple" },
  PreProc: { fg: "yellow" },
  Repeat: { fg: "yellow" },
  Special: { fg: "cyan" },
  SpecialChar: { fg: "dark_red" },
  Statement: { fg: "red" },
  StorageClass: { fg: "yellow" },
  String: { fg: "green" },
  Structure: { fg: "purple" },
  Tag: { fg: "yellow" },
  Todo: { fg: "yellow", bg: "darkest_grey" },
  Type: { fg: "yellow" },
  Typedef: { fg: "yellow" },
  Added: { fg: "green" },
  Removed: { fg: "red" },
  Changed: { fg: "cyan" },

  // ── modern treesitter @ captures ───────────────────────────────────────
  "@comment": { link: "Comment" },
  "@error": { fg: "red" },
  "@none": { fg: "foreground" },

  "@preproc": { fg: "yellow" },
  "@define": { fg: "purple" },
  "@operator": { fg: "foreground" },

  "@punctuation.delimiter": { fg: "dark_red" },
  "@punctuation.bracket": { fg: "foreground" },
  "@punctuation.special": { fg: "dark_red" },

  "@string": { fg: "green" },
  "@string.regex": { fg: "green" },
  "@string.escape": { fg: "cyan" },
  "@string.special": { fg: "green" },
  "@string.special.symbol": { link: "@symbol" },

  "@character": { fg: "red" },
  "@character.special": { fg: "dark_red" },

  "@boolean": { fg: "orange" },
  "@number": { fg: "orange" },
  "@float": { fg: "orange" },

  "@function": { link: "Function" },
  "@function.call": { link: "@function" },
  "@function.builtin": { link: "@function" },
  "@function.macro": { fg: "red" },

  "@method": { fg: "blue" },
  "@method.call": { link: "@method" },

  "@constructor": { fg: "blue" },

  "@parameter": { fg: "foreground" },

  "@keyword": { link: "Keyword" },
  "@keyword.function": { link: "@keyword" },
  "@keyword.import": { link: "@include" },
  "@keyword.operator": { link: "@keyword" },
  "@keyword.return": { link: "@keyword" },
  "@keyword.exception": { link: "@keyword" },

  "@conditional": { fg: "purple" },
  "@repeat": { fg: "purple" },

  "@label": { fg: "yellow" },

  "@include": { fg: "blue" },
  "@exception": { fg: "red" },

  "@type": { link: "Type" },
  "@type.builtin": { link: "@type" },
  "@type.definition": { link: "@type" },
  "@type.qualifier": { link: "@keyword" },

  "@class": { link: "Type" },
  "@struct": { link: "Type" },
  "@enum": { link: "Type" },
  "@enumMember": { link: "Constant" },
  "@event": { link: "Identifier" },
  "@interface": { link: "Structure" },
  "@modifier": { link: "Identifier" },
  "@regexp": { link: "@string.regex" },
  "@typeParameter": { link: "Type" },
  "@decorator": { link: "Identifier" },

  "@storageclass": { fg: "yellow" },
  "@attribute": { fg: "yellow" },

  "@field": { fg: "foreground" },
  "@property": { fg: "foreground" },

  "@variable": { fg: "foreground" },
  "@variable.builtin": { fg: "foreground", italic: true },
  "@variable.parameter": { link: "@parameter" },
  "@variable.member": { link: "@field" },

  "@constant": { fg: "orange" },
  "@constant.builtin": { link: "@constant" },
  "@constant.macro": { link: "@constant" },

  "@namespace": { fg: "red" },
  "@module": { link: "@namespace" },
  "@module.builtin": { link: "@namespace" },
  "@symbol": { fg: "green" },

  // markup (nvim-0.10 branch)
  "@markup": { fg: "foreground" },
  "@markup.heading": { fg: "blue" },
  "@markup.heading.1": { link: "@markup.heading" },
  "@markup.heading.2": { link: "@markup.heading" },
  "@markup.heading.3": { link: "@markup.heading" },
  "@markup.heading.4": { link: "@markup.heading" },
  "@markup.heading.5": { link: "@markup.heading" },
  "@markup.heading.6": { link: "@markup.heading" },
  "@markup.raw": { fg: "orange" },
  "@markup.raw.block": { link: "@markup.raw" },
  "@markup.link.url": { fg: "orange", underline: true },
  "@markup.link": { link: "@markup.link.url" },
  "@markup.link.label": { link: "@markup.link.url" },
  "@markup.list": { fg: "yellow" },
  "@markup.quote": { link: "@comment" },
  "@markup.math": { link: "@constant" },
  "@markup.environment": { link: "@keyword" },
  "@markup.strong": { bold: true },
  "@markup.emphasis": { italic: true },
  "@markup.underline": { underline: true },
  "@markup.strikethrough": { strikethrough: true },
  "@markup.todo": { fg: "yellow" },
  "@markup.warning": { fg: "orange" },
  "@markup.danger": { fg: "bright_red" },
  "@string.special.url": { link: "@markup.link.url" },

  "@comment.todo": { link: "Todo" },
  "@comment.warning": { link: "DiagnosticWarn" },
  "@comment.error": { link: "DiagnosticError" },
  "@comment.note": { link: "DiagnosticInfo" },

  // diff captures (tree-sitter-diff; mirror Added/Removed/Changed)
  "@diff.plus": { link: "Added" },
  "@diff.minus": { link: "Removed" },
  "@diff.delta": { link: "Changed" },
};
