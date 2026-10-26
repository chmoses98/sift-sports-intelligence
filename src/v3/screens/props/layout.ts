// Row geometry for the windowed list. Every collapsed row has a CONSTANT height so the list can compute every offset without measuring
// (which is what keeps Back's scroll restoration exact): a row is either `ROW_H` (the opponent chip sits beside the statistic) or
// `ROW_H_WRAP` (it sits on its own line). Which one is decided from the text, with the approved designs' own measured widths, and the
// CSS forces that layout, so the prediction can never disagree with what is painted.
export const ROW_H = 96;
export const ROW_H_WRAP = 118;
/** An expanded row's peek card before it has been measured. */
export const PEEK_EST = 480;

/** Width the text column of a row has at this column width: the column less its gutters, the avatar, the gaps and the price pill. */
export const textColumn = (colW: number) => colW - 32 - 40 - 20 - 58;

const STAT_CHAR = 7.1; // 13.5px Geist, medium (used only where the browser cannot measure text)
const CHIP_CHAR = 5.2; // 11px Geist, medium
const CHIP_PAD = 18; // 8 + 8 padding, 2 border
const GAP = 6;

let ctx2d: CanvasRenderingContext2D | null | undefined;
let fontUi = '';
let fontNum = '';
/** The width of `text` in the font the stylesheet gives it, or null where the browser cannot measure (tests, very old engines). */
function measure(text: string, weight: number, size: number, family: 'ui' | 'num'): number | null {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))) return null;
  if (ctx2d === undefined) {
    try { ctx2d = document.createElement('canvas').getContext('2d'); } catch { ctx2d = null; }
  }
  if (!ctx2d) return null;
  if (!fontUi) {
    const cs = getComputedStyle(document.querySelector('.v3') ?? document.body);
    fontUi = cs.getPropertyValue('--f-ui').trim() || 'sans-serif';
    fontNum = cs.getPropertyValue('--f-num').trim() || fontUi;
  }
  ctx2d.font = `${weight} ${size}px ${family === 'ui' ? fontUi : fontNum}`;
  const w = ctx2d.measureText(text).width;
  return Number.isFinite(w) && w > 0 ? w : null;
}

/** Forget the cached fonts (a web font finished loading: widths measured before it are wrong). */
export const resetMeasure = () => { fontUi = ''; fontNum = ''; ctx2d = undefined; };

/**
 * True when the statistic ("Receptions 3+") and the opponent chip fit on one line at this column width. Measured in the real fonts where
 * the browser can; the CSS forces the layout chosen here (nowrap, or wrap), so the prediction can never disagree with what is painted.
 */
export function chipBeside(label: string, rung: string, chipText: string, colW: number): boolean {
  const stat = measure(`${label} `, 500, 13.5, 'ui');
  const k = measure(rung, 700, 13.5, 'num');
  const chip = measure(chipText, 500, 11, 'ui');
  const statW = stat != null && k != null ? stat + k : (label.length + 1 + rung.length) * STAT_CHAR;
  const chipW = chip != null ? chip : chipText.length * CHIP_CHAR;
  return statW + GAP + chipW + CHIP_PAD + 6 <= textColumn(colW);
}

export const rowHeight = (wrap: boolean) => (wrap ? ROW_H_WRAP : ROW_H);

/** The phone column's width: the viewport, capped at the shell's column. */
export const columnWidth = (vw: number) => Math.min(vw, 430);
