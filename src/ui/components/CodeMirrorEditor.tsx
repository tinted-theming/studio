import { useEffect, useRef, type CSSProperties } from "react";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightWhitespace,
  keymap,
  lineNumbers,
  type KeyBinding,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { vim } from "@replit/codemirror-vim";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import {
  highlightExtensions,
  languageCompartment,
  languageFacet,
  setTableEffect,
} from "./cm/highlight";
import type { HighlightTable } from "../../theme";
import type { EditorSettings } from "../../state/store";

interface CodeMirrorEditorProps {
  language: string;
  value: string;
  /** Resolved highlight table for the active scheme (drives spans + chrome colors). */
  table: HighlightTable;
  /** Global editor preferences (vim, relative line numbers, whitespace). */
  settings: EditorSettings;
  onChange: (text: string) => void;
}

// Per-setting compartments so toggles reconfigure in place.
const vimCompartment = new Compartment();
const gutterCompartment = new Compartment();
const whitespaceCompartment = new Compartment();

/** Tab inserts two spaces (parity with the hand-rolled editor; no literal tabs). */
const insertTwoSpaces: KeyBinding = {
  key: "Tab",
  run: (view) => {
    view.dispatch(view.state.replaceSelection("  "));
    return true;
  },
};

/** Line-number gutter + active-line gutter; relative numbering is opt-in.
 *  (highlightActiveLineGutter forces the gutter to refresh on caret moves, so
 *  relative numbers re-compute as the cursor moves.) */
function gutterExtension(relative: boolean) {
  const ln = relative
    ? lineNumbers({
        formatNumber: (n, state) => {
          const cur = state.doc.lineAt(state.selection.main.head).number;
          return n === cur ? String(n) : String(Math.abs(cur - n));
        },
      })
    : lineNumbers();
  return [ln, highlightActiveLineGutter()];
}

/**
 * Static editor theme. Scheme colors come from CSS custom properties set on the
 * host element, so a scheme change recolors instantly without injecting a new
 * stylesheet per edit. The selection selectors mirror CM6's drawSelection base
 * theme depth so they win on specificity.
 */
const editorTheme = EditorView.theme({
  "&": {
    color: "var(--cm-fg)",
    backgroundColor: "var(--cm-bg)",
    height: "clamp(360px, 58vh, 760px)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    fontSize: "12.5px",
    lineHeight: "20px",
    overflow: "auto",
  },
  ".cm-content": { padding: "18px 0", tabSize: "2", caretColor: "var(--cm-fg)" },
  ".cm-line": { padding: "0 18px" },
  ".cm-activeLine": { backgroundColor: "var(--cm-cursorline)" },
  ".cm-selectionLayer .cm-selectionBackground": { backgroundColor: "var(--cm-selection)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--cm-selection)",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--cm-fg)" },
  // Gutter (LineNr / CursorLineNr).
  ".cm-gutters": {
    backgroundColor: "var(--cm-gutter-bg)",
    color: "var(--cm-linenr)",
    border: "none",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--cm-cursorline)",
    color: "var(--cm-cursorlinenr)",
  },
  // Matching brackets (MatchParen) + occurrence matches. CM6's bracketMatching
  // base theme uses "&.cm-focused .cm-matchingBracket", so match that depth to win.
  ".cm-matchingBracket": { backgroundColor: "var(--cm-matchparen)", color: "inherit" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--cm-matchparen)", color: "inherit" },
  "&.cm-focused .cm-nonmatchingBracket": { backgroundColor: "transparent" },
  ".cm-selectionMatch": { backgroundColor: "var(--cm-selectionmatch)" },
  // Search (Search / IncSearch).
  ".cm-searchMatch": { backgroundColor: "var(--cm-search-bg)", color: "var(--cm-search-fg)" },
  ".cm-searchMatch-selected": {
    backgroundColor: "var(--cm-incsearch-bg)",
    color: "var(--cm-incsearch-fg)",
  },
  // Panels (search panel, vim status) ~ Pmenu/StatusLine.
  ".cm-panels": { backgroundColor: "var(--cm-panel-bg)", color: "var(--cm-panel-fg)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--cm-linenr)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--cm-linenr)" },
  ".cm-panel input, .cm-panel button, .cm-panel select": {
    backgroundColor: "var(--cm-bg)",
    color: "var(--cm-panel-fg)",
    border: "1px solid var(--cm-linenr)",
  },
  ".cm-highlightSpace:before": { color: "var(--cm-whitespace)" },
});

function cssVars(table: HighlightTable): CSSProperties {
  const ui = table.ui;
  return {
    "--cm-fg": table.fg,
    "--cm-bg": table.bg,
    "--cm-cursorline": table.cursorLine,
    "--cm-selection": table.selection,
    "--cm-linenr": ui.lineNr,
    "--cm-cursorlinenr": ui.cursorLineNr,
    "--cm-gutter-bg": ui.gutterBg,
    "--cm-matchparen": ui.matchParen,
    "--cm-search-bg": ui.searchBg,
    "--cm-search-fg": ui.searchFg,
    "--cm-incsearch-bg": ui.incSearchBg,
    "--cm-incsearch-fg": ui.incSearchFg,
    "--cm-selectionmatch": ui.selectionMatch,
    "--cm-whitespace": ui.whitespace,
    "--cm-indentguide": ui.indentGuide,
    "--cm-indentguide-active": ui.indentGuideActive,
    "--cm-panel-bg": ui.panelBg,
    "--cm-panel-fg": ui.panelFg,
  } as CSSProperties;
}

// Vim's block cursor theme is registered at Prec.highest (a hard-coded pink), so
// override it at the same precedence (placed after vim() in the extension order)
// with the scheme's Cursor colors: block = foreground, glyph = background.
const vimCursorTheme = Prec.highest(
  EditorView.theme({
    // !important to beat vim's own Prec.highest fat-cursor rule (which lands later
    // in the stylesheet on a specificity tie).
    ".cm-fat-cursor": {
      background: "var(--cm-fg) !important",
      color: "var(--cm-bg) !important",
    },
    "&:not(.cm-focused) .cm-fat-cursor": {
      background: "none !important",
      outline: "solid 1px var(--cm-fg) !important",
      color: "transparent !important",
    },
  }),
);

// Indent guides read their color from the host CSS vars (static config).
const indentGuides = indentationMarkers({
  highlightActiveBlock: true,
  colors: {
    light: "var(--cm-indentguide)",
    dark: "var(--cm-indentguide)",
    activeLight: "var(--cm-indentguide-active)",
    activeDark: "var(--cm-indentguide-active)",
  },
});

/**
 * CodeMirror 6 editor whose highlighting is driven by our tree-sitter engine +
 * tinted-nvim color mapping (see ./cm/highlight). Adds gutter (abs/relative),
 * bracket matching, occurrence + search highlighting, indent guides, an optional
 * whitespace overlay, and a toggleable vim mode — all themed from the scheme.
 */
export function CodeMirrorEditor({ language, value, table, settings, onChange }: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount the EditorView once.
  useEffect(() => {
    const state = EditorState.create({
      doc: value,
      extensions: [
        // vim() must precede the other keymaps for its bindings to win.
        vimCompartment.of(settings.vim ? vim() : []),
        history(),
        keymap.of([insertTwoSpaces, ...searchKeymap, ...defaultKeymap, ...historyKeymap]),
        gutterCompartment.of(gutterExtension(settings.relativeLineNumbers)),
        bracketMatching(),
        highlightSelectionMatches(),
        search({ top: true }),
        indentGuides,
        whitespaceCompartment.of(settings.whitespace ? highlightWhitespace() : []),
        drawSelection(),
        highlightActiveLine(),
        ...highlightExtensions(language),
        editorTheme,
        vimCursorTheme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current! });
    viewRef.current = view;
    view.dispatch({ effects: setTableEffect.of(table) });
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount-once; prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value changes (language switch / Reset) → replace the doc.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  // Language change → swap the language facet (triggers re-highlight).
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageCompartment.reconfigure(languageFacet.of(language)),
    });
  }, [language]);

  // Scheme change → recolor decorations (no re-parse); chrome via host CSS vars.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setTableEffect.of(table) });
  }, [table]);

  // Setting toggles → reconfigure the matching compartment.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: vimCompartment.reconfigure(settings.vim ? vim() : []),
    });
  }, [settings.vim]);
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: gutterCompartment.reconfigure(gutterExtension(settings.relativeLineNumbers)),
    });
  }, [settings.relativeLineNumbers]);
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: whitespaceCompartment.reconfigure(
        settings.whitespace ? highlightWhitespace() : [],
      ),
    });
  }, [settings.whitespace]);

  return <div className="cm-host" ref={hostRef} style={cssVars(table)} />;
}
