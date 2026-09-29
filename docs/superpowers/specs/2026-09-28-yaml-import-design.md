# YAML import (paste + GitHub URL) — design

Status: approved design, pending implementation plan.
Companion to [`SPEC.md`](../../../SPEC.md) (product + domain truth).

## Goal

Let a user preview any scheme they have as YAML — not just the ~510 in the
bundled snapshot — by loading it into the Studio:

1. **Paste** — a modal with a textbox that accepts scheme YAML.
2. **GitHub URL** — a modal field that accepts a GitHub link to a scheme YAML
   file; the scheme is fetched client-side.

Primary use: previewing schemes that aren't in the snapshot yet (a fork, a PR
branch, a local draft) and sharing them via a Studio link.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| What does "preview" do? | **Load into the matching workspace**, exactly like picking a library scheme: editable, undoable, exportable; confirm before replacing edited work. |
| Shareable? | **Yes** for GitHub sources: `#url=<encoded GitHub URL>` fetches + loads on open. Pasted YAML is local-only. |
| Which URLs? | **GitHub file URLs only** (allowlist): `github.com/<o>/<r>/blob/<ref>/<path>`, `raw.githubusercontent.com/…`, `gist.githubusercontent.com/…`. No PR/commit links, no arbitrary hosts. |
| Which YAML formats? | **Current spec + legacy Base16/24**: modern flat Base16/Base24 (`system:` + `palette:`), Tinted8 (`scheme:` wrapper), and the legacy flat format (`scheme: "Name"`, top-level `base00: "282c34"` without `#`). |
| Tinted8 overrides | **Kept as authored** (not diffed against derivation), so re-export reproduces the author's file. An explicit `orange-dim` is kept — the SPEC §10 skip applies only to *expanded snapshot* data. |
| Reset after import | Reverts to the **imported scheme**, not stock (new persisted `baseline`). |

## Approach

Parse YAML with **`js-yaml`** (≈40 KB), loaded via dynamic `import()` so it is
not in the main bundle. The UI/state layer turns text into a plain object; a
**pure normalizer in `core/`** turns that object into Studio data. `core/` never
sees YAML text and stays library-free — the same injection pattern image
extraction uses (colorthief output → pure `extractScheme`).

Rejected: the `yaml` package (≈3× larger, no benefit for our inputs); a
hand-rolled parser (brittle against real-world files).

## Architecture

### `src/core/import.ts` (pure, unit-tested)

```ts
export interface ImportedScheme {
  system: Flavor;
  meta: Meta;                         // variant always "dark" | "light"
  palette: Record<string, string>;    // base16/24 slots, or the 8 tinted8 normals
  overrides?: Tinted8Overrides;       // tinted8 only
}

export type ImportResult =
  | { ok: true; scheme: ImportedScheme; warnings: string[] }
  | { ok: false; errors: string[] };

export function parseSchemeDocument(doc: unknown): ImportResult;
```

**Format detection** (in order):

1. **Tinted8** — `doc.scheme` is an object with `system: "tinted8"`.
2. **Modern Base16/24** — top-level `system` is `base16`/`base24` and
   `palette` is an object.
3. **Legacy** — `doc.scheme` is a string and top-level `baseXX` keys exist.
   Base24 if any of `base10`–`base17` is present, else Base16. Name comes from
   `scheme`; hex values gain a leading `#`.
4. Otherwise → error ("Unrecognized scheme format").

**Normalization rules:**

- Hex: accept `#RRGGBB`/`RRGGBB` (case-insensitive), store lowercase with `#`.
  Shorthand is normalized via the existing `normalizeHex`. **8-digit / alpha hex
  is an error** (Tinted8 compliance; the builder rejects it).
- Base16/24: every required slot (`requiredSlotKeys`) must be present and valid;
  missing/invalid slots are errors listing the keys.
- Tinted8:
  - `palette`: the 8 base normals are required. `orange`/`brown`/`gray` →
    `overrides.palette[<color>]`; `<color>-dim|-bright` →
    `overrides.palette[<color>-<variant>]`; `<color>-normal` for a base color is
    accepted as an alias of `<color>`.
  - `ui`/`syntax`: accept flat dotted keys **or** nested maps (flattened to
    dotted paths). Keys must be in `UI_KEYS`/`SYNTAX_KEYS`.
  - Meta from `scheme.{name, author, family, style, description}`. If `name`
    is absent, fall back to `family` + `style`, then `slug`.
- `variant`: must be `dark` or `light`. If absent (always, for legacy), infer
  from `base00` (or Tinted8 `black`) relative luminance (`> 0.5` → light) and
  emit a warning. Any other value → error.
- `author` missing → allowed (warning); export validation already requires it.
- Unknown keys → ignored with a warning (one line per key, capped).
- `slug` in the file is ignored — the Studio always derives slug from name
  (SPEC §11); warn if it differs from `slugify(name)`.

**Round-trip property:** for any valid workspace `w`,
`parseSchemeDocument(jsyaml.load(buildXYaml(w)))` reproduces `w`'s meta,
palette, and overrides.

### `src/core/githubUrl.ts` (pure, unit-tested)

```ts
export function toGithubRawUrl(input: string):
  { ok: true; url: string } | { ok: false; error: string };
```

- `https://github.com/<o>/<r>/blob/<ref>/<path>` →
  `https://raw.githubusercontent.com/<o>/<r>/<ref>/<path>` (drop `?query`/`#hash`).
- `https://raw.githubusercontent.com/…` and `https://gist.githubusercontent.com/…`
  → accepted unchanged.
- `http:` is upgraded to `https:`; anything else (other hosts, `github.com` tree/
  PR/commit URLs) → error naming the accepted forms.

### Deep-link (`src/state/deeplink.ts`)

- New hash form `#url=<encodeURIComponent(originalUrl)>`. Unambiguous: no
  snapshot id contains `=`, `:` or `/` (verified against `data/schemes.json`).
- `parseHash(): { kind: "id"; id } | { kind: "url"; url } | null` replaces ad-hoc
  `hashId()` use in `App.tsx`; `setHash` gains a `url` variant.
- As today, editing a workspace clears the hash.

### State (`src/state/store.ts`)

- New action `loadImported(scheme: ImportedScheme, origin: string | null)`:
  pushes history, replaces the target workspace, switches `flavor` to it, sets
  `touched = false`, `loadedFrom = origin` (`"url:<raw url>"` for GitHub,
  `null` for paste), `authorByUser = false`, clears `invalidSlots`.
- New optional persisted `baseline` on each workspace: the `ImportedScheme` it
  was imported from. Set by `loadImported`; cleared by `loadScheme`,
  `applyExtractedScheme`, and `clearAll`. `mergeData` tolerates its absence.
- **Reset**: if `baseline` is present, restore it (via `loadImported` semantics);
  else existing behavior (library entry or stock).
- Confirm-on-replace lives in the UI (same as library loads): if the target
  workspace is `touched`, `window.confirm` before loading.

### Fetch (`src/ui/importYaml.ts`, UI layer)

- `fetchSchemeText(rawUrl)`: `fetch` with a 10 s `AbortController` timeout;
  reject non-2xx (message includes status; 404 → "File not found"), reject
  bodies > 256 KB (check `Content-Length`, then actual length).
- `parseYamlText(text)`: lazy `import("js-yaml")`, `load` with the default
  (safe) schema; YAML syntax errors surface with line/column.
- Pipeline: `text → parseYamlText → parseSchemeDocument → ImportResult`.

### UI

- **"From YAML"** button in `EditorToolbar`, beside "From image".
- **`ImportDialog`** (Zustand dialog store like `useExtract`, same modal styling
  as `ExtractDialog`; Esc/backdrop closes) with two tabs:
  - **Paste** — monospace textarea. Parses on input (debounced ~200 ms); shows
    detected system + name, or inline errors; warnings listed beneath.
  - **GitHub URL** — URL input + **Fetch**; shows the normalized raw URL,
    loading state, fetch/parse errors inline.
  - **Load** (primary) enabled only on a successful parse. On load: confirm if
    the target workspace is edited → `loadImported` → toast
    ("Loaded <name> into <System>"). GitHub loads also set `#url=…`.
  - After a GitHub load, a **Copy share link** action copies
    `location.origin + pathname + #url=…`.
- **`App.tsx`** deep-link effect: on `#url=` → normalize → fetch → parse →
  confirm-if-touched → `loadImported`. Failures show a toast and clear the hash.
  Independent of the library load (does not wait for `schemes.json`).

## Error handling summary

| Failure | Where shown |
|---|---|
| Non-GitHub / unsupported GitHub URL | Inline under URL field |
| Network error, timeout, non-2xx, > 256 KB | Inline (dialog) / toast (deep-link) |
| YAML syntax error | Inline with line:col |
| Unknown format, missing/invalid required slots, bad variant, alpha hex | Inline error list; Load disabled |
| Unknown keys, inferred variant, missing author, slug mismatch | Warnings; Load allowed |

## Docs

- SPEC §3: add feature 14 (import from YAML / GitHub URL) and a new section
  describing formats, URL allowlist, and `#url=` deep-links.
- SPEC §1: amend "Offline-capable" — the only runtime third-party request is a
  **user-initiated** GitHub fetch (dialog or an opened `#url=` link).

## Testing

- `core/import.test.ts`: fixtures for modern Base16, modern Base24, legacy
  Base16, legacy Base24, Tinted8 (flat), Tinted8 (nested ui/syntax, supplemental
  + dim/bright overrides, explicit `orange-dim`); error cases (unknown format,
  missing slot, alpha hex, bad variant); warnings (inferred variant, unknown
  keys, slug mismatch); **round-trip** through `buildBaseYaml`/`buildTinted8Yaml`
  + `js-yaml` for defaults and several snapshot-derived workspaces.
- `core/githubUrl.test.ts`: blob → raw, raw/gist passthrough, query/hash
  stripping, rejects other hosts and tree/PR URLs.
- Deep-link hash parsing tests (`id` vs `url` forms, encoding).
- Store: `loadImported` + Reset-to-baseline behavior (pure helpers tested; store
  wiring verified in the running app).

## Out of scope

PR/commit/tree URLs (need the GitHub API), arbitrary hosts, dropping `.yaml`
files onto the page (cheap follow-up via the Paste path), sharing pasted YAML.
