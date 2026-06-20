/**
 * The 7 preview code snippets, pre-marked-up with role classes (.keyword,
 * .string, .ansi-*, …) that the preview colors via --preview-* CSS variables
 * (SPEC §7). Imported as raw HTML at build time and injected into the preview's
 * <code> element.
 */
import rust from "./rust.html?raw";
import kotlin from "./kotlin.html?raw";
import lisp from "./lisp.html?raw";
import elixir from "./elixir.html?raw";
import haskell from "./haskell.html?raw";
import diff from "./diff.html?raw";
import terminal from "./terminal.html?raw";

export const SNIPPETS: Record<string, string> = {
  rust,
  kotlin,
  lisp,
  elixir,
  haskell,
  diff,
  terminal,
};
