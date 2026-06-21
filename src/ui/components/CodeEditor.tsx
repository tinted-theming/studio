import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import { highlight, type Span } from "../../highlight";
import { caretLine, selectionRects } from "../../highlight/geometry";
import { styleForCapture, type HighlightTable, type Style } from "../../theme";

interface CodeEditorProps {
  language: string;
  value: string;
  /** Resolved highlight table for the active scheme (drives span + decoration colors). */
  table: HighlightTable;
  onChange: (text: string) => void;
}

/** Must match `tab-size` in the .ts-highlight/.ts-input CSS. */
const TAB_SIZE = 2;

interface Metrics {
  lineHeight: number;
  padTop: number;
  padLeft: number;
  charWidth: number;
  width: number;
}

interface SelState {
  start: number;
  end: number;
  dir: "forward" | "backward" | "none";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function styleAttr(style: Style): string {
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

/** Build the highlighted HTML mirror of `text`, coloring spans via the table. */
function renderHtml(text: string, spans: Span[], table: HighlightTable): string {
  let html = "";
  let pos = 0;
  for (const sp of spans) {
    if (sp.start > pos) html += escapeHtml(text.slice(pos, sp.start));
    const chunk = escapeHtml(text.slice(sp.start, sp.end));
    const style = styleForCapture(sp.capture, table);
    const css = style ? styleAttr(style) : "";
    html += css ? `<span style="${css}">${chunk}</span>` : chunk;
    pos = sp.end;
  }
  if (pos < text.length) html += escapeHtml(text.slice(pos));
  // Trailing newline so the <pre> keeps a final empty line in step with the textarea.
  return html + "\n";
}

/**
 * A tree-sitter-highlighted code editor: a transparent <textarea> for input,
 * overlaid on a <pre> that shows the highlighted mirror, with a decoration layer
 * behind both that draws the current-line band (CursorLine) and the selection
 * (Visual). Highlight spans and decoration geometry are theme-independent, so
 * changing the scheme recolors instantly without re-parsing.
 */
export function CodeEditor({ language, value, table, onChange }: CodeEditorProps) {
  const [spans, setSpans] = useState<Span[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [sel, setSel] = useState<SelState>({ start: 0, end: 0, dir: "none" });
  const [scroll, setScroll] = useState({ top: 0, left: 0 });

  const editorRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLPreElement>(null);
  const scrollRaf = useRef(0);

  // Re-parse/highlight on content or language change (debounced).
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      highlight(language, value)
        .then((result) => {
          if (cancelled) return;
          setSpans(result);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setSpans([]);
          setLoading(false);
        });
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [language, value]);

  useEffect(() => {
    setLoading(true);
  }, [language]);

  // Measure typography/box metrics (stable per font; width tracks resize).
  useLayoutEffect(() => {
    const measure = () => {
      const ta = taRef.current;
      const ed = editorRef.current;
      const ruler = measureRef.current;
      if (!ta || !ed || !ruler) return;
      const cs = getComputedStyle(ta);
      const charWidth = ruler.getBoundingClientRect().width / 10;
      setMetrics({
        lineHeight: parseFloat(cs.lineHeight) || 20,
        padTop: parseFloat(cs.paddingTop) || 0,
        padLeft: parseFloat(cs.paddingLeft) || 0,
        charWidth: charWidth || 7,
        width: ed.clientWidth,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (editorRef.current) ro.observe(editorRef.current);
    // Web fonts can land after first paint, shifting char width.
    (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, []);

  const syncSelection = () => {
    const ta = taRef.current;
    if (!ta) return;
    setSel({
      start: ta.selectionStart,
      end: ta.selectionEnd,
      dir: (ta.selectionDirection as SelState["dir"]) ?? "none",
    });
  };

  // Caret moves (incl. arrow keys / clicks) surface via document selectionchange.
  useEffect(() => {
    const onSelChange = () => {
      if (document.activeElement === taRef.current) syncSelection();
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);

  // Keep selection in sync after programmatic value/language swaps.
  useEffect(() => {
    syncSelection();
  }, [value, language]);

  const onScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    const pre = preRef.current;
    if (pre) {
      pre.scrollTop = scrollTop;
      pre.scrollLeft = scrollLeft;
    }
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = 0;
      setScroll({ top: scrollTop, left: scrollLeft });
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = value.slice(0, start) + "  " + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + 2;
      syncSelection();
    });
  };

  // Decoration geometry (cursor band + selection rects), in container pixels.
  let cursorTop: number | null = null;
  let rects: Array<{ key: number; top: number; left: number; width: number; height: number }> = [];
  if (metrics) {
    const m = metrics;
    cursorTop = m.padTop + caretLine(value, sel.start, sel.end, sel.dir) * m.lineHeight - scroll.top;
    rects = selectionRects(value, sel.start, sel.end, TAB_SIZE).map((r) => {
      const left = m.padLeft + r.from * m.charWidth - scroll.left;
      const width = r.to === Infinity ? Math.max(0, m.width - left) : (r.to - r.from) * m.charWidth;
      return { key: r.line, top: m.padTop + r.line * m.lineHeight - scroll.top, left, width, height: m.lineHeight };
    });
  }

  const colors: CSSProperties = { color: table.fg, background: table.bg };

  return (
    <div className="ts-editor" style={colors} ref={editorRef}>
      <div className="ts-decorations" aria-hidden="true">
        {cursorTop != null && (
          <div
            className="ts-cursorline"
            style={{ top: cursorTop, height: metrics?.lineHeight, background: table.cursorLine }}
          />
        )}
        {rects.map((r) => (
          <div
            key={r.key}
            className="ts-selection"
            style={{
              top: r.top,
              left: r.left,
              width: r.width,
              height: r.height,
              background: table.selection,
            }}
          />
        ))}
      </div>
      <pre className="ts-highlight" aria-hidden="true" ref={preRef}>
        <code dangerouslySetInnerHTML={{ __html: renderHtml(value, spans, table) }} />
      </pre>
      <textarea
        ref={taRef}
        className="ts-input"
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        aria-label="Code editor"
        onChange={(e) => onChange(e.target.value)}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        onSelect={syncSelection}
        onFocus={syncSelection}
        style={{ caretColor: table.fg }}
      />
      {/* Hidden ruler: 10 monospace chars → char width. */}
      <pre className="ts-measure" aria-hidden="true" ref={measureRef}>
        0000000000
      </pre>
      {loading && <span className="ts-status">loading grammar…</span>}
    </div>
  );
}
