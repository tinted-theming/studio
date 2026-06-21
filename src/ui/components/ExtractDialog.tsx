import { useEffect } from "react";
import type { Variant } from "../../core";
import { useExtract } from "../extract";

const SYSTEMS: Array<["base16" | "base24", string]> = [
  ["base16", "Base16"],
  ["base24", "Base24"],
];
const VARIANTS: Array<[Variant, string]> = [
  ["dark", "Dark"],
  ["light", "Light"],
];

/**
 * Modal that collects scheme properties for an image extraction, then derives
 * and applies the draft (IMAGE-EXTRACTION.md §7). Extract is disabled until the
 * image finishes decoding; errors surface inline (never a thrown toast).
 */
export function ExtractDialog() {
  const s = useExtract();

  useEffect(() => {
    if (!s.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") s.close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [s.open, s]);

  if (!s.open) return null;

  return (
    <div
      className="extract-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) s.close();
      }}
    >
      <div
        className="extract-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Extract scheme from image"
      >
        <div className="plate-head">
          <h2 className="section-label">From image</h2>
          <span className="plate-rule" />
        </div>

        <div className="extract-body">
          {s.thumbUrl && (
            <img className="extract-thumb" src={s.thumbUrl} alt="Selected image preview" />
          )}

          <div className="extract-fields">
            <div className="field field-nameplate">
              <label htmlFor="extract-name">Name</label>
              <input
                id="extract-name"
                type="text"
                value={s.name}
                spellCheck={false}
                onChange={(e) => s.setName(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="extract-author">Author</label>
              <input
                id="extract-author"
                type="text"
                value={s.author}
                placeholder="Your Name"
                spellCheck={false}
                onChange={(e) => s.setAuthor(e.target.value)}
              />
            </div>

            <div className="extract-choices">
              <div className="field">
                <label>System</label>
                <div className="field-variant">
                  {SYSTEMS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={"chip" + (s.system === value ? " active" : "")}
                      onClick={() => s.setSystem(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Variant</label>
                <div className="field-variant">
                  {VARIANTS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={"chip" + (s.variant === value ? " active" : "")}
                      onClick={() => s.setVariant(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="extract-note">
          Everything runs in your browser — the image is never uploaded.
        </p>

        {(s.status || s.decoding) && (
          <p className="extract-status">{s.status ?? "Reading image…"}</p>
        )}

        <div className="extract-actions">
          <button className="button button-ghost" onClick={s.close}>
            Cancel
          </button>
          <button
            className="button button-primary"
            disabled={!s.decoded || s.decoding}
            onClick={s.run}
          >
            Extract
          </button>
        </div>
      </div>
    </div>
  );
}
