/**
 * Validation (SPEC §11). Gates export: `name` and `author` are required, and
 * every required slot must be valid hex (all Base16/24 slots; the 8 Tinted8
 * base normals). Ported from the reference.
 */

import { normalizeHex } from "./color";
import { BASE16_SLOTS, BASE24_SLOTS, BASE8 } from "./tables";
import type { Flavor, Meta } from "./types";

export const REQUIRED_PROPS: ReadonlyArray<keyof Meta> = ["name", "author"];

export interface ValidationResult {
  ok: boolean;
  /** Required meta props that are empty. */
  missing: string[];
  /** Count of required slots holding an empty/malformed value. */
  invalidCount: number;
  /** The specific required slot keys that are invalid. */
  invalidSlots: string[];
}

/** Keys of the always-required slots for a flavor. */
export function requiredSlotKeys(flavor: Flavor): string[] {
  if (flavor === "base16") return BASE16_SLOTS.map(([k]) => k);
  if (flavor === "base24") return BASE24_SLOTS.map(([k]) => k);
  return [...BASE8];
}

/**
 * Validate a scheme for export. `palette` holds the required slot values
 * (base normals for Tinted8). This mirrors the legacy `validateScheme` but is
 * pure: it derives invalid-slot state from the palette rather than tracking
 * live DOM input flags.
 */
export function validateScheme(
  flavor: Flavor,
  meta: Meta,
  palette: Record<string, string>,
): ValidationResult {
  const missing = REQUIRED_PROPS.filter((k) => !String(meta[k] || "").trim()).map((k) => String(k));
  const invalidSlots = requiredSlotKeys(flavor).filter((k) => !normalizeHex(palette[k]));
  return {
    ok: missing.length === 0 && invalidSlots.length === 0,
    missing,
    invalidCount: invalidSlots.length,
    invalidSlots,
  };
}
