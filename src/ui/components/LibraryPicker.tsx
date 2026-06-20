import { useEffect, useMemo } from "react";
import { schemesForFlavor, type Flavor } from "../../core";
import { useStore } from "../../state/store";
import { useLibrary } from "../../state/library";
import { setHash } from "../../state/deeplink";

const LABELS: Record<Flavor, string> = {
  base16: "Base16",
  base24: "Base24",
  tinted8: "Tinted8",
};

/**
 * "Start from" picker (SPEC §3.6 / §9). Filtered to the active workspace's
 * system; selecting a scheme loads it (reconstructing Tinted8 overrides) and
 * sets a shareable hash. Replacing an edited workspace is confirmed first.
 */
export function LibraryPicker() {
  const flavor = useStore((s) => s.flavor);
  const loadedFrom = useStore((s) => s[flavor].loadedFrom);
  const touched = useStore((s) => s[flavor].touched);
  const loadScheme = useStore((s) => s.loadScheme);

  const entries = useLibrary((s) => s.entries);
  const byId = useLibrary((s) => s.byId);
  const status = useLibrary((s) => s.status);
  const load = useLibrary((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  const list = useMemo(() => schemesForFlavor(entries, flavor), [entries, flavor]);

  if (status !== "ready" || list.length === 0) return null;

  // Once edited, the picker no longer reflects a pristine known scheme.
  const value = !touched && loadedFrom && byId.has(loadedFrom) ? loadedFrom : "";

  const onChange = (id: string) => {
    if (!id) return;
    const entry = byId.get(id);
    if (!entry) return;
    const target = String(entry.system).toLowerCase() as Flavor;
    if (
      useStore.getState()[target]?.touched &&
      !window.confirm(
        `Start from “${entry.name}”? This replaces the ${LABELS[target]} workspace and can't be undone.`,
      )
    ) {
      return; // controlled <select> snaps back to the persisted value
    }
    if (loadScheme(entry)) setHash(entry.id);
  };

  return (
    <div className="library-picker" id="library-picker">
      <label htmlFor="library-select">Start from</label>
      <div className="language-select-wrapper">
        <select id="library-select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select a {LABELS[flavor]} scheme…</option>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
