import { describe, expect, it } from "vitest";
import { toGithubRawUrl } from "./githubUrl";

const RAW = "https://raw.githubusercontent.com";

describe("toGithubRawUrl", () => {
  it("converts blob and raw file links to raw.githubusercontent.com", () => {
    expect(toGithubRawUrl("https://github.com/o/r/blob/main/base16/a.yaml")).toEqual({
      ok: true,
      url: `${RAW}/o/r/main/base16/a.yaml`,
    });
    expect(toGithubRawUrl("https://github.com/o/r/raw/main/a.yaml")).toEqual({
      ok: true,
      url: `${RAW}/o/r/main/a.yaml`,
    });
  });
  it("strips query and hash from blob links, upgrades http, trims input", () => {
    expect(toGithubRawUrl("  http://www.github.com/o/r/blob/main/a.yaml?plain=1#L3 ")).toEqual({
      ok: true,
      url: `${RAW}/o/r/main/a.yaml`,
    });
  });
  it("keeps slashed refs and encoded paths", () => {
    expect(toGithubRawUrl("https://github.com/o/r/blob/feat/x/schemes/a%20b.yaml")).toEqual({
      ok: true,
      url: `${RAW}/o/r/feat/x/schemes/a%20b.yaml`,
    });
  });
  it("passes raw and gist raw URLs through (minus the hash)", () => {
    expect(toGithubRawUrl(`${RAW}/o/r/main/a.yaml#x`)).toEqual({
      ok: true,
      url: `${RAW}/o/r/main/a.yaml`,
    });
    const gist = "https://gist.githubusercontent.com/u/abc123/raw/def/a.yaml";
    expect(toGithubRawUrl(gist)).toEqual({ ok: true, url: gist });
  });
  it("rejects non-URLs, other hosts, and non-file GitHub links", () => {
    for (const bad of [
      "not a url",
      "ftp://github.com/o/r/blob/main/a.yaml",
      "https://gitlab.com/o/r/-/blob/main/a.yaml",
      "https://github.com/o/r",
      "https://github.com/o/r/tree/main/base16",
      "https://github.com/o/r/pull/12/files",
      "https://github.com/o/r/blob/main",
    ]) {
      const res = toGithubRawUrl(bad);
      expect(res.ok, bad).toBe(false);
    }
  });
});
