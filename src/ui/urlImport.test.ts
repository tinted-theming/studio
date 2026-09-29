import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BASE16, type ImportedScheme } from "../core";
import { URL_ORIGIN_PREFIX } from "../state/deeplink";
import { freshData, useStore } from "../state/store";
import { importUrlTarget } from "./urlImport";

const RAW = "https://raw.githubusercontent.com/o/r/main/";
const yamlFor = (name: string) =>
  `system: "base16"\nname: "${name}"\nauthor: "A"\nvariant: "dark"\npalette:\n` +
  Object.entries(DEFAULT_BASE16)
    .map(([k, v]) => `  ${k}: "${v}"`)
    .join("\n");

/** A fetch whose responses resolve only when released, keyed by URL. */
function deferredFetch() {
  const pending = new Map<string, (r: Response) => void>();
  const fetchImpl = vi.fn(
    (url: string) => new Promise<Response>((resolve) => pending.set(url, resolve)),
  ) as unknown as typeof fetch;
  const release = (url: string, body: string) => pending.get(url)!(new Response(body));
  return { fetchImpl, release };
}

const flush = () => new Promise((r) => setTimeout(r, 50));

beforeEach(() => {
  useStore.setState({ ...freshData(), undoStack: [], redoStack: [], invalidSlots: new Set() });
});

describe("importUrlTarget", () => {
  it("does not refetch when any workspace already shows the import; switches to it", async () => {
    const url = RAW + "a.yaml";
    const scheme: ImportedScheme = {
      system: "base16",
      meta: { name: "A", author: "A", slug: "a", description: "", variant: "dark" },
      palette: { ...DEFAULT_BASE16 },
    };
    useStore.getState().loadImported(scheme, URL_ORIGIN_PREFIX + url);
    useStore.getState().setFlavor("base24");
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await importUrlTarget(url, { fetchImpl, currentUrl: () => url });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(useStore.getState().flavor).toBe("base16");
    expect(useStore.getState().undoStack.length).toBe(1);
  });

  it("drops a result when the hash moved on during the fetch", async () => {
    const url = RAW + "a.yaml";
    const { fetchImpl, release } = deferredFetch();
    let hashUrl: string | null = url;
    const done = importUrlTarget(url, { fetchImpl, currentUrl: () => hashUrl });
    await flush();
    hashUrl = null; // e.g. the user picked a library scheme meanwhile
    release(url, yamlFor("Late"));
    await done;
    expect(useStore.getState().base16.meta.name).toBe("Untitled");
  });

  it("keeps the newer of two overlapping imports", async () => {
    const a = RAW + "a.yaml";
    const b = RAW + "b.yaml";
    const { fetchImpl, release } = deferredFetch();
    let hashUrl: string | null = a;
    const first = importUrlTarget(a, { fetchImpl, currentUrl: () => hashUrl });
    await flush();
    hashUrl = b;
    const second = importUrlTarget(b, { fetchImpl, currentUrl: () => hashUrl });
    await flush();
    release(b, yamlFor("B"));
    await second;
    release(a, yamlFor("A"));
    await first;
    expect(useStore.getState().base16.meta.name).toBe("B");
  });
});
