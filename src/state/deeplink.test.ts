import { describe, expect, it } from "vitest";
import { buildShareLink, parseHashString } from "./deeplink";

describe("parseHashString", () => {
  it("returns null for an empty hash", () => {
    expect(parseHashString("")).toBeNull();
    expect(parseHashString("#")).toBeNull();
    expect(parseHashString("#url=")).toBeNull();
  });
  it("parses scheme ids", () => {
    expect(parseHashString("#base16-ayu-dark")).toEqual({ kind: "id", id: "base16-ayu-dark" });
  });
  it("parses encoded url targets", () => {
    const raw = "https://raw.githubusercontent.com/o/r/main/a b.yaml";
    expect(parseHashString(`#url=${encodeURIComponent(raw)}`)).toEqual({ kind: "url", url: raw });
  });
  it("ignores malformed percent-encoding", () => {
    expect(parseHashString("#url=%E0%A4%A")).toBeNull();
    expect(parseHashString("#%E0%A4%A")).toBeNull();
  });
});

describe("buildShareLink", () => {
  it("replaces any existing hash with #url=<encoded raw url>", () => {
    const raw = "https://raw.githubusercontent.com/o/r/main/a.yaml";
    expect(buildShareLink("https://tinted-studio.bez.dev/#base16-x", raw)).toBe(
      `https://tinted-studio.bez.dev/#url=${encodeURIComponent(raw)}`,
    );
  });
});
