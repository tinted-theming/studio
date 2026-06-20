import { useMemo } from "react";
import {
  computeEffectiveTinted8,
  normalizeHex,
  type EffectiveTinted8,
  type Flavor,
  type RowDescriptor,
} from "../core";
import { useStore, type StudioState } from "../state/store";

/** The active workspace's effective Tinted8 trees, or null for base16/24. */
export function useEffectiveTinted8(): EffectiveTinted8 | null {
  const flavor = useStore((s) => s.flavor);
  const palette = useStore((s) => s.tinted8.palette);
  const overrides = useStore((s) => s.tinted8.overrides);
  const variant = useStore((s) => s.tinted8.meta.variant);
  return useMemo(() => {
    if (flavor !== "tinted8") return null;
    return computeEffectiveTinted8(palette, overrides, variant);
  }, [flavor, palette, overrides, variant]);
}

/** Resolve a row's displayed hex value. */
export function effectiveValueOf(
  desc: RowDescriptor,
  flavor: Flavor,
  basePalette: Record<string, string>,
  eff: EffectiveTinted8 | null,
): string {
  if (flavor !== "tinted8" || !eff) {
    return normalizeHex(basePalette[desc.fullKey]) || "#000000";
  }
  return eff[desc.scope][desc.fullKey] ?? "#000000";
}

export function useActiveWorkspace(): StudioState["base16"] | StudioState["tinted8"] {
  const flavor = useStore((s) => s.flavor);
  return useStore((s) => s[flavor]);
}
