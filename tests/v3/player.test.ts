// Player Research as pure functions, over a REAL published player log (the repo's own NFL history document for CeeDee Lamb, copied
// unchanged to tests/v3/fixtures). Every number the screen shows (chips, chart, summary, ladder, filter counts, Trends, Log, Replay)
// comes from these functions, so these tests pin them to hand-checkable counts of the real games.
import { describe, expect, it } from 'vitest';
import hist from './fixtures/nfl-player-history-lamb.json';
import { nflObs } from '../../src/v3/data/usePlayer';
import { withRest, NO_FILTERS, type Obs } from '../../src/v3/model/research';
import {
  cutGames, eventForObs, facets, filterChips, hitCount, lineOfRung, matchSummary, nearestRung, otherStats, replayGames, rungOf, rungViews, rungWindow,
  savedChips, tierOfRank, windowChips, windowLabel, windowTable, gameWhen, type CutContext, type FacetContext,
} from '../../src/v3/model/playerResearch';

const stats = [{ key: 'receptions', label: 'Receptions', short: 'REC' }, { key: 'targets', label: 'Targets', short: 'TGT' }, { key: 'receiving_yards', label: 'Receiving yards', short: 'REC YDS' }];
const all: Obs[] = withRest(nflObs([...hist.prior.games.map((g) => ({ ...g, season: g.season ?? hist.prior.season })), ...hist.games] as never, stats as never, hist.season).sort((a, b) => a.date.localeCompare(b.date)));
const ctx: CutContext = { opp: 'PHI', season: String(hist.season) };
const rec = (o: Obs) => o.v.receptions as number;
const hits = (rows: Obs[], line: number) => rows.filter((o) => rec(o) > line).length;

describe('the real log', () => {
  it('is the documented 17 games, oldest first, every one with a reception count', () => {
    expect(all).toHaveLength(17);
    expect(all.every((o) => typeof o.v.receptions === 'number')).toBe(true);
  });
});

describe('windows and filters', () => {
  it('L5 and L10 are the last games; the season is this season only; vs PHI only PHI games; all is everything', () => {
    expect(cutGames(all, 'L5', NO_FILTERS, ctx).games.map((o) => o.key)).toEqual(all.slice(-5).map((o) => o.key));
    expect(cutGames(all, 'L10', NO_FILTERS, ctx).games).toHaveLength(10);
    expect(cutGames(all, 'SEASON', NO_FILTERS, ctx).games.every((o) => o.season === ctx.season)).toBe(true);
    expect(cutGames(all, 'H2H', NO_FILTERS, ctx).games.every((o) => o.opp === 'PHI')).toBe(true);
    expect(cutGames(all, 'ALL', NO_FILTERS, ctx).games).toHaveLength(17);
  });
  it('filters narrow WITHIN the window: L10 + Away is the away games among the last ten', () => {
    const l10 = all.slice(-10);
    const { pool, games } = cutGames(all, 'L10', { ...NO_FILTERS, site: 'away' }, ctx);
    expect(pool).toHaveLength(10);
    expect(games.map((o) => o.key)).toEqual(l10.filter((o) => o.home === false).map((o) => o.key));
  });
  it('window chips carry hit counts that equal a direct count of the same games at the same line', () => {
    const chips = windowChips(all, NO_FILTERS, 'receptions', 6.5, ctx);
    expect(chips.map((c) => c.win)).toEqual(['L5', 'L10', 'SEASON', 'H2H', 'ALL']);
    for (const c of chips) { const g = cutGames(all, c.win, NO_FILTERS, ctx).games; expect([c.over, c.n]).toEqual([hits(g, 6.5), g.length]); }
    expect(chips.find((c) => c.win === 'ALL')!.label).toBe('All 17');
    expect(chips.find((c) => c.win === 'H2H')!.label).toBe('vs PHI');
  });
  it('without a coming opponent there is no vs-opponent chip', () => {
    expect(windowChips(all, NO_FILTERS, 'receptions', 6.5, { ...ctx, opp: null }).map((c) => c.win)).toEqual(['L5', 'L10', 'SEASON', 'ALL']);
  });
  it('game script, rest and role filters use the log’s own fields and never match a game that lacks the field', () => {
    const won = cutGames(all, 'ALL', { ...NO_FILTERS, script: 'won' }, ctx).games, lost = cutGames(all, 'ALL', { ...NO_FILTERS, script: 'lost' }, ctx).games;
    expect(won.every((o) => (o.margin ?? 0) > 0)).toBe(true);
    expect(lost.every((o) => (o.margin ?? 0) < 0)).toBe(true);
    const snaps = cutGames(all, 'ALL', { ...NO_FILTERS, role: 'snaps' }, ctx).games;
    expect(snaps.every((o) => (o.snap ?? 0) >= 0.85)).toBe(true);
    const short = cutGames(all, 'ALL', { ...NO_FILTERS, rest: 'short' }, ctx).games;
    expect(short.every((o) => o.rest != null && o.rest <= 6)).toBe(true);
    // the first game after an offseason has no rest figure, so no rest filter can match it
    expect(all.some((o) => o.rest == null)).toBe(true);
    for (const r of ['short', 'week', 'long'] as const) expect(cutGames(all, 'ALL', { ...NO_FILTERS, rest: r }, ctx).games.some((o) => o.rest == null)).toBe(false);
  });
  it('an opponent tier needs the published ranks: without them nothing matches (never a guess)', () => {
    expect(cutGames(all, 'ALL', { ...NO_FILTERS, tier: 'top' }, ctx).games).toHaveLength(0);
    const tierOf = (opp: string) => (opp === 'WAS' ? ('top' as const) : null);
    expect(cutGames(all, 'ALL', { ...NO_FILTERS, tier: 'top' }, { ...ctx, tierOf }).games.every((o) => o.opp === 'WAS')).toBe(true);
  });
  it('tiers by rank: 10th or better is top, the worst ten of the universe is bottom, the middle is neither', () => {
    expect([tierOfRank(1, 28), tierOfRank(10, 28), tierOfRank(11, 28), tierOfRank(18, 28), tierOfRank(19, 28), tierOfRank(28, 28), tierOfRank(null, 28), tierOfRank(5, null)]).toEqual(['top', 'top', null, null, 'bottom', 'bottom', null, null]);
  });
});

describe('facets (the research-filters sheet)', () => {
  const l10 = cutGames(all, 'L10', NO_FILTERS, ctx).pool;
  const fctx = (o: Partial<FacetContext> = {}): FacetContext => ({ ...ctx, stat: 'receptions', line: 6.5, tiers: false, tiersWhy: 'The opposing-unit ranking is not published yet.', sport: 'NFL', hasMinutes: false, ...o });
  const group = (id: string, f = NO_FILTERS, o: Partial<FacetContext> = {}) => facets(l10, f, fctx(o)).find((g) => g.id === id)!;
  it('every option’s count is exactly what the chart would show if it were applied now', () => {
    for (const g of facets(l10, NO_FILTERS, fctx())) for (const o of g.options) {
      if (o.locked) continue;
      const rows = cutGames(all, 'L10', { ...NO_FILTERS, ...o.patch }, ctx).games;
      expect([g.id, o.key, o.n, o.over]).toEqual([g.id, o.key, rows.length, hits(rows, 6.5)]);
    }
  });
  it('site: All / Home / Away partition the pool', () => {
    const [a, h, w] = group('site').options;
    expect([a.label, h.label, w.label]).toEqual(['All', 'Home', 'Away']);
    expect(h.n + w.n).toBe(a.n);
    expect(a.n).toBe(10);
  });
  it('the "other groups" rule: choosing Away changes the counts of the other groups but not Site’s own options', () => {
    const base = group('site').options.map((o) => o.n);
    const withAway = group('site', { ...NO_FILTERS, site: 'away' }).options.map((o) => o.n);
    expect(withAway).toEqual(base);
    const restBase = group('rest').options.reduce((s, o) => s + o.n, 0), restAway = group('rest', { ...NO_FILTERS, site: 'away' }).options.reduce((s, o) => s + o.n, 0);
    expect(restAway).toBeLessThanOrEqual(restBase);
  });
  it('tiers are locked with the reason until ranks are published; Favorite is always locked; teammate-out, weather, pace are locked rows', () => {
    const opp = group('opponent');
    expect(opp.options.filter((o) => o.locked).map((o) => o.key)).toEqual(['top', 'bottom']);
    expect(group('script').options.find((o) => o.key === 'fav')!.locked).toBe('needs data');
    const on = group('opponent', NO_FILTERS, { tiers: true, tierOf: () => 'top' });
    expect(on.options.filter((o) => o.locked)).toHaveLength(0);
  });
  it('the live card: games matching, hit count at the line, average and one square per window game', () => {
    const m = matchSummary(l10, { ...NO_FILTERS, site: 'away' }, 'receptions', 6.5, ctx);
    const away = l10.filter((o) => o.home === false);
    expect(m.matched).toBe(away.length);
    expect(m.of).toBe(10);
    expect(m.hit.over).toBe(hits(away, 6.5));
    expect(m.squares).toHaveLength(10);
    expect(m.squares.filter((s) => s.hit != null)).toHaveLength(away.length);
  });
  it('applied filters become removable chips in the sheet’s order, and saved chips carry the window and the rung', () => {
    const f = { ...NO_FILTERS, site: 'away' as const, rest: 'long' as const, script: 'won' as const };
    expect(filterChips(f).map((c) => c.label)).toEqual(['Away', 'Team won', '8+ days']);
    expect(savedChips('L10', f, 7)).toEqual(['L10', 'Away', 'Team won', '8+ days', '7+']);
    expect(windowLabel('H2H', { opp: 'PHI', season: '2026', total: 17 })).toBe('vs PHI');
  });
});

describe('the ladder and the line', () => {
  it('a half-point line is the next whole rung, and back', () => {
    expect([rungOf(6.5), rungOf(24.5), rungOf(25)]).toEqual([7, 25, 26]);
    expect(lineOfRung(7)).toBe(6.5);
  });
  it('the line snaps to the nearest listed rung', () => {
    const rungs = [3.5, 4.5, 5.5, 6.5, 7.5].map((line) => ({ line }));
    expect(nearestRung(rungs, 6.1)!.line).toBe(6.5);
    expect(nearestRung(rungs, 4.9)!.line).toBe(4.5);
    expect(nearestRung(rungs, 100)!.line).toBe(7.5);
    expect(nearestRung([], 3)).toBeNull();
  });
  it('every rung carries Market from the gate, History counted over the shown games, and SIFT from its own lane; none is derived from another', () => {
    const games = cutGames(all, 'L10', NO_FILTERS, ctx).games;
    const price = (ask: number) => ({ ask, bid: ask - 1, implied: ask, ticker: `T${ask}`, side: 'YES' as const, description: '', observedAt: null, source: 'Kalshi' as const, tradable: true, marketStatus: 'open' as const });
    const views = rungViews([{ line: 5.5, price: price(70) }, { line: 3.5, price: price(90) }, { line: 6.5, price: price(56) }], games, 'receptions', (p) => (p.ask === 56 ? null : p.ask), (k) => (k === 7 ? { p: 0.38, reason: null } : { p: null, reason: 'not approved yet' }));
    expect(views.map((r) => r.label)).toEqual(['4+', '6+', '7+']);
    expect(views.map((r) => r.ask)).toEqual([90, 70, null]);
    for (const r of views) { expect(r.over).toBe(hits(games, r.line)); expect(r.n).toBe(games.length); expect(r.history).toBe(Math.round((100 * r.over) / r.n)); }
    expect(views.map((r) => r.sift.p)).toEqual([null, null, 0.38]);
  });
  it('a long ladder lists a window around the selected line; a short one lists all', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ line: i + 0.5 }));
    expect(rungWindow(rows.slice(0, 5), 2.5)).toHaveLength(5);
    const w = rungWindow(rows, 6.5);
    expect(w).toHaveLength(7);
    expect(w.some((r) => r.line === 6.5)).toBe(true);
    expect(rungWindow(rows, 0.5)[0].line).toBe(0.5);
    expect(rungWindow(rows, 11.5).at(-1)!.line).toBe(11.5);
  });
});

describe('Trends, Log and Replay', () => {
  it('the windows table repeats the chips’ counts and adds average, median and distance from the line from the same games', () => {
    const t = windowTable(all, NO_FILTERS, 'receptions', 6.5, ctx);
    const chips = windowChips(all, NO_FILTERS, 'receptions', 6.5, ctx);
    expect(t.map((r) => [r.win, r.over, r.n])).toEqual(chips.map((c) => [c.win, c.over, c.n]));
    const l5 = all.slice(-5).map(rec);
    expect(t[0].mean).toBeCloseTo(l5.reduce((a, b) => a + b, 0) / 5, 8);
    expect(t[0].vsLine).toBeCloseTo(t[0].mean! - 6.5, 8);
  });
  it('Replay: similar games are the coming venue side (newest 20), head-to-head the coming opponent; no venue means every game', () => {
    const away = replayGames(all, 'similar', false, 'PHI');
    expect(away.every((o) => o.home === false)).toBe(true);
    expect(replayGames(all, 'similar', true, 'PHI').every((o) => o.home === true)).toBe(true);
    expect(replayGames(all, 'similar', null, 'PHI')).toHaveLength(17);
    expect(replayGames(all, 'h2h', false, 'PHI').every((o) => o.opp === 'PHI')).toBe(true);
    expect(replayGames(all, 'h2h', false, null)).toHaveLength(0);
    expect(away.map((o) => o.date)).toEqual([...away.map((o) => o.date)].sort());
  });
  it('Replay never exceeds the newest 20', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...all[0], key: `k${i}`, date: `2026-01-${String(i + 1).padStart(2, '0')}`, home: true }));
    const r = replayGames(many, 'similar', true, null);
    expect(r).toHaveLength(20);
    expect(r.at(-1)!.key).toBe('k29');
  });
  it('a game’s other statistics are listed without the selected one and without anything the log lacks', () => {
    const o = { ...all.at(-1)!, v: { receptions: 5, targets: 8, receiving_yards: null } as Obs['v'] };
    expect(otherStats(o, stats, 'receptions')).toBe('8 TGT');
  });
  it('a logged game’s page is found only when the schedule lists exactly one final game against that opponent that day', () => {
    const g = (eventId: string, opponentCode: string, startUtc: string, status = 'FINAL') => ({ eventId, opponentCode, startUtc, status });
    const games = [g('E1', 'NYG', '2026-09-13T17:00:00Z'), g('E2', 'WAS', '2026-09-20T17:00:00Z'), g('E3', 'WAS', '2026-09-21T01:15:00Z')];
    expect(eventForObs(games, { date: '2026-09-13', opp: 'NYG' })).toBe('E1');
    expect(eventForObs(games, { date: '2026-09-13', opp: 'WAS' })).toBeNull();
    expect(eventForObs(games, { date: '2026-09-20', opp: 'WAS' })).toBeNull();     // two candidates: no guess
    expect(eventForObs([g('E4', 'NYG', '2026-09-13T17:00:00Z', 'SCHEDULED')], { date: '2026-09-13', opp: 'NYG' })).toBeNull();
    expect(eventForObs(games, { date: 'nope', opp: 'NYG' })).toBeNull();
  });
  it('hitCount is over / n with pushes left out of both counts', () => {
    const rows = all.slice(-4).map((o, i) => ({ ...o, v: { receptions: [6, 7, 7, 8][i] } as Obs['v'] }));
    expect(hitCount(rows, 'receptions', 7)).toMatchObject({ over: 1, push: 2 });
  });
  it('game times are words, never an age', () => {
    const t = Date.parse('2026-10-27T00:15:00Z');
    const w = gameWhen(t, Date.parse('2026-10-26T19:00:00Z'));
    expect(w).toMatch(/\d{1,2}:\d{2}/);
    expect(w).not.toMatch(/ago|stale/i);
    expect(gameWhen(NaN, 0)).toBe(''); // no start time: nothing is shown, never a guess
  });
});
