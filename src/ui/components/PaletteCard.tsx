import {
  paletteRowDescriptors,
  syntaxRowDescriptors,
  uiRowDescriptors,
  SYNTAX_KEYS,
  UI_KEYS,
} from "../../core";
import { useStore } from "../../state/store";
import { useEffectiveTinted8 } from "../useEffective";
import { AdvancedSection } from "./AdvancedSection";
import { SlotList } from "./SlotList";

export function PaletteCard() {
  const flavor = useStore((s) => s.flavor);
  const basePalette = useStore((s) => s[flavor].palette);
  const overrides = useStore((s) => s.tinted8.overrides);
  const eff = useEffectiveTinted8();

  const isT8 = flavor === "tinted8";
  const hint = isT8
    ? "8 base colors required · derived slots can be overridden"
    : `${flavor === "base16" ? 16 : 24} colors`;

  return (
    <div className="panel-card slots-card">
      <div className="slots-header">
        <h2 className="section-label">Palette</h2>
        <span className="plate-rule" />
        <p className="slots-hint plate-meta">{hint}</p>
      </div>

      <SlotList
        descriptors={paletteRowDescriptors(flavor)}
        flavor={flavor}
        basePalette={basePalette}
        eff={eff}
        overrides={isT8 ? overrides : null}
      />

      {isT8 && eff && (
        <div className="advanced-sections">
          <AdvancedSection
            title="UI tokens"
            note="Every UI token is derived from the palette. Override any value; clear it to fall back to derivation."
            descriptors={uiRowDescriptors()}
            total={UI_KEYS.length}
            overriddenCount={Object.keys(overrides.ui).length}
            eff={eff}
            overrides={overrides}
          />
          <AdvancedSection
            title="Syntax tokens"
            note="Every syntax token is derived from the palette. Override any value; clear it to fall back to derivation."
            descriptors={syntaxRowDescriptors()}
            total={SYNTAX_KEYS.length}
            overriddenCount={Object.keys(overrides.syntax).length}
            eff={eff}
            overrides={overrides}
          />
        </div>
      )}
    </div>
  );
}
