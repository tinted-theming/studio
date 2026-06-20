import { type EffectiveTinted8, type RowDescriptor, type Tinted8Overrides } from "../../core";
import { IconChevron } from "../icons";
import { SlotList } from "./SlotList";

interface AdvancedSectionProps {
  title: string;
  note: string;
  descriptors: RowDescriptor[];
  total: number;
  overriddenCount: number;
  eff: EffectiveTinted8;
  overrides: Tinted8Overrides;
}

/** A collapsible UI/Syntax token section (Tinted8 only). */
export function AdvancedSection({
  title,
  note,
  descriptors,
  total,
  overriddenCount,
  eff,
  overrides,
}: AdvancedSectionProps) {
  const count =
    overriddenCount > 0 ? `${overriddenCount} overridden / ${total}` : `${total} tokens`;
  return (
    <details className="advanced-group">
      <summary className="advanced-summary">
        <IconChevron />
        <span>{title}</span>
        <span className={"advanced-count" + (overriddenCount > 0 ? " has-overrides" : "")}>
          {count}
        </span>
      </summary>
      <p className="advanced-note">{note}</p>
      <SlotList
        descriptors={descriptors}
        flavor="tinted8"
        basePalette={{}}
        eff={eff}
        overrides={overrides}
      />
    </details>
  );
}
