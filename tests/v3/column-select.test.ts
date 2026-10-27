// The Trend chart's touch geometry: N equal columns tile the plot, so a horizontal position belongs to exactly one column.
import { describe, expect, it } from 'vitest';
import { columnAt } from '../../src/v3/ui/charts/columnSelect';

describe('columnAt', () => {
  it('cuts the plot into n equal columns with no gap and no overlap, at any chart width', () => {
    for (const n of [1, 2, 12, 17, 20]) for (const width of [323, 338, 390]) {
      const inset = (4 / 338) * width, left = 15;
      const seen: number[] = [];
      for (let x = left; x <= left + width; x += 0.25) seen.push(columnAt(x, left, width, n, inset));
      // never goes backwards, never skips a column, every column is present
      for (let i = 1; i < seen.length; i++) { expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]); expect(seen[i] - seen[i - 1]).toBeLessThanOrEqual(1); }
      expect(new Set(seen).size).toBe(n);
      // each column is (width - 2 inset) / n wide, to a quarter pixel
      const w = (width - 2 * inset) / n;
      for (let c = 0; c < n; c++) {
        const first = left + inset + w * c;
        expect(columnAt(first + 0.01, left, width, n, inset)).toBe(c);
        expect(columnAt(first + w - 0.01, left, width, n, inset)).toBe(c);
      }
    }
  });

  it('a press outside the first or last column (the chart\'s margin, or a drag past its edge) selects the nearest column', () => {
    expect(columnAt(-500, 10, 338, 12, 4)).toBe(0);
    expect(columnAt(10 + 338 + 500, 10, 338, 12, 4)).toBe(11);
    expect(columnAt(10 + 1, 10, 338, 12, 4)).toBe(0);
    expect(columnAt(10 + 337, 10, 338, 12, 4)).toBe(11);
  });

  it('no columns: nothing to select', () => { expect(columnAt(50, 0, 100, 0)).toBe(-1); });
});
