import {
  buildBaseYaml,
  buildTinted8Yaml,
  effectiveSlug,
  validateScheme,
  type BaseWorkspace,
  type Tinted8Workspace,
} from "../../core";
import { useStore } from "../../state/store";
import { useToast } from "../toast";

export function Export() {
  const flavor = useStore((s) => s.flavor);
  const ws = useStore((s) => s[flavor]);
  const invalidCount = useStore((s) => s.invalidSlots.size);
  const show = useToast((s) => s.show);
  const yaml =
    flavor === "tinted8"
      ? buildTinted8Yaml(ws as Tinted8Workspace)
      : buildBaseYaml(flavor, ws as BaseWorkspace);

  const baseValidity = validateScheme(flavor, ws.meta, ws.palette);
  const ok = baseValidity.ok && invalidCount === 0;

  const statusParts: string[] = [];
  if (baseValidity.missing.length) statusParts.push(`${baseValidity.missing.join(" & ")} required`);
  if (invalidCount > 0) {
    statusParts.push(
      `${invalidCount} color${invalidCount > 1 ? "s" : ""} ${invalidCount > 1 ? "need" : "needs"} a value`,
    );
  }

  const onCopy = async () => {
    if (!ok) return;
    try {
      await navigator.clipboard.writeText(yaml);
      show("YAML copied to clipboard");
    } catch {
      show("Copy failed — select the text manually");
    }
  };

  const onDownload = () => {
    if (!ok) return;
    const fileName = `${flavor}-${effectiveSlug(ws.meta.name)}.yaml`;
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    show(`Downloaded ${fileName}`);
  };

  return (
    <div className="panel-card export-card">
      <div className="export-header">
        <h2 className="section-label">Export</h2>
        <span className="plate-rule" />
        <div className="export-actions">
          <button className="button button-ghost" disabled={!ok} onClick={onCopy}>
            Copy
          </button>
          <button className="button button-primary" disabled={!ok} onClick={onDownload}>
            Download YAML
          </button>
        </div>
      </div>
      {!ok && <p className="export-status">{statusParts.join(" · ")}</p>}
      <pre className="yaml-preview">
        <code>{yaml}</code>
      </pre>
    </div>
  );
}
