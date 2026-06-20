import { slugify, type Variant } from "../../core";
import { useStore } from "../../state/store";

const REQUIRED = new Set(["name", "author"]);

function Field(props: {
  label: string;
  metaKey: string;
  value: string;
  placeholder?: string;
  wide?: boolean;
  invalid?: boolean;
}) {
  const setMeta = useStore((s) => s.setMeta);
  return (
    <div className={"field" + (props.wide ? " field-wide" : "")}>
      <label>{props.label}</label>
      <input
        type="text"
        className={props.invalid ? "is-invalid" : undefined}
        value={props.value}
        placeholder={props.placeholder}
        spellCheck={false}
        data-meta-key={props.metaKey}
        onChange={(e) => setMeta(props.metaKey, e.target.value)}
      />
    </div>
  );
}

export function Properties() {
  const flavor = useStore((s) => s.flavor);
  const meta = useStore((s) => s[flavor].meta);
  const touched = useStore((s) => s[flavor].touched);
  const setVariant = useStore((s) => s.setVariant);

  const showInvalid = (key: string) =>
    REQUIRED.has(key) && touched && !String(meta[key as keyof typeof meta] || "").trim();

  const slug = slugify(meta.name);

  return (
    <div className="panel-card properties-card">
      <div className="plate-head">
        <h2 className="section-label">Properties</h2>
        <span className="plate-rule" />
      </div>
      <div className="properties-grid" id="properties-grid">
        <div className="field field-wide field-nameplate">
          <label>Name</label>
          <input
            type="text"
            className={showInvalid("name") ? "is-invalid" : undefined}
            value={meta.name}
            placeholder="My Scheme"
            spellCheck={false}
            data-meta-key="name"
            onChange={(e) => useStore.getState().setMeta("name", e.target.value)}
          />
          <p className="slug-caption">slug · {slug || "—"}</p>
        </div>

        <Field
          label="Author"
          metaKey="author"
          value={meta.author}
          placeholder="Your Name"
          invalid={showInvalid("author")}
        />

        <div className="field">
          <label>Variant</label>
          <div className="field-variant">
            {(["dark", "light"] as Variant[]).map((v) => (
              <button
                key={v}
                type="button"
                className={"chip" + (meta.variant === v ? " active" : "")}
                onClick={() => setVariant(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {flavor === "tinted8" && (
          <>
            <Field
              label="Family"
              metaKey="family"
              value={meta.family ?? ""}
              placeholder="optional"
            />
            <Field label="Style" metaKey="style" value={meta.style ?? ""} placeholder="optional" />
          </>
        )}

        <Field
          label="Description"
          metaKey="description"
          value={meta.description}
          placeholder="optional"
          wide
        />
      </div>
    </div>
  );
}
