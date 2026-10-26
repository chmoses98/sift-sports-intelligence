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

const STAT_CHAR = 7.1; // 13.5px Geist, medium
const CHIP_CHAR = 5.2; // 11px Geist, medium
const CHIP_PAD = 18; // 8 + 8 padding, 2 border
const GAP = 6;

/** True when the statistic and the opponent chip fit on one line at this column width (with a small safety margin). */
export function chipBeside(statText: string, chipText: string, colW: number): boolean {
  return statText.length * STAT_CHAR + GAP + chipText.length * CHIP_CHAR + CHIP_PAD <= textColumn(colW) - 4;
}

export const rowHeight = (wrap: boolean) => (wrap ? ROW_H_WRAP : ROW_H);

/** The phone column's width: the viewport, capped at the shell's column. */
export const columnWidth = (vw: number) => Math.min(vw, 430);
