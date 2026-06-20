import { memo, useEffect, useRef, useState } from "react";
import { fieldKey, normalizeHex, type RowDescriptor } from "../../core";
import { useStore } from "../../state/store";
import { IconClose } from "../icons";

interface SlotRowProps {
  desc: RowDescriptor;
  /** Effective (resolved) hex value for this slot. */
  value: string;
  overridden: boolean;
}

/**
 * One editable slot: a color-picker swatch, key/description, and a hex input.
 *
 * The hex input keeps its own in-progress text so invalid/partial input isn't
 * clobbered by re-renders (HANDOFF gotcha): the canonical value only flows back
 * into the field when it isn't focused and isn't currently invalid — matching
 * the legacy refresh-in-place behavior.
 */
function SlotRowImpl({ desc, value, overridden }: SlotRowProps) {
  const commitSlot = useStore((s) => s.commitSlot);
  const clearSlot = useStore((s) => s.clearSlot);
  const markInvalid = useStore((s) => s.markInvalid);
  const clearInvalid = useStore((s) => s.clearInvalid);

  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);
  const key = fieldKey(desc);

  useEffect(() => {
    if (!focused.current && !invalid) setText(value);
  }, [value, invalid]);

  const onHexChange = (raw: string) => {
    setText(raw);
    const hex = normalizeHex(raw);
    if (hex) {
      setInvalid(false);
      commitSlot(desc, hex);
    } else if (raw.trim() === "" && !desc.required) {
      // Emptying an optional/derived slot reverts it to derivation.
      setInvalid(false);
      if (overridden) clearSlot(desc);
      else clearInvalid(key);
    } else {
      // Empty required slot, or malformed value: flag and block export.
      setInvalid(true);
      markInvalid(key);
    }
  };

  const onPick = (hex: string) => {
    setText(hex);
    setInvalid(false);
    commitSlot(desc, hex);
  };

  const onClear = () => {
    setInvalid(false);
    clearSlot(desc);
  };

  return (
    <div className={"slot-row" + (overridden ? " is-overridden" : "")}>
      <button
        className="slot-swatch"
        type="button"
        aria-label="Pick color"
        style={{ background: value }}
      >
        <input
          className="slot-picker"
          type="color"
          value={normalizeHex(value) || "#000000"}
          onChange={(e) => onPick(e.target.value)}
        />
      </button>
      <div className="slot-meta">
        <span className="slot-key">
          {desc.label}
          {!desc.required && (
            <span className="derived-tag">{overridden ? "custom" : "derived"}</span>
          )}
        </span>
        {desc.desc && <span className="slot-desc">{desc.desc}</span>}
      </div>
      <div className="slot-input-group">
        <button
          className="slot-clear"
          type="button"
          title="Clear override — fall back to derivation"
          onClick={onClear}
        >
          <IconClose />
        </button>
        <input
          className={"slot-hex" + (invalid ? " is-invalid" : "")}
          type="text"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          maxLength={7}
          value={text}
          onChange={(e) => onHexChange(e.target.value)}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            if (!invalid) setText(value);
          }}
        />
      </div>
    </div>
  );
}

export const SlotRow = memo(SlotRowImpl);
