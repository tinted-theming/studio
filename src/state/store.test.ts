import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BASE16,
  DEFAULT_BASE24,
  DEFAULT_TINTED8,
  paletteRowDescriptors,
  type ImportedScheme,
  type SchemeEntry,
} from "../core";
import { freshData, mergeData, useStore } from "./store";

function resetStore() {
  useStore.setState({
    ...freshData(),
    undoStack: [],
    redoStack: [],
    coalesceKey: null,
    canUndo: false,
    canRedo: false,
    invalidSlots: new Set(),
  });
}

const imported24 = (): ImportedScheme => ({
  system: "base24",
  meta: { name: "Imported", author: "Ann", slug: "imported", description: "", variant: "light" },
  palette: { ...DEFAULT_BASE24, base08: "#ff0000" },
});

const importedT8 = (): ImportedScheme => ({
  system: "tinted8",
  meta: {
    name: "T8",
    author: "Ann",
    slug: "t8",
    description: "",
    variant: "dark",
    family: "F",
    style: "S",
  },
  palette: { ...DEFAULT_TINTED8, red: "#ee0000" },
  overrides: { palette: { "orange-dim": "#884400" }, ui: {}, syntax: { string: "#00ff00" } },
});

const base08 = () => paletteRowDescriptors("base24").find((d) => d.fullKey === "base08")!;

beforeEach(resetStore);

describe("loadImported", () => {
  it("loads into the matching workspace, switches to it, and records a baseline", () => {
    useStore
      .getState()
      .loadImported(imported24(), "url:https://raw.githubusercontent.com/o/r/m/a.yaml");
    const st = useStore.getState();
    expect(st.flavor).toBe("base24");
    expect(st.base24.palette.base08).toBe("#ff0000");
    expect(st.base24.meta.name).toBe("Imported");
    expect(st.base24.touched).toBe(false);
    expect(st.base24.authorByUser).toBe(false);
    expect(st.base24.loadedFrom).toBe("url:https://raw.githubusercontent.com/o/r/m/a.yaml");
    expect(st.base24.baseline).toEqual(imported24());
    expect(st.canUndo).toBe(true);
  });

  it("loads Tinted8 overrides as authored", () => {
    useStore.getState().loadImported(importedT8(), null);
    const t8 = useStore.getState().tinted8;
    expect(t8.palette.red).toBe("#ee0000");
    expect(t8.overrides).toEqual(importedT8().overrides);
    expect(t8.meta).toMatchObject({ family: "F", style: "S" });
    expect(t8.loadedFrom).toBeNull();
  });

  it("is undoable", () => {
    useStore.getState().loadImported(imported24(), null);
    useStore.getState().undo();
    expect(useStore.getState().base24.palette).toEqual(DEFAULT_BASE24);
    expect(useStore.getState().flavor).toBe("base16");
  });

  it("does not share references with the passed scheme", () => {
    const scheme = imported24();
    useStore.getState().loadImported(scheme, null);
    scheme.palette.base00 = "#123456";
    expect(useStore.getState().base24.palette.base00).toBe(DEFAULT_BASE24.base00);
    expect(useStore.getState().base24.baseline!.palette.base00).toBe(DEFAULT_BASE24.base00);
  });
});

describe("reset with a baseline", () => {
  it("returns an edited import to the imported scheme, not stock", () => {
    useStore.getState().loadImported(imported24(), null);
    useStore.getState().commitSlot(base08(), "#00ff00");
    expect(useStore.getState().base24.touched).toBe(true);
    useStore.getState().reset();
    const ws = useStore.getState().base24;
    expect(ws.palette.base08).toBe("#ff0000");
    expect(ws.touched).toBe(false);
    expect(ws.baseline).toEqual(imported24());
  });

  it("restores Tinted8 overrides", () => {
    useStore.getState().loadImported(importedT8(), null);
    useStore.getState().setMeta("name", "Changed");
    useStore.getState().reset();
    expect(useStore.getState().tinted8.overrides).toEqual(importedT8().overrides);
    expect(useStore.getState().tinted8.meta.name).toBe("T8");
  });

  it("falls back to stock when there is no baseline", () => {
    useStore.getState().setFlavor("base24");
    useStore.getState().commitSlot(base08(), "#00ff00");
    useStore.getState().reset();
    expect(useStore.getState().base24.palette).toEqual(DEFAULT_BASE24);
  });
});

describe("baseline is cleared by other loads", () => {
  it("clearAll drops it", () => {
    useStore.getState().loadImported(imported24(), null);
    useStore.getState().clearAll();
    expect(useStore.getState().base24.baseline ?? null).toBeNull();
    expect(useStore.getState().base24.palette).toEqual(DEFAULT_BASE24);
  });

  it("loadScheme drops it", () => {
    useStore.getState().loadImported(imported24(), null);
    const entry: SchemeEntry = {
      id: "base24-x",
      name: "X",
      author: "Y",
      system: "base24",
      variant: "dark",
      slug: "x",
      palette: Object.fromEntries(
        Object.entries(DEFAULT_BASE24).map(([k, v]) => [k, { hex_str: v }]),
      ),
    };
    useStore.getState().loadScheme(entry);
    expect(useStore.getState().base24.baseline ?? null).toBeNull();
    expect(useStore.getState().base24.loadedFrom).toBe("base24-x");
  });
});

describe("mergeData", () => {
  it("keeps a persisted baseline whose system matches, drops a mismatched one", () => {
    const saved = freshData();
    saved.base24.baseline = imported24();
    saved.base16.baseline = imported24(); // wrong system for base16
    const merged = mergeData(JSON.parse(JSON.stringify(saved)));
    expect(merged.base24.baseline).toEqual(imported24());
    expect(merged.base16.baseline ?? null).toBeNull();
    expect(merged.base16.palette).toEqual(DEFAULT_BASE16);
  });
});
