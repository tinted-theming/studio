/**
 * YAML import I/O adapter (UI layer). Turns pasted text or a GitHub URL into an
 * `ImportResult`: fetch (bounded) → js-yaml (lazy, FAILSAFE schema) → the pure
 * `parseSchemeDocument`. No store access here — see `./import.ts` for applying.
 */

import { parseSchemeDocument, toGithubRawUrl, type ImportResult } from "../core";

export const MAX_IMPORT_BYTES = 256 * 1024;
export const FETCH_TIMEOUT_MS = 10_000;

const TOO_LARGE = `That file is too large (limit ${MAX_IMPORT_BYTES / 1024} KB).`;

/**
 * Parse scheme YAML text. FAILSAFE_SCHEMA keeps every scalar a string, so
 * unquoted legacy hex like `000e00` is never coerced to a number.
 */
export async function parseYamlText(text: string): Promise<ImportResult> {
  if (!text.trim()) return { ok: false, errors: ["Paste some scheme YAML."] };
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: [TOO_LARGE] };
  const { load, FAILSAFE_SCHEMA, YAMLException } = await import("js-yaml");
  let doc: unknown;
  try {
    doc = load(text, { schema: FAILSAFE_SCHEMA });
  } catch (e) {
    if (e instanceof YAMLException) {
      const { line, column } = e.mark;
      return {
        ok: false,
        errors: [`YAML syntax error at line ${line + 1}, column ${column + 1}: ${e.reason}`],
      };
    }
    return { ok: false, errors: [`Couldn't parse YAML: ${(e as Error)?.message ?? String(e)}`] };
  }
  return parseSchemeDocument(doc);
}

/** Fetch a raw scheme file with a timeout and size cap. */
export async function fetchSchemeText(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(rawUrl, { signal: controller.signal });
    if (res.status === 404) {
      return { ok: false, error: "File not found (404). Check the branch and path." };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `GitHub returned ${res.status}${res.statusText ? ` ${res.statusText}` : ""}.`,
      };
    }
    if (Number(res.headers.get("content-length")) > MAX_IMPORT_BYTES) {
      return { ok: false, error: TOO_LARGE };
    }
    const text = await res.text();
    if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: TOO_LARGE };
    return { ok: true, text };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      return { ok: false, error: "Timed out fetching the file." };
    }
    return {
      ok: false,
      error: "Couldn't fetch the file (network error or blocked by the browser).",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Normalize a GitHub URL, fetch it, and parse it. `rawUrl` is null if the URL was rejected. */
export async function importFromUrl(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ rawUrl: string | null; result: ImportResult }> {
  const norm = toGithubRawUrl(input);
  if (!norm.ok) return { rawUrl: null, result: { ok: false, errors: [norm.error] } };
  const fetched = await fetchSchemeText(norm.url, fetchImpl);
  if (!fetched.ok) return { rawUrl: norm.url, result: { ok: false, errors: [fetched.error] } };
  return { rawUrl: norm.url, result: await parseYamlText(fetched.text) };
}
