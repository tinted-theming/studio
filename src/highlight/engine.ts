/**
 * Browser tree-sitter highlighting engine.
 *
 * Loads the web-tree-sitter runtime + per-language grammar `.wasm` and the
 * (sanitized) nvim-treesitter `highlights.scm`, parses source, and returns
 * non-overlapping highlight spans tagged with capture names. Mapping spans →
 * colors is the caller's job (see src/theme), so spans are theme-independent and
 * can be re-colored without re-parsing.
 *
 * web-tree-sitter node indices are UTF-16 code units, i.e. directly usable as
 * JS string slice offsets.
 */

import { Parser, Language, Query } from "web-tree-sitter";
import { loadQuerySource } from "./queryLoader";
import { buildSpans, type RawCapture, type Span } from "./spans";

export type { Span } from "./spans";

/** Editable languages with vendored grammars (see scripts/grammars.json). */
export const SUPPORTED_LANGUAGES = [
  "rust",
  "typescript",
  "python",
  "lua",
  "go",
  "json",
  "bash",
  "kotlin",
  "commonlisp",
  "elixir",
  "haskell",
] as const;
export type Lang = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(lang: string): lang is Lang {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}

const BASE = import.meta.env.BASE_URL || "/";
const grammarUrl = (lang: string) => `${BASE}grammars/tree-sitter-${lang}.wasm`;
const queryUrl = (lang: string) => `${BASE}queries/${lang}/highlights.scm`;

let runtime: Promise<void> | null = null;
function initRuntime(): Promise<void> {
  runtime ??= Parser.init({ locateFile: () => `${BASE}grammars/tree-sitter.wasm` });
  return runtime;
}

interface LangModule {
  language: Language;
  query: Query;
}
const modules = new Map<string, Promise<LangModule>>();

async function fetchQuery(lang: string): Promise<string | null> {
  const res = await fetch(queryUrl(lang));
  return res.ok ? res.text() : null;
}

function loadModule(lang: string): Promise<LangModule> {
  let m = modules.get(lang);
  if (!m) {
    m = (async () => {
      await initRuntime();
      const language = await Language.load(grammarUrl(lang));
      const source = await loadQuerySource(lang, fetchQuery);
      const query = new Query(language, source);
      return { language, query };
    })();
    modules.set(lang, m);
  }
  return m;
}

let sharedParser: Parser | null = null;
function getParser(): Parser {
  sharedParser ??= new Parser();
  return sharedParser;
}

/** Eagerly load a language module (grammar + query). Resolves false on failure. */
export async function preloadLanguage(lang: string): Promise<boolean> {
  if (!isSupportedLanguage(lang)) return false;
  try {
    await loadModule(lang);
    return true;
  } catch (err) {
    console.error(`[highlight] failed to load "${lang}"`, err);
    modules.delete(lang); // allow a later retry
    return false;
  }
}

/**
 * Highlight `code` in `lang`, returning non-overlapping spans. Returns an empty
 * array for unsupported languages or on any parse/query failure (caller renders
 * plain text in that case).
 */
export async function highlight(lang: string, code: string): Promise<Span[]> {
  if (!isSupportedLanguage(lang) || code.length === 0) return [];
  let mod: LangModule;
  try {
    mod = await loadModule(lang);
  } catch {
    return [];
  }
  const parser = getParser();
  parser.setLanguage(mod.language);
  const tree = parser.parse(code);
  if (!tree) return [];
  try {
    const captures = mod.query.captures(tree.rootNode);
    const raw: RawCapture[] = captures.map((c) => {
      const prio = c.setProperties?.priority;
      return {
        start: c.node.startIndex,
        end: c.node.endIndex,
        capture: c.name,
        priority: prio != null ? Number(prio) : 100,
      };
    });
    return buildSpans(raw, code.length);
  } finally {
    tree.delete();
  }
}
