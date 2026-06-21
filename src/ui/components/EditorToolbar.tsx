import { useRef } from "react";
import { useStore } from "../../state/store";
import { useLibrary } from "../../state/library";
import { setHash } from "../../state/deeplink";
import { useExtract } from "../extract";
import { IconImage, IconRedo, IconReset, IconTrash, IconUndo } from "../icons";
import { LibraryPicker } from "./LibraryPicker";

export function EditorToolbar() {
  const flavor = useStore((s) => s.flavor);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const reset = useStore((s) => s.reset);
  const clearAll = useStore((s) => s.clearAll);
  const loadScheme = useStore((s) => s.loadScheme);
  const byId = useLibrary((s) => s.byId);
  const openExtract = useExtract((s) => s.openWith);
  const fileInput = useRef<HTMLInputElement>(null);

  // Reset reverts to the scheme this workspace was loaded from, or stock if it
  // was started blank (SPEC §3.9). Confirmed; not undoable in one step.
  const onReset = () => {
    const loadedId = useStore.getState()[flavor].loadedFrom;
    const entry = loadedId ? byId.get(loadedId) : null;
    const target = entry ? `“${entry.name}”` : "the default starting colors";
    if (
      !window.confirm(
        `Reset this scheme to ${target}? Your changes will be discarded and this can't be undone.`,
      )
    ) {
      return;
    }
    if (entry) loadScheme(entry);
    else reset();
    setHash(useStore.getState()[flavor].loadedFrom || "");
  };

  const onClear = () => {
    const extra = flavor === "tinted8" ? ", palette and overrides" : " and palette";
    if (
      !window.confirm(
        `Clear everything back to a blank scheme? All properties${extra} reset to stock colors.`,
      )
    ) {
      return;
    }
    clearAll();
    setHash("");
  };

  return (
    <div className="editor-toolbar">
      <LibraryPicker />
      <div className="toolbar-actions">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) openExtract(file);
            e.target.value = "";
          }}
        />
        <button
          className="button button-ghost reset-button"
          title="Extract a scheme from an image"
          onClick={() => fileInput.current?.click()}
        >
          <IconImage />
          <span>From image</span>
        </button>
        <div className="history-controls" role="group" aria-label="History">
          <button
            className="icon-button"
            title="Undo (⌘Z)"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={undo}
          >
            <IconUndo />
          </button>
          <button
            className="icon-button"
            title="Redo (⇧⌘Z)"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={redo}
          >
            <IconRedo />
          </button>
        </div>
        <button
          className="button button-ghost reset-button"
          title="Restore this scheme to its starting point"
          onClick={onReset}
        >
          <IconReset />
          <span>Reset</span>
        </button>
        <button
          className="button button-ghost reset-button"
          title="Clear everything back to a blank scheme"
          onClick={onClear}
        >
          <IconTrash />
          <span>Clear all</span>
        </button>
      </div>
    </div>
  );
}
