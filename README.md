# Tinted Studio

🌐 https://tinted-theming.github.io/studio/.

A static, client-only web app for crafting [Tinted Theming](https://github.com/tinted-theming)
color schemes (Base16, Base24, Tinted8) and exporting them as scheme YAML.

## What's in the repo

| Path | What |
|------|------|
| `reference/snippets/` | The 7 syntax-highlight code snippets used by the live preview. |
| `data/schemes.json` | Local snapshot of the known-scheme library (`tinty list --json`). |
| `assets/` | Fonts (Space Mono, DM Serif Display, IBM Plex Mono) + logo/favicon. |
| `scripts/refresh-schemes.sh` | Regenerate `data/schemes.json`. |


