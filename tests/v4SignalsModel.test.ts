import { describe, expect, it } from 'vitest';
import { compareOpportunities, featureOpportunities } from '../src/opportunity/rank';
import type { Opportunity } from '../src/opportunity/types';
import { buildFeed, coverage, focusOf, gameOptions, parseFilter, signalsHref, standingOf } from '../src/v4/signalsModel';
import { iso, MARKET, NOW, opp } from './support/v4Opportunity';

const o = (id: string, over: Parameters<typeof opp>[0] = {}) => opp({ id, ...over });
const rank = (tier: 1 | 2 | 3 | 4 | 5, over: Partial<Opportunity['rank']> = {}) => ({ tier, tierWord: '', worstCaseEdge: null, evPerContract: null, edgeShare: null, priceCurrent: true, highVariance: false, kickoff: '2026-10-05T17:00:00Z', ...over });

describe('where an opportunity stands at this moment', () => {
  it('a current research candidate and a current actionable one are current signals', () => {
    expect(standingOf(opp(), NOW)).toEqual({ kind: 'current', why: null });
    expect(standingOf(opp({ status: 'ACTIONABLE', authority: 'PUBLISHED_PLAYABLE' }), NOW).kind).toBe('current');
  });
  it('a watch is a watch, never a priced signal, while its game is pregame and its quote is current', () => {
    expect(standingOf(opp({ status: 'WATCH' }), NOW)).toEqual({ kind: 'watch', why: null });
  });
  it('a pass the publication made keeps its own reason and is "passed"', () => {
    const s = standingOf(opp({ status: 'PASS', statusReason: 'Data warning from the publication.', price: { state: 'ABOVE_BET_UP_TO' } }), NOW);
    expect(s).toEqual({ kind: 'passed', why: 'Data warning from the publication.' });
  });
  it('a pass about time (game started, window expired, quote stale) is "no longer current"', () => {
    expect(standingOf(opp({ status: 'PASS', phase: 'STARTED', statusReason: 'The game started.' }), NOW).kind).toBe('stale');
    expect(standingOf(opp({ status: 'PASS', price: { state: 'EXPIRED' }, statusReason: 'Window passed.' }), NOW).kind).toBe('stale');
    expect(standingOf(opp({ status: 'PASS', price: { state: 'STALE' }, statusReason: 'No current quote.' }), NOW).kind).toBe('stale');
  });
  it('re-reads time: the same signal is current, then lapses as its window closes, its quote ages, or kickoff passes', () => {
    const windowed = opp({ price: { expiresAt: new Date(NOW + 10 * 60_000).toISOString() } });
    expect(standingOf(windowed, NOW).kind).toBe('current');
    expect(standingOf(windowed, NOW + 11 * 60_000)).toMatchObject({ kind: 'stale', why: expect.stringMatching(/validity window/) });
    const quoted = opp({ price: { observedAt: iso(2) } });
    expect(standingOf(quoted, NOW + 20 * 60_000).kind).toBe('current'); // aging
    expect(standingOf(quoted, NOW + 40 * 60_000)).toMatchObject({ kind: 'stale', why: expect.stringMatching(/stale/) });
    expect(standingOf(opp({ phase: 'STARTED' }), NOW)).toMatchObject({ kind: 'stale', why: expect.stringMatching(/frozen/) });
  });
  it('a candidate that is not eligible is never current: identity, side/price mismatch, research-only authority on an actionable', () => {
    expect(standingOf(opp({ orientation: 'MISMATCH' }), NOW).kind).toBe('stale');
    expect(standingOf(opp({ what: { side: 'YES' }, price: { side: 'NO' } }), NOW).kind).toBe('stale');
    expect(standingOf(opp({ status: 'ACTIONABLE', authority: 'RESEARCH_ONLY' }), NOW).kind).toBe('stale');
  });
  it('a watch whose quote has gone stale, or whose game started, is no longer current', () => {
    expect(standingOf(opp({ status: 'WATCH', price: { observedAt: iso(60) } }), NOW).kind).toBe('stale');
    expect(standingOf(opp({ status: 'WATCH', phase: 'STARTED' }), NOW).kind).toBe('stale');
  });
});

describe('the feed uses the app’s own ranking and grouping, not its own', () => {
  const list = [
    o('r1', { rank: rank(3, { evPerContract: 0.01 }), group: 'g1', marketId: 'm1' }),
    o('a1', { status: 'ACTIONABLE', authority: 'PUBLISHED_PLAYABLE', rank: rank(1), group: 'g2', marketId: 'm2', eventId: 'e2' }),
    o('r2', { rank: rank(3, { evPerContract: 0.09 }), group: 'g3', marketId: 'm3', eventId: 'e3' }),
    o('rel', { rank: rank(3, { evPerContract: 0.001 }), group: 'g1', marketId: 'm1b' }),
  ];
  it('the current groups are exactly featureOpportunities over the current set', () => {
    const feed = buildFeed(list, NOW, { sport: null, game: null, status: null });
    expect(feed.current.map((x) => x.lead.id)).toEqual(featureOpportunities(list).map((x) => x.lead.id));
    expect(feed.current.map((x) => x.lead.id)).toEqual(['a1', 'r2', 'r1']);
    expect(feed.current.find((x) => x.lead.id === 'r1')!.related.map((r) => r.id)).toEqual(['rel']);
  });
  it('passes keep compareOpportunities order and carry the publication’s reason', () => {
    const passes = [o('p1', { status: 'PASS', statusReason: 'A', rank: rank(5, { kickoff: '2026-10-05T19:00:00Z' }) }), o('p2', { status: 'PASS', statusReason: 'B', rank: rank(5, { kickoff: '2026-10-05T17:00:00Z' }) })];
    const feed = buildFeed(passes, NOW, { sport: null, game: null, status: null });
    expect(feed.passed.map((x) => x.o.id)).toEqual([...passes].sort(compareOpportunities).map((x) => x.id));
    expect(feed.passed.map((x) => x.why)).toEqual(feed.passed.map((x) => x.o.statusReason));
    expect(feed.current).toEqual([]);
  });
  it('opposed expressions are flagged by the app’s own rule: opposite outcomes on one thesis group', () => {
    const a = o('a', { group: 'g', ticker: 'TA', outcome: { winner: 'ATL' }, rank: rank(3, { evPerContract: 0.1 }) });
    const b = o('b', { group: 'g', ticker: 'TB', outcome: { winner: 'NO' }, rank: rank(3, { evPerContract: 0.05 }), marketId: 'mb' });
    const f = buildFeed([a, b], NOW, { sport: null, game: null, status: null }).current[0];
    expect(f.lead.id).toBe('a');
    expect(f.opposed).toEqual(['b']);
  });
  it('the two sides of one contract are opposed expressions of the same thesis', () => {
    const y = o('y', { group: 'g', rank: rank(3, { evPerContract: 0.1 }) });
    const n = o('n', { group: 'g', what: { side: 'NO' }, price: { side: 'NO' }, rank: rank(3, { evPerContract: 0.05 }) });
    const f = buildFeed([y, n], NOW, { sport: null, game: null, status: null }).current[0];
    expect(f.opposed).toEqual(['n']);
  });
  it('counts are taken before the status filter; the filter only chooses what is listed', () => {
    const mixed = [opp({ id: 'c' }), opp({ id: 'p', status: 'PASS', statusReason: 'no' }), opp({ id: 'w', status: 'WATCH' })];
    const all = buildFeed(mixed, NOW, { sport: null, game: null, status: null });
    const only = buildFeed(mixed, NOW, { sport: null, game: null, status: 'passed' });
    expect(only.counts).toEqual(all.counts);
    expect(all.counts).toEqual({ current: 1, watch: 1, passed: 1, stale: 0 });
    expect(only.current).toEqual([]);
    expect(only.passed).toHaveLength(1);
  });
  it('sport and game filters narrow before grouping', () => {
    const mixed = [opp({ id: 'n', slug: 'nfl', eventId: 'e1' }), opp({ id: 'h', slug: 'nhl', sport: 'NHL', eventId: 'e2', marketId: 'x' })];
    expect(buildFeed(mixed, NOW, { sport: 'nhl', game: null, status: null }).current.map((x) => x.lead.id)).toEqual(['h']);
    expect(buildFeed(mixed, NOW, { sport: null, game: 'e1', status: null }).current.map((x) => x.lead.id)).toEqual(['n']);
    expect(gameOptions(mixed, 'nhl').map((g) => g.eventId)).toEqual(['e2']);
  });
});

describe('addresses carry sport, game, status and the exact contract and side', () => {
  it('round-trips', () => {
    const href = signalsHref({ sport: 'nfl', game: 'evt 1', status: 'passed', market: MARKET, side: 'NO' });
    expect(href).toBe(`/v4/signals?sport=nfl&game=evt+1&status=passed&market=${MARKET}&side=NO`);
    expect(parseFilter(new URLSearchParams(href.split('?')[1]))).toEqual({ sport: 'nfl', game: 'evt 1', status: 'passed', market: MARKET, side: 'NO' });
  });
  it('a side without a market is dropped, junk is ignored', () => {
    expect(signalsHref({ side: 'YES' })).toBe('/v4/signals');
    expect(parseFilter(new URLSearchParams('status=bogus&side=maybe'))).toEqual({ sport: null, game: null, status: null, market: null, side: null });
    expect(signalsHref()).toBe('/v4/signals');
  });
  it('focus is the exact market and side; the other side is reported, never returned as a match', () => {
    const yes = opp({ id: 'y' });
    expect(focusOf([yes], MARKET, 'YES')).toEqual({ exact: yes, other: null });
    expect(focusOf([yes], MARKET, 'NO')).toEqual({ exact: null, other: yes });
    expect(focusOf([yes], 'mkt_other', 'YES')).toEqual({ exact: null, other: null });
    expect(focusOf([yes], null, null)).toEqual({ exact: null, other: null });
  });
});

describe('what each sport published', () => {
  const bundle = (code: string, slug: string, error: string | null = null) => ({ sport: { code, slug, label: code }, board: [], recommendations: null, theses: null, signals: null, modelState: null, marketCaptureAt: null, error });
  const verdict = (slug: string, over: object = {}) => ({ sport: 'X', slug, label: slug, games: 3, opportunities: 0, passes: 0, passReason: 'The NFL publication recommends nothing this week.', modelState: null, marketCaptureAt: null, loaded: true, error: null, ...over });
  it('an unreadable publication is "unavailable"; a readable one with nothing live carries its verdict; one with signals counts them', () => {
    const rows = coverage(
      [bundle('NFL', 'nfl'), bundle('NHL', 'nhl', 'Failed to fetch'), bundle('MLB', 'mlb')] as never,
      [verdict('nfl'), verdict('nhl', { loaded: false, error: 'Failed to fetch' }), verdict('mlb')] as never,
      [opp({ id: 'm', slug: 'mlb', sport: 'MLB' })], NOW);
    expect(rows.map((r) => [r.slug, r.state])).toEqual([['nfl', 'verdict'], ['nhl', 'unavailable'], ['mlb', 'signals']]);
    expect(rows[0].note).toBe('The NFL publication recommends nothing this week.');
    expect(rows[1].note).toBe('Failed to fetch');
    expect(rows[2].counts.current).toBe(1);
  });
  it('a sport whose only rows are passes is a verdict, not "signals"', () => {
    const rows = coverage([bundle('NFL', 'nfl')] as never, [verdict('nfl')] as never, [opp({ status: 'PASS', statusReason: 'x' })], NOW);
    expect(rows[0].state).toBe('verdict');
    expect(rows[0].counts.passed).toBe(1);
  });
});
