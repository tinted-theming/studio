/**
 * CodeMirror 6 ↔ our tree-sitter highlighter bridge.
 *
 * CM6 supplies the editing engine only; highlighting stays ours: we run
 * `highlight(lang, code)` (tree-sitter + nvim-treesitter queries) and paint the
 * resulting spans as inline-styled mark decorations, colored via the tinted-nvim
 * port (`styleForCapture`). Recoloring on a scheme change rebuilds decorations
 * from the *cached* spans — no re-parse.
 */

import {
  StateEffect,
  StateField,
  Compartment,
  Facet,
  RangeSetBuilder,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { highlight, type Span } from "../../../highlight";
import { styleForCapture, type HighlightTable, type Style } from "../../../theme";

/** Active language, read by the re-highlight plugin; swapped via the compartment. */
export const languageFacet = Facet.define<string, string>({
  combine: (values) => values[0] ?? "",
});
export const languageCompartment = new Compartment();

/** Push freshly-parsed spans / a new color table into the decoration field. */
export const setSpansEffect = StateEffect.define<Span[]>();
export const setTableEffect = StateEffect.define<HighlightTable>();

function cssFor(style: Style): string {
  let css = "";
  if (style.fg) css += `color:${style.fg};`;
  if (style.bold) css += "font-weight:600;";
  if (style.italic) css += "font-style:italic;";
  const deco = [style.underline && "underline", style.strikethrough && "line-through"].filter(
    Boolean,
  );
  if (deco.length) css += `text-decoration:${deco.join(" ")};`;
  return css;
}

function buildDecorations(spans: Span[], table: HighlightTable | null, docLength: number): DecorationSet {
  if (!table || spans.length === 0) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const s of spans) {
    // spans are non-overlapping and sorted by start (engine sweep); guard against
    // offsets that fell out of range from edits made before the parse landed.
    if (s.start >= s.end || s.start >= docLength) continue;
    const end = Math.min(s.end, docLength);
    const style = styleForCapture(s.capture, table);
    if (!style) continue;
    const css = cssFor(style);
    if (!css) continue;
    builder.add(s.start, end, Decoration.mark({ attributes: { style: css } }));
  }
  return builder.finish();
}

interface HState {
  spans: Span[];
  table: HighlightTable | null;
  deco: DecorationSet;
}

const highlightField = StateField.define<HState>({
  create() {
    return { spans: [], table: null, deco: Decoration.none };
  },
  update(value, tr) {
    let { spans, table, deco } = value;
    let rebuilt = false;
    for (const e of tr.effects) {
      if (e.is(setSpansEffect)) spans = e.value;
      if (e.is(setTableEffect)) table = e.value;
      if (e.is(setSpansEffect) || e.is(setTableEffect)) rebuilt = true;
    }
    if (rebuilt) {
      deco = buildDecorations(spans, table, tr.state.doc.length);
    } else if (tr.docChanged) {
      // No fresh spans yet — keep colors aligned with the edit until re-highlight.
      deco = deco.map(tr.changes);
    }
    return { spans, table, deco };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

/** Debounced re-highlight: re-parses on doc edits and on language changes. */
const reHighlighter = ViewPlugin.fromClass(
  class {
    timer = 0;
    constructor(view: EditorView) {
      this.schedule(view);
    }
    update(u: ViewUpdate) {
      const langChanged = u.startState.facet(languageFacet) !== u.state.facet(languageFacet);
      if (u.docChanged || langChanged) this.schedule(u.view);
    }
    schedule(view: EditorView) {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.run(view), 60);
    }
    async run(view: EditorView) {
      const lang = view.state.facet(languageFacet);
      const code = view.state.doc.toString();
      try {
        const spans = await highlight(lang, code);
        view.dispatch({ effects: setSpansEffect.of(spans) });
      } catch {
        view.dispatch({ effects: setSpansEffect.of([]) });
      }
    }
    destroy() {
      clearTimeout(this.timer);
    }
  },
);

/** The full set of highlighting extensions, parameterized by the initial language. */
export function highlightExtensions(initialLanguage: string) {
  return [
    languageCompartment.of(languageFacet.of(initialLanguage)),
    highlightField,
    reHighlighter,
  ];
}
