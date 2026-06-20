import { useEffect } from "react";
import { applyTheme, useStore } from "../state/store";
import { useLibrary } from "../state/library";
import { hashId, setHash } from "../state/deeplink";
import type { Flavor } from "../core";
import { Topbar } from "./components/Topbar";
import { WorkspaceTabs } from "./components/WorkspaceTabs";
import { EditorToolbar } from "./components/EditorToolbar";
import { Properties } from "./components/Properties";
import { PaletteCard } from "./components/PaletteCard";
import { Preview } from "./components/Preview";
import { Export } from "./components/Export";
import { Toast } from "./components/Toast";

export function App() {
  const theme = useStore((s) => s.theme);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const loadLibrary = useLibrary((s) => s.load);
  const libStatus = useLibrary((s) => s.status);

  // Keep <html data-theme> in sync (the pre-paint script only handled light/dark).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Load the snapshot library lazily, then resolve any deep-link (SPEC §3.7).
  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (libStatus !== "ready") return;
    const apply = () => {
      const id = hashId();
      if (!id) return;
      const entry = useLibrary.getState().byId.get(id);
      if (!entry) return;
      const flavor = String(entry.system).toLowerCase() as Flavor;
      const st = useStore.getState();
      const ws = st[flavor];
      // Already showing this exact scheme, untouched — nothing to do.
      if (ws?.loadedFrom === id && st.flavor === flavor && !ws.touched) return;
      // No edits to lose — load straight away.
      if (!ws?.touched) {
        if (st.loadScheme(entry)) setHash(entry.id);
        return;
      }
      // Replacing edited work needs confirmation.
      if (
        window.confirm(
          `Load “${entry.name}”? This replaces your current scheme and can't be undone.`,
        )
      ) {
        if (st.loadScheme(entry)) setHash(entry.id);
      } else {
        setHash(useStore.getState()[useStore.getState().flavor].loadedFrom || "");
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [libStatus]);

  // Keyboard undo/redo, but not while editing a field (so native text undo works).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className="page-scene">
      <Topbar />
      <main className="studio-layout">
        <section className="editor-panel" aria-label="Scheme editor">
          <WorkspaceTabs />
          <EditorToolbar />
          <Properties />
          <PaletteCard />
        </section>
        <aside className="preview-panel" aria-label="Live preview">
          <Preview />
          <Export />
        </aside>
      </main>
      <Toast />
    </div>
  );
}
