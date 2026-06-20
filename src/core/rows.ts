/**
 * Editable-row descriptors — the editing model shared by the slot UI and the
 * store. Pure: a descriptor identifies one editable slot and where its value
 * lives (a Base16/24 palette slot, a Tinted8 base normal, or a Tinted8 override).
 * Ported from the legacy `paletteRowDescriptors` / `fieldKey` / `isOverridden`.
 */

import {
  ALL11,
  BASE8,
  BASE16_SLOTS,
  BASE24_SLOTS,
  SYNTAX_KEYS,
  TINTED8_COLOR_DESC,
  UI_KEYS,
  VARIANTS,
} from "./tables";
import type { Flavor, Tinted8Overrides } from "./types";

export type RowScope = "palette" | "ui" | "syntax";

export interface RowDescriptor {
  scope: RowScope;
  /** Key into the effective palette/ui/syntax map. */
  fullKey: string;
  /** Where the value is stored: a base slot/normal key, or an override key. */
  storeKey: string;
  label: string;
  desc: string;
  /** Required slots are always explicit (no derive/clear). */
  required: boolean;
  /** Tinted8 grouping color (for visual grouping), else null. */
  group: string | null;
}

/** A stable identity for a row, used to track in-progress invalid input. */
export function fieldKey(desc: RowDescriptor): string {
  return `${desc.scope}:${desc.storeKey}:${desc.fullKey}`;
}

/** Palette rows for the active flavor. */
export function paletteRowDescriptors(flavor: Flavor): RowDescriptor[] {
  if (flavor === "base16" || flavor === "base24") {
    const slots = flavor === "base16" ? BASE16_SLOTS : BASE24_SLOTS;
    return slots.map(([key, desc]) => ({
      scope: "palette" as const,
      fullKey: key,
      storeKey: key,
      label: key,
      desc,
      required: true,
      group: null,
    }));
  }
  // Tinted8: 11 colors × 3 variants.
  const descs: RowDescriptor[] = [];
  ALL11.forEach((color) => {
    const isBase = (BASE8 as readonly string[]).includes(color);
    VARIANTS.forEach((variant) => {
      const fullKey = `${color}-${variant}`;
      const required = isBase && variant === "normal";
      // normal → palette[color] (base) or override["orange"] (supplemental);
      // dim/bright → override["<color>-<variant>"].
      const storeKey = variant === "normal" ? color : `${color}-${variant}`;
      descs.push({
        scope: "palette",
        fullKey,
        storeKey,
        label: variant === "normal" ? color : `${color}-${variant}`,
        desc: variant === "normal" ? (TINTED8_COLOR_DESC[color] ?? "") : `${variant} variant`,
        required,
        group: color,
      });
    });
  });
  return descs;
}

export function uiRowDescriptors(): RowDescriptor[] {
  return UI_KEYS.map((key) => ({
    scope: "ui" as const,
    fullKey: key,
    storeKey: key,
    label: key,
    desc: "",
    required: false,
    group: null,
  }));
}

export function syntaxRowDescriptors(): RowDescriptor[] {
  return SYNTAX_KEYS.map((key) => ({
    scope: "syntax" as const,
    fullKey: key,
    storeKey: key,
    label: key,
    desc: "",
    required: false,
    group: null,
  }));
}

/** Whether a Tinted8 row currently carries an explicit override. */
export function isOverridden(desc: RowDescriptor, overrides: Tinted8Overrides): boolean {
  if (desc.required) return false;
  return Object.prototype.hasOwnProperty.call(overrides[desc.scope], desc.storeKey);
}
