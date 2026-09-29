/**
 * `#url=` deep-link import (UI layer). Fetches + imports a GitHub scheme named
 * by the hash, guarding against the ways a slow fetch can go stale: the scheme
 * is already shown in some workspace, the hash moved on (a library pick, an
 * edit, another link), or a newer link superseded this one.
 */

import { toGithubRawUrl, type Flavor } from "../core";
import { parseHash, restoreHash, URL_ORIGIN_PREFIX } from "../state/deeplink";
import { useStore } from "../state/store";
import { applyImport } from "./import";
import { importFromUrl } from "./importYaml";
import { useToast } from "./toast";

const FLAVORS: Flavor[] = ["base16", "base24", "tinted8"];

interface UrlImportDeps {
  fetchImpl?: typeof fetch;
  /** The URL the hash currently names (null if none); checked when the fetch returns. */
  currentUrl?: () => string | null;
}

function hashUrl(): string | null {
  const target = parseHash();
  return target?.kind === "url" ? target.url : null;
}

/** Normalize to a raw URL for comparison; null if not an accepted GitHub URL. */
function rawOf(url: string | null): string | null {
  if (!url) return null;
  const norm = toGithubRawUrl(url);
  return norm.ok ? norm.url : null;
}

let latest = 0;
let inFlight: string | null = null;

export async function importUrlTarget(url: string, deps: UrlImportDeps = {}): Promise<void> {
  const { fetchImpl = fetch, currentUrl = hashUrl } = deps;
  const toast = useToast.getState().show;
  const norm = toGithubRawUrl(url);
  if (!norm.ok) {
    toast(norm.error);
    const st = useStore.getState();
    restoreHash(st[st.flavor].loadedFrom);
    return;
  }
  const origin = URL_ORIGIN_PREFIX + norm.url;
  const st = useStore.getState();
  // Already showing this exact import, unedited, in some workspace — just go there.
  const shown = FLAVORS.find((f) => st[f].loadedFrom === origin && !st[f].touched);
  if (shown) {
    if (st.flavor !== shown) st.setFlavor(shown);
    return;
  }
  if (inFlight === origin) return; // StrictMode double-invokes effects in dev
  inFlight = origin;
  const seq = ++latest;
  try {
    const { result } = await importFromUrl(norm.url, fetchImpl);
    // Stale: a newer link started, or the hash no longer names this URL.
    if (seq !== latest || rawOf(currentUrl()) !== norm.url) return;
    if (result.ok && applyImport(result.scheme, origin)) return;
    if (!result.ok) toast(`Couldn't load scheme: ${result.errors[0]}`);
    const now = useStore.getState();
    restoreHash(now[now.flavor].loadedFrom);
  } finally {
    if (inFlight === origin) inFlight = null;
  }
}
