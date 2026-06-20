import {
  isOverridden,
  type EffectiveTinted8,
  type Flavor,
  type RowDescriptor,
  type Tinted8Overrides,
} from "../../core";
import { effectiveValueOf } from "../useEffective";
import { SlotRow } from "./SlotRow";

interface SlotListProps {
  descriptors: RowDescriptor[];
  flavor: Flavor;
  basePalette: Record<string, string>;
  eff: EffectiveTinted8 | null;
  overrides: Tinted8Overrides | null;
}

/** A list of slot rows. Tinted8 reserves the clear column on every row. */
export function SlotList({ descriptors, flavor, basePalette, eff, overrides }: SlotListProps) {
  const reserveClear = flavor === "tinted8";
  return (
    <div className={"slot-list" + (reserveClear ? " reserve-clear" : "")}>
      {descriptors.map((desc) => {
        const value = effectiveValueOf(desc, flavor, basePalette, eff);
        const overridden = overrides ? isOverridden(desc, overrides) : false;
        return (
          <SlotRow
            key={`${desc.scope}:${desc.storeKey}:${desc.fullKey}`}
            desc={desc}
            value={value}
            overridden={overridden}
          />
        );
      })}
    </div>
  );
}
