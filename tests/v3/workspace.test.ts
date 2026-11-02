// My SIFT's workspace model (src/v3/model/workspace.ts): the Recent list and the contract Watchlist. Pure: ordering, de-duplication, caps, and that
// whatever storage holds is validated before it is trusted (a bad route or ticker is dropped, so no row is a broken link).
import { describe, expect, it } from 'vitest';
import {
  addVisit, addWatch, contractRoute, isTicker, isWatched, RECENT_CAP, removeVisit, removeWatch, reviveVisits, reviveWatchlist, visitKey, WATCH_CAP, type Visit,
} from '../../src/v3/model/workspace';

const v = (route: string, over: Partial<Visit> = {}): Visit => ({ route, title: route, subtitle: '', kind: 'game', slug: 'nba', ...over });

describe('recent views', () => {
  it('newest first, one entry per page (the query does not make another page)', () => {
    let l: Visit[] = [];
    l = addVisit(l, v('/v3/game/nba/a'), 1);
    l = addVisit(l, v('/v3/team/nba/NYK', { kind: 'team' }), 2);
    l = addVisit(l, v('/v3/game/nba/a?tab=odds'), 3);
    expect(l.map((x) => x.route)).toEqual(['/v3/game/nba/a?tab=odds', '/v3/team/nba/NYK']);
    expect(l[0].at).toBe(3);
  });
  it('reopening the page already on top changes nothing (same list)', () => {
    const l = addVisit([], v('/v3/game/nba/a'), 1);
    expect(addVisit(l, v('/v3/game/nba/a'), 9)).toBe(l);
  });
  it('is capped at 30, dropping the oldest', () => {
    let l: Visit[] = [];
    for (let i = 0; i < 40; i++) l = addVisit(l, v(`/v3/game/nba/g${i}`), i);
    expect(l).toHaveLength(RECENT_CAP);
    expect(l[0].route).toBe('/v3/game/nba/g39');
    expect(l.at(-1)!.route).toBe('/v3/game/nba/g10');
  });
  it('research is told apart by its address but not by the selected rung: the same prop at another line replaces its entry', () => {
    const r = (q: string) => v(`/v3/props?view=list&player=p1&exp=${q}`, { kind: 'research' });
    let l = addVisit([], r('abc'), 1);
    l = addVisit(l, v('/v3/props?view=list&player=p2&exp=zzz', { kind: 'research' }), 2);
    l = addVisit(l, r('abc@6'), 3);
    expect(l).toHaveLength(2);
    expect(l[0].route).toContain('exp=abc@6');
    expect(visitKey(r('abc@6'))).toBe(visitKey(r('abc')));
    expect(visitKey(r('abc'))).not.toBe(visitKey(v('/v3/props?view=list&player=p2&exp=zzz', { kind: 'research' })));
  });
  it('refuses a route outside the app or an untitled entry', () => {
    expect(addVisit([], v('https://evil.example/v3/x'), 1)).toEqual([]);
    expect(addVisit([], v('/v3/game/nba/a', { title: '  ' }), 1)).toEqual([]);
  });
  it('removes one page by key', () => {
    const l = addVisit(addVisit([], v('/v3/game/nba/a'), 1), v('/v3/game/nba/b'), 2);
    expect(removeVisit(l, visitKey(l[0])).map((x) => x.route)).toEqual(['/v3/game/nba/a']);
  });
  it('revive: drops invalid entries and duplicates, keeps order, caps, never throws', () => {
    expect(reviveVisits('nope')).toEqual([]);
    const raw = [null, 7, { route: '/v3/game/nba/a', title: 'A', kind: 'game', slug: 'nba' }, { route: '//evil', title: 'x', kind: 'game' }, { route: '/v3/game/nba/a?x=1', title: 'dup', kind: 'game' }, { route: '/v3/x', title: 'bad kind', kind: 'zzz' }, { route: '/v3/team/nba/NYK', title: '', kind: 'team' }, { route: 'v3/team/nba/BOS', title: 'Celtics', kind: 'team', at: 5 }];
    const out = reviveVisits(raw);
    expect(out.map((x) => x.title)).toEqual(['A', 'Celtics']);
    expect(out[1].route).toBe('/v3/team/nba/BOS');
    expect(reviveVisits(Array.from({ length: 80 }, (_, i) => ({ route: `/v3/game/nba/g${i}`, title: `g${i}`, kind: 'game' })))).toHaveLength(RECENT_CAP);
  });
});

describe('watchlist', () => {
  const w = (ticker: string, over: Record<string, unknown> = {}) => ({ ticker, title: `T ${ticker}`, subtitle: 's', route: contractRoute('/v3/props', '?view=list', ticker), startMs: 1000, ...over });

  it('tickers: letters, digits and . _ - only', () => {
    expect(isTicker('KXNBAPTS-26NOV03NYKBOS-NYKJB11-20')).toBe(true);
    expect(isTicker('ab')).toBe(false);
    expect(isTicker('has space')).toBe(false);
    expect(isTicker('x/../y')).toBe(false);
    expect(isTicker(null)).toBe(false);
  });
  it('the contract route is the screen with the sheet open and replaces an earlier sheet', () => {
    expect(contractRoute('/v3/props', '?view=list&exp=a@6', 'KX-1')).toBe('/v3/props?view=list&exp=a%406&sheet=contract&tk=KX-1');
    expect(contractRoute('/v3/props', '?sheet=contract&tk=OLD-1&view=list', 'KX-1')).toBe('/v3/props?view=list&sheet=contract&tk=KX-1');
    expect(contractRoute('/v3/player/nfl/x', '', 'KX-1')).toBe('/v3/player/nfl/x?sheet=contract&tk=KX-1');
  });
  it('add: newest first, one entry per ticker (re-adding moves it to the top), capped', () => {
    let l = addWatch([], w('AAA-1'), 1);
    l = addWatch(l, w('BBB-2'), 2);
    l = addWatch(l, w('AAA-1', { title: 'renamed' }), 3);
    expect(l.map((x) => x.ticker)).toEqual(['AAA-1', 'BBB-2']);
    expect(l[0].title).toBe('renamed');
    expect(l[0].addedAt).toBe(3);
    let big = [] as ReturnType<typeof addWatch>;
    for (let i = 0; i < WATCH_CAP + 10; i++) big = addWatch(big, w(`TK-${i}`), i);
    expect(big).toHaveLength(WATCH_CAP);
    expect(big[0].ticker).toBe(`TK-${WATCH_CAP + 9}`);
  });
  it('add refuses a bad ticker or a route outside the app; the list is returned unchanged', () => {
    const l = addWatch([], w('AAA-1'), 1);
    expect(addWatch(l, w('bad ticker'), 2)).toBe(l);
    expect(addWatch(l, w('CCC-3', { route: 'https://evil.example/' }), 2)).toBe(l);
  });
  it('remove and isWatched', () => {
    const l = addWatch(addWatch([], w('AAA-1'), 1), w('BBB-2'), 2);
    expect(isWatched(l, 'AAA-1')).toBe(true);
    expect(removeWatch(l, 'AAA-1').map((x) => x.ticker)).toEqual(['BBB-2']);
    expect(isWatched(removeWatch(l, 'AAA-1'), 'AAA-1')).toBe(false);
    expect(isWatched(l, null)).toBe(false);
  });
  it('revive: invalid and duplicate entries dropped, defaults filled, no stored price survives, never throws', () => {
    expect(reviveWatchlist({})).toEqual([]);
    const out = reviveWatchlist([null, { ticker: 'AAA-1', route: '/v3/props?sheet=contract&tk=AAA-1', price: 55, ask: 55 }, { ticker: 'AAA-1', route: '/v3/props' }, { ticker: 'no good', route: '/v3/props' }, { ticker: 'BBB-2', route: 'https://x.example' }, { ticker: 'CCC-3', route: '#/v3/game/nba/a', title: 'C', addedAt: 9, startMs: 'x' }]);
    expect(out.map((x) => x.ticker)).toEqual(['AAA-1', 'CCC-3']);
    expect(out[0].title).toBe('AAA-1');
    expect(out[0]).not.toHaveProperty('price');
    expect(out[0]).not.toHaveProperty('ask');
    expect(out[1]).toMatchObject({ route: '/v3/game/nba/a', addedAt: 9, startMs: null });
  });
});
