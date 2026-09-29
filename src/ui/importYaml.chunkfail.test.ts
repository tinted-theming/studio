import { describe, expect, it, vi } from "vitest";

// Simulate the lazily-loaded js-yaml chunk failing to load (stale deploy, offline).
vi.mock("js-yaml", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

import { parseYamlText } from "./importYaml";

describe("parseYamlText when the YAML parser can't load", () => {
  it("resolves to an error result instead of rejecting", async () => {
    const res = await parseYamlText('system: "base16"');
    expect(res).toEqual({ ok: false, errors: [expect.stringMatching(/YAML parser/)] });
  });
});
