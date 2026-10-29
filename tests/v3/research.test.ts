import { describe, expect, it } from 'vitest';
import { applyFilters, NO_FILTERS, referenceLine, resultOf, sliceWindow, summarize, withRest, type Obs } from '../../src/v3/model/research';

const mk = (date: string, v: number, o: Partial<Obs> = {}): Obs => ({ key: date, date, opp: 'BOS', home: true, v: { pts: v }, min: 30, margin: 5, rest: 2, season: '2026', eventId: null, label: date, ...o });
const rows = [mk('2026-10-01', 20), mk('2026-10-03', 30, { home: false, min: 36 }), mk('2026-10-05', 27.5, { opp: 'NYK', margin: 20 }), mk('2026-10-07', 35, { min: 22 }), mk('2026-10-09', 18, { rest: 8, margin: -3 })];

describe('player research engine', () => {
  it('compares to the line with pushes kept apart', () => {
    expect(resultOf(28, 27.5)).toBe('over');
    expect(resultOf(27, 27.5)).toBe('under');
    expect(resultOf(28, 28)).toBe('push');
  });
  it('summarizes hit rate, mean, median and distance to the line from the same games', () => {
    const s = summarize(rows, 'pts', 27.5);
    expect(s).toMatchObject({ n: 5, over: 2, under: 2, push: 1, median: 27.5 });
    expect(s.mean).toBeCloseTo(26.1, 5);
    expect(s.vsLine).toBeCloseTo(-1.4, 5);
  });
  it('windows take the last N games, oldest first, and H2H takes only the opponent', () => {
    expect(sliceWindow(rows, 'L5', null, null).map((r) => r.date)).toHaveLength(5);
    expect(sliceWindow(rows, 'L5', null, null)[0].date).toBe('2026-10-01');
    expect(sliceWindow(rows, 'H2H', 'NYK', null)).toHaveLength(1);
    expect(sliceWindow(rows, 'H2H', null, null)).toHaveLength(0);
  });
  it('filters change the games, and an impossible filter yields zero games (never a fabricated one)', () => {
    expect(applyFilters(rows, { ...NO_FILTERS, site: 'away' })).toHaveLength(1);
    expect(applyFilters(rows, { ...NO_FILTERS, minMin: 30 }).map((r) => r.date)).toEqual(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-09']);
    expect(applyFilters(rows, { ...NO_FILTERS, script: 'blowout' })).toHaveLength(1);
    expect(applyFilters(rows, { ...NO_FILTERS, site: 'away', minMin: 40 })).toHaveLength(0);
    expect(summarize([], 'pts', 27.5)).toMatchObject({ n: 0, mean: null, median: null, vsLine: null });
  });
  it('rest days come from the previous game and a reference line is a half point', () => {
    const r = withRest([{ ...mk('2026-10-01', 1) }, { ...mk('2026-10-08', 1) }].map(({ rest: _r, ...x }) => x));
    expect(r.map((x) => x.rest)).toEqual([null, 7]);
    expect(referenceLine(rows, 'pts')! % 1).toBe(0.5);
  });
});
