# Tinted Studio — Product Spec

Tinted Studio is a **static, client-only web application** for crafting color
schemes for the [Tinted Theming](https://github.com/tinted-theming) ecosystem
(Base16, Base24, Tinted8) and exporting them as valid scheme YAML.

This spec is the **what to build** — product behavior and domain logic,
independent of framework. For **how to start building it** (stack, structure,
porting plan), see [`HANDOFF.md`](./HANDOFF.md). A complete, working
implementation of all of this (vanilla JS, byte-verified against the Rust
builder) is preserved in [`reference/legacy/`](./reference/legacy/) — treat it
as the authoritative source of truth when porting domain logic.

> Origin: this began life as the `tinty studio` subcommand of the Tinted Theming
> CLI. It is being spun out into a standalone web app, rebuilt with modern build
> tooling and a frontend framework, while preserving every user-facing feature
> and all the hard-won domain logic.

---

## 1. Constraints & principles

- **Purely static** — compiles to static files hostable anywhere (no backend,
  no server-side code). `localStorage` is the only persistence. Production is on
  Cloudflare Workers Static Assets (§14).
- **Modern stack** — build tools + a frontend framework (see HANDOFF), but the
  output is a static bundle.
- **Domain logic is the asset.** The Tinted8 derivation engine, YAML formats,
  and preview role-mappings are exact and were verified against
  `tinted-builder` (Rust). Port them faithfully; keep them framework-agnostic
  and unit-tested.
- **Offline-capable** — fonts, images, snippets, the scheme snapshot, and the
  tree-sitter grammars + highlight queries (§13) are bundled; nothing is fetched
  from third parties at runtime, **except** a user-initiated GitHub fetch when
  importing a scheme by URL (the dialog, or opening a `#url=` link — §16).

---

## 2. Core concept — three independent workspaces

The app edits **three independent schemes at once**, one per system: Base16,
Base24, Tinted8. These are **separate documents**, not three views of one
scheme — switching between them (via tabs) preserves each one's full state
independently, persisted separately. Each workspace has:

- its own **palette** (slot colors),
- its own **properties** (name, author, variant, …),
- (Tinted8 only) its own **overrides** for derived slots/tokens,
- a **loaded-from** scheme id (if started from a known scheme),
- a **`touched`** flag (edited since last load/reset) → drives a per-tab
  "edited" indicator and "replace your work?" confirmations.

---

## 3. Feature set (all required for parity)

1. **Workspace tabs** — Base16 / Base24 / Tinted8, each an independent scheme
   with a per-tab edited indicator.
2. **Per-slot color editing** — every slot has a hex text input **and** a
   native color-picker, kept in sync.
3. **Live preview** — renders the scheme applied to either a **user-editable,
   tree-sitter-highlighted code editor** (§7, §13), a **fixed** role-mapped
   snippet (Terminal, Diff), or a palette-swatch grid (§7).
4. **Tinted8 derivation + override** — derive dim/bright, orange/brown/gray, and
   the UI/syntax token trees from the 8 base colors; override any derived value;
   clear an override to fall back to derivation (§6).
5. **Properties** — name (rendered as a serif "nameplate"), author, variant
   (strict Dark/Light), and for Tinted8 also family/style/description. Slug is
   **derived** from the name (read-only).
6. **Start from a known scheme** — a picker, filtered to the active workspace's
   system, sourced from the local scheme snapshot (§9). Loading reconstructs
   Tinted8 overrides by diffing the scheme's expanded values vs derivation.
7. **Deep-linking** — `#<scheme-id>` loads that scheme into its workspace on
   load; shareable URLs.
8. **Undo / redo** — bounded in-session history with per-control coalescing.
9. **Reset** (revert workspace to its loaded scheme, or stock if blank) and
   **Clear all** (always back to a blank stock scheme). Both confirmed.
10. **Validation** — required properties (name, author) and required slots must
    be valid before export; show clear inline + summary errors.
11. **Export** — live YAML preview; **Copy** and **Download**
    (`<system>-<slug>.yaml`). Output is **minimal** (only what the builder can't
    re-derive) so derivation stays dynamic.
12. **Extract scheme from an uploaded image** — user uploads an image; the app
    extracts a palette client-side and seeds the active workspace's slots (§8).
13. **Theme switching** — System / Light / Dark page theme, persisted, applied
    before first paint (no flash).
14. **Import from YAML** — load any Base16/Base24/Tinted8 scheme by pasting its
    YAML or giving a GitHub file URL; GitHub imports are shareable as
    `#url=<raw URL>` links (§16).

---

## 4. Systems & slots

- **Base16** — `base00`…`base0F` (16 slots), all required. (Labels/semantics in
  `BASE16_SLOTS` in the reference.)
- **Base24** — `base00`…`base17` (24 slots), all required. Adds `base10`
  (darker black), `base11` (brighter white), `base12`–`base17` (bright
  red/yellow/green/cyan/blue/magenta).
- **Tinted8** — 8 **required** base normals: `black, red, green, yellow, blue,
  magenta, cyan, white`. Everything else is derived: each color's `-dim`/`-bright`,
  plus supplementals `orange`/`brown`/`gray` (normal + dim + bright) → 33 palette
  slots, plus a **UI** token tree (45 keys) and a **Syntax** token tree (105
  keys). Base normals are stored; derived values are computed; explicit
  overrides are stored separately.

---

## 5. Data model (per workspace)

```
meta:    { name, author, variant, description, (family, style for tinted8) }
palette: base16/base24 → { baseXX: hex }
         tinted8        → { black..white: hex }   // 8 base normals only
overrides (tinted8):     { palette: {key:hex}, ui: {key:hex}, syntax: {key:hex} }
loadedFrom: <scheme-id|null>
touched:    boolean
```

Persisted to `localStorage` (the legacy keys are `tinty-studio-state` and
`tinty-studio-page-theme`; pick your own, just be consistent). `variant` must
be exactly `"dark"` or `"light"`.

---

## 6. Tinted8 derivation engine (the crown jewel)

Ported to JS in the reference and **verified byte-identical** to
`tinted-builder` for 45 UI + 105 syntax + 32/33 palette slots. (The 33rd,
`orange-dim`, differs only due to an upstream builder bug — §10.) All math is in
**HSL**; clamp S and L to `[0,1]` after each operation; round RGB channels with
`round(c*255)`.

**Variant (dim/bright) of a normal color** — hue unchanged, `ΔL = 0.12`:
- **dim:**    `k = L<0.4 ? 1.04 : L<0.7 ? 1.07 : 1.10`; `L' = clamp(L − min(ΔL, L))`;     `S' = clamp(S·k)`.
- **bright:** `k = L<0.5 ? 1.08 : L<0.8 ? 1.00 : 0.90`; `L' = clamp(L + min(ΔL, 1−L))`; `S' = clamp(S·k)`.

**Supplemental normals (from the base palette):**
- **orange** = `yellow` with `H' = (H − 10) mod 360` (S, L unchanged).
- **brown**  = `yellow` with `H' = (H − 15) mod 360`, `S' = clamp(S·0.65)`, `L' = clamp(L − 0.30)`.
- **gray**   = `S = 0`, `L = (L_black + L_white) / 2` (hue irrelevant).

**UI tokens (45)** — `UI_DEFAULTS`: each key → a `<color>-<variant>` palette slot,
with **separate dark/light mappings** (some keys swap based on variant).

**Syntax tokens (105)** — `SYNTAX_DEFAULTS`: each key → a dark-oriented
`<color>-<variant>`; for `variant: light`, **swap white↔black** in the slot name.

> **Port the `UI_DEFAULTS` and `SYNTAX_DEFAULTS` tables verbatim** from
> `reference/legacy/legacy-studio.js`. They are exhaustive and byte-verified;
> do not regenerate them by hand. The pure functions to port: `rgb↔hsl`,
> `hexToRgb/rgbToHex`, `deriveVariant`, `deriveOrange/Brown`, `deriveGray`,
> `effectivePaletteFull`, `effectiveUi`, `effectiveSyntax`, `swapForLight`,
> `isLightVariant`.

**Override / clear semantics:** editing a derived slot stores an override;
clearing it reverts to derivation. Editing the *effective* normal cascades to
its derived dim/bright (unless those are themselves overridden). Loading a known
scheme reconstructs overrides by diffing the snapshot's expanded values against
fresh derivation (skip `orange-dim` — its snapshot value is the buggy one).

---

## 7. Preview surface

The preview language selector switches between three kinds of surface:

1. **Editable code editor** (`rust, typescript, python, lua, go, json, bash,
   kotlin, commonlisp` (labelled "Lisp"), `elixir, haskell`) — a real,
   user-editable **CodeMirror 6** editor with **tree-sitter** highlighting driven
   by the exact parsers + queries nvim-treesitter uses, colored via a TypeScript
   port of tinted-nvim's palette→highlight-group mapping (CM6 is the editing
   engine only; highlighting and chrome colors are ours). This is the substance of
   the feature; see **§13** for the full architecture.
2. **Fixed, role-mapped snippets** (`terminal`, `diff`) — static HTML
   (`src/ui/snippets/*.html`) pre-marked-up with role classes (`.keyword`,
   `.string`, `.comment`, `.diff-add`, `.ansi-*`, …) that consume per-role CSS
   custom properties (`--preview-*`) the preview sets from the scheme. These are
   **not** editable (Terminal needs ANSI semantics; Diff is a hunk illustration).
3. **Palette grid** (`palette`) — a grid of every swatch.

The **role mapping** (used by the fixed snippets and palette) maps **roles**
(bg, fg, comment, keyword, function, string, …, and 16 ANSI roles) to colors:

- **Base16/Base24** — `PREVIEW_ROLE_KEYS` map role → `baseXX` (Base24 overlays
  the bright-ANSI accents).
- **Tinted8** — non-ANSI roles resolve via `TINTED8_ROLE_PATHS` to the
  authored/derived `ui`/`syntax` token (e.g. `keyword → syntax.keyword`,
  `bg → ui.global.background.normal`); ANSI roles fall back to palette slots.

`PREVIEW_ROLES`, `PREVIEW_ROLE_KEYS`, `TINTED8_ROLE_PATHS`, and
`previewColor`/`palettePreviewKey` live in `src/core/preview.ts`.

> The role system is a **coarse** (≈13 semantic roles) approximation. The code
> editor (§13) supersedes it for real source, mapping the *full* set of
> tree-sitter capture groups to colors. The role system is retained only for the
> fixed Terminal/Diff snippets and the palette grid.

---

## 8. Image → scheme extraction

A required feature (carried over from the CLI's `generate-scheme`, which uses
the Rust `tinted-scheme-extractor` crate). Because this app is static, implement
it **client-side**:

1. User uploads an image (drag-drop / file input).
2. Draw to an offscreen `<canvas>`, sample pixels (downscale for speed).
3. Quantize to a representative palette (median-cut or k-means).
4. Map extracted colors to slots: order by lightness for the base00–07 ramp;
   assign the accent hues (base08–0F / the 8 ANSI colors) by hue. For Tinted8,
   seed the 8 base normals and let derivation fill the rest.
5. Seed the active workspace (mark it touched). Let the user fine-tune.

Reference behavior: tinty `generate-scheme <image>` and the
`tinted-scheme-extractor` crate. A previous prototype/spec referenced this
feature — reproduce the *behavior* (a sensible scheme from an image); the
client-side quantization approach is an implementation choice.

---

## 9. Scheme snapshot (the "start from" library)

The known-schemes library is a **local snapshot**, `data/schemes.json`,
produced by the Tinted CLI:

```
tinty list --json > data/schemes.json
```

It's an array of entries (510 at time of writing) shaped like:

```
{ id, name, author, system, variant, slug, palette,
  lightness: { foreground, background } | null,
  ui?, syntax?   // present only for tinted8 (fully-expanded token maps)
}
```

`palette` values are `{ hex_str, hex, rgb, dec }`; for Tinted8 the keys are
`"<color>-<variant>"` (e.g. `red-bright`), and `ui`/`syntax` keys are dotted
paths. The picker filters to the active workspace's `system`. Provide a refresh
script (HANDOFF §) and treat the snapshot as a build input. It's ~1.2 MB — load
it lazily / code-split it so it doesn't block first paint.

---

## 10. Known upstream bug (orange-dim)

`tinted-builder` 0.16.0 computes Tinted8 `orange_dim` from the **bright** source
(a copy/paste bug). The studio is **spec-correct** (true dim), and skips
reconstructing `orange-dim` overrides from snapshot data (which carries the
buggy value). Keep this behavior. Details in the tinty repo's
`tinted-studio-spec.md` §14 and the `tinted-builder-rust` handoff.

---

## 11. YAML export

Minimal emission — only the values the builder can't re-derive.

- **Base16 / Base24** (flat): `system`, `name`, `slug?`, `author`, `variant`,
  `description?`, then `palette:` with all slots.
- **Tinted8** (nested `scheme:` wrapper — **this is the spec**, verified against
  `tinted-theming--home/specs/tinted8/styling.md`, the builder's parser, and
  fixtures):
  ```yaml
  scheme:
    system: "tinted8"
    supports:
      styling-spec: "0.2.0"
    author: "..."
    name: "..."        # optional fields omitted when empty
    slug: "..."
    family: "..."
    style: "..."
    description: "..."
  variant: "dark"      # MUST be "dark" or "light"
  palette:             # 8 base colors + ONLY overridden derived slots
    black: "#..."
    ...
  syntax:              # only overridden keys (whole section omitted if none)
  ui:                  # only overridden keys (whole section omitted if none)
  ```
- **`variant`** must be exactly `dark` or `light` (the builder types it as an
  enum; anything else fails to parse). Use a strict Dark/Light control.
- **`slug`** is always derived from `name`: `slugify` = NFKD-fold accents → strip
  combining marks → lowercase → collapse non-alphanumeric runs to a single `-` →
  trim leading/trailing `-`.
- **Filename**: `<system>-<slug>.yaml`.
- Quote hex values (a leading `#` starts a YAML comment if unquoted).
- **Validation gates export**: `name` and `author` required; all required slots
  (every Base16/24 slot; the 8 Tinted8 base normals) must be valid hex. Disable
  Copy/Download with a status message until valid; show red indicators on
  emptied required fields (after first edit, not on a pristine load).

Port `buildBaseYaml`, `buildTinted8Yaml`, `slugify`, `validateScheme` from the
reference; keep the round-trip property (output re-parses to the same scheme).

---

## 12. Visual design — "The Drafting Table"

A draftsman's-sheet aesthetic; reproduce or evolve, but keep the identity.

- **Plates, not cards** — sections are open regions delineated by a top hairline
  rule with a small tick + cartouche label (no filled boxes/shadows). Sharp
  corners, hairline rules, mono technical labels.
- **Crop-mark corner ticks** frame the preview and YAML "viewports."
- **Light = warm vellum** (`#f4f1e9`) + graphite ink. **Dark = blueprint** (deep
  ink `#0c1219` + cyan-tinted hairlines).
- **Accent = plain ink** (black on light, white on dark) for active controls,
  override markers, the Download button, focus rings. **Teal**
  (`#0f857a` / `#2bb5a6`) is reserved for the per-workspace "edited" dot.
- **Type**: wordmark **"TINTED STUDIO"** in all-caps **Space Mono** Bold; the
  scheme **name** is a **DM Serif Display** nameplate; body **Inter**; technical
  labels/keys **IBM Plex Mono**. Fonts are in `assets/fonts/` (woff2). Images
  (logo, favicon) in `assets/`.

**Layout**: two columns — scheme editor (left) and preview+export (right). The
preview column is the **wider** of the two (grid `0.8fr / 1.2fr`) to give the
code editor room. On desktop they scroll **independently** (the page itself
doesn't scroll) so the **preview stays fixed/visible** while the long Tinted8
palette/token list scrolls. Below a breakpoint (~920px), stack to one column with
normal page scrolling.

The left-column toolbar stacks vertically ("Start from" label → full-width
scheme picker → wrapped action buttons: From image / Undo / Redo / Reset / Clear
all) so the picker label isn't clipped in the narrower column.

See `reference/legacy/legacy-studio.css` for the full token system and the
tab/plate/crop-mark techniques.

---

## 13. Code editor — tree-sitter highlighting

The preview's code languages (§7) are a **user-editable editor** whose
highlighting is **tree-sitter-backed**, using the **exact parsers and highlight
queries nvim-treesitter uses**, colored by a faithful TypeScript port of
**tinted-nvim**'s palette→highlight-group mapping. This makes the preview show
real, structurally-correct highlighting that matches what a Neovim user sees with
a given scheme.

### 13.1 Why this shape (research findings)

- **web-tree-sitter is parser + query engine only.** It does *not* do
  highlighting. Neovim's `vim.treesitter.highlighter` (and the Rust
  `tree-sitter-highlight` crate) own capture→color resolution, the fallback
  hierarchy, and overlap handling — none of which is portable. **We reimplement
  that layer in TS** (`src/highlight`, `src/theme`).
- **nvim-treesitter was archived (read-only) on 2026-04-03.** Its `main` branch
  is the terminal state. Parser revisions live in
  `lua/nvim-treesitter/parsers.lua` (`install_info.{url,revision,location}`);
  highlight queries live in `runtime/queries/<lang>/highlights.scm`.
- **Grammar and query must come from the same revision.** A query and grammar
  from different revisions is the #1 cause of broken/partial highlighting, so we
  pin both to one nvim-treesitter commit.
- **Capture name *is* the highlight group**, with a rightmost-`.`-segment
  fallback chain (`@string.special.url → @string.special → @string`).
- **Overlapping captures**: higher `#set! priority` wins, else **last capture
  wins** (tree-sitter ≥0.21 default). Resolve to non-overlapping spans with a
  cut-point sweep.
- **Predicates**: web-tree-sitter natively evaluates `#eq? #match? #any-of?
  #not-*?`; `#set!` passes through as per-capture metadata; **Neovim-only**
  predicates (`#lua-match?`, `#has-parent?`, `#contains?`, …) are unknown and
  would make `new Query(...)` throw — they must be translated or stripped.
- **tinted-nvim** (cloned at `~/.dotfiles/.../tinted-nvim`) is **alias-based**:
  highlight groups map to palette aliases (`@keyword → Keyword → purple`) or
  `{ link = … }`; aliases resolve to base slots (`red→base08`,
  `bright_red→base12||base08`). `CursorLine = darken(base01, 0.6)`,
  `Visual = base01` (`highlights/core.lua`).

### 13.2 Design decisions

- **CodeMirror 6 is the editing engine; highlighting stays ours.** CM6 provides
  the editing surface, gutter, selection, search, and modal (vim) support — but
  **not** syntax highlighting here: no Lezer, no `@codemirror/lang-*`. Our
  tree-sitter spans are painted as CM `Decoration` marks and CM's chrome is themed
  from the scheme, so the highlight layer remains the single source of truth. (An
  earlier hand-rolled `<textarea>`-over-`<pre>` editor was replaced by this; the
  A/B comparison lived in the `feat/studio-cm6` worktree.)
- **Editable language set** = every grammar with a vendored `.wasm` (§13.3):
  `rust, typescript, python, lua, go, json, bash, kotlin, commonlisp` (shown as
  "Lisp"), `elixir, haskell`. **Terminal and Diff stay fixed** (Terminal needs
  ANSI semantics; Diff is a fixed hunk illustration) — see §7. Adding a language
  is: add it to `scripts/grammars.json`, run `npm run build:grammars`, add it to
  `SUPPORTED_LANGUAGES` + a preset + a label.
- **Vendored prebuilt assets**, not built in CI — reproducible, offline, simple
  deploy.
- **One alias resolver for all three systems.** Base16/24 pass slots straight
  through; **Tinted8 is synthesized into base slots** (the inverse of
  tinted-nvim's tinted8 translation) so a single base16/24-shaped highlighter
  renders every system.
- **CM chrome is themed via CSS custom properties on the host** (not per-edit
  `EditorView.theme` reconfigures), so a scheme change recolors gutter, active
  line, selection, brackets, search, etc. with zero stylesheet churn. `CursorLine`
  (active line) and `Visual` (selection, drawn behind text by `drawSelection`)
  use the exact tinted-nvim colors; the vim block cursor is themed to `Cursor`
  (fg↔bg inverted).

### 13.3 Build pipeline (vendored grammars + queries)

- `scripts/grammars.json` — manifest: pinned nvim-treesitter `main` commit
  (`4916d6592ede8c07973490d9322f187e07dfefac`) + per-grammar `{ url, revision,
  location? }` copied from that commit's `parsers.lua` (one entry per editable
  language, including kotlin/commonlisp/elixir/haskell).
- `scripts/build-grammars.mjs` (`npm run build:grammars`): clones each grammar at
  its revision → `tree-sitter build --wasm` → `public/grammars/tree-sitter-<lang>.wasm`;
  copies `highlights.scm` (+ `injections.scm`, + transitively-`inherits`-ed query
  dirs such as `ecma` for typescript) → `public/queries/<lang>/`; copies the
  web-tree-sitter runtime `tree-sitter.wasm`.
- Outputs are **committed** and served as static assets (referenced via
  `import.meta.env.BASE_URL`). Deps: `web-tree-sitter@^0.25`, `tree-sitter-cli`
  (dev only). Re-run the script to refresh; pinning lives entirely in the manifest.

### 13.4 Highlight engine — `src/highlight/`

- `engine.ts` — `Parser.init({ locateFile })` once; per-language `Language.load`
  + `new Query` (cached); `highlight(lang, code)` parses, reads captures (with
  `setProperties.priority`), and returns non-overlapping spans. Node indices are
  **UTF-16 code units** = JS string offsets. Unsupported language or any failure →
  empty spans (caller renders plain text). `SUPPORTED_LANGUAGES` is the editable
  set.
- `queryLoader.ts` — resolves `; inherits:` (inherited query text **first** so
  the current language's later patterns win), rewrites `#lua-match?` /
  `#not-lua-match?` → `#match?` / `#not-match?` via `luaPatternToRegex` (Lua
  `%`-classes → JS regex, inside-`[…]`-class aware), and **drops** any other
  unsupported predicate (keeps `#set!` + natively-supported predicates).
- `spans.ts` — cut-point sweep → non-overlapping `{start,end,capture}` (priority
  desc, then last-wins); **drops non-visual captures** (`@spell/@nospell/@conceal`
  and `_`-prefixed internal captures) so they never blank real colors; merges
  adjacent same-capture spans. Offsets are UTF-16 code units = CM6 document
  positions, so spans map directly onto CM `Decoration` ranges.

### 13.5 Theme mapping — `src/theme/` (tinted-nvim port)

- `aliases.ts` — `ALIAS_MAP` + resolver (first existing slot wins → Base24
  bright-slot precedence), ported from `aliases.lua`.
- `groups.ts` — highlight-group specs ported from tinted-nvim `treesitter.lua`
  (modern `@` captures, nvim-0.10 markup branch), `syntax.lua`, plus `Normal`,
  `Diagnostic*`, and the `@diff.*` captures (newer than tinted-nvim → mapped to
  Added/Removed/Changed).
- `color.ts` — `blend` (from `utils.lua`).
- `resolve.ts` — `buildHighlightTable(slots)` resolves aliases + `link` chains
  into `{ groups, fg, bg, cursorLine, selection, ui }`; `styleForCapture(capture)`
  applies the dotted fallback. `cursorLine = blend(base01, base00, 0.6)`
  (CursorLine), `selection = base01` (Visual). `ui` carries the CM6 chrome colors
  ported from `core.lua` — `LineNr`/`CursorLineNr`, `MatchParen`, `Search`/
  `IncSearch`, `Pmenu`-style panels, `NonText`/whitespace, indent-guide — consumed
  as CSS variables by the editor (§13.6).
- `baseSlots.ts` — `schemeToBaseSlots`: base16/24 pass-through; **Tinted8**
  synthesizes `base00..base17` from the effective tree
  (`ui.global.background.normal→base00`, `…foreground.normal→base05`,
  `red-normal→base08`, …, `brown-normal→base0F`, grays→`base01..04`,
  `*-bright→base12..17`).

### 13.6 Editor component — `src/ui/components/CodeMirrorEditor.tsx` (+ `cm/highlight.ts`)

A React wrapper that mounts one `EditorView` and bridges it to the store
(`{ language, value, table, settings, onChange }`).

- **Highlight bridge** (`cm/highlight.ts`): a `ViewPlugin` re-runs
  `highlight(lang, code)` on doc/language change (≈60 ms debounce) and dispatches
  a `setSpans` effect; a `StateField` caches the spans and derives a
  `DecorationSet` of inline-styled `Decoration.mark`s via `styleForCapture`. A
  `setTable` effect rebuilds decorations from the **cached spans** on a scheme
  change → **recolor without re-parsing**. Language lives in a `Compartment`.
- **Theme**: one static `EditorView.theme` whose colors are CSS variables
  (`--cm-fg`, `--cm-bg`, `--cm-cursorline`, `--cm-selection`, `--cm-linenr`,
  `--cm-matchparen`, `--cm-search-*`, …) set on the host element from `table`.
  Scheme changes update the vars (instant recolor, no new stylesheet). Selection
  and matching-bracket rules mirror CM's deep base-theme selectors to win on
  specificity; the vim cursor override uses `!important` to beat vim's
  `Prec.highest` theme. Mono `12.5px/20px`, `tab-size: 2`.
- **Editing**: `history()`, `defaultKeymap` + `searchKeymap`, Tab → two spaces.
  `value`/`language` sync via transactions; failures fall back to plain text.

### 13.7 Editor features (CodeMirror)

All themed from the active scheme; the three toggles persist in
`store.editorSettings` (own localStorage key, decoupled from scheme undo/redo).

- **Line-number gutter** + active-line gutter (`LineNr`/`CursorLineNr`), with a
  **relative-number** toggle (active line absolute, others by distance; the
  active-line gutter forces the refresh on caret moves).
- **Bracket matching** (`MatchParen`), **selection-occurrence** highlighting, and
  a **search panel** (Mod-F, `Search`/`IncSearch`, `Pmenu`-style panel).
- **Vim mode** toggle (`@replit/codemirror-vim`, in a `Compartment`); block cursor
  themed to `Cursor`.
- **Indentation guides** (`@replit/codemirror-indentation-markers`, colors via CSS
  vars) and a **whitespace-rendering** toggle (`NonText`).

### 13.8 Presets & persistence

- `src/ui/snippets/presets.ts` — one editable default per language, each opening
  with a prominent "EDIT ME …" comment (a `"_comment"` key for JSON, which has no
  comment syntax).
- `store.editorContent` — per-language edits, persisted under its **own**
  localStorage key (`tinted-studio-editor`) and **decoupled from scheme
  undo/redo** (CM has its own history; code edits must not touch palette history).
  Effective content = `editorContent[lang] ?? DEFAULT_PRESETS[lang]`; a **Reset**
  button (shown only when edited) drops the override. `store.editorSettings`
  (`tinted-studio-editor-settings`) holds the vim / relative-numbers / whitespace
  toggles.

---

## 14. Deployment (Cloudflare)

Production is served from **Cloudflare Workers Static Assets** — no Worker script,
just the built `dist/` uploaded as static assets. Config in `wrangler.jsonc`:

- `name: "tinted-studio"`, `assets.directory: "./dist"`.
- `assets.not_found_handling: "single-page-application"` — unknown paths fall back
  to `index.html` (the app is a single page; scheme deep-links use the URL hash, so
  no server routing is needed).
- `workers_dev: false`, `preview_urls: false` — served **only** from the custom
  domain `tinted-studio.bez.dev` (a `custom_domain` route on the `bez.dev` zone).

**Deploy:** `npm run build` (→ `dist/`, including the vendored `public/grammars/*.wasm`
and `public/queries/**` which Vite copies verbatim and the app fetches at runtime via
`import.meta.env.BASE_URL`), then `wrangler deploy`. Requires Cloudflare auth
(`wrangler login` or a `CLOUDFLARE_API_TOKEN` with Workers + the zone). The static
bundle stays host-agnostic (§1) — Cloudflare is the chosen host, not a hard
dependency.

Live: **https://tinted-studio.bez.dev**

---

## 15. Non-goals

- No backend, accounts, or saving to a server.
- No editing of arbitrary scheme systems beyond Base16/Base24/Tinted8.
- Not a theme *applier* — it builds and exports scheme files only.

---

## 16. Import from YAML (paste / GitHub URL)

Design: `docs/superpowers/specs/2026-09-28-yaml-import-design.md`.

- **Entry points:** the "From YAML" toolbar button (Paste / GitHub URL tabs) and
  `#url=<encodeURIComponent(raw URL)>` deep-links.
- **Formats:** modern Base16/Base24 (`system:` + `palette:`), Tinted8 (`scheme:`
  wrapper; flat or nested `ui`/`syntax`; `<key>.default` → parent key), and the
  legacy flat Base16/24 format (`scheme: "Name"`, top-level `base00: "282c34"`).
  YAML is parsed with js-yaml 4's FAILSAFE schema so unquoted hex stays a string.
- **Normalization:** `src/core/import.ts` (`parseSchemeDocument`) — errors block
  the load (missing/invalid/alpha slots, non-enum variant, unknown format);
  warnings don't (unknown keys, inferred variant, missing author/name, slug
  mismatch). Tinted8 overrides are kept as authored, including `orange-dim`.
- **URLs:** GitHub only — `github.com/…/blob|raw/…` is rewritten to
  `raw.githubusercontent.com`; raw and gist-raw URLs pass through
  (`src/core/githubUrl.ts`). 10 s timeout, 256 KB cap.
- **Loading:** like a library load (switches workspace, undoable, confirm if
  edited), plus a persisted `baseline` so **Reset** returns to the import.
  GitHub imports record `loadedFrom = "url:<raw URL>"`.
