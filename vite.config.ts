import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Emit a THIRD-PARTY-NOTICES.txt into the build so the bundled MIT dependencies'
 * notices ship with the static site (IMAGE-EXTRACTION.md §9 — required for
 * colorthief; we include all bundled runtime deps).
 */
function thirdPartyNotices(): Plugin {
  const require = createRequire(import.meta.url);
  const deps = ["colorthief", "react", "react-dom", "zustand"];
  // Walk up from a resolved entry to the package's own manifest (some packages,
  // e.g. colorthief, don't expose "./package.json" via their exports map).
  const findPkgJson = (startFile: string, name: string): string => {
    let dir = dirname(startFile);
    for (;;) {
      const pj = join(dir, "package.json");
      if (existsSync(pj)) {
        try {
          if ((JSON.parse(readFileSync(pj, "utf8")) as { name?: string }).name === name) return pj;
        } catch {
          /* keep walking */
        }
      }
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`package.json for ${name} not found`);
      dir = parent;
    }
  };
  return {
    name: "third-party-notices",
    apply: "build",
    generateBundle() {
      const blocks = deps.map((dep) => {
        const pkgPath = findPkgJson(require.resolve(dep), dep);
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
          version: string;
          license?: string;
        };
        let licenseText = "";
        for (const name of ["LICENSE", "LICENSE.md", "license", "LICENSE.txt"]) {
          try {
            licenseText = readFileSync(join(dirname(pkgPath), name), "utf8").trim();
            break;
          } catch {
            /* try the next candidate */
          }
        }
        return `${dep}@${pkg.version} (${pkg.license ?? "see notice"})\n\n${licenseText}`.trim();
      });
      const sep = `\n\n${"=".repeat(72)}\n\n`;
      this.emitFile({
        type: "asset",
        fileName: "THIRD-PARTY-NOTICES.txt",
        source: `Tinted Studio — third-party notices\n${sep}${blocks.join(sep)}\n`,
      });
    },
  };
}

// Static SPA build → dist/. The scheme snapshot (~1.2MB) is loaded lazily at
// runtime (see SPEC §9 / HANDOFF), so it is served from public/ rather than
// bundled into the main chunk.
export default defineConfig({
  plugins: [react(), thirdPartyNotices()],
  server: {
    // Allow the containerized verification browser to reach the dev server.
    allowedHosts: ["host.docker.internal"],
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
