# Tinted Studio

A static, client-only web app for crafting [Tinted Theming](https://github.com/tinted-theming)
color schemes (Base16, Base24, Tinted8) and exporting them as scheme YAML.

> **Status: pre-build.** This repo currently holds the spec, the engineering
> handoff, and the preserved artifacts from the original implementation (which
> lived as the `tinty studio` CLI subcommand). The app itself is being rebuilt
> here with a modern framework + build tooling.

## Start here

- **[SPEC.md](./SPEC.md)** — what the product is and the exact domain logic
  (Tinted8 derivation, YAML formats, preview mappings). Framework-agnostic.
- **[HANDOFF.md](./HANDOFF.md)** — how to build it: recommended stack, project
  structure, the port plan, deploy, and conventions.

## What's in the repo

| Path | What |
|------|------|
| `reference/legacy/` | The complete, working vanilla-JS implementation to port **from** (byte-verified against the Rust builder). |
| `reference/snippets/` | The 7 syntax-highlight code snippets used by the live preview. |
| `data/schemes.json` | Local snapshot of the known-scheme library (`tinty list --json`). |
| `assets/` | Fonts (Space Mono, DM Serif Display, IBM Plex Mono) + logo/favicon. |
| `scripts/refresh-schemes.sh` | Regenerate `data/schemes.json`. |

## Live reference instance

The original implementation is hosted at <https://tinted-studio.bez.dev>.
