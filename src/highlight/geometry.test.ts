import { describe, expect, it } from "vitest";
import { lineColAt, visualCol, caretLine, selectionRects } from "./geometry";

const V = "ab\n\tcd\nefgh"; // line0 "ab", line1 "\tcd", line2 "efgh"

describe("lineColAt", () => {
  it("maps offsets to line/col", () => {
    expect(lineColAt(V, 0)).toEqual({ line: 0, col: 0 });
    expect(lineColAt(V, 2)).toEqual({ line: 0, col: 2 });
    expect(lineColAt(V, 3)).toEqual({ line: 1, col: 0 }); // just after first \n
    expect(lineColAt(V, 5)).toEqual({ line: 1, col: 2 });
    expect(lineColAt(V, 100)).toEqual({ line: 2, col: 4 }); // clamped
  });
});

describe("visualCol (tab expansion)", () => {
  it("expands tabs to the next stop", () => {
    expect(visualCol("\tcd", 0, 2)).toBe(0);
    expect(visualCol("\tcd", 1, 2)).toBe(2); // tab → col 2
    expect(visualCol("\tcd", 3, 2)).toBe(4); // tab(2) + c + d
    expect(visualCol("abcd", 3, 2)).toBe(3); // no tabs
  });
});

describe("caretLine", () => {
  it("uses selEnd forward, selStart backward", () => {
    expect(caretLine(V, 0, 5, "forward")).toBe(1);
    expect(caretLine(V, 0, 5, "backward")).toBe(0);
    expect(caretLine(V, 8, 8)).toBe(2);
  });
});

describe("selectionRects", () => {
  it("is empty for a collapsed selection", () => {
    expect(selectionRects(V, 3, 3, 2)).toEqual([]);
  });

  it("single-line selection → one bounded rect", () => {
    expect(selectionRects(V, 0, 2, 2)).toEqual([{ line: 0, from: 0, to: 2 }]);
  });

  it("multi-line: first/middle to edge, last bounded; tabs expanded", () => {
    // from line0 col1 ("b") to line2 col2 (offset 9 → "ef")
    const rows = selectionRects(V, 1, 9, 2);
    expect(rows).toEqual([
      { line: 0, from: 1, to: Infinity },
      { line: 1, from: 0, to: Infinity },
      { line: 2, from: 0, to: 2 },
    ]);
  });

  it("normalizes reversed selections", () => {
    expect(selectionRects(V, 2, 0, 2)).toEqual([{ line: 0, from: 0, to: 2 }]);
  });
});
