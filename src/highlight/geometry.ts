/**
 * Pure geometry for the editor's decoration layer (cursor line + selection),
 * expressed in cell units (line index, visual column). The caller maps these to
 * pixels using measured char width / line height. With `white-space: pre`,
 * monospace, and no wrapping, visual columns are exact once tabs are expanded to
 * `tabSize` stops.
 */

/** Line index + raw (char) column of an absolute string offset. */
export function lineColAt(value: string, pos: number): { line: number; col: number } {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < pos && i < value.length; i++) {
    if (value[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, col: Math.min(pos, value.length) - lineStart };
}

/** Visual column of a raw column on a line, expanding tabs to `tabSize` stops. */
export function visualCol(lineText: string, col: number, tabSize: number): number {
  let v = 0;
  const n = Math.min(col, lineText.length);
  for (let i = 0; i < n; i++) {
    if (lineText[i] === "\t") v += tabSize - (v % tabSize);
    else v += 1;
  }
  return v;
}

/** Index of the line holding the caret (the moving end of the selection). */
export function caretLine(
  value: string,
  selStart: number,
  selEnd: number,
  dir?: "forward" | "backward" | "none",
): number {
  const caret = dir === "backward" ? selStart : selEnd;
  return lineColAt(value, caret).line;
}

export interface SelectionRow {
  line: number;
  /** start visual column (inclusive) */
  from: number;
  /** end visual column (exclusive); Infinity = extend to the right edge */
  to: number;
}

/**
 * Rectangles (one per touched line) covering [selStart, selEnd), in visual
 * columns. Empty for a collapsed selection. Multi-line rows extend to the right
 * edge (Infinity) except the last line, which ends at the caret column.
 */
export function selectionRects(
  value: string,
  selStart: number,
  selEnd: number,
  tabSize: number,
): SelectionRow[] {
  if (selStart === selEnd) return [];
  const a = Math.min(selStart, selEnd);
  const b = Math.max(selStart, selEnd);
  const lines = value.split("\n");
  const start = lineColAt(value, a);
  const end = lineColAt(value, b);

  const rows: SelectionRow[] = [];
  for (let line = start.line; line <= end.line; line++) {
    const text = lines[line] ?? "";
    const fromCol = line === start.line ? start.col : 0;
    const from = visualCol(text, fromCol, tabSize);
    if (line === end.line) {
      rows.push({ line, from, to: visualCol(text, end.col, tabSize) });
    } else {
      rows.push({ line, from, to: Infinity }); // first/middle lines run to the edge
    }
  }
  return rows;
}
