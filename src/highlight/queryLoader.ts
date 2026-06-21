/**
 * Loads nvim-treesitter `highlights.scm` and adapts it for web-tree-sitter's query
 * engine, which (unlike Neovim) understands no runtimepath, modelines, or
 * Neovim-specific predicates. We:
 *   1. resolve `; inherits: a,b` by prepending the inherited languages' queries,
 *   2. rewrite `#lua-match?` / `#not-lua-match?` to `#match?` / `#not-match?`
 *      (translating the Lua pattern to a JS regexp), and
 *   3. drop any other unsupported predicate (e.g. `#contains?`, `#has-parent?`),
 *      which would otherwise make `new Query(...)` throw.
 * `#set!` directives and the natively-supported predicates are preserved.
 */

const SUPPORTED_PREDICATES = new Set([
  "eq?",
  "not-eq?",
  "any-eq?",
  "any-not-eq?",
  "match?",
  "not-match?",
  "any-match?",
  "not-any-match?",
  "any-of?",
  "not-any-of?",
]);

/** Translate a Lua string pattern into an equivalent JS RegExp source. */
export function luaPatternToRegex(p: string): string {
  // `%X` character classes; tracked for inside-vs-outside `[...]` context.
  const classBody: Record<string, string> = {
    d: "0-9",
    s: " \\t\\r\\n\\f",
    w: "A-Za-z0-9",
    a: "A-Za-z",
    u: "A-Z",
    l: "a-z",
    x: "0-9A-Fa-f",
    p: "!-/:-@\\[-`{-~",
  };
  let out = "";
  let inClass = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i]!;
    if (c === "%") {
      const n = p[++i];
      if (n === undefined) {
        out += "%";
      } else if (n in classBody) {
        out += inClass ? classBody[n] : `[${classBody[n]}]`;
      } else {
        out += "\\" + n; // %. %[ %- … → escaped literal
      }
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    out += c;
  }
  return out;
}

/** True if `(#name ...)` is a supported predicate or a `#set!` directive we keep. */
function keepPredicate(name: string): boolean {
  return SUPPORTED_PREDICATES.has(name) || name.endsWith("!");
}

/**
 * Walk the query source, rewriting/dropping `(#...)` predicate s-expressions.
 * String- and comment-aware so parentheses inside literals/comments are ignored.
 */
function sanitizePredicates(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === ";") {
      // line comment: copy to end of line
      const eol = src.indexOf("\n", i);
      const end = eol === -1 ? n : eol;
      out += src.slice(i, end);
      i = end;
      continue;
    }
    if (c === '"') {
      // string literal: copy verbatim
      let j = i + 1;
      while (j < n && !(src[j] === '"' && src[j - 1] !== "\\")) j++;
      out += src.slice(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }
    if (c === "(" && src[i + 1] === "#") {
      // read predicate name
      let j = i + 2;
      let name = "";
      while (j < n && !/\s/.test(src[j]!) && src[j] !== ")") name += src[j++];
      // capture the whole balanced s-expression
      let depth = 0;
      let k = i;
      let inStr = false;
      for (; k < n; k++) {
        const ch = src[k]!;
        if (inStr) {
          if (ch === '"' && src[k - 1] !== "\\") inStr = false;
        } else if (ch === '"') inStr = true;
        else if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          if (depth === 0) {
            k++;
            break;
          }
        }
      }
      const sexpr = src.slice(i, k);
      i = k;
      if (name === "lua-match?" || name === "not-lua-match?") {
        const target = name === "lua-match?" ? "match?" : "not-match?";
        out += sexpr.replace(/^\(#lua-match\?|^\(#not-lua-match\?/, `(#${target}`).replace(
          /"((?:[^"\\]|\\.)*)"/,
          (_m, body: string) => `"${luaPatternToRegex(body)}"`,
        );
      } else if (keepPredicate(name)) {
        out += sexpr;
      }
      // else: drop unsupported predicate entirely
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Extract the `inherits` languages from a modeline, if present. */
function parseInherits(src: string): string[] {
  const m = src.match(/^\s*;+\s*inherits\s*:\s*(.+)$/im);
  if (!m) return [];
  return m[1]!
    .split(",")
    .map((s) => s.trim().replace(/[()]/g, ""))
    .filter(Boolean);
}

export type FetchQuery = (lang: string) => Promise<string | null>;

/**
 * Resolve a language's full highlights query: inherited queries first (so the
 * current language's later patterns win), then sanitized for web-tree-sitter.
 */
export async function loadQuerySource(lang: string, fetchQuery: FetchQuery): Promise<string> {
  const seen = new Set<string>();
  const parts: string[] = [];
  async function visit(l: string): Promise<void> {
    if (seen.has(l)) return;
    seen.add(l);
    const src = await fetchQuery(l);
    if (src == null) return;
    for (const dep of parseInherits(src)) await visit(dep); // inherited first
    parts.push(src);
  }
  await visit(lang);
  return sanitizePredicates(parts.join("\n"));
}
