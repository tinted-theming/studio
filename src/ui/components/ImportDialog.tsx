import { useEffect } from "react";
import type { ImportResult } from "../../core";
import { copyShareLink, SYSTEM_LABELS, useImport, type ImportTab } from "../import";

const TABS: Array<[ImportTab, string]> = [
  ["paste", "Paste YAML"],
  ["url", "GitHub URL"],
];

/** Parse outcome: detected scheme + warnings, or the error list. */
function ResultSummary({ result }: { result: ImportResult | null }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <ul className="import-messages is-error" aria-live="polite">
        {result.errors.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    );
  }
  const { system, meta } = result.scheme;
  return (
    <div aria-live="polite">
      <p className="import-summary">
        {SYSTEM_LABELS[system]} · {meta.name} · {meta.variant}
      </p>
      {result.warnings.length > 0 && (
        <ul className="import-messages">
          {result.warnings.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Modal for loading a scheme from pasted YAML or a GitHub file URL
 * (SPEC §16). Load stays
 * disabled until the active tab has a successful parse.
 */
export function ImportDialog() {
  const s = useImport();

  useEffect(() => {
    if (!s.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") s.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [s.open, s]);

  if (!s.open) return null;

  const result = s.tab === "paste" ? s.pasteResult : s.urlResult;
  const canLoad = Boolean(result?.ok) && !(s.tab === "url" && s.fetching);

  return (
    <div
      className="extract-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) s.close();
      }}
    >
      <div
        className="extract-dialog import-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Load scheme from YAML"
      >
        <div className="plate-head">
          <h2 className="section-label">From YAML</h2>
          <span className="plate-rule" />
        </div>

        <div className="field-variant import-tabs" role="tablist">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={s.tab === value}
              className={"chip" + (s.tab === value ? " active" : "")}
              onClick={() => s.setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {s.tab === "paste" ? (
          <textarea
            className="import-textarea"
            aria-label="Scheme YAML"
            placeholder={
              'system: "base16"\nname: "My Scheme"\nauthor: "Me"\nvariant: "dark"\npalette:\n  base00: "#181818"\n  …'
            }
            spellCheck={false}
            autoFocus
            value={s.text}
            onChange={(e) => s.setText(e.target.value)}
          />
        ) : (
          <form
            className="import-url-row"
            onSubmit={(e) => {
              e.preventDefault();
              void s.fetchUrl();
            }}
          >
            <div className="field">
              <label htmlFor="import-url">GitHub file URL</label>
              <input
                id="import-url"
                type="url"
                placeholder="https://github.com/<owner>/<repo>/blob/<branch>/<path>.yaml"
                spellCheck={false}
                autoFocus
                value={s.urlInput}
                onChange={(e) => s.setUrlInput(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="button button-ghost"
              disabled={!s.urlInput.trim() || s.fetching}
            >
              {s.fetching ? "Fetching…" : "Fetch"}
            </button>
          </form>
        )}

        {s.tab === "url" && s.rawUrl && <p className="import-raw">{s.rawUrl}</p>}

        <ResultSummary result={result} />

        <p className="extract-note">
          {s.tab === "paste"
            ? "Parsed in your browser — nothing is uploaded."
            : "Fetched directly from GitHub by your browser."}
        </p>

        <div className="extract-actions">
          {s.tab === "url" && s.rawUrl && s.urlResult?.ok && (
            <button className="button button-ghost" onClick={() => void copyShareLink(s.rawUrl!)}>
              Copy share link
            </button>
          )}
          <button className="button button-ghost" onClick={s.close}>
            Cancel
          </button>
          <button className="button button-primary" disabled={!canLoad} onClick={s.load}>
            Load
          </button>
        </div>
      </div>
    </div>
  );
}
