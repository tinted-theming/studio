import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BASE16 } from "../core";
import { freshData, useStore } from "../state/store";
import { useImport } from "./import";

const yamlFor = (name: string) =>
  `system: "base16"\nname: "${name}"\nauthor: "A"\nvariant: "dark"\npalette:\n` +
  Object.entries(DEFAULT_BASE16)
    .map(([k, v]) => `  ${k}: "${v}"`)
    .join("\n");

async function until(cond: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

beforeEach(() => {
  useStore.setState({ ...freshData(), undoStack: [], redoStack: [], invalidSlots: new Set() });
  useImport.getState().close();
});

describe("useImport paste tab", () => {
  it("never loads a previous paste's result while the new text is still parsing", async () => {
    const s = useImport.getState();
    s.openDialog("paste");
    s.setText(yamlFor("First"));
    await until(() => useImport.getState().pasteResult?.ok === true);

    useImport.getState().setText("not: [valid");
    expect(useImport.getState().pasteResult).toBeNull();
    useImport.getState().load();
    expect(useStore.getState().base16.meta.name).toBe("Untitled");
  });
});
