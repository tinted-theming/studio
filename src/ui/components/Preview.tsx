import { useMemo, type CSSProperties } from "react";
import {
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
import { DEFAULT_PRESETS } from "../snippets/presets";
import { isSupportedLanguage, SUPPORTED_LANGUAGES } from "../../highlight";
import { buildHighlightTable, schemeToBaseSlots, type SchemeForSlots } from "../../theme";
import { CodeEditor } from "./CodeEditor";

const DIFF_LANGUAGE = "diff";
const TERMINAL_LANGUAGE = "terminal";

const LANGUAGE_LABELS: Record<string, string> = {
  rust: "Rust",
  typescript: "TypeScript",
  python: "Python",
  lua: "Lua",
  go: "Go",
  json: "JSON",
  bash: "Bash",
  kotlin: "Kotlin",
  commonlisp: "Lisp",
  elixir: "Elixir",
  haskell: "Haskell",
  diff: "Diff",
  terminal: "Terminal",
  palette: "Palette",
};

const LANGUAGES: string[] = [
  ...SUPPORTED_LANGUAGES,
  DIFF_LANGUAGE,
  TERMINAL_LANGUAGE,
  PALETTE_LANGUAGE,
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
  const editorContent = useStore((s) => s.editorContent);
  const setEditorContent = useStore((s) => s.setEditorContent);
  const resetEditorContent = useStore((s) => s.resetEditorContent);
  const scheme = usePreviewScheme();

  // Resolved highlight table for the code editor (recomputed when the scheme changes).
  const table = useMemo(
    () => buildHighlightTable(schemeToBaseSlots(scheme as unknown as SchemeForSlots)),
    [scheme],
  );

  const isCode = isSupportedLanguage(language);
  const isPalette = language === PALETTE_LANGUAGE;
  const hasEdits = editorContent[language] != null;
  const content = isCode ? (editorContent[language] ?? DEFAULT_PRESETS[language] ?? "") : "";

  // --preview-* vars drive the fixed Terminal snippet and the palette grid.
  const styleVars: Record<string, string> = {};
  for (const role of PREVIEW_ROLES) styleVars[`--preview-${role}`] = previewColor(scheme, role);

  let codeStyle: CSSProperties = {};
  let body: { __html: string } | null = null;
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
  } else if (!isCode) {
    // Fixed, non-editable snippets (Terminal, Diff).
    body = { __html: SNIPPETS[language] ?? SNIPPETS[TERMINAL_LANGUAGE]! };
  }

  return (
    <div className="panel-card preview-card">
      <div className="preview-toolbar">
        <h2 className="section-label">Preview</h2>
        <span className="plate-rule" />
        {isCode && hasEdits && (
          <button
            type="button"
            className="ts-reset"
            onClick={() => resetEditorContent(language)}
            title="Reset to the default sample"
          >
            Reset
          </button>
        )}
        <div className="language-select-wrapper">
          <select
            id="language-select"
            aria-label="Preview language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANGUAGES.map((value) => (
              <option key={value} value={value}>
                {LANGUAGE_LABELS[value] ?? value}
              </option>
            ))}
          </select>
        </div>
      </div>
      {isCode ? (
        <CodeEditor
          language={language}
          value={content}
          table={table}
          onChange={(text) => setEditorContent(language, text)}
        />
      ) : (
        <pre
          className={"code-preview" + (isPalette ? " is-palette" : "")}
          style={styleVars as CSSProperties}
        >
          <code style={codeStyle} dangerouslySetInnerHTML={body!} />
        </pre>
      )}
    </div>
  );
}
