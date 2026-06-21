/**
 * Image-extraction dialog state + orchestration (UI layer).
 *
 * Holds the dialog's form, decodes the dropped/picked image (impure adapter),
 * runs the pure `extractScheme`, and applies the result as a workspace draft.
 * Lives in `src/ui` because it touches the DOM/colorthief adapter and the toast.
 */

import { create } from "zustand";
import { extractScheme, type Variant } from "../core";
import { useStore } from "../state/store";
import { useToast } from "./toast";
import { decodeForExtraction, type DecodeResult } from "./decode";

const SYSTEM_LABELS = { base16: "Base16", base24: "Base24" } as const;

/** Prettify a filename into a scheme name: drop extension, spaces, Title Case. */
export function fileNameToSchemeName(name: string): string {
  const base = String(name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!base) return "Untitled";
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ExtractState {
  open: boolean;
  file: File | null;
  thumbUrl: string | null;
  decoded: DecodeResult | null;
  decoding: boolean;
  status: string | null;
  name: string;
  author: string;
  system: "base16" | "base24";
  variant: Variant;
  openWith: (file: File) => void;
  close: () => void;
  setName: (v: string) => void;
  setAuthor: (v: string) => void;
  setSystem: (v: "base16" | "base24") => void;
  setVariant: (v: Variant) => void;
  run: () => void;
}

export const useExtract = create<ExtractState>((set, get) => ({
  open: false,
  file: null,
  thumbUrl: null,
  decoded: null,
  decoding: false,
  status: null,
  name: "",
  author: "",
  system: "base16",
  variant: "dark",

  openWith: (file) => {
    if (!file.type.startsWith("image/")) {
      useToast.getState().show("That file isn't an image");
      return;
    }
    const prev = get().thumbUrl;
    if (prev) URL.revokeObjectURL(prev);

    const app = useStore.getState();
    const flavor = app.flavor;
    const ws = app[flavor];
    // Extraction targets only Base16/Base24, so Tinted8 defaults to Base16.
    const system = flavor === "base24" ? "base24" : "base16";
    const thumbUrl = URL.createObjectURL(file);
    set({
      open: true,
      file,
      thumbUrl,
      decoded: null,
      decoding: true,
      status: null,
      name: fileNameToSchemeName(file.name),
      // Only carry over an author the user entered themselves — never one
      // inherited from a loaded preset.
      author: ws.authorByUser ? ws.meta.author || "" : "",
      system,
      variant: ws.meta.variant,
    });

    decodeForExtraction(file).then(
      (decoded) => {
        if (get().file === file) set({ decoded, decoding: false });
      },
      (e: unknown) => {
        if (get().file === file) {
          set({ decoding: false, status: (e as Error)?.message || "Couldn't read that image." });
        }
      },
    );
  },

  close: () => {
    const prev = get().thumbUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({ open: false, file: null, thumbUrl: null, decoded: null, decoding: false, status: null });
  },

  setName: (name) => set({ name }),
  setAuthor: (author) => set({ author }),
  setSystem: (system) => set({ system }),
  setVariant: (variant) => set({ variant }),

  run: () => {
    const { decoded, name, author, system, variant } = get();
    if (!decoded) return;
    set({ status: null });
    try {
      const palette = extractScheme({
        pixels: decoded.pixels,
        width: decoded.width,
        height: decoded.height,
        dominantPalette: decoded.dominantPalette,
        system,
        variant,
      });
      const ok = useStore
        .getState()
        .applyExtractedScheme(system, palette, name.trim(), author.trim(), variant);
      get().close();
      if (ok) useToast.getState().show(`Extracted ${SYSTEM_LABELS[system]} scheme`);
    } catch (e) {
      set({ status: (e as Error)?.message || "Extraction failed." });
    }
  },
}));
