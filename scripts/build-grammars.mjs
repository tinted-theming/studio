// Vendors tree-sitter grammar `.wasm` files and nvim-treesitter `highlights.scm`
// queries into `public/`, so the in-browser code editor highlights with the exact
// parsers + queries nvim-treesitter uses. Revisions are pinned in scripts/grammars.json.
//
// Usage: npm run build:grammars
// Requires: `tree-sitter` CLI (>= 0.26, auto-fetches wasi-sdk) on PATH, git, and
// `web-tree-sitter` installed (its runtime tree-sitter.wasm is copied too).
//
// Output (committed to the repo):
//   public/grammars/tree-sitter.wasm          (web-tree-sitter runtime)
//   public/grammars/tree-sitter-<lang>.wasm   (one per grammar)
//   public/queries/<lang>/highlights.scm      (+ injections.scm, + inherited deps)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, copyFileSync, cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const GRAMMARS_OUT = join(ROOT, "public", "grammars");
const QUERIES_OUT = join(ROOT, "public", "queries");
const WORK = join(tmpdir(), "tinted-studio-grammars");

const manifest = JSON.parse(readFileSync(join(__dirname, "grammars.json"), "utf8"));
const NT_COMMIT = manifest.nvimTreesitterCommit;
const NT_URL = "https://github.com/nvim-treesitter/nvim-treesitter";

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

// Shallow-fetch a single revision (sha or tag) of `url` into `dir`.
function fetchRevision(url, revision, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  run("git", ["init", "-q"], dir);
  run("git", ["remote", "add", "origin", url], dir);
  try {
    run("git", ["fetch", "-q", "--depth", "1", "origin", revision], dir);
    run("git", ["checkout", "-q", "FETCH_HEAD"], dir);
  } catch {
    // Some hosts won't serve an arbitrary sha via want; fall back to a full fetch.
    run("git", ["fetch", "-q", "origin"], dir);
    run("git", ["checkout", "-q", revision], dir);
  }
}

function copyQueryDir(ntRoot, lang, copied) {
  if (copied.has(lang)) return;
  const srcDir = join(ntRoot, "runtime", "queries", lang);
  if (!existsSync(srcDir)) {
    console.warn(`  ! no query dir for "${lang}" (skipped)`);
    return;
  }
  copied.add(lang);
  const destDir = join(QUERIES_OUT, lang);
  mkdirSync(destDir, { recursive: true });
  for (const file of ["highlights.scm", "injections.scm"]) {
    const src = join(srcDir, file);
    if (existsSync(src)) copyFileSync(src, join(destDir, file));
  }
  // Follow `; inherits: a,b` modelines so the runtime resolver can fetch deps.
  const hl = join(srcDir, "highlights.scm");
  if (existsSync(hl)) {
    const text = readFileSync(hl, "utf8");
    const m = text.match(/^\s*;+\s*inherits\s*:\s*(.+)$/im);
    if (m) {
      for (const dep of m[1].split(",").map((s) => s.trim().replace(/[()]/g, "")).filter(Boolean)) {
        copyQueryDir(ntRoot, dep, copied);
      }
    }
  }
}

function main() {
  mkdirSync(GRAMMARS_OUT, { recursive: true });
  mkdirSync(QUERIES_OUT, { recursive: true });
  mkdirSync(WORK, { recursive: true });

  // 1. web-tree-sitter runtime wasm.
  const runtimeCandidates = [
    join(ROOT, "node_modules", "web-tree-sitter", "tree-sitter.wasm"),
    join(ROOT, "node_modules", "web-tree-sitter", "debug", "tree-sitter.wasm"),
  ];
  const runtime = runtimeCandidates.find(existsSync);
  if (!runtime) throw new Error("web-tree-sitter runtime wasm not found — run `npm install` first");
  copyFileSync(runtime, join(GRAMMARS_OUT, "tree-sitter.wasm"));
  console.log("✓ runtime tree-sitter.wasm");

  // 2. Grammars → wasm.
  for (const g of manifest.grammars) {
    console.log(`\n• ${g.name} @ ${g.revision}`);
    const repoDir = join(WORK, g.name);
    fetchRevision(g.url, g.revision, repoDir);
    const grammarPath = g.location ? join(repoDir, g.location) : repoDir;
    const out = join(GRAMMARS_OUT, `tree-sitter-${g.name}.wasm`);
    run("tree-sitter", ["build", "--wasm", "-o", out, grammarPath]);
    console.log(`  ✓ ${g.name} → ${out.replace(ROOT + "/", "")}`);
  }

  // 3. Queries from nvim-treesitter (single clone, copy each lang + inherited deps).
  console.log(`\n• nvim-treesitter queries @ ${NT_COMMIT}`);
  const ntDir = join(WORK, "nvim-treesitter");
  fetchRevision(NT_URL, NT_COMMIT, ntDir);
  const copied = new Set();
  for (const g of manifest.grammars) copyQueryDir(ntDir, g.name, copied);
  console.log(`  ✓ queries: ${[...copied].sort().join(", ")}`);

  console.log("\nDone. Vendored assets written under public/grammars and public/queries.");
}

main();
