/**
 * The known-scheme library (SPEC §9). The snapshot is ~1.2 MB, so it is loaded
 * lazily and kept out of the main bundle: `?url` resolves to the asset URL (a
 * separate file in the build) and we `fetch` it on first need (when the picker
 * mounts / a deep-link resolves), not at first paint.
 */

import { create } from "zustand";
import { indexSchemes, type SchemeEntry } from "../core";
import schemesUrl from "../../data/schemes.json?url";

type LibraryStatus = "idle" | "loading" | "ready" | "error";

interface LibraryState {
  entries: SchemeEntry[];
  byId: Map<string, SchemeEntry>;
  status: LibraryStatus;
  load: () => Promise<void>;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  entries: [],
  byId: new Map(),
  status: "idle",
  load: async () => {
    if (get().status !== "idle") return;
    set({ status: "loading" });
    try {
      const res = await fetch(schemesUrl);
      const data = (await res.json()) as SchemeEntry[];
      const entries = Array.isArray(data) ? data : [];
      set({ entries, byId: indexSchemes(entries), status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },
}));
