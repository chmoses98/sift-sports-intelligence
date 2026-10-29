// The Trend chart's touch geometry: N equal columns tile the plot, so a horizontal position belongs to exactly one column.
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { columnAt, useColumnSelect } from '../../src/v3/ui/charts/columnSelect';

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

describe('useColumnSelect: pointer sequences and the click that follows', () => {
  const make = () => {
    const commits: number[] = [], previews: Array<number | null> = [];
    const { result } = renderHook(() => useColumnSelect({ n: 10, geometry: () => ({ left: 0, width: 100, inset: 0 }), onPreview: (i) => previews.push(i), onCommit: (i) => commits.push(i) }));
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const ptr = (x: number) => ({ clientX: x, pointerId: 1, pointerType: 'touch', button: 0, currentTarget: target }) as never;
    return { h: result.current, commits, previews, ptr, click: (x: number) => ({ clientX: x }) as never };
  };

  it('a clean tap commits once, on pointerup; the click that follows adds nothing', () => {
    const { h, commits, ptr, click } = make();
    h.onPointerDown(ptr(25)); h.onPointerUp(ptr(25)); h.onClick(click(25));
    expect(commits).toEqual([2]);
  });

  it('a tap the browser cancels but still clicks (WebKit: pointerdown, pointercancel, pointerup, click) selects the column it landed on', () => {
    const { h, commits, previews, ptr, click } = make();
    h.onPointerDown(ptr(85)); h.onPointerCancel(ptr(85)); h.onPointerUp(ptr(85)); h.onClick(click(85));
    expect(commits).toEqual([8]);
    expect(previews.at(-1)).toBeNull();
  });

  it('a gesture the browser takes for a scroll (cancel, no click) selects nothing', () => {
    const { h, commits, ptr } = make();
    h.onPointerDown(ptr(85)); h.onPointerCancel(ptr(85));
    expect(commits).toEqual([]);
  });

  it('a drag commits the column it ends on once, and its click adds nothing', () => {
    const { h, commits, ptr, click } = make();
    h.onPointerDown(ptr(15)); h.onPointerMove(ptr(45)); h.onPointerUp(ptr(75)); h.onClick(click(75));
    expect(commits).toEqual([7]);
  });
});
