/**
 * Turn a flat list of (possibly overlapping) tree-sitter captures into a set of
 * non-overlapping highlight spans, using the same resolution Neovim and the
 * tree-sitter CLI use: higher `#set! priority` wins, ties broken by *last capture
 * wins* (the capture appearing later in query order).
 *
 * Pure & framework-free so it can be unit-tested in isolation.
 */

export interface RawCapture {
  start: number;
  end: number;
  capture: string;
  /** from `#set! priority N`, default 100 */
  priority: number;
}

export interface Span {
  start: number;
  end: number;
  capture: string;
}

/** Captures conventionally used as metadata, never rendered with a color. */
const NON_VISUAL = new Set(["spell", "nospell", "conceal"]);

function isVisual(capture: string): boolean {
  if (capture.startsWith("_")) return false; // internal predicate-only captures
  return !NON_VISUAL.has(capture);
}

export function buildSpans(captures: RawCapture[], textLength: number): Span[] {
  const caps = captures.filter((c) => isVisual(c.capture) && c.end > c.start);
  if (caps.length === 0) return [];

  // Collect cut points.
  const points = new Set<number>([0, textLength]);
  for (const c of caps) {
    points.add(c.start);
    points.add(c.end);
  }
  const cuts = [...points].filter((p) => p >= 0 && p <= textLength).sort((a, b) => a - b);

  const out: Span[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const s = cuts[i]!;
    const e = cuts[i + 1]!;
    if (s === e) continue;
    // Pick the winning capture over [s, e): highest priority, then latest index.
    let win: RawCapture | null = null;
    let winPrio = -Infinity;
    let winOrder = -1;
    for (let k = 0; k < caps.length; k++) {
      const c = caps[k]!;
      if (c.start <= s && c.end >= e) {
        if (c.priority > winPrio || (c.priority === winPrio && k > winOrder)) {
          win = c;
          winPrio = c.priority;
          winOrder = k;
        }
      }
    }
    if (!win) continue;
    const last = out[out.length - 1];
    if (last && last.end === s && last.capture === win.capture) {
      last.end = e; // merge adjacent same-capture spans
    } else {
      out.push({ start: s, end: e, capture: win.capture });
    }
  }
  return out;
}
