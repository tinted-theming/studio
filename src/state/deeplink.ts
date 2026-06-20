/**
 * Deep-linking helpers (SPEC §3.7). `#<scheme-id>` in the URL identifies a
 * scheme to load; editing clears the hash so a reload restores the user's own
 * work. Ported from the legacy hashId/setHash.
 */

export function hashId(): string {
  if (typeof location === "undefined") return "";
  return decodeURIComponent(location.hash.replace(/^#/, "")).trim();
}

export function setHash(id: string): void {
  if (typeof location === "undefined" || typeof history === "undefined") return;
  const url = new URL(location.href);
  url.hash = id ? encodeURIComponent(id) : "";
  history.replaceState(null, "", url);
}
