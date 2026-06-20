# Reference artifacts

Preserved from the original `tinty studio` implementation. **Port from these;
don't ship them as-is.**

## `legacy/`

The complete working implementation as embedded static assets in the Tinted CLI.

- `legacy-studio.js` — **the source of truth for all domain logic.** Contains:
  - `BASE16_SLOTS`, `BASE24_*`, `BASE8`, `SUPPLEMENTAL` (slot definitions)
  - `UI_DEFAULTS` (45 keys), `SYNTAX_DEFAULTS` (105 keys) — **byte-verified
    against `tinted-builder`; copy verbatim**
  - color math + `deriveVariant` / `deriveOrange` / `deriveBrown` / `deriveGray`
    / `effectivePaletteFull` / `effectiveUi` / `effectiveSyntax` / `swapForLight`
  - `PREVIEW_ROLES`, `PREVIEW_ROLE_KEYS`, `TINTED8_ROLE_PATHS`, `previewColor`
  - `buildBaseYaml`, `buildTinted8Yaml`, `slugify`, `validateScheme`
  - the full state/undo/deep-link/library/workspace logic
- `legacy-studio.css` — the complete "Drafting Table" design-token system and
  the plate / workspace-tab / crop-mark / blueprint techniques.
- `legacy-studio.html` — page structure. Note two build-time substitution
  points the Rust generator used (you'll handle differently):
  - `<!--SNIPPETS-->` ← the snippet `<template>`s (see `../snippets/`)
  - `__TINTY_SCHEMES__` (in the JS) ← the scheme library JSON (now `data/schemes.json`)

## `snippets/`

Seven code snippets (`rust, kotlin, lisp, elixir, haskell, diff, terminal`),
pre-marked-up with highlight role classes (`.keyword`, `.string`, `.comment`,
`.ansi-*`, …) that the preview colors via `--preview-*` CSS variables.
