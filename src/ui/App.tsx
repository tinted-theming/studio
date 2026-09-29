import { useEffect } from "react";
import { applyTheme, useStore } from "../state/store";
import { useLibrary } from "../state/library";
import { parseHash, restoreHash, setHash, URL_ORIGIN_PREFIX } from "../state/deeplink";
import { toGithubRawUrl, type Flavor } from "../core";
import { Topbar } from "./components/Topbar";
import { WorkspaceTabs } from "./components/WorkspaceTabs";
import { EditorToolbar } from "./components/EditorToolbar";
import { Properties } from "./components/Properties";
import { PaletteCard } from "./components/PaletteCard";
import { Preview } from "./components/Preview";
import { Export } from "./components/Export";
import { Toast } from "./components/Toast";
import { Dropzone } from "./components/Dropzone";
import { ExtractDialog } from "./components/ExtractDialog";
import { ImportDialog } from "./components/ImportDialog";
import { applyImport } from "./import";
import { importFromUrl } from "./importYaml";
import { useToast } from "./toast";

/** The `#url=` import currently in flight (StrictMode runs effects twice in dev). */
let urlImportInFlight: string | null = null;

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
      const target = parseHash();
      if (target?.kind !== "id") return;
      const id = target.id;
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
        restoreHash(useStore.getState()[useStore.getState().flavor].loadedFrom);
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [libStatus]);

  // `#url=<raw GitHub URL>` deep-links: fetch + import on open and on hash change.
  // Independent of the snapshot library, which it doesn't need.
  useEffect(() => {
    const apply = () => {
      const target = parseHash();
      if (target?.kind !== "url") return;
      const toast = useToast.getState().show;
      const norm = toGithubRawUrl(target.url);
      if (!norm.ok) {
        toast(norm.error);
        const st = useStore.getState();
        restoreHash(st[st.flavor].loadedFrom);
        return;
      }
      const origin = URL_ORIGIN_PREFIX + norm.url;
      const st = useStore.getState();
      // Already showing this exact import, unedited — nothing to do.
      if (st[st.flavor].loadedFrom === origin && !st[st.flavor].touched) return;
      if (urlImportInFlight === origin) return;
      urlImportInFlight = origin;
      void importFromUrl(norm.url).then(({ result }) => {
        urlImportInFlight = null;
        if (result.ok && applyImport(result.scheme, origin)) return;
        if (!result.ok) toast(`Couldn't load scheme: ${result.errors[0]}`);
        const now = useStore.getState();
        restoreHash(now[now.flavor].loadedFrom);
      });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

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
      <div className="desk">
        <div className="sheet">
          <div className="workspace-bar">
            <WorkspaceTabs />
          </div>
          <main className="studio-layout">
            <section className="editor-panel" aria-label="Scheme editor">
              <EditorToolbar />
              <Properties />
              <PaletteCard />
            </section>
            <aside className="preview-panel" aria-label="Live preview">
              <Preview />
              <Export />
            </aside>
          </main>
        </div>
      </div>
      <Dropzone />
      <ExtractDialog />
      <ImportDialog />
      <Toast />
    </div>
  );
}
