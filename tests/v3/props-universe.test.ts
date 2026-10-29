// Which games enter the prop universe (the cost bound), the list's address rules and the row-layout fallback. Pure functions only.
import { describe, expect, it } from 'vitest';
import type { BoardItem } from '../../src/contract/types';
import { PROP_HORIZON_MS, propGames } from '../../src/v3/data/props/load';
import { listProps, parseRef, refToken, rungFor, viewOf, type ListState, type QueryCtx } from '../../src/v3/data/props/query';
import { decode } from '../../src/v3/state/url';
import { propsSchema } from '../../src/v3/nav/schemas';
import { routes } from '../../src/v3/nav/routes';
import { chipBeside, rowHeight, ROW_H, ROW_H_WRAP, textColumn } from '../../src/v3/screens/props/layout';
import type { V3Game } from '../../src/v3/model/types';
import type { Prop } from '../../src/v3/data/props/types';

const NOW = Date.parse('2026-10-26T20:00:00Z');
const game = (over: Partial<V3Game> & { markets?: number }): V3Game => ({
  key: `${over.slug ?? 'nfl'}:${over.eventId ?? 'e'}`, slug: 'nfl', sport: 'NFL', eventId: 'e', league: 'NFL', phase: 'pregame', startMs: NOW + 3600_000,
  away: {} as never, home: {} as never, score: null, lines: [], signals: 0, provenance: 'publication',
  item: { markets_available: over.markets ?? 800 } as BoardItem, ...over,
});

describe('which games enter the prop universe', () => {
  it('keeps real, pre-game games of a sport that prices props, inside the horizon, soonest first', () => {
    const g = [
      game({ eventId: 'late', startMs: NOW + 5 * 3600_000 }),
      game({ eventId: 'soon', startMs: NOW + 1 * 3600_000 }),
    ];
    expect(propGames(g, NOW).map((x) => x.eventId)).toEqual(['soon', 'late']);
  });
  it('skips what cannot hold a player ladder or costs a document for nothing', () => {
    const g = [
      game({ eventId: 'far', startMs: NOW + PROP_HORIZON_MS + 1 }),
      game({ eventId: 'edge', startMs: NOW + PROP_HORIZON_MS }),
      game({ eventId: 'live', phase: 'live' }),
      game({ eventId: 'final', phase: 'final' }),
      game({ eventId: 'demo', provenance: 'demo' }),
      game({ eventId: 'none', markets: 0 }),
      game({ eventId: 'soccer', slug: 'soccer' }),
      game({ eventId: 'ok' }),
    ];
    expect(propGames(g, NOW).map((x) => x.eventId).sort()).toEqual(['edge', 'ok']);
  });
  it('treats a board row that does not say how many markets as possibly priced (never drops what it cannot rule out)', () => {
    expect(propGames([game({ eventId: 'a', item: undefined })], NOW)).toHaveLength(1);
  });
  it('a large college slate costs nothing: 300 games with no markets are never read', () => {
    const many = Array.from({ length: 300 }, (_, i) => game({ eventId: `cbb${i}`, slug: 'cbb', markets: 0 }));
    expect(propGames(many, NOW)).toHaveLength(0);
  });
});

const prop = (id: string, over: Partial<Prop> = {}): Prop => ({
  id, slug: 'nfl', sportLabel: 'NFL', eventId: 'e1', gameKey: 'nfl:e1', startMs: NOW, away: { abbr: 'DAL' } as never, home: { abbr: 'PHI' } as never,
  playerId: 'prt_1', histId: 'g1', name: id, team: 'DAL', opp: 'PHI', position: null, stat: 'receptions', fam: 'receptions', label: 'Receptions', abbr: 'REC',
  playerStat: 'receptions', history: { kind: 'nfl', stat: 'receptions' }, oppUnit: null,
  rungs: [{ k: 3, ticker: `${id}-3`, ask: 52, bid: 50, volume: 1, capturedAt: null, source: 'Kalshi' }, { k: 5, ticker: `${id}-5`, ask: 20, bid: 18, volume: 1, capturedAt: null, source: 'Kalshi' }],
  featured: 3, playerPage: true, out: null, availKnown: true, availPending: false, model: { state: 'none', reason: 'x' }, provenance: 'publication', ...over,
});
const ctx: QueryCtx = { matchup: () => null, values: () => undefined };
const st = (q: string): ListState => decode(propsSchema, q);

describe('the list address', () => {
  it('opens the home with nothing set, the list with any list field, compare only when asked', () => {
    expect(viewOf(st(''))).toBe('home');
    expect(viewOf(st('?v=1&sport=nfl'))).toBe('list');
    expect(viewOf(st('?v=1&q=lamb'))).toBe('list');
    expect(viewOf(st('?v=1&view=compare&cmp=a,b'))).toBe('compare');
    expect(viewOf(st('?v=1&team=DAL'))).toBe('list');
  });
  it('round-trips every list-state field through the route builder', () => {
    const route = routes.props({ view: 'list', sport: 'nhl', fam: 'points', sort: 'price', q: 'mar', hide: false, exp: 'ID@2', cmp: ['a', 'b@4'], cmpm: true, range: '35-75', hmin: 6, hwin: 'L5', orank: 'bottom10', model: true });
    const d = st(route.slice(route.indexOf('?')));
    expect(d).toMatchObject({ view: 'list', sport: 'nhl', fam: 'points', sort: 'price', q: 'mar', hide: false, exp: 'ID@2', cmp: ['a', 'b@4'], cmpm: true, range: '35-75', hmin: 6, hwin: 'L5', orank: 'bottom10', model: true });
  });
  it('bounds the compare list at three props', () => {
    expect(st(`?v=1&cmp=${'a,'.repeat(10)}`).cmp).toHaveLength(3);
  });
  it('names a rung with @k only when it is not the featured one', () => {
    const p = prop('P');
    expect(refToken(p, 3)).toBe('P');
    expect(refToken(p, 5)).toBe('P@5');
    expect(parseRef('P@5')).toEqual({ id: 'P', k: 5 });
    expect(parseRef('P')).toEqual({ id: 'P', k: null });
    expect(rungFor(p, 5).k).toBe(5);
    expect(rungFor(p, 9).k).toBe(3);                                                                   // an unknown rung falls back to the featured one
  });
  it('sorts by the captured ask without logs, and lifts a pinned prop to the top', () => {
    const a = prop('A', { rungs: [{ k: 3, ticker: 'a', ask: 70, bid: null, volume: null, capturedAt: null, source: 'Kalshi' }] }), b = prop('B', { rungs: [{ k: 3, ticker: 'b', ask: 30, bid: null, volume: null, capturedAt: null, source: 'Kalshi' }] });
    expect(listProps([a, b], st('?v=1&sort=price'), ctx).map((p) => p.id)).toEqual(['B', 'A']);
    expect(listProps([a, b], st('?v=1&sort=price&exp=A&pin=1'), ctx).map((p) => p.id)).toEqual(['A', 'B']);
  });
  it('never ranks a row whose History is not loaded above one that is, and never invents a History number', () => {
    const a = prop('A'), b = prop('B');
    const c: QueryCtx = { matchup: () => null, values: (p) => (p.id === 'B' ? [3, 4, 5, 3, 1, 3, 4, 0, 3, 3] : undefined) };
    expect(listProps([a, b], st('?v=1&sort=hist'), c).map((p) => p.id)).toEqual(['B', 'A']);
    expect(listProps([a, b], st('?v=1&hmin=6'), c).map((p) => p.id)).toEqual(['B']);                    // a threshold passes only rows that have the log
  });
});

describe('row layout', () => {
  it('has two constant heights and a text column that shrinks with the screen', () => {
    expect(rowHeight(false)).toBe(ROW_H);
    expect(rowHeight(true)).toBe(ROW_H_WRAP);
    expect(textColumn(375)).toBeLessThan(textColumn(390));
  });
  it('estimates from character counts where text cannot be measured, with the chip beside the line only when it fits', () => {
    expect(chipBeside('Goals', '1+', 'DET goals against · 9th of 32', 390)).toBe(true);
    expect(chipBeside('Receiving yds', '120+', 'PHI pass D · 10th of 28', 375)).toBe(false);
    expect(chipBeside('Receptions', '2+', 'DAL pass D · 28th of 28', 390)).toBe(false);                    // the case the first estimate got wrong
  });
});
