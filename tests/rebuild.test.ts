// The 2026-10-10 rebuild's rules: destinations, decision words, the board's grouping and "what changed since saved",
// the slate rules behind Home and Games, discoveries (significance vs evidence), NHL thesis words, model evidence
// verdicts and NFL week arithmetic. Each rule is checked on its own; none of this shows a predictive edge.
import { describe, expect, it } from 'vitest';
import type { BoardItem, MetricDef } from '../src/contract/types';
import { destinationOf } from '../src/lib/destinations';
import { decisionOf } from '../src/lib/decision';
import { boardGroups, eventIdOf, gameChanges, groupOf, marketChange } from '../src/board/model';
import type { TrayItem } from '../src/packet/tray';
import { featuredGame, gameRows, inDay, phaseWord, slateOrder, type GameRow } from '../src/views/broadcast/games';
import { buildDiscoveries, freshnessDiscoveries, marketDiscovery } from '../src/intelligence/discoveries';
import { nhlThesisWords } from '../src/opportunity/sources';
import { readers, verdictOf } from '../src/intelligence/evidence';
import { sportByCode } from '../src/data/sports';
import { weekAnchor, weekOf } from '../src/views/explore/SeasonView';
import type { Opportunity, SportVerdict } from '../src/opportunity/types';
import type { LiveQuote } from '../src/live/types';

describe('destinations', () => {
  it('maps every screen to the one destination its tab lights', () => {
    expect(destinationOf('/')).toBe('home');
    expect(destinationOf('/games')).toBe('games');
    expect(destinationOf('/nfl')).toBe('games');
    expect(destinationOf('/nfl/game/evt_1')).toBe('games');
    expect(destinationOf('/nfl/market/m1')).toBe('games');
    expect(destinationOf('/explore')).toBe('explore');
    expect(destinationOf('/nfl/player/p1')).toBe('explore');
    expect(destinationOf('/nfl/season')).toBe('explore');
    expect(destinationOf('/nfl/props')).toBe('explore');
    expect(destinationOf('/intelligence')).toBe('intelligence');
    expect(destinationOf('/intelligence/pulse')).toBe('intelligence');
    expect(destinationOf('/nhl/scorecard')).toBe('intelligence');
    expect(destinationOf('/board')).toBe('board');
    expect(destinationOf('/packet')).toBe('board');
    expect(destinationOf('/settings')).toBeNull();
  });
});

describe('decision words', () => {
  it('say Back only when the publication permits a bet, and never Fade', () => {
    expect(decisionOf('ACTIONABLE').word).toBe('Back');
    expect(decisionOf('PASS').word).toBe('No Edge');
    expect(decisionOf('WATCH').word).toBe('Watch');
    expect(decisionOf('RESEARCH_CANDIDATE', 'RESEARCH').word).toBe('Watch');
    // A model the market beats on its own settled record is a disagreement, not evidence of an edge.
    expect(decisionOf('RESEARCH_CANDIDATE', 'MARKET_BEATS_MODEL').word).toBe('No Edge');
    for (const s of ['ACTIONABLE', 'PASS', 'WATCH', 'RESEARCH_CANDIDATE'] as const) expect(decisionOf(s).word).not.toBe('Fade');
  });
});

const item = (over: Partial<TrayItem>): TrayItem => ({ item_id: Math.random().toString(36).slice(2), ref_kind: 'MARKET', sport: 'NFL', id: 'mkt_kalshi_X', extra: null, note: null, added_at: '2026-10-10T00:00:00Z', ...over });
const board = (over: Partial<BoardItem> = {}): BoardItem => ({
  event_id: 'evt_a', league: 'NFL', competition: null, status: 'SCHEDULED', start_time_utc: '2026-10-11T17:00:00Z', home_participant: 'h', away_participant: 'a',
  participants: [{ participant_id: 'h', display_name: 'Buffalo Bills', short_name: 'BUF', participant_type: 'TEAM' }, { participant_id: 'a', display_name: 'Miami Dolphins', short_name: 'MIA', participant_type: 'TEAM' }],
  data_freshness: 'FRESH' as never, health_flags: [], detail_path: '', market_captured_at: null, model_generated_at: '2026-10-10T06:00:00Z', markets_available: 10, markets_priced: 0, recommendations_count: 0, wagers_count: 0, ...over,
});
const quote = (ticker: string, yesAsk: number | null): LiveQuote => ({ ticker, eventTicker: null, seriesTicker: null, yesBid: null, yesAsk, noBid: null, noAsk: null, lastPrice: null, volume: null, openInterest: null, availability: 'OPEN' as never, rawStatus: null, closeTime: null, observedAt: '2026-10-10T07:00:00Z', source: 'test', title: null, yesSubTitle: null, strike: null });

describe('My Board', () => {
  it('finds each item’s game from its reference, its market’s event or its address', () => {
    expect(eventIdOf(item({ ref_kind: 'EVENT', id: 'evt_x' }), undefined)).toBe('evt_x');
    expect(eventIdOf(item({ extra: { event_id: 'evt_y', market_id: 'm', metric_id: null, series_id: null, x: null } }), undefined)).toBe('evt_y');
    expect(eventIdOf(item({ ref_kind: 'METRIC' }), { label: 'x', href: '/nfl/game/evt_z?tab=matchups' })).toBe('evt_z');
    expect(eventIdOf(item({ ref_kind: 'TEAM' }), { label: 'x', href: '/nfl/team/prt_1' })).toBeNull();
  });

  it('groups by game with the publication’s matchup title, soonest game first', () => {
    const items = [item({ ref_kind: 'PLAYER', id: 'p1', extra: { event_id: 'evt_a', market_id: null, metric_id: null, series_id: null, x: null } }), item({ ref_kind: 'EVENT', id: 'evt_a' }), item({ ref_kind: 'TEAM', id: 't1' })];
    const gs = boardGroups(items, {}, new Map([['evt_a', board()]]), Date.parse('2026-10-10T08:00:00Z'));
    expect(gs[0].title).toBe('MIA @ BUF');
    expect(gs[0].entries.map((e) => e.group)).toEqual(['thesis', 'players']);
    expect(gs[1].eventId).toBeNull();
    expect(groupOf(item({ ref_kind: 'METRIC' }), { label: 'x', href: '', finding: 'script' })).toBe('scripts');
  });

  it('compares a saved market only with the same contract, and says when there is nothing to compare', () => {
    const snap = { ticker: 'KX-1', yesAsk: 0.41, yesBid: 0.39, noAsk: 0.61, noBid: 0.59, observedAt: '2026-10-10T06:00:00Z', source: 'test' };
    expect(marketChange(snap, quote('KX-1', 0.47))!.text).toMatch(/up 6¢ since saved: 41¢ → 47¢/);
    expect(marketChange(snap, quote('KX-1', 0.47))!.reassess).toBe(true);
    expect(marketChange(snap, quote('KX-1', 0.42))!.text).toMatch(/unchanged/);
    // A different contract (another threshold) is never read as a price move.
    expect(marketChange(snap, quote('KX-2', 0.9))).toBeNull();
    expect(marketChange({ ...snap, yesAsk: null }, quote('KX-1', 0.5))!.kind).toBe('unpriced');
    expect(marketChange(snap, undefined)!.text).toMatch(/no current quote/);
  });

  it('notes a started game and a newer research run, never a recalculated edge', () => {
    const now = Date.parse('2026-10-11T19:00:00Z');
    const g = boardGroups([item({ ref_kind: 'EVENT', id: 'evt_a' })], {}, new Map([['evt_a', board()]]), now)[0];
    const ch = gameChanges(g, board(), '2026-10-09T00:00:00Z').map((c) => c.text).join(' ');
    expect(ch).toMatch(/started/);
    expect(ch).toMatch(/newer research run/);
    expect(ch).not.toMatch(/edge/i);
  });
});

describe('slates', () => {
  const now = new Date(2026, 9, 10, 12, 0).getTime();
  it('keeps today a local calendar day, with games from the last three hours', () => {
    expect(inDay(new Date(2026, 9, 10, 20, 0).getTime(), now, 'today')).toBe(true);
    expect(inDay(new Date(2026, 9, 11, 1, 0).getTime(), now, 'today')).toBe(false);
    expect(inDay(new Date(2026, 9, 11, 1, 0).getTime(), now, 'tomorrow')).toBe(true);
    expect(inDay(now - 2 * 3600_000, now, 'today')).toBe(true);
  });
  it('never calls a game started hours ago without a final word "In play"', () => {
    const bundles = [{ sport: sportByCode('NFL')!, board: [board({ event_id: 'old', start_time_utc: new Date(now - 6 * 3600_000).toISOString() }), board({ event_id: 'live', start_time_utc: new Date(now - 3600_000).toISOString() }), board({ event_id: 'next', start_time_utc: new Date(now + 3600_000).toISOString() })], recommendations: null, theses: null, signals: null, modelState: null, marketCaptureAt: null, error: null }];
    const rows = gameRows(bundles, [], now).sort(slateOrder);
    expect(rows.map((r) => r.item.event_id)).toEqual(['live', 'next', 'old']);
    expect(phaseWord(rows[0])).toBe('In play');
    expect(phaseWord(rows[2])).toBe('Awaiting result');
  });
  it('features only an upcoming game', () => {
    const r = (id: string, t: number, sport = 'NFL'): GameRow => ({ ...gameRows([{ sport: sportByCode(sport)!, board: [board({ event_id: id, start_time_utc: new Date(t).toISOString() })], recommendations: null, theses: null, signals: null, modelState: null, marketCaptureAt: null, error: null }], [], now)[0] });
    expect(featuredGame([r('past', now - 3600_000)], now)).toBeNull();
    expect(featuredGame([r('past', now - 3600_000), r('soon', now + 3600_000)], now)!.item.event_id).toBe('soon');
  });
});

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  id: 'o1', sport: 'TENNIS', slug: 'tennis', eventId: 'e1', eventLabel: 'A v B', competition: null, startTime: '2026-10-10T12:00:00Z', marketId: 'm1', ticker: 'T1', family: 'match_winner',
  what: { title: 'A to win', side: 'YES', subject: 'A' }, why: 'Model fair 60%', evidence: [], risk: 'Market beats the model on settled rows', alternatives: [],
  price: { side: 'YES', ask: 0.4, bid: 0.38, observedAt: null, source: 'publication', fair: 0.6, fairLow: null, fairHigh: null, fee: 0.02, feeSource: 'kalshi-schedule', breakEven: 0.42, evPerContract: 0.18, evSource: 'derived', betUpTo: null, availableSize: null, expiresAt: null, state: 'CURRENT' },
  confidence: { calibration: 'MARKET_BEATS_MODEL', note: '', inputs: {}, support: null, supportNote: null, edgeShare: null },
  status: 'RESEARCH_CANDIDATE', authority: 'RESEARCH_ONLY', statusReason: '', phase: 'PREGAME', reprice: { side: 'YES', fair: 0.6 }, group: null, orientation: { state: 'OK' } as never, href: '/tennis/market/m1', gameHref: '/tennis/game/e1',
  rank: { tier: 4, tierWord: 'Model disagreement', worstCaseEdge: null, evPerContract: 0.18, edgeShare: null, priceCurrent: true, highVariance: false, kickoff: '2026-10-10T12:00:00Z' }, ...over,
});

describe('discoveries', () => {
  it('rate significance and betting evidence separately: a large model gap the market beats is No Edge', () => {
    const d = marketDiscovery(opp());
    expect(d.evidence!.word).toBe('No Edge');
    expect(d.significance).toBe('low');
  });
  it('flag a stale market capture and an unreadable publication', () => {
    const now = Date.parse('2026-10-10T08:00:00Z');
    const v = (over: Partial<SportVerdict>): SportVerdict => ({ sport: 'MLB', slug: 'mlb', label: 'MLB', games: 3, opportunities: 0, passes: 0, passReason: null, modelState: null, marketCaptureAt: '2026-10-09T00:00:00Z', loaded: true, error: null, ...over });
    const ds = freshnessDiscoveries([v({}), v({ slug: 'nba', label: 'NBA', error: 'HTTP 404' }), v({ slug: 'nhl', label: 'NHL', marketCaptureAt: '2026-10-10T07:50:00Z' })], now);
    expect(ds.map((d) => d.slug)).toEqual(['mlb', 'nba']);
    expect(ds[0].title).toMatch(/^MLB market capture is 1d old$/);
    expect(buildDiscoveries({ opportunities: [opp()], verdicts: [], research: [], now }).length).toBe(1);
  });
});

describe('NHL thesis words', () => {
  it('turn publication keys into plain words, never raw tokens', () => {
    expect(nhlThesisWords('TOR:WINS_BY_2PLUS')).toBe('TOR wins by 2+ goals');
    expect(nhlThesisWords('MTL:OFFENSE_4PLUS')).toBe('MTL scores 4+ goals');
    expect(nhlThesisWords('GAME:LOW_EVENT')).toBe('a low-event game (few chances and goals)');
    expect(nhlThesisWords('GAME:TIGHT')).toBe('a tight, one-goal game');
    expect(nhlThesisWords(null)).toBe('');
    expect(nhlThesisWords('VAN:SOMETHING_NEW')).not.toMatch(/_/);
  });
});

describe('model evidence', () => {
  it('names the market when its published score is lower', () => {
    expect(verdictOf({ label: 'x', metric: 'Brier', model: 0.2145, market: 0.1865, n: 35448, leader: 'market' }, [])).toMatch(/market has been the better forecaster/);
    expect(verdictOf(null, [])).toMatch(/No like-for-like/);
  });
  it('reads the tennis settled scorecard and the NHL per-family record from the metric registry only', () => {
    const def = (id: string, extensions: unknown): MetricDef => ({ metric_id: id, extensions, known_limitations: ['research only'] } as unknown as MetricDef);
    const t = readers.tennis(sportByCode('TENNIS')!, new Map([['met_tennis.settled_brier_score', def('met_tennis.settled_brier_score', { scorecard: { generated_at: '2026-10-10T06:18:42Z', forecasters: { model_fair: { brier: 0.2145, n: 35448, cal_slope: 0.781 }, market_mid_at_decision: { brier: 0.1865, n: 35448, cal_slope: 1.072 } }, strict_executable_clv: { mean: -0.048, n: 2705 } } })]]));
    expect(t.headline).toMatchObject({ model: 0.2145, market: 0.1865, leader: 'market', n: 35448 });
    expect(t.clv!.mean).toBe(-0.048);
    const n = readers.nhl(sportByCode('NHL')!, new Map([['met_nhl.calibration_v1', def('met_nhl.calibration_v1', { evaluated_at_utc: '2026-10-10T06:36:58Z', overall: { DATA_ONLY_V1: { brier: 0.1674, n: 36525, calibration: [] } }, by_family: { game_total: { v1_brier: 0.1272, market_brier_same_rows: 0.1248, v1_n: 13149 }, first_goal: { v1_n: 0, market_brier: 0.04 } } })]]));
    expect(n.families.map((f) => f.label)).toEqual(['Game total']);
    expect(n.headline!.leader).toBe('market');
  });
});

describe('NFL weeks', () => {
  it('run Tuesday to Monday from the first game’s week, Monday night staying in its week', () => {
    const a = weekAnchor('2026-09-11T00:20:00Z'); // Thursday-night opener (UTC Friday)
    expect(weekOf('2026-09-13T17:00:00Z', a)).toBe(1);
    expect(weekOf('2026-09-15T00:15:00Z', a)).toBe(1); // Monday night, after midnight UTC
    expect(weekOf('2026-09-20T17:00:00Z', a)).toBe(2);
    expect(weekOf('2026-10-13T00:15:00Z', a)).toBe(5);
  });
});
