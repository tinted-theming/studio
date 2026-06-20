/**
 * YAML export (SPEC §11). Emission is MINIMAL — only what the builder can't
 * re-derive (8 base colors + explicit overrides). Never dump full derived
 * palettes; that would freeze derivation and embed the orange-dim bug.
 *
 * Ported from the reference. Two formats:
 *  - Base16/Base24: flat top-level keys.
 *  - Tinted8: a nested `scheme:` wrapper, then top-level variant/palette/...
 */

import { normalizeHex } from "./color";
import {
  ALL11,
  BASE16_SLOTS,
  BASE24_SLOTS,
  BASE8,
  DERIVE_VARIANTS,
  STYLING_SPEC,
  SUPPLEMENTAL,
  SYNTAX_KEYS,
  UI_KEYS,
} from "./tables";
import { slugify } from "./slug";
import type { BaseWorkspace, Tinted8Workspace } from "./types";

/** Quote a scalar. Hex values MUST be quoted (a leading `#` starts a comment). */
export function yamlStr(s: unknown): string {
  return (
    '"' +
    String(s == null ? "" : s)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"') +
    '"'
  );
}

export function buildBaseYaml(flavor: "base16" | "base24", data: BaseWorkspace): string {
  const meta = data.meta;
  const slots = flavor === "base16" ? BASE16_SLOTS : BASE24_SLOTS;
  const lines: string[] = [];
  lines.push(`system: ${yamlStr(flavor)}`);
  lines.push(`name: ${yamlStr(meta.name || "Untitled")}`);
  if (slugify(meta.name)) lines.push(`slug: ${yamlStr(slugify(meta.name))}`);
  lines.push(`author: ${yamlStr(meta.author)}`);
  lines.push(`variant: ${yamlStr(meta.variant)}`);
  if (meta.description) lines.push(`description: ${yamlStr(meta.description)}`);
  lines.push("palette:");
  slots.forEach(([key]) => {
    lines.push(`  ${key}: ${yamlStr(normalizeHex(data.palette[key]) || "#000000")}`);
  });
  return lines.join("\n") + "\n";
}

export function buildTinted8Yaml(data: Tinted8Workspace): string {
  const meta = data.meta;
  const ov = data.overrides;
  const lines: string[] = [];
  lines.push("scheme:");
  lines.push(`  system: "tinted8"`);
  lines.push("  supports:");
  lines.push(`    styling-spec: ${yamlStr(STYLING_SPEC)}`);
  lines.push(`  author: ${yamlStr(meta.author)}`);
  if (meta.name) lines.push(`  name: ${yamlStr(meta.name)}`);
  if (slugify(meta.name)) lines.push(`  slug: ${yamlStr(slugify(meta.name))}`);
  if (meta.family) lines.push(`  family: ${yamlStr(meta.family)}`);
  if (meta.style) lines.push(`  style: ${yamlStr(meta.style)}`);
  if (meta.description) lines.push(`  description: ${yamlStr(meta.description)}`);
  lines.push(`variant: ${yamlStr(meta.variant)}`);

  lines.push("palette:");
  BASE8.forEach((c) => {
    lines.push(`  ${c}: ${yamlStr(normalizeHex(data.palette[c]) || "#000000")}`);
  });
  // Overridden derived palette slots, in canonical order.
  ALL11.forEach((c) => {
    if ((SUPPLEMENTAL as readonly string[]).includes(c) && ov.palette[c]) {
      lines.push(`  ${c}: ${yamlStr(ov.palette[c])}`);
    }
    DERIVE_VARIANTS.forEach((v) => {
      const key = `${c}-${v}`;
      if (ov.palette[key]) lines.push(`  ${key}: ${yamlStr(ov.palette[key])}`);
    });
  });

  const synKeys = SYNTAX_KEYS.filter((k) => ov.syntax[k]);
  if (synKeys.length) {
    lines.push("syntax:");
    synKeys.forEach((k) => lines.push(`  ${k}: ${yamlStr(ov.syntax[k])}`));
  }
  const uiKeys = UI_KEYS.filter((k) => ov.ui[k]);
  if (uiKeys.length) {
    lines.push("ui:");
    uiKeys.forEach((k) => lines.push(`  ${k}: ${yamlStr(ov.ui[k])}`));
  }
  return lines.join("\n") + "\n";
}
