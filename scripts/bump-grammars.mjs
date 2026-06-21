// Re-pin the grammar revisions in scripts/grammars.json to the latest
// nvim-treesitter `parsers.lua`. Updates each grammar's `revision` (and `url` /
// `location` if they changed upstream) plus the top-level `nvimTreesitterCommit`.
// Does NOT rebuild — review the diff, then run `npm run chore:grammars`.
//
// Usage:
//   npm run chore:grammars:bump            # re-pin to nvim-treesitter `main`
//   node scripts/bump-grammars.mjs <ref>   # ...to a branch/tag/sha instead
//
// Note: nvim-treesitter is archived (read-only), so `main` is its final state —
// bumping is typically a no-op until/unless you point this at a maintained fork
// (set NT_REPO=owner/name) or a different ref.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dirname, "grammars.json");

const REPO = process.env.NT_REPO || "nvim-treesitter/nvim-treesitter";
const REF = process.argv[2] || process.env.NT_REF || "main";

const headers = { "User-Agent": "tinted-studio-bump" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function getJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
  return res.json();
}
async function getText(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
  return res.text();
}

/** Extract a language's `install_info` block from parsers.lua. */
function installInfo(lua, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const head = new RegExp(`^  ${esc} = \\{$`, "m").exec(lua);
  if (!head) return null;
  const after = lua.slice(head.index);
  const end = after.indexOf("\n  },");
  const block = end === -1 ? after : after.slice(0, end);
  const grab = (key) => {
    const m = new RegExp(`${key}\\s*=\\s*'([^']+)'`).exec(block);
    return m ? m[1] : undefined;
  };
  return { revision: grab("revision"), url: grab("url"), location: grab("location") };
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

  console.log(`Resolving ${REPO}@${REF} …`);
  const commit = await getJson(`https://api.github.com/repos/${REPO}/commits/${REF}`);
  const sha = commit.sha;
  console.log(`  nvim-treesitter commit: ${sha}`);

  const lua = await getText(
    `https://raw.githubusercontent.com/${REPO}/${sha}/lua/nvim-treesitter/parsers.lua`,
  );

  let changed = 0;
  const missing = [];
  for (const g of manifest.grammars) {
    const info = installInfo(lua, g.name);
    if (!info || !info.revision) {
      missing.push(g.name);
      console.warn(`  ! ${g.name}: not found in parsers.lua — kept ${g.revision}`);
      continue;
    }
    const before = g.revision;
    if (info.revision !== g.revision) {
      g.revision = info.revision;
      changed++;
    }
    if (info.url && info.url !== g.url) g.url = info.url;
    if (info.location && info.location !== g.location) g.location = info.location;
    const mark = info.revision !== before ? `${before.slice(0, 8)} → ${info.revision.slice(0, 8)}` : "unchanged";
    console.log(`  ${g.name.padEnd(12)} ${mark}`);
  }

  manifest.nvimTreesitterCommit = sha;
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    `\nUpdated scripts/grammars.json (${changed} revision${changed === 1 ? "" : "s"} changed).` +
      (changed ? " Review the diff, then run `npm run chore:grammars`." : " Already up to date."),
  );
  if (missing.length) console.warn(`Not found upstream: ${missing.join(", ")}`);
}

main().catch((err) => {
  console.error(`bump failed: ${err.message}`);
  process.exit(1);
});
