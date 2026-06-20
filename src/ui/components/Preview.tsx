import type { CSSProperties } from "react";
import {
  FALLBACK_LANGUAGE,
  PALETTE_LANGUAGE,
  PREVIEW_ROLES,
  normalizeHex,
  paletteEntriesInGridOrder,
  paletteGridShape,
  previewColor,
  wrapHex,
  type PreviewScheme,
} from "../../core";
import { useStore } from "../../state/store";
import { useEffectiveTinted8 } from "../useEffective";
import { SNIPPETS } from "../snippets";

const LANGUAGES: Array<[string, string]> = [
  ["rust", "Rust"],
  ["kotlin", "Kotlin"],
  ["lisp", "Lisp"],
  ["elixir", "Elixir"],
  ["haskell", "Haskell"],
  ["diff", "Diff"],
  ["terminal", "Terminal"],
  ["palette", "Palette"],
];

function usePreviewScheme(): PreviewScheme {
  const flavor = useStore((s) => s.flavor);
  const ws = useStore((s) => s[flavor]);
  const eff = useEffectiveTinted8();
  if (flavor === "tinted8" && eff) {
    return {
      system: "tinted8",
      variant: ws.meta.variant,
      palette: wrapHex(eff.palette),
      ui: wrapHex(eff.ui),
      syntax: wrapHex(eff.syntax),
    };
  }
  const palette: Record<string, string> = {};
  for (const k in ws.palette) palette[k] = normalizeHex(ws.palette[k]) || "#000000";
  return { system: flavor, variant: ws.meta.variant, palette: wrapHex(palette) };
}

export function Preview() {
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const scheme = usePreviewScheme();

  const styleVars: Record<string, string> = {};
  for (const role of PREVIEW_ROLES) styleVars[`--preview-${role}`] = previewColor(scheme, role);

  const isPalette = language === PALETTE_LANGUAGE;
  let codeStyle: CSSProperties = {};
  let body: { __html: string };
  if (isPalette) {
    const { cols, rows } = paletteGridShape(scheme.system);
    codeStyle = {
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
    };
    body = {
      __html: paletteEntriesInGridOrder(scheme)
        .map(([name, value]) => {
          const safe = name.replace(/[<>&"]/g, "");
          return `<span class="palette-cell" style="background:${value.hex_str}" title="${safe}: ${value.hex_str}"></span>`;
        })
        .join(""),
    };
  } else {
    body = { __html: SNIPPETS[language] ?? SNIPPETS[FALLBACK_LANGUAGE]! };
  }

  return (
    <div className="panel-card preview-card">
      <div className="preview-toolbar">
        <h2 className="section-label">Preview</h2>
        <span className="plate-rule" />
        <div className="language-select-wrapper">
          <select
            id="language-select"
            aria-label="Preview language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANGUAGES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <pre
        className={"code-preview" + (isPalette ? " is-palette" : "")}
        style={styleVars as CSSProperties}
      >
        <code style={codeStyle} dangerouslySetInnerHTML={body} />
      </pre>
    </div>
  );
}
