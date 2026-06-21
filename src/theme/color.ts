/**
 * Color blending, ported from tinted-nvim `utils.lua` (`blend`/`darken`/`lighten`).
 * `darken` blends toward base00 (background); `lighten` toward base05 (foreground).
 */
import { hexToRgb } from "../core/color";

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const toHex = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");

/** Linear per-channel blend of `fg` toward `bg` by `amount` (0..1), rounded. */
export function blend(fg: string, bg: string, amount: number): string {
  const a = clamp01(amount);
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  const r = Math.floor(f.r * (1 - a) + b.r * a + 0.5);
  const g = Math.floor(f.g * (1 - a) + b.g * a + 0.5);
  const bl = Math.floor(f.b * (1 - a) + b.b * a + 0.5);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}
