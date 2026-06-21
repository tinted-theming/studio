/**
 * Fixed, non-editable previews, marked up with role classes colored via
 * --preview-* CSS variables (SPEC §7): the Terminal ANSI snippet and the unified
 * Diff snippet. All other languages are live, user-editable code in the
 * tree-sitter editor (see ./presets and ui/components/CodeEditor).
 */
import terminal from "./terminal.html?raw";
import diff from "./diff.html?raw";

export const SNIPPETS: Record<string, string> = {
  terminal,
  diff,
};
