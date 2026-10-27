// Prop Discovery load hardening: the discovery horizon, the universe published in prefixes, availability and rankings read for the rows
// that need them, and History's evaluated / not-evaluated split. Pure rules and the loaders with injected reads: no network.
import { describe, expect, it } from 'vitest';
import type { BoardItem } from '../../src/contract/types';
import { nameKey } from '../../src/insights/context';
import { availabilityBank, availKey, pendingKeys, withAvailability, type Sidelined } from '../../src/v3/data/props/availability';
import { capGames, costText, gameCostBytes, GZ_BYTES_PER_MARKET, HORIZON_MS, horizonCounts, MAX_GAMES } from '../../src/v3/data/props/horizon';
import { LazyBank } from '../../src/v3/data/props/lazyBank';
import { buildUniverse, loadProgressive, propGames, publishablePrefix, summarize, type GameResult } from '../../src/v3/data/props/load';
import { comparator, histClassOf, histSummary, listProps, type ListState, type QueryCtx } from '../../src/v3/data/props/query';
import { chipStateOf, rankKeyOf } from '../../src/v3/data/props/ranks';
import { horizonStatus } from '../../src/v3/screens/props/HorizonBar';
import { propsSchema } from '../../src/v3/nav/schemas';
import { routes } from '../../src/v3/nav/routes';
import { decode } from '../../src/v3/state/url';
import type { V3Game } from '../../src/v3/model/types';
import type { Prop } from '../../src/v3/data/props/types';

const NOW = Date.parse('2026-10-26T20:00:00Z');
const H = 3600_000;
const game = (id: string, hours: number, over: Partial<V3Game> & { markets?: number } = {}): V3Game => ({
  key: `${over.slug ?? 'nfl'}:${id}`, slug: 'nfl', sport: 'NFL', eventId: id, league: 'NFL', phase: 'pregame', startMs: NOW + hours * H,
  away: { abbr: 'AAA' } as never, home: { abbr: 'BBB' } as never, score: null, lines: [], signals: 0, provenance: 'publication',
  item: { markets_available: over.markets ?? 800 } as BoardItem, ...over,
});

describe('the discovery horizon', () => {
  const slate = [game('a', 5), game('b', 47), game('c', 49), game('d', 24 * 6), game('e', 24 * 9), game('x', 3, { markets: 0 }), game('live', 1, { phase: 'live' })];
  it('48 hours is the default and the cut is inclusive', () => {
    expect(propGames(slate, NOW).map((g) => g.eventId)).toEqual(['a', 'b']);
    expect(propGames([game('edge', 48)], NOW)).toHaveLength(1);
  });
  it('7 days and All upcoming add games, never drop any, and keep the order', () => {
    expect(propGames(slate, NOW, '7d').map((g) => g.eventId)).toEqual(['a', 'b', 'c', 'd']);
    expect(propGames(slate, NOW, 'all').map((g) => g.eventId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(HORIZON_MS['48h']).toBeLessThan(HORIZON_MS['7d']);
  });
  it('counts per option come from the board rows (cumulative) and estimate the wire cost from the listed markets', () => {
    const c = horizonCounts(propGames(slate, NOW, 'all'), NOW);
    expect([c['48h'].games, c['7d'].games, c.all.games]).toEqual([2, 4, 5]);
    expect(c['48h'].bytes).toBe(2 * 800 * GZ_BYTES_PER_MARKET);
    expect(c.all.bytes - c['7d'].bytes).toBe(gameCostBytes(game('e', 9 * 24)));
  });
  it('a row that does not say how many markets is costed as a typical game (never as free)', () => {
    expect(gameCostBytes({ item: undefined })).toBe(300 * GZ_BYTES_PER_MARKET);
  });
  it('the cost prints rounded, in the unit a phone user reads', () => {
    expect(costText(1_432_000)).toBe('1.4 MB');
    expect(costText(820_000)).toBe('820 KB');
    expect(costText(3_000)).toBe('10 KB');
  });
  it('one view reads at most MAX_GAMES games, soonest first, and says how many it left out', () => {
    const many = Array.from({ length: MAX_GAMES + 30 }, (_, i) => i);
    const c = capGames(many);
    expect(c.games).toHaveLength(MAX_GAMES);
    expect(c.games[0]).toBe(0);
    expect(c.omitted).toBe(30);
    expect(capGames([1, 2]).omitted).toBe(0);
  });
  it('lives in the address as hz, absent for the default, and never turns the home into the list', () => {
    expect(routes.props({})).toBe('/v3/props');
    expect(routes.props({ hz: '7d' })).toContain('hz=7d');
    expect(routes.props({ hz: '48h' })).not.toContain('hz=');
    expect(decode(propsSchema, 'hz=all').hz).toBe('all');
    expect(decode(propsSchema, 'hz=nonsense').hz).toBe('48h');
  });
  it('the status line states the cost before the horizon is chosen and the progress while it is read', () => {
    const counts = horizonCounts(propGames(slate, NOW, 'all'), NOW);
    const u = (loaded: number, total: number) => ({ ...summarize([], new Map(), [], 0, false, { loaded, total, complete: loaded === total }) });
    const idle = horizonStatus({ horizon: '48h', counts, universe: u(2, 2), reading: false, omitted: 0 });
    expect(idle).toMatch(/7 days adds 2 games \(about [\d.]+ (MB|KB)\)/);
    const reading = horizonStatus({ horizon: '7d', counts, universe: u(3, 4), reading: true, omitted: 0 });
    expect(reading).toMatch(/Reading games: 3 of 4/);
    expect(reading).toMatch(/about [\d.]+ (MB|KB)/);
    expect(horizonStatus({ horizon: '7d', counts, universe: u(4, 4), reading: false, omitted: 12 })).toMatch(/Showing the soonest 320 of 332 games/);
  });
});

const gr = (g: V3Game, n = 1): GameResult => ({ eventId: g.eventId, key: g.key, startMs: g.startMs, props: Array.from({ length: n }, (_, i) => prop(`${g.eventId}-${i}`, { eventId: g.eventId, startMs: g.startMs })), unreadable: null, gap: false });
const prop = (id: string, over: Partial<Prop> = {}): Prop => ({
  id, slug: 'nfl', sportLabel: 'NFL', eventId: 'e1', gameKey: 'nfl:e1', startMs: NOW, away: { abbr: 'DAL' } as never, home: { abbr: 'PHI' } as never,
  playerId: 'prt_1', histId: 'g1', name: id, team: 'DAL', opp: 'PHI', position: null, stat: 'receptions', fam: 'receptions', label: 'Receptions', abbr: 'REC',
  playerStat: 'receptions', history: { kind: 'nfl', stat: 'receptions' }, oppUnit: null,
  rungs: [{ k: 3, ticker: `${id}-3`, ask: 52, bid: 50, volume: 1, capturedAt: null, source: 'Kalshi' }, { k: 5, ticker: `${id}-5`, ask: 20, bid: 18, volume: 1, capturedAt: null, source: 'Kalshi' }],
  featured: 3, playerPage: true, out: null, availKnown: true, availPending: false, model: { state: 'none', reason: 'x' }, provenance: 'publication', ...over,
});

describe('the universe is published in prefixes', () => {
  it('publishes the longest read prefix that does not split a group of games starting together', () => {
    expect(publishablePrefix([1, 2, 3], [true, true, true])).toBe(3);
    expect(publishablePrefix([1, 2, 3], [true, false, true])).toBe(1);
    expect(publishablePrefix([1, 2, 3], [false, true, true])).toBe(0);
    // games 1 and 2 start together: with only the first read, nothing of that group is published yet
    expect(publishablePrefix([1, 1, 2], [true, false, false])).toBe(0);
    expect(publishablePrefix([1, 1, 2], [true, true, false])).toBe(2);
    expect(publishablePrefix([5, 5, 5], [true, true, true])).toBe(3);
  });

  it('draws the soonest games while the rest are still being read, and the last publication is complete', async () => {
    const games = [game('g1', 1), game('g2', 2), game('g3', 3), game('g4', 4)];
    const gates = games.map(() => { let go!: () => void; const p = new Promise<void>((r) => { go = r; }); return { p, go }; });
    const seen: { loaded: number; complete: boolean; ids: string[] }[] = [];
    const run = loadProgressive(games, {
      concurrency: 4, throttleMs: 0,
      read: async (g) => { const i = games.indexOf(g); await gates[i].p; return gr(g, 2); },
      onUpdate: (p) => seen.push({ loaded: p.loaded, complete: p.complete, ids: [...new Set(p.universe.props.map((x) => x.eventId))] }),
    });
    // the 2nd and 3rd games arrive first: nothing may be drawn, because the soonest game is not read yet
    gates[1].go(); gates[2].go();
    await new Promise((r) => setTimeout(r, 5));
    expect(seen).toHaveLength(0);
    gates[0].go();
    await new Promise((r) => setTimeout(r, 5));
    expect(seen.at(-1)).toMatchObject({ loaded: 3, complete: false, ids: ['g1', 'g2', 'g3'] });
    gates[3].go();
    const last = await run;
    expect(last.complete).toBe(true);
    expect(last.universe.complete).toBe(true);
    expect(last.universe.props).toHaveLength(8);
    expect(seen.at(-1)).toMatchObject({ loaded: 4, complete: true });
    // every published universe is a prefix of the final order
    for (const s of seen) expect(s.ids).toEqual(['g1', 'g2', 'g3', 'g4'].slice(0, s.ids.length));
  });

  it('a background refresh publishes only the complete universe (a full list is never replaced by a partial one)', async () => {
    const games = [game('g1', 1), game('g2', 2)];
    const seen: boolean[] = [];
    await loadProgressive(games, { partial: false, throttleMs: 0, concurrency: 1, read: async (g) => gr(g), onUpdate: (p) => seen.push(p.complete) });
    expect(seen).toEqual([true]);
  });

  it('never publishes a prefix shorter than the one already on screen (Back re-reads the same games)', async () => {
    const games = [game('g1', 1), game('g2', 2), game('g3', 3), game('g4', 4)];
    const seen: number[] = [];
    await loadProgressive(games, { concurrency: 1, throttleMs: 0, minLoaded: 3, read: async (g) => gr(g), onUpdate: (p) => seen.push(p.loaded) });
    expect(seen.every((n) => n >= 3)).toBe(true);
    expect(seen.at(-1)).toBe(4);
  });

  it('stops reading when the viewer leaves (abort) and publishes nothing further', async () => {
    const games = [game('g1', 1), game('g2', 2), game('g3', 3)];
    const ctl = new AbortController();
    const reads: string[] = [];
    const seen: number[] = [];
    await loadProgressive(games, { signal: ctl.signal, concurrency: 1, throttleMs: 0, read: async (g) => { reads.push(g.eventId); if (g.eventId === 'g1') ctl.abort(); return gr(g); }, onUpdate: (p) => seen.push(p.loaded) });
    expect(reads).toEqual(['g1']);
    expect(seen).toEqual([]);
  });

  it('a game that cannot be read is named, not dropped silently', async () => {
    const games = [game('g1', 1), game('g2', 2)];
    const last = await loadProgressive(games, { concurrency: 2, throttleMs: 0, read: async (g) => { if (g.eventId === 'g2') throw new Error('x'); return gr(g); } });
    expect(last.complete).toBe(true);
    expect(last.universe.unreadable).toEqual(['AAA at BBB']);
  });

  it('an empty horizon is a complete, empty universe', async () => {
    const last = await loadProgressive([], {});
    expect(last.complete).toBe(true);
    expect(last.universe.props).toHaveLength(0);
  });

  it('counts say how much of the horizon they cover', () => {
    const u = buildUniverse([gr(game('g1', 1), 3)], 5, false);
    expect(u).toMatchObject({ gamesLoaded: 1, gamesTotal: 5, complete: false });
    expect(u.stats.props).toBe(3);
  });
});

describe('availability is read for the rows that need it', () => {
  const pending = (id: string, ev: string, name: string) => prop(id, { eventId: ev, name, availKnown: false, availPending: true });
  const base = summarize([pending('a', 'e1', 'Ann Able'), pending('b', 'e1', 'Bob Baker'), pending('c', 'e2', 'Cy Clark'), prop('d', { eventId: 'e3', name: 'Hockey Guy' })], new Map(), [], 0, false);
  const out = (m: Record<string, string>): Sidelined => new Map(Object.entries(m).map(([k, v]) => [nameKey(k), v]));

  it('names the games whose availability document has not been read', () => {
    expect(base.availPendingGames).toBe(2);
    expect(pendingKeys(base.props).sort()).toEqual(['nfl|e1', 'nfl|e2']);
  });

  it('a pending row stays pending (and unhidden, but labelled) until its document arrives; nothing is guessed', () => {
    const u = withAvailability(base, () => undefined, nameKey);
    expect(u).toBe(base);
    expect(u.props.filter((p) => p.availPending)).toHaveLength(3);
  });

  it('a read document marks the listed players out and the rest known; a game without one is "not published", not "available"', () => {
    const get = (k: string) => (k === availKey(base.props[0]) ? { state: 'ready' as const, value: out({ 'Ann Able': 'OUT' }) } : k === 'nfl|e2' ? { state: 'none' as const } : undefined);
    const u = withAvailability(base, get, nameKey);
    const by = (id: string) => u.byId.get(id)!;
    expect(by('a')).toMatchObject({ out: 'OUT', availKnown: true, availPending: false });
    expect(by('b')).toMatchObject({ out: null, availKnown: true, availPending: false });
    expect(by('c')).toMatchObject({ out: null, availKnown: false, availPending: false });
    expect(u.availPendingGames).toBe(0);
    expect(u.availabilityGaps).toBe(1);
  });

  it('while a game is loading its rows are still pending', () => {
    const u = withAvailability(base, (k) => (k === 'nfl|e1' ? { state: 'loading' as const } : { state: 'ready' as const, value: out({}) }), nameKey);
    expect(u.byId.get('a')!.availPending).toBe(true);
    expect(u.byId.get('c')!.availPending).toBe(false);
    expect(u.availPendingGames).toBe(1);
  });

  it('only the rows on screen ask: the bank drops waiting requests for rows that left, and never asks twice', async () => {
    const asked: string[] = [];
    const release: (() => void)[] = [];
    const bank = new LazyBank<number>((k) => { asked.push(k); return new Promise((r) => { release.push(() => r(1)); }); }, 1);
    bank.ensure(['a', 'b', 'c']);
    expect(asked).toEqual(['a']);
    bank.ensure(['c', 'd'], { latest: true });
    expect(bank.get('b')).toBeUndefined();
    release[0]();
    await new Promise((r) => setTimeout(r, 5));
    expect(asked).toEqual(['a', 'c']);
    bank.ensure(['a', 'c']);
    expect(asked).toEqual(['a', 'c']);
    expect(bank.requested).toBe(4);
  });

  it('the shared availability bank exists and is empty at start', () => {
    expect(availabilityBank.get('nfl|nothing')).toBeUndefined();
  });
});

describe('opponent rankings are read for the rows that show them', () => {
  const p = prop('a', { oppUnit: { metric: 'adj_def_db_epa', chip: 'pass D', long: 'pass defense', short: 'pass D', perGame: false } });
  it('a chip says it is loading until its table is requested and has answered', () => {
    expect(rankKeyOf(p)).toBe('nfl:adj_def_db_epa');
    expect(chipStateOf(p, new Map(), () => undefined).state).toBe('loading');
    expect(chipStateOf(p, new Map(), () => ({ state: 'loading' })).state).toBe('loading');
    expect(chipStateOf(p, new Map(), () => ({ state: 'none' })).state).toBe('none');
    const table = new Map([['PHI', { rank: 10, n: 28, value: null, window: 'ADJ_RIDGE', rankingId: 'r' }]]);
    const c = chipStateOf(p, new Map(), () => ({ state: 'ready', value: table }));
    expect(c.state === 'ready' && c.m.text).toBe('PHI pass D · 10th of 28');
    // a table that answered but does not list the opponent is "no matchup rows", not a spinner
    expect(chipStateOf(p, new Map(), () => ({ state: 'ready', value: new Map() })).state).toBe('none');
  });
  it('a statistic without an opponent unit never waits for a table', () => {
    expect(chipStateOf(prop('b'), new Map(), () => undefined).state).toBe('none');
  });
});

describe('History: evaluated against not evaluated', () => {
  // a: 8 of 10, b: 3 of 10 (evaluated); c: log not loaded; d: log loaded but empty / no source
  const vals: Record<string, number[]> = { a: [5, 5, 5, 5, 5, 5, 5, 5, 1, 1], b: [5, 5, 5, 1, 1, 1, 1, 1, 1, 1] };
  const kind: Record<string, 'pending' | 'none'> = { c: 'pending', d: 'none' };
  const ctx: QueryCtx = { matchup: () => null, values: (p) => vals[p.id], histKind: (p) => kind[p.id] ?? 'pending' };
  const props = [
    prop('c', { startMs: NOW + 1 * H }), prop('d', { startMs: NOW + 2 * H }), prop('b', { startMs: NOW + 3 * H }), prop('a', { startMs: NOW + 4 * H }),
    prop('c2', { startMs: NOW + 0.5 * H }),
  ];
  const st = decode(propsSchema, 'sort=hist') as ListState;

  it('classifies every row and counts them', () => {
    expect(histClassOf(props[2], ctx)).toBe('evaluated');
    expect(histClassOf(props[0], ctx)).toBe('pending');
    expect(histClassOf(props[1], ctx)).toBe('none');
    expect(histSummary(props, ctx)).toEqual({ evaluated: 2, pending: 2, none: 1 + 0, total: 5 });
  });

  it('ranks evaluated rows by History, then lists the rest in START order (never ranked), pending before none', () => {
    const ids = listProps(props, st, ctx).map((p) => p.id);
    expect(ids.slice(0, 2)).toEqual(['a', 'b']);
    // not evaluated: waiting for a log first (c2 at +0.5h, c at +1h), then rows that have none (d)
    expect(ids.slice(2)).toEqual(['c2', 'c', 'd']);
  });

  it('a row that gains History moves into the ranked group; the order of the others does not change', () => {
    const more: QueryCtx = { ...ctx, values: (p) => (p.id === 'c' ? [5, 5, 5, 5, 5, 5, 5, 5, 5, 5] : vals[p.id]) };
    expect(listProps(props, st, more).map((p) => p.id)).toEqual(['c', 'a', 'b', 'c2', 'd']);
  });

  it('the History threshold keeps evaluated rows only', () => {
    const f = decode(propsSchema, 'hmin=5') as ListState;
    expect(listProps(props, f, ctx).map((p) => p.id)).toEqual(['a']);
  });

  it('the comparator is a total order over mixed rows (no row is lost or duplicated)', () => {
    const sorted = [...props].sort(comparator('hist', ctx));
    expect(new Set(sorted.map((p) => p.id)).size).toBe(props.length);
  });
});
