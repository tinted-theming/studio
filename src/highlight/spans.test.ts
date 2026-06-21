import { describe, expect, it } from "vitest";
import { buildSpans, type RawCapture } from "./spans";

const cap = (start: number, end: number, capture: string, priority = 100): RawCapture => ({
  start,
  end,
  capture,
  priority,
});

describe("buildSpans", () => {
  it("returns a single span for a lone capture", () => {
    expect(buildSpans([cap(0, 5, "keyword")], 5)).toEqual([{ start: 0, end: 5, capture: "keyword" }]);
  });

  it("lets a later capture win an overlap (last-wins)", () => {
    // a generic @variable over the whole range, then a specific @constant inside
    const spans = buildSpans([cap(0, 10, "variable"), cap(0, 10, "constant")], 10);
    expect(spans).toEqual([{ start: 0, end: 10, capture: "constant" }]);
  });

  it("splits a nested capture into sub-ranges", () => {
    // @function over [0,10), @keyword.return over [2,5)
    const spans = buildSpans([cap(0, 10, "function"), cap(2, 5, "keyword.return")], 10);
    expect(spans).toEqual([
      { start: 0, end: 2, capture: "function" },
      { start: 2, end: 5, capture: "keyword.return" },
      { start: 5, end: 10, capture: "function" },
    ]);
  });

  it("honors #set! priority over order", () => {
    // earlier capture has higher priority → wins despite a later capture
    const spans = buildSpans([cap(0, 4, "string", 105), cap(0, 4, "escape", 100)], 4);
    expect(spans).toEqual([{ start: 0, end: 4, capture: "string" }]);
  });

  it("drops non-visual captures so real colors survive", () => {
    const spans = buildSpans([cap(0, 8, "comment"), cap(0, 8, "spell")], 8);
    expect(spans).toEqual([{ start: 0, end: 8, capture: "comment" }]);
  });

  it("drops internal underscore captures", () => {
    expect(buildSpans([cap(0, 3, "_internal")], 3)).toEqual([]);
  });

  it("merges adjacent identical-capture spans", () => {
    const spans = buildSpans([cap(0, 3, "string"), cap(3, 6, "string")], 6);
    expect(spans).toEqual([{ start: 0, end: 6, capture: "string" }]);
  });
});
