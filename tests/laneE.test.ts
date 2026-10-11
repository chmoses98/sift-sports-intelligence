// Lane E (2026-10-11 repair sprint): the league schedule's results and spread arithmetic, the game card's facts,
// Home's rail grouping, the Research Lab's tool categories and the discoveries' plain conclusions and leads. Each rule
// is checked on published data or a minimal row; nothing here shows a predictive edge.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BoardItem, EventResearchDoc } from '../src/contract/types';
import { atsOf, atsRecordsFrom, currentLeagueWeek, findLeagueGame, FULL_REG_SEASON, leagueWeekCells, recordsFrom, resultLine, totalResultOf, type LeagueGame, type LeagueScheduleDoc } from '../src/history/league';
import { cardFacts, edgeOf, lineText, marketRead, modelRead, sideRanks } from '../src/views/broadcast/cardFacts';
import { gameRows, RAIL_CAP, railGroups } from '../src/views/broadcast/games';
import { LAB_TOOLS, labHref, PROPS_ROUTE } from '../src/views/explore/labTools';
import { weekSummary } from '../src/views/explore/SeasonWeek';
import { marketDiscovery, mismatchDiscovery } from '../src/intelligence/discoveries';
import { matchupInsights } from '../src/insights/matchups';
import { sportByCode } from '../src/data/sports';
import { betPhrase } from '../src/lib/betWords';
import type { Opportunity } from '../src/opportunity/types';

const ROOT = join(__dirname, '..');
const schedule = JSON.parse(readFileSync(join(ROOT, 'public/data/league/nfl/schedule.json'), 'utf-8')) as LeagueScheduleDoc;
const neBuf = JSON.parse(readFileSync(join(ROOT, 'public/data/nfl/app/latest/explorer/events/evt_0cb333291f580a201a70.json'), 'utf-8')) as EventResearchDoc;

const lg = (over: Partial<LeagueGame>): LeagueGame => ({ id: 'g', week: 1, type: 'REG', date: '2026-09-13', time_et: '13:00', away: 'AAA', home: 'HHH', neutral: false, away_score: null, home_score: null, overtime: null, spread_line: null, total_line: null, ...over });

describe('league schedule: the published file', () => {
  it('lists a complete regular season, and writes closing lines only for final games', () => {
    expect(schedule.kind).toBe('sift_league_schedule');
    expect(schedule.games.filter((g) => g.type === 'REG').length).toBe(FULL_REG_SEASON);
    for (const g of schedule.games) {
      const final = g.home_score != null && g.away_score != null;
      if (!final) {
        expect(g.spread_line).toBeNull();
        expect(g.total_line).toBeNull();
      }
    }
  });
});

describe('against the spread (published final vs published closing spread)', () => {
  it('reads nflverse’s sign: positive = home favoured', () => {
    // 2026 week 4, NE 29 @ BUF 26, BUF −7 closing: the favourite lost outright, so it did not cover.
    const g = schedule.games.find((x) => x.id === '2026_04_NE_BUF')!;
    const a = atsOf(g)!;
    expect(a.favourite).toBe('BUF');
    expect(a.line).toBe(7);
    expect(a.cover).toBe('not_covered');
    expect(a.atsWinner).toBe('NE');
    expect(a.text).toBe('BUF −7 · did not cover');
    expect(resultLine(g)).toBe('NE won 29–26');
  });
  it('covers, pushes and pick’ems', () => {
    expect(atsOf(lg({ home_score: 24, away_score: 17, spread_line: 3.5 }))!.cover).toBe('covered');
    expect(atsOf(lg({ home_score: 20, away_score: 17, spread_line: 3 }))!.cover).toBe('push');
    expect(atsOf(lg({ home_score: 17, away_score: 30, spread_line: -10 }))).toMatchObject({ favourite: 'AAA', cover: 'covered', text: 'AAA −10 · covered' });
    expect(atsOf(lg({ home_score: 17, away_score: 20, spread_line: 0 }))).toMatchObject({ favourite: null, cover: null, text: 'Pick’em' });
  });
  it('never estimates: no final or no closing spread means no result', () => {
    expect(atsOf(lg({ spread_line: -3 }))).toBeNull();
    expect(atsOf(lg({ home_score: 20, away_score: 10 }))).toBeNull();
    expect(totalResultOf(lg({ home_score: 20, away_score: 10 }))).toBeNull();
    expect(totalResultOf(lg({ home_score: 30, away_score: 20, total_line: 49.5 }))).toEqual({ line: 49.5, points: 50, result: 'over' });
  });
});

describe('records', () => {
  const games = [lg({ id: '1', date: '2026-09-13', home_score: 20, away_score: 10, spread_line: 3 }), lg({ id: '2', date: '2026-09-20', home_score: 10, away_score: 10, spread_line: -1 }), lg({ id: '3', date: '2026-09-27' })];
  it('count published finals only, and only before the given date', () => {
    expect(recordsFrom(games).get('HHH')!.text).toBe('1–0–1');
    expect(recordsFrom(games).get('AAA')!.text).toBe('0–1–1');
    expect(recordsFrom(games, '2026-09-20').get('HHH')!.text).toBe('1–0');
  });
  it('against the spread too (a tie at a −1 line is a cover for the underdog)', () => {
    const r = atsRecordsFrom(games);
    expect(r.get('HHH')!.text).toBe('2–0');
    expect(r.get('AAA')!.text).toBe('0–2');
  });
});

describe('weeks', () => {
  it('a bye only on a complete schedule; the current week is the first with an open game', () => {
    const cells = leagueWeekCells(schedule.games, 'ARI');
    expect(cells.filter((c) => c.kind === 'game')).toHaveLength(17);
    expect(cells.filter((c) => c.kind === 'bye')).toHaveLength(1);
    const partial = leagueWeekCells(schedule.games.slice(0, 100), 'ARI');
    expect(partial.some((c) => c.kind === 'bye')).toBe(false);
    expect(currentLeagueWeek(schedule.games, '2026-10-11')).toBe(5);
  });
  it('matches a published game by teams and date, never by teams alone', () => {
    expect(findLeagueGame(schedule.games, 'NE', 'BUF', '2026-10-04T17:00:00Z')!.id).toBe('2026_04_NE_BUF');
    expect(findLeagueGame(schedule.games, 'NE', 'BUF', '2026-11-29T17:00:00Z')?.id ?? null).not.toBe('2026_04_NE_BUF');
  });
  it('summarises a week’s finals as counts', () => {
    const s = weekSummary(schedule.games.filter((g) => g.week === 1))!;
    expect(s.finals).toBe(16);
    expect(s.favCovered).toBeLessThanOrEqual(s.favGames);
  });
});

describe('game card facts', () => {
  it('reads the opponent-adjusted ranks direction-aware from the game’s research', () => {
    expect(sideRanks(neBuf, 'BUF')).toEqual({ off: { rank: 1, of: 32 }, def: { rank: 19, of: 32 } });
    expect(sideRanks(neBuf, 'NE')).toEqual({ off: { rank: 16, of: 32 }, def: { rank: 4, of: 32 } });
    expect(sideRanks(neBuf, 'KC')).toEqual({ off: null, def: null });
  });
  it('labels the model read and the market read from published fields', () => {
    expect(modelRead('NFL', neBuf, 'NE', 'BUF')!.text).toBe('NE 22–29 BUF');
    expect(modelRead('NFL', neBuf, 'NE', 'BUF')!.title).toMatch(/Research model/);
    expect(marketRead(neBuf, 'NE', 'BUF')!.text).toMatch(/^BUF −7 · O\/U /);
    expect(modelRead('SOCCER', neBuf, 'NE', 'BUF')).toBeNull();
    expect(lineText(-0.2, 'A', 'H')).toBe('Pick’em');
    expect(lineText(3.24, 'A', 'H')).toBe('A −3');
  });
  it('a final shows the result against the closing spread and no pregame read', () => {
    const g = schedule.games.find((x) => x.id === '2026_04_NE_BUF')!;
    const f = cardFacts({ sport: 'NFL', away: 'NE', home: 'BUF', research: neBuf, league: g, records: recordsFrom(schedule.games, g.date) });
    expect(f.final!.line).toBe('NE won 29–26');
    expect(f.final!.ats!.text).toBe('BUF −7 · did not cover');
    expect(f.away.score).toBe(29);
    expect(f.away.won).toBe(true);
    expect(f.model).toBeNull();
    expect(f.market).toBeNull();
    expect(f.edge).toBeNull();
    expect(f.home.record).toMatch(/^\d–\d$/);
  });
});

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  id: 'o1', sport: 'NHL', slug: 'nhl', eventId: 'e1', eventLabel: 'A @ B', competition: null, startTime: '2026-10-11T23:00:00Z', marketId: 'm1', ticker: 'T1', family: 'game_spread',
  what: { title: 'Washington wins by over 1.5 goals', side: 'NO', subject: null }, why: '', evidence: [], risk: null, alternatives: [],
  price: { side: 'NO', ask: 0.57, bid: null, observedAt: null, source: 'publication', fair: 0.61, fairLow: null, fairHigh: null, fee: 0.02, feeSource: 'kalshi-schedule', breakEven: 0.59, evPerContract: 0.02, evSource: 'derived', betUpTo: 0.59, availableSize: null, expiresAt: null, state: 'CURRENT' },
  confidence: { calibration: 'RESEARCH', note: '', inputs: {}, support: null, supportNote: null, edgeShare: null },
  status: 'RESEARCH_CANDIDATE', authority: 'RESEARCH_ONLY', statusReason: '', phase: 'PREGAME', reprice: { side: 'NO', fair: 0.61 } as never, group: null, orientation: { state: 'OK' } as never, href: '/nhl/market/m1', gameHref: '/nhl/game/e1',
  rank: { tier: 3, tierWord: 'Research candidate', worstCaseEdge: null, evPerContract: 0.02, edgeShare: null, priceCurrent: true, highVariance: false, kickoff: '2026-10-11T23:00:00Z' }, ...over,
});

describe('the validated-market indicator', () => {
  it('Back only for an ACTIONABLE row; a tier 2–3 research candidate with its tier word; else No edge', () => {
    expect(edgeOf([opp({ status: 'ACTIONABLE', rank: { ...opp().rank, tier: 1, tierWord: 'Actionable' } })])).toMatchObject({ tone: 'back', word: 'Back' });
    expect(edgeOf([opp()])).toMatchObject({ tone: 'research', word: 'Research candidate', text: betPhrase('NO', 'Washington wins by over 1.5 goals').text });
    expect(edgeOf([opp({ confidence: { ...opp().confidence, calibration: 'MARKET_BEATS_MODEL' }, rank: { ...opp().rank, tier: 4, tierWord: 'Model disagreement' } })])).toMatchObject({ tone: 'noedge', word: 'No edge' });
    expect(edgeOf([opp({ status: 'PASS', rank: { ...opp().rank, tier: 5, tierWord: 'Pass' } })])).toMatchObject({ word: 'No edge' });
    expect(edgeOf([opp({ status: 'WATCH', rank: { ...opp().rank, tier: 4, tierWord: 'Watch' } })])).toBeNull();
    expect(edgeOf([])).toBeNull();
  });
});

const board = (id: string, start: string, over: Partial<BoardItem> = {}): BoardItem => ({
  event_id: id, league: null, competition: null, status: 'SCHEDULED', start_time_utc: start, home_participant: 'h', away_participant: 'a',
  participants: [{ participant_id: 'h', display_name: 'Home', short_name: 'HOM', participant_type: 'TEAM' }, { participant_id: 'a', display_name: 'Away', short_name: 'AWY', participant_type: 'TEAM' }],
  data_freshness: 'FRESH' as never, health_flags: [], detail_path: '', market_captured_at: null, model_generated_at: null, markets_available: 2, markets_priced: 0, recommendations_count: 0, wagers_count: 0, ...over,
});

describe('Home’s rail', () => {
  const now = Date.parse('2026-10-11T12:00:00Z');
  const bundle = (code: string, n: number) => ({ sport: sportByCode(code)!, board: Array.from({ length: n }, (_, i) => board(`${code}${i}`, new Date(now + (i + 1) * 600_000).toISOString())), recommendations: null, theses: null, signals: null, modelState: null, marketCaptureAt: null, error: null });
  it('puts the richest-research sports first and caps a deep tennis slate behind a "more" tile', () => {
    const rows = gameRows([bundle('TENNIS', 198), bundle('NFL', 12), bundle('SOCCER', 30)], [], now);
    const gs = railGroups(rows);
    expect(gs.map((x) => x.sport)).toEqual(['NFL', 'SOCCER', 'TENNIS']);
    expect(gs[0].games).toHaveLength(12);
    expect(gs[2].games).toHaveLength(RAIL_CAP.TENNIS);
    expect(gs[2].total).toBe(198);
  });
  it('keeps a game its publication flags inside the cap, and a sport filter shows everything', () => {
    const rows = gameRows([bundle('TENNIS', 20)], [opp({ sport: 'TENNIS', slug: 'tennis', eventId: 'TENNIS19' })], now);
    expect(railGroups(rows)[0].games.map((g) => g.item.event_id)).toContain('TENNIS19');
    expect(railGroups(rows, 'tennis')[0].games).toHaveLength(20);
  });
});

describe('Research Lab', () => {
  it('names the seven tool categories, Props on the top-level explorer', () => {
    expect(LAB_TOOLS.map((t) => t.title)).toEqual(['Teams', 'Players', 'Props', 'Matchup compare', 'Season', 'Stats & rankings', 'Model Pulse']);
    expect(labHref('props')).toBe(PROPS_ROUTE);
    expect(labHref('teams', 'nhl')).toBe('/explore?sport=nhl&tool=teams');
    expect(labHref('season', 'nfl')).toBe('/nfl/season');
  });
});

describe('discoveries lead somewhere', () => {
  it('a mismatch explains itself and leads to the matchup, the stat, the players and the scripts', () => {
    const ins = matchupInsights(neBuf)[0];
    const d = mismatchDiscovery(ins, neBuf, 'nfl');
    expect(d.meaning).toMatch(/not a priced edge/);
    expect(d.leads.map((l) => l.kind)).toEqual(['game', 'stat', 'player', 'script']);
    expect(d.leads[0].href).toContain('tab=matchup');
    expect(d.href).toContain('tab=matchup');
    expect(d.leads.find((l) => l.kind === 'stat')!.href).toContain(`/nfl/metric/${ins.offense.metricId}`);
  });
  it('a market finding never reads stronger than its decision word', () => {
    const d = marketDiscovery(opp());
    expect(d.meaning).toMatch(/not validated for betting/);
    expect(d.leads[0]).toMatchObject({ kind: 'market', href: '/nhl/market/m1' });
    const mb = marketDiscovery(opp({ confidence: { ...opp().confidence, calibration: 'MARKET_BEATS_MODEL' } }));
    expect(mb.meaning).toMatch(/disagreement, not an edge/);
  });
});
