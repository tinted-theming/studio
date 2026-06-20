import { useStore } from "../../state/store";
import type { Flavor } from "../../core";

const TABS: Array<{ flavor: Flavor; label: string }> = [
  { flavor: "base16", label: "Base16" },
  { flavor: "base24", label: "Base24" },
  { flavor: "tinted8", label: "Tinted8" },
];

export function WorkspaceTabs() {
  const flavor = useStore((s) => s.flavor);
  const setFlavor = useStore((s) => s.setFlavor);
  const touched = {
    base16: useStore((s) => s.base16.touched),
    base24: useStore((s) => s.base24.touched),
    tinted8: useStore((s) => s.tinted8.touched),
  };
  return (
    <div className="workspace-tabs" role="tablist" aria-label="Scheme workspaces">
      {TABS.map(({ flavor: f, label }) => (
        <button
          key={f}
          type="button"
          role="tab"
          className={"ws-tab" + (f === flavor ? " active" : "") + (touched[f] ? " is-edited" : "")}
          aria-selected={f === flavor}
          onClick={() => setFlavor(f)}
        >
          <span className="ws-tab-name">{label}</span>
          <span className="ws-tab-dot" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
