/**
 * Deep-linking helpers (SPEC §3.7). Two hash forms:
 *  - `#<scheme-id>` — load a scheme from the bundled snapshot.
 *  - `#url=<encoded raw GitHub URL>` — fetch + import a scheme (YAML import spec).
 * Editing clears the hash so a reload restores the user's own work.
 */

export type HashTarget = { kind: "id"; id: string } | { kind: "url"; url: string };

/** `loadedFrom` prefix marking a workspace imported from a GitHub URL. */
export const URL_ORIGIN_PREFIX = "url:";

const URL_HASH_PREFIX = "url=";

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** Parse a `location.hash` string. Malformed encodings are ignored (null). */
export function parseHashString(hash: string): HashTarget | null {
  const raw = hash.replace(/^#/, "");
  if (!raw) return null;
  if (raw.startsWith(URL_HASH_PREFIX)) {
    const url = safeDecode(raw.slice(URL_HASH_PREFIX.length))?.trim();
    return url ? { kind: "url", url } : null;
  }
  const id = safeDecode(raw)?.trim();
  return id ? { kind: "id", id } : null;
}

export function parseHash(): HashTarget | null {
  if (typeof location === "undefined") return null;
  return parseHashString(location.hash);
}

function replaceHash(fragment: string): void {
  if (typeof location === "undefined" || typeof history === "undefined") return;
  const url = new URL(location.href);
  url.hash = fragment;
  history.replaceState(null, "", url);
}

export function setHash(id: string): void {
  replaceHash(id ? encodeURIComponent(id) : "");
}

export function setUrlHash(rawUrl: string): void {
  replaceHash(URL_HASH_PREFIX + encodeURIComponent(rawUrl));
}

/** Point the hash at whatever a workspace was loaded from (or clear it). */
export function restoreHash(loadedFrom: string | null | undefined): void {
  if (loadedFrom?.startsWith(URL_ORIGIN_PREFIX)) {
    setUrlHash(loadedFrom.slice(URL_ORIGIN_PREFIX.length));
  } else {
    setHash(loadedFrom || "");
  }
}

/** A shareable Studio link that imports `rawUrl` on open. */
export function buildShareLink(pageUrl: string, rawUrl: string): string {
  const url = new URL(pageUrl);
  url.hash = URL_HASH_PREFIX + encodeURIComponent(rawUrl);
  return url.toString();
}
