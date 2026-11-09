// The NFL production check compares the Explorer's "Expected value" and "Projected <stat>" text with the published mean. The Explorer
// says a count stat with propBoard.fmtValue (one decimal, a trailing ".0" dropped: 5.038 -> "5 rec"), so the check must expect that
// form, not toFixed(1) ("5.0"), which can never appear. This holds the check's helper equal to the app's own formatter.
import { describe, expect, it } from 'vitest';
import { fmtValue, PROP_STAT_DEFS } from '../src/insights/propBoard';
import { FAMILIES } from '../scripts/nfl-distribution-plan.mjs';
import { shownMean, showsMean } from '../scripts/nfl-distribution-display.mjs';

// What PropExplorerView renders for a value: fmtValue with the unit trimmed off (src/views/explore/PropExplorerView.tsx `fmt`).
const appText = (v: number, stat: string) => {
  const def = PROP_STAT_DEFS.find((d) => d.stat === stat)!;
  return { def, text: fmtValue(v, def).replace(/ \S+$/, ''), unit: def.unit };
};

describe('NFL production check: the published mean as the Explorer says it', () => {
  it('the promoted families are count stats the Explorer formats with the count rule', () => {
    expect(FAMILIES.length).toBeGreaterThan(0);
    for (const stat of FAMILIES) expect(PROP_STAT_DEFS.find((d) => d.stat === stat)?.count, stat).toBe(true);
  });

  it('the 2026-11-09 failure: Jefferson receptions, mean 5.038, reads "5"', () => {
    const { text, unit } = appText(5.038, 'receptions');
    expect(text).toBe('5');
    expect(shownMean(5.038)).toBe('5');
    expect(showsMean(`Expected value ${text} ${unit}`, 5.038)).toBe(true);
    expect(showsMean('Projected receptions 5 rec', 5.038)).toBe(true);
  });

  it('equals the app for every promoted family over a dense range, and the app text is found by the check', () => {
    const bad: string[] = [];
    for (const stat of FAMILIES) {
      for (let i = 0; i <= 6000; i++) {
        const v = i / 100 + (i % 7) / 1000; // 0.000 .. 60.006, hitting every rounding edge
        const { text, unit } = appText(v, stat);
        if (shownMean(v) !== text || !showsMean(`Expected value ${text} ${unit}`, v)) bad.push(`${stat} ${v}: app "${text}" check "${shownMean(v)}"`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('stays strict: a different value, or the number inside a larger one, is not a match', () => {
    expect(showsMean('Expected value 15 rec', 5.038)).toBe(false);
    expect(showsMean('Expected value 5.4 rec', 5.038)).toBe(false);
    expect(showsMean('Expected value 25.4 rec', 5.4)).toBe(false);
    expect(showsMean('Expected value 4.6 rec', 5.038)).toBe(false);
    expect(showsMean('Expected value 5.4 rec', 5.4)).toBe(true);
    expect(showsMean('Expected value 5 rec', 5.4)).toBe(false);
  });
});
