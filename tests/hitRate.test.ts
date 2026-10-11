// Hit rates against TODAY's line: the threshold math (half-point lines, whole-number lines with pushes), the
// eligible-game rule (missed games, special-teams-only rows, missing snap joins) and the windows' n.
import { describe, expect, it } from 'vitest';
import { compareToLine, hitPhrase, hitRate, hitShort, hitWindowLabel, hitWindows, lineText, playedOffense, sampleNote, skipReason, windowGames } from '../src/history/hitRate';
import { statDef } from '../src/history/stats';
import type { GameLogRow } from '../src/history/types';

const rec = statDef('receptions')!;
const rush = statDef('rushing_yards')!;
const pass = statDef('passing_yards')!;
const longRec = statDef('longest_reception')!;

let gid = 0;
function g(over: { season?: number; week?: number; rec?: number; tgt?: number; car?: number; ryds?: number; snaps?: number | null; pass?: number | null; long?: number | null }): GameLogRow {
  gid++;
  return {
    season: over.season ?? 2026, week: over.week ?? gid, game_id: `g${gid}`, season_type: 'REG', date: null, team: 'AAA', opp: 'BBB', home: true, score: null,
    snaps: over.snaps === null ? null : { off: over.snaps ?? 40, pct: 0.6 },
    passing: over.pass == null ? null : { att: 30, cmp: 20, yds: over.pass, td: 1, int: 0, sacks: 1, epa: null },
    rushing: { car: over.car ?? 0, yds: over.ryds ?? 0, td: 0, long: null },
    receiving: { tgt: over.tgt ?? (over.rec ?? 0), rec: over.rec ?? 0, yds: 0, td: 0, long: over.long ?? null, target_share: null, air_share: null },
  };
}
const cur = (...rows: GameLogRow[]) => ({ prior: [] as GameLogRow[], current: rows });

describe('compareToLine', () => {
  it('half-point lines can never push', () => {
    expect(compareToLine(55, 54.5)).toBe('over');
    expect(compareToLine(54, 54.5)).toBe('under');
    expect(compareToLine(0, 0.5)).toBe('under');
    expect(compareToLine(1, 0.5)).toBe('over');
  });
  it('a whole-number line pushes on equality, and only then', () => {
    expect(compareToLine(5, 5)).toBe('push');
    expect(compareToLine(6, 5)).toBe('over');
    expect(compareToLine(4, 5)).toBe('under');
  });
  it('is not fooled by floating point', () => {
    expect(compareToLine(0.1 + 0.2, 0.3)).toBe('push');
  });
  it('handles negative values (a run for a loss)', () => {
    expect(compareToLine(-3, 0.5)).toBe('under');
  });
});

describe('eligible games', () => {
  it('a row with zero offensive snaps and no stat value is skipped, not counted as a zero', () => {
    const row = g({ snaps: 0 });
    expect(playedOffense(row)).toBe(false);
    expect(skipReason(row, rec)).toBe('no-offensive-snaps');
  });
  it('a played game with a zero is a real zero', () => {
    expect(skipReason(g({ snaps: 30, rec: 0 }), rec)).toBeNull();
  });
  it('a missing snap join falls back to touches', () => {
    expect(playedOffense(g({ snaps: null, tgt: 2 }))).toBe(true);
    expect(playedOffense(g({ snaps: null }))).toBe(false);
    expect(skipReason(g({ snaps: null }), rec)).toBe('no-offensive-snaps');
  });
  it('a non-zero value proves he played even when the snap count says 0', () => {
    expect(skipReason(g({ snaps: 0, rec: 2 }), rec)).toBeNull();
  });
  it('a stat with no value that game (no passing line, no catch for a longest reception) is skipped', () => {
    expect(skipReason(g({}), pass)).toBe('no-stat');
    expect(skipReason(g({ rec: 0 }), longRec)).toBe('no-stat');
  });
});

describe('hitRate', () => {
  it('counts over / under against a half-point line with n = eligible games', () => {
    const h = hitRate(cur(g({ rec: 6 }), g({ rec: 4 }), g({ rec: 5 }), g({ rec: 7 }), g({ rec: 3 })), rec, 4.5, 'last5');
    expect([h.over, h.under, h.push, h.n]).toEqual([3, 2, 0, 5]);
    expect(hitPhrase(h)).toBe('3 of 5 over 4.5');
  });

  it('counts pushes separately on a whole-number line; over + under + push = n', () => {
    const h = hitRate(cur(g({ rec: 5 }), g({ rec: 6 }), g({ rec: 5 }), g({ rec: 2 })), rec, 5, 'season');
    expect([h.over, h.under, h.push, h.n]).toEqual([1, 1, 2, 4]);
    expect(h.over + h.under + h.push).toBe(h.n);
    expect(hitPhrase(h)).toBe('1 of 4 over 5, 2 pushes');
    expect(hitShort(h, 'Season')).toBe('Season: 1/4 over · 2P');
  });

  it('Last 5 is the last five games PLAYED: skipped rows extend the window back, and are reported', () => {
    const rows = cur(
      g({ rec: 9 }), // oldest: falls out once five played games are found
      g({ rec: 1 }),
      g({ rec: 2 }),
      g({ snaps: 0 }), // special teams only
      g({ rec: 8 }),
      g({ snaps: 0 }),
      g({ rec: 7 }),
      g({ rec: 6 }),
    );
    const h = hitRate(rows, rec, 4.5, 'last5');
    expect(h.n).toBe(5);
    expect(h.games.map((x) => x.v)).toEqual([1, 2, 8, 7, 6]);
    expect(h.over).toBe(3);
    expect(h.skipped).toBe(2);
    expect(sampleNote(h)).toBe('2 games without an offensive snap skipped');
  });

  it('a short history says so: n is what exists, never padded', () => {
    const h = hitRate(cur(g({ rec: 6 }), g({ rec: 3 }), g({ rec: 5 })), rec, 4.5, 'last10');
    expect(h.n).toBe(3);
    expect(h.wanted).toBe(10);
    expect(sampleNote(h)).toBe('only 3 games played on record');
  });

  it('Last 10 spans seasons; season and prior windows do not', () => {
    const prior = Array.from({ length: 8 }, (_, i) => g({ season: 2025, week: i + 1, car: 15, ryds: 50 + i * 10 }));
    const current = Array.from({ length: 4 }, (_, i) => g({ week: i + 1, car: 15, ryds: 100 }));
    const rows = { prior, current };
    const l10 = hitRate(rows, rush, 79.5, 'last10');
    expect(l10.n).toBe(10);
    expect(l10.games.filter((x) => x.row.season === 2025)).toHaveLength(6);
    expect(l10.over).toBe(4 + 5); // 4 current at 100 + prior weeks 4-8 (80 … 120); weeks 3 (70) is under
    expect(hitRate(rows, rush, 79.5, 'season').n).toBe(4);
    expect(hitRate(rows, rush, 79.5, 'prior').n).toBe(8);
    expect(hitRate(rows, rush, 79.5, 'all').n).toBe(12);
  });

  it('a different line re-reads the same games (the current threshold, nothing cached)', () => {
    const rows = cur(g({ rec: 4 }), g({ rec: 5 }), g({ rec: 6 }));
    expect(hitRate(rows, rec, 4.5, 'season').over).toBe(2);
    expect(hitRate(rows, rec, 5.5, 'season').over).toBe(1);
    expect(hitRate(rows, rec, 5, 'season').push).toBe(1);
  });

  it('no games: n 0 and nothing over', () => {
    const h = hitRate(cur(), rec, 4.5, 'last5');
    expect([h.n, h.over, h.under, h.push]).toEqual([0, 0, 0, 0]);
  });
});

describe('windows offered', () => {
  it('lists only windows with eligible games and reports their n', () => {
    const rows = { prior: [g({ season: 2025, rec: 3 }), g({ season: 2025, snaps: 0 })], current: [g({ rec: 4 }), g({ rec: 5 })] };
    expect(hitWindows(rows, rec)).toEqual([{ w: 'last5', n: 3 }, { w: 'season', n: 2 }, { w: 'prior', n: 1 }]);
  });
  it('offers All only when it adds games beyond Last 10 across two seasons', () => {
    const prior = Array.from({ length: 9 }, () => g({ season: 2025, rec: 3 }));
    const current = Array.from({ length: 3 }, () => g({ rec: 3 }));
    expect(hitWindows({ prior, current }, rec).map((x) => x.w)).toEqual(['last5', 'last10', 'season', 'prior', 'all']);
    expect(hitWindows({ prior, current }, rec).find((x) => x.w === 'all')!.n).toBe(12);
  });
  it('names windows in plain words', () => {
    expect(hitWindowLabel('last10', 2026, 2025)).toBe('Last 10');
    expect(hitWindowLabel('prior', 2026, 2025)).toBe('2025 season');
    expect(lineText(54.5)).toBe('54.5');
    expect(lineText(5)).toBe('5');
  });
  it('windowGames returns oldest first', () => {
    const rows = cur(g({ rec: 1 }), g({ rec: 2 }), g({ rec: 3 }));
    expect(windowGames(rows, rec, 'last5').games.map((x) => x.v)).toEqual([1, 2, 3]);
  });
});
