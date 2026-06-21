/**
 * App state (Zustand). Three independent workspaces (one per system), page
 * theme, preview language, in-session undo/redo, and localStorage persistence.
 *
 * The store is the glue between the pure `core/` and the React `ui/`. All
 * scheme math lives in `core/`; this file owns mutation, history, and
 * persistence semantics — ported from the legacy state/undo/redo logic.
 */

import { create } from "zustand";
import {
  BASE16_SLOTS,
  BASE24_SLOTS,
  DEFAULT_BASE16,
  DEFAULT_BASE24,
  DEFAULT_TINTED8,
  extractTinted8BaseNormals,
  isOverridden,
  normalizeVariant,
  reconstructTinted8,
  type BasePalette,
  type BaseWorkspace,
  type Flavor,
  type RowDescriptor,
  type SchemeColor,
  type SchemeEntry,
  type Tinted8Workspace,
  type Variant,
} from "../core";
import { setHash } from "./deeplink";

export type PageTheme = "system" | "light" | "dark";

export const STATE_STORAGE_KEY = "tinted-studio-state";
export const PAGE_THEME_STORAGE_KEY = "tinted-studio-page-theme";
export const EDITOR_STORAGE_KEY = "tinted-studio-editor";
const MAX_HISTORY = 100;

/** The persisted, editable slice (also what undo/redo snapshots). */
export interface PersistData {
  flavor: Flavor;
  language: string;
  base16: BaseWorkspace;
  base24: BaseWorkspace;
  tinted8: Tinted8Workspace;
}

function freshData(): PersistData {
  return {
    flavor: "base16",
    language: "rust",
    base16: {
      meta: { name: "Untitled", author: "", slug: "", description: "", variant: "dark" },
      palette: { ...DEFAULT_BASE16 },
      loadedFrom: null,
      touched: false,
      authorByUser: false,
    },
    base24: {
      meta: { name: "Untitled", author: "", slug: "", description: "", variant: "dark" },
      palette: { ...DEFAULT_BASE24 },
      loadedFrom: null,
      touched: false,
      authorByUser: false,
    },
    tinted8: {
      meta: {
        name: "Untitled",
        author: "",
        slug: "",
        description: "",
        variant: "dark",
        family: "",
        style: "",
      },
      palette: { ...DEFAULT_TINTED8 },
      overrides: { palette: {}, ui: {}, syntax: {} },
      loadedFrom: null,
      touched: false,
      authorByUser: false,
    },
  };
}

/**
 * Shallow-merge a persisted/snapshot blob onto a fresh data object, so adding
 * fields later doesn't break an old saved blob. Ported from legacy mergeState.
 */
function mergeData(saved: unknown): PersistData {
  const base = freshData();
  if (!saved || typeof saved !== "object") return base;
  const s = saved as Record<string, unknown>;
  if (typeof s.flavor === "string") base.flavor = s.flavor as Flavor;
  if (typeof s.language === "string") base.language = s.language;
  for (const flavor of ["base16", "base24", "tinted8"] as const) {
    const w = s[flavor] as Record<string, unknown> | undefined;
    if (!w) continue;
    const target = base[flavor];
    if (w.meta) Object.assign(target.meta, w.meta);
    if (w.palette) Object.assign(target.palette, w.palette);
    if (typeof w.loadedFrom === "string" || w.loadedFrom === null) {
      target.loadedFrom = w.loadedFrom as string | null;
    }
    target.touched = Boolean(w.touched);
    target.authorByUser = Boolean(w.authorByUser);
    if (flavor === "tinted8" && w.overrides) {
      const ov = w.overrides as Tinted8Workspace["overrides"];
      base.tinted8.overrides.palette = ov.palette || {};
      base.tinted8.overrides.ui = ov.ui || {};
      base.tinted8.overrides.syntax = ov.syntax || {};
    }
  }
  return base;
}

function pickData(state: StudioState): PersistData {
  return {
    flavor: state.flavor,
    language: state.language,
    base16: state.base16,
    base24: state.base24,
    tinted8: state.tinted8,
  };
}

function loadData(): PersistData {
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return freshData();
    return mergeData(JSON.parse(raw));
  } catch {
    return freshData();
  }
}

function saveData(data: PersistData): void {
  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage full / unavailable — ignore */
  }
}

/**
 * Per-language editable code-editor content. Kept separate from PersistData (and
 * thus out of scheme undo/redo) — the editor's <textarea> has native undo, and
 * code edits must not interact with palette history.
 */
function loadEditorContent(): Record<string, string> {
  try {
    const raw = localStorage.getItem(EDITOR_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveEditorContent(content: Record<string, string>): void {
  try {
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(content));
  } catch {
    /* storage full / unavailable — ignore */
  }
}

function loadTheme(): PageTheme {
  try {
    const t = localStorage.getItem(PAGE_THEME_STORAGE_KEY);
    if (t === "light" || t === "dark" || t === "system") return t;
  } catch {
    /* ignore */
  }
  return "system";
}

/** Apply the page theme to <html> (mirrors the pre-paint inline script). */
export function applyTheme(theme: PageTheme): void {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

/** Deep-clone the editable slice for a history snapshot. */
function clone(data: PersistData): PersistData {
  return JSON.parse(JSON.stringify(data)) as PersistData;
}

export interface StudioState extends PersistData {
  theme: PageTheme;
  /** Per-language code-editor content (user edits; falls back to DEFAULT_PRESETS). */
  editorContent: Record<string, string>;
  /** Row keys whose input currently holds invalid/empty text (blocks export). */
  invalidSlots: Set<string>;
  // history (transient, not persisted)
  undoStack: PersistData[];
  redoStack: PersistData[];
  coalesceKey: string | null;
  canUndo: boolean;
  canRedo: boolean;

  // actions
  setFlavor: (flavor: Flavor) => void;
  setLanguage: (language: string) => void;
  /** Replace a language's editor content (persisted, no history). */
  setEditorContent: (language: string, text: string) => void;
  /** Drop a language's edits so it reverts to its default preset. */
  resetEditorContent: (language: string) => void;
  setTheme: (theme: PageTheme) => void;
  setMeta: (key: string, value: string) => void;
  setVariant: (variant: Variant) => void;
  commitSlot: (desc: RowDescriptor, hex: string) => void;
  clearSlot: (desc: RowDescriptor) => void;
  markInvalid: (key: string) => void;
  clearInvalid: (key: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  clearAll: () => void;
  /** Load a known scheme into its workspace as a pristine starting point. */
  loadScheme: (entry: SchemeEntry) => boolean;
  /** Apply an image-extracted palette as an editable, unsaved draft. */
  applyExtractedScheme: (
    system: "base16" | "base24",
    palette: BasePalette,
    name: string,
    author: string,
    variant: Variant,
  ) => boolean;
}

export const useStore = create<StudioState>((set, get) => {
  /** Record the pre-mutation snapshot; coalesce a run of edits to one control. */
  function pushHistory(coalesceId: string | null) {
    const st = get();
    if (coalesceId != null && coalesceId === st.coalesceKey) return;
    const undoStack = st.undoStack.concat([clone(pickData(st))]);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    set({
      undoStack,
      redoStack: [],
      coalesceKey: coalesceId,
      canUndo: undoStack.length > 0,
      canRedo: false,
    });
  }

  /** Apply a mutation to the active workspace, persist, and mark it touched. */
  function mutateActive(mutate: (data: PersistData) => void, markTouched = true) {
    const st = get();
    const data = clone(pickData(st));
    mutate(data);
    if (markTouched) {
      data[data.flavor].touched = true;
      // Once the user edits a deep-linked scheme, drop the hash so a reload
      // restores their edited work instead of re-applying the linked scheme.
      if (typeof location !== "undefined" && location.hash) setHash("");
    }
    saveData(data);
    set({ ...data });
  }

  function restore(snapshot: PersistData) {
    const data = clone(snapshot);
    saveData(data);
    set({ ...data, coalesceKey: null, invalidSlots: new Set() });
  }

  return {
    ...loadData(),
    theme: loadTheme(),
    editorContent: loadEditorContent(),
    invalidSlots: new Set<string>(),
    undoStack: [],
    redoStack: [],
    coalesceKey: null,
    canUndo: false,
    canRedo: false,

    setFlavor: (flavor) => {
      const data = { ...pickData(get()), flavor };
      saveData(data);
      // Switching workspaces discards any in-progress invalid input flags.
      set({ flavor, invalidSlots: new Set(), coalesceKey: null });
    },

    setLanguage: (language) => {
      set({ language });
      saveData(pickData(get()));
    },

    setEditorContent: (language, text) => {
      const editorContent = { ...get().editorContent, [language]: text };
      saveEditorContent(editorContent);
      set({ editorContent });
    },

    resetEditorContent: (language) => {
      const editorContent = { ...get().editorContent };
      delete editorContent[language];
      saveEditorContent(editorContent);
      set({ editorContent });
    },

    setTheme: (theme) => {
      applyTheme(theme);
      try {
        localStorage.setItem(PAGE_THEME_STORAGE_KEY, theme);
      } catch {
        /* ignore */
      }
      set({ theme });
    },

    setMeta: (key, value) => {
      const flavor = get().flavor;
      pushHistory(`meta:${flavor}:${key}`);
      mutateActive((data) => {
        (data[flavor].meta as unknown as Record<string, string>)[key] = value;
        // Editing the author field marks it as the user's own (so it can prefill
        // new-scheme dialogs, unlike an author taken from a preset).
        if (key === "author") data[flavor].authorByUser = true;
      });
    },

    setVariant: (variant) => {
      const flavor = get().flavor;
      if (get()[flavor].meta.variant === variant) return;
      pushHistory(`variant:${flavor}`);
      mutateActive((data) => {
        data[flavor].meta.variant = variant;
      });
    },

    commitSlot: (desc, hex) => {
      const flavor = get().flavor;
      pushHistory(`slot:${desc.scope}:${desc.storeKey}`);
      mutateActive((data) => setSlotValue(data, flavor, desc, hex));
      get().clearInvalid(fieldKeyOf(desc));
    },

    clearSlot: (desc) => {
      const flavor = get().flavor;
      pushHistory(`clear:${desc.scope}:${desc.storeKey}`);
      mutateActive((data) => clearSlotOverride(data, flavor, desc));
      get().clearInvalid(fieldKeyOf(desc));
    },

    markInvalid: (key) => {
      const st = get();
      const invalidSlots = new Set(st.invalidSlots);
      invalidSlots.add(key);
      // Touch the workspace so emptied-required indicators can show.
      const data = clone(pickData(st));
      data[data.flavor].touched = true;
      saveData(data);
      set({ ...data, invalidSlots });
    },

    clearInvalid: (key) => {
      const st = get();
      if (!st.invalidSlots.has(key)) return;
      const invalidSlots = new Set(st.invalidSlots);
      invalidSlots.delete(key);
      set({ invalidSlots });
    },

    undo: () => {
      const st = get();
      if (!st.undoStack.length) return;
      const undoStack = st.undoStack.slice();
      const snapshot = undoStack.pop()!;
      const redoStack = st.redoStack.concat([clone(pickData(st))]);
      set({ undoStack, redoStack, canUndo: undoStack.length > 0, canRedo: true });
      restore(snapshot);
    },

    redo: () => {
      const st = get();
      if (!st.redoStack.length) return;
      const redoStack = st.redoStack.slice();
      const snapshot = redoStack.pop()!;
      const undoStack = st.undoStack.concat([clone(pickData(st))]);
      set({ undoStack, redoStack, canUndo: true, canRedo: redoStack.length > 0 });
      restore(snapshot);
    },

    reset: () => {
      const flavor = get().flavor;
      pushHistory(`reset:${flavor}`);
      mutateActive((data) => resetWorkspace(data, flavor), false);
      set({ invalidSlots: new Set() });
    },

    clearAll: () => {
      const flavor = get().flavor;
      pushHistory(`clear-all:${flavor}`);
      mutateActive((data) => resetWorkspace(data, flavor), false);
      set({ invalidSlots: new Set() });
    },

    loadScheme: (entry) => {
      pushHistory(`load:${entry.id}`);
      const data = clone(pickData(get()));
      if (!applyEntry(data, entry)) {
        // Unknown system — undo the just-pushed history step.
        const st = get();
        const undoStack = st.undoStack.slice(0, -1);
        set({ undoStack, canUndo: undoStack.length > 0 });
        return false;
      }
      // A freshly loaded scheme is pristine (not yet edited).
      data[data.flavor].touched = false;
      saveData(data);
      set({ ...data, invalidSlots: new Set(), coalesceKey: null });
      return true;
    },

    applyExtractedScheme: (system, palette, name, author, variant) => {
      const wrapped: Record<string, SchemeColor> = {};
      for (const k of Object.keys(palette)) wrapped[k] = { hex_str: palette[k]! };
      const entry: SchemeEntry = {
        id: "",
        system,
        name: name || "Untitled",
        author: author || "",
        slug: "",
        variant,
        palette: wrapped,
      };
      pushHistory(`extract:${system}`);
      const data = clone(pickData(get()));
      if (!applyEntry(data, entry)) {
        const st = get();
        const undoStack = st.undoStack.slice(0, -1);
        set({ undoStack, canUndo: undoStack.length > 0 });
        return false;
      }
      // An extraction is an unsaved draft: mark it touched and drop any loaded /
      // deep-link identity so Reset falls back to stock and a reload restores
      // the draft without a confirm prompt.
      data[system].touched = true;
      data[system].loadedFrom = null;
      // The author was confirmed by the user in the extract dialog (the dialog
      // only ever prefills a user-entered author), so treat it as their own.
      data[system].authorByUser = Boolean(author.trim());
      saveData(data);
      set({ ...data, invalidSlots: new Set(), coalesceKey: null });
      if (typeof location !== "undefined" && location.hash) setHash("");
      return true;
    },
  };
});

/* ---------- Slot value access (mirrors legacy setValue/clearOverride) ---------- */

function fieldKeyOf(desc: RowDescriptor): string {
  return `${desc.scope}:${desc.storeKey}:${desc.fullKey}`;
}

/** Replace the active workspace with its stock default (narrowed per flavor). */
function resetWorkspace(data: PersistData, flavor: Flavor): void {
  const fresh = freshData();
  if (flavor === "tinted8") data.tinted8 = fresh.tinted8;
  else data[flavor] = fresh[flavor];
}

/**
 * Apply a known-scheme snapshot entry into its workspace and make it active.
 * Tinted8 reconstructs the minimal override set from the expanded snapshot
 * (skipping orange-dim). Mirrors the legacy applyEntryToState.
 */
function applyEntry(data: PersistData, entry: SchemeEntry): boolean {
  const flavor = String(entry.system).toLowerCase();
  const variant = normalizeVariant(entry.variant);
  if (flavor === "base16" || flavor === "base24") {
    const ws = data[flavor];
    const slots = flavor === "base16" ? BASE16_SLOTS : BASE24_SLOTS;
    slots.forEach(([key]) => {
      const v = entry.palette?.[key]?.hex_str;
      if (v) ws.palette[key] = v.toLowerCase();
    });
    ws.meta = {
      name: entry.name || "Untitled",
      author: entry.author || "",
      slug: entry.slug || "",
      description: "",
      variant,
    };
    ws.loadedFrom = entry.id;
    // The author came from a preset, not the user — don't prefill it elsewhere.
    ws.authorByUser = false;
    data.flavor = flavor;
    return true;
  }
  if (flavor === "tinted8") {
    const t8 = data.tinted8;
    t8.meta = {
      name: entry.name || "Untitled",
      author: entry.author || "",
      slug: entry.slug || "",
      description: entry.description || "",
      family: entry.family || "",
      style: entry.style || "",
      variant,
    };
    Object.assign(t8.palette, extractTinted8BaseNormals(entry));
    t8.overrides = reconstructTinted8(t8.palette, variant, entry);
    t8.loadedFrom = entry.id;
    t8.authorByUser = false;
    data.flavor = "tinted8";
    return true;
  }
  return false;
}

function setSlotValue(data: PersistData, flavor: Flavor, desc: RowDescriptor, hex: string): void {
  if (flavor !== "tinted8") {
    data[flavor].palette[desc.fullKey] = hex;
    return;
  }
  const t8 = data.tinted8;
  if (desc.required) {
    t8.palette[desc.storeKey] = hex;
  } else if (desc.scope === "palette") {
    t8.overrides.palette[desc.storeKey] = hex;
  } else {
    t8.overrides[desc.scope][desc.storeKey] = hex;
  }
}

function clearSlotOverride(data: PersistData, flavor: Flavor, desc: RowDescriptor): void {
  if (flavor !== "tinted8") return;
  const t8 = data.tinted8;
  if (desc.scope === "palette") delete t8.overrides.palette[desc.storeKey];
  else delete t8.overrides[desc.scope][desc.storeKey];
}

export { freshData, mergeData, isOverridden };
