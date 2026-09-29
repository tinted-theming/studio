/**
 * YAML-import dialog state + applying an import (UI layer). Parsing/fetching
 * lives in `./importYaml.ts`; this file owns the dialog form, stale-result
 * guards, the confirm-before-replace prompt, the hash, and toasts.
 */

import { create } from "zustand";
import type { Flavor, ImportedScheme, ImportResult } from "../core";
import { buildShareLink, restoreHash, URL_ORIGIN_PREFIX } from "../state/deeplink";
import { useStore } from "../state/store";
import { useToast } from "./toast";
import { importFromUrl, parseYamlText } from "./importYaml";

export type ImportTab = "paste" | "url";

export const SYSTEM_LABELS: Record<Flavor, string> = {
  base16: "Base16",
  base24: "Base24",
  tinted8: "Tinted8",
};

const PARSE_DEBOUNCE_MS = 200;

/**
 * Load an imported scheme into its workspace, confirming first if that
 * workspace has edits. Returns false if the user cancelled.
 */
export function applyImport(scheme: ImportedScheme, origin: string | null): boolean {
  const st = useStore.getState();
  const label = SYSTEM_LABELS[scheme.system];
  if (
    st[scheme.system].touched &&
    !window.confirm(`Load “${scheme.meta.name}”? This replaces your current ${label} scheme.`)
  ) {
    return false;
  }
  st.loadImported(scheme, origin);
  restoreHash(origin);
  useToast.getState().show(`Loaded “${scheme.meta.name}” into ${label}`);
  return true;
}

export async function copyShareLink(rawUrl: string): Promise<void> {
  const link = buildShareLink(location.href, rawUrl);
  try {
    await navigator.clipboard.writeText(link);
    useToast.getState().show("Share link copied");
  } catch {
    useToast.getState().show("Copy failed — the link is in the address bar after loading");
  }
}

interface ImportState {
  open: boolean;
  tab: ImportTab;
  text: string;
  pasteResult: ImportResult | null;
  urlInput: string;
  rawUrl: string | null;
  urlResult: ImportResult | null;
  fetching: boolean;
  openDialog: (tab?: ImportTab) => void;
  close: () => void;
  setTab: (tab: ImportTab) => void;
  setText: (text: string) => void;
  setUrlInput: (value: string) => void;
  fetchUrl: () => Promise<void>;
  load: () => void;
}

// Sequence numbers drop results that arrive after newer input (or after close).
let parseTimer: ReturnType<typeof setTimeout> | null = null;
let parseSeq = 0;
let fetchSeq = 0;

const INITIAL = {
  open: false,
  tab: "paste" as ImportTab,
  text: "",
  pasteResult: null,
  urlInput: "",
  rawUrl: null,
  urlResult: null,
  fetching: false,
};

export const useImport = create<ImportState>((set, get) => ({
  ...INITIAL,

  openDialog: (tab = "paste") => set({ ...INITIAL, open: true, tab }),

  close: () => {
    if (parseTimer) clearTimeout(parseTimer);
    parseSeq++;
    fetchSeq++;
    set({ ...INITIAL });
  },

  setTab: (tab) => set({ tab }),

  setText: (text) => {
    set({ text });
    if (parseTimer) clearTimeout(parseTimer);
    const seq = ++parseSeq;
    if (!text.trim()) {
      set({ pasteResult: null });
      return;
    }
    parseTimer = setTimeout(() => {
      void parseYamlText(text).then((pasteResult) => {
        if (seq === parseSeq) set({ pasteResult });
      });
    }, PARSE_DEBOUNCE_MS);
  },

  setUrlInput: (urlInput) => {
    fetchSeq++;
    set({ urlInput, rawUrl: null, urlResult: null, fetching: false });
  },

  fetchUrl: async () => {
    const input = get().urlInput.trim();
    if (!input) return;
    const seq = ++fetchSeq;
    set({ fetching: true, rawUrl: null, urlResult: null });
    const { rawUrl, result } = await importFromUrl(input);
    if (seq !== fetchSeq) return;
    set({ fetching: false, rawUrl, urlResult: result });
  },

  load: () => {
    const s = get();
    const result = s.tab === "paste" ? s.pasteResult : s.urlResult;
    if (!result?.ok) return;
    const origin = s.tab === "url" && s.rawUrl ? URL_ORIGIN_PREFIX + s.rawUrl : null;
    if (applyImport(result.scheme, origin)) get().close();
  },
}));
