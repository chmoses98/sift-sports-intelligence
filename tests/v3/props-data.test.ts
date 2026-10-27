// Prop Discovery's data layer against REAL published documents (trimmed copies in tests/v3/fixtures/props, captured 2026-10-26):
// the contract ladders of a football, a hockey and a baseball game, the football roster and history index, the hockey player log, the
// opponent rankings and the football projection feed.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { EventDetailDoc, ExplorerIndexDoc, Market, RankingDoc } from '../../src/contract/types';
import { readBoxLog } from '../../src/history/boxLog';
import type { PlayerHistoryDoc } from '../../src/history/types';
import { decodeProjections } from '../../src/lib/projections';
import { makeAuthority } from '../../src/lib/projectionAuthority';
import { hitCount, hitsAt, recentValues, type PlayerLog } from '../../src/v3/data/props/history';
import { modelLaneFor, modelPercent, sportHasApprovedModel } from '../../src/v3/data/props/model';
import { featuredRung, parseGameProps, rungOf, sidelinedByName, statOf, subjectOf, teamFromTicker, type GameCtx, type IdentityHints } from '../../src/v3/data/props/parse';
import { matchupOf, pickWindow, rankMap, trackPct } from '../../src/v3/data/props/rank';
import type { Prop, Universe } from '../../src/v3/data/props/types';
import { summarize } from '../../src/v3/data/props/load';
import type { V3Team } from '../../src/v3/model/types';

const load = <T,>(f: string) => JSON.parse(readFileSync(`tests/v3/fixtures/props/${f}`, 'utf8')) as T;
const loadTop = <T,>(f: string) => JSON.parse(readFileSync(`tests/v3/fixtures/${f}`, 'utf8')) as T;
const TEAM_NAMES: Record<string, [string, string]> = { DAL: ['Dallas Cowboys', 'Cowboys'], PHI: ['Philadelphia Eagles', 'Eagles'] };
const team = (slug: string, abbr: string): V3Team => ({ id: abbr, slug, sport: slug.toUpperCase(), name: TEAM_NAMES[abbr]?.[0] ?? abbr, nick: TEAM_NAMES[abbr]?.[1] ?? abbr, abbr, logo: null, colors: ['#111', '#222'] });

const nflDetail = load<EventDetailDoc>('nfl-detail.json');
const nflIndex = load<ExplorerIndexDoc>('nfl-index.json');
const nflHist = load<{ players: Record<string, { name: string; position: string; team: string }> }>('nfl-history-index.json');
const nhlDetail = load<EventDetailDoc>('nhl-detail.json');
const nhlIndex = load<ExplorerIndexDoc>('nhl-index.json');
const mlbDetail = load<EventDetailDoc>('mlb-detail.json');

const NFL_GAME: GameCtx = { slug: 'nfl', sportLabel: 'NFL', eventId: 'evt_nfl', key: 'nfl:evt_nfl', startMs: Date.parse('2026-10-27T00:15:00Z'), away: team('nfl', 'DAL'), home: team('nfl', 'PHI'), awayId: nflDetail.event.away_participant, homeId: nflDetail.event.home_participant };
const NHL_GAME: GameCtx = { slug: 'nhl', sportLabel: 'NHL', eventId: 'evt_nhl', key: 'nhl:evt_nhl', startMs: Date.parse('2026-10-27T00:30:00Z'), away: team('nhl', 'TOR'), home: team('nhl', 'CGY'), awayId: nhlDetail.event.away_participant, homeId: nhlDetail.event.home_participant };
const MLB_GAME: GameCtx = { slug: 'mlb', sportLabel: 'MLB', eventId: 'evt_mlb', key: 'mlb:evt_mlb', startMs: Date.parse('2026-10-27T00:00:00Z'), away: team('mlb', 'MIL'), home: team('mlb', 'TB'), awayId: mlbDetail.event.away_participant, homeId: mlbDetail.event.home_participant };

const codeById = (idx: ExplorerIndexDoc) => new Map(idx.teams.map((t) => [t.participant_id, t.short_name ?? '']));
function hints(idx: ExplorerIndexDoc, playerResearch: boolean, histPlayers?: typeof nflHist.players): IdentityHints {
  const codes = codeById(idx);
  const roster = new Map<string, string>();
  for (const [t, ps] of Object.entries(idx.players_by_team)) for (const p of ps) roster.set(p, codes.get(t) ?? '');
  const profiles = new Set(Object.values(idx.files).filter((f) => f.kind === 'entity_profile').map((f) => f.entity_id));
  return {
    teamOfPlayer: (pid) => roster.get(pid) ?? null,
    history: histPlayers ? (gsis) => (gsis && histPlayers[gsis] ? { team: histPlayers[gsis].team, position: histPlayers[gsis].position } : null) : undefined,
    hasPlayerPage: (pid) => playerResearch && !!pid && profiles.has(pid),
  };
}

describe('parsing a contract', () => {
  it('reads the rung a contract settles on from each publication\'s own wording', () => {
    const rec = nflDetail.markets.find((m) => m.extensions?.stat === 'receptions' && m.threshold === 7)!;
    expect(rungOf(rec)).toBe(7); // football: ">= 7"
    const pts = nhlDetail.markets.find((m) => m.market_family === 'player_points' && m.threshold === 1.5)!;
    expect(rungOf(pts)).toBe(2); // hockey: "greater than 1.5" is 2+
    const hit = mlbDetail.markets.find((m) => m.market_family === 'hitter_hits' && m.threshold === 3)!;
    expect(rungOf(hit)).toBe(3); // baseball: AT_LEAST 3
  });
  it('names the statistic and the player in the publication\'s words, and ignores what is not a player ladder', () => {
    const fp = nflDetail.markets.find((m) => /D\/ST/.test(String(m.extensions?.subject)))!;
    expect(subjectOf(fp)).toMatch(/D\/ST/);
    const spread = nflDetail.markets.find((m) => m.market_family === 'spread')!;
    expect(statOf(spread)).toBeNull();
    const first = nhlDetail.markets.find((m) => m.market_family === 'first_goal')!;
    expect(statOf(first)).toBeNull();
    expect(statOf(nhlDetail.markets.find((m) => m.market_family === 'player_goals')!)).toBe('player_goals');
  });
  it('takes the team from a ticker only as a last resort, longest code first', () => {
    expect(teamFromTicker('KXNHLPTS-26OCT26TORCGY-TORKMARCHENKO86-1', ['TOR', 'CGY'])).toBe('TOR');
    expect(teamFromTicker('KXMLBHIT-26OCT262000MILTB-TBYDIAZ2-4', ['MIL', 'TB'])).toBe('TB');
    expect(teamFromTicker('KXX-1-ZZZ-1', ['TOR'])).toBeNull();
  });
  it('picks the rung nearest a coin flip, the lower one on a tie, never one without an ask', () => {
    const r = (k: number, ask: number | null) => ({ k, ticker: `t${k}`, ask, bid: null, volume: null, capturedAt: null, source: 'Kalshi' as const });
    expect(featuredRung([r(1, 65), r(2, 25)])).toBe(1);
    expect(featuredRung([r(3, 48), r(4, 52)])).toBe(3);
    expect(featuredRung([r(1, null), r(2, 90)])).toBe(2);
  });
});

describe('football props joined to published identity', () => {
  const props = parseGameProps(NFL_GAME, nflDetail.markets, hints(nflIndex, true, nflHist.players));
  const lamb = props.find((p) => p.name === 'CeeDee Lamb' && p.stat === 'receptions')!;
  it('groups a ladder into one row per player and statistic, keyed by the ticker without its rung', () => {
    expect(lamb.id).toBe('KXNFLREC-26OCT26DALPHI-DALCLAMB88');
    expect(lamb.rungs.map((r) => r.k)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(lamb.featured).toBe(7);
    expect(new Set(props.map((p) => p.id)).size).toBe(props.length);
  });
  it('joins the published roster for team and the history layer for the log, and names the coming opponent', () => {
    expect(lamb).toMatchObject({ team: 'DAL', opp: 'PHI', histId: '00-0036358', history: { kind: 'nfl', stat: 'receptions' }, playerStat: 'receptions', playerPage: true, fam: 'receptions' });
    expect(lamb.oppUnit).toMatchObject({ metric: 'adj_def_db_epa', chip: 'pass D' });
  });
  it('leaves out team and fantasy-defense contracts and game lines', () => {
    expect(props.some((p) => /D\/ST/.test(p.name))).toBe(false);
    expect(props.some((p) => p.fam === 'field_goals')).toBe(false);
    expect(props.every((p) => p.rungs.length > 0)).toBe(true);
  });
  it('says there is no player page for a player the explorer has no profile for', () => {
    const noProfile = props.filter((p) => !p.playerPage);
    for (const p of noProfile) expect(nflIndex.files[`players/${p.playerId}.json`]).toBeUndefined();
  });
  it('flags a sidelined player without removing him (Hide out counts and reveals them)', () => {
    const out = parseGameProps(NFL_GAME, nflDetail.markets, { ...hints(nflIndex, true, nflHist.players), outOf: (name) => (name === 'CeeDee Lamb' ? 'OUT' : null) });
    expect(out.find((p) => p.name === 'CeeDee Lamb')!.out).toBe('OUT');
    expect(out.length).toBe(props.length);
  });
});

describe('hockey and baseball props', () => {
  it('turns "greater than" thresholds into counts and keeps goalie saves as a ladder', () => {
    const props = parseGameProps(NHL_GAME, nhlDetail.markets, hints(nhlIndex, true));
    const m = props.filter((p) => p.name === 'Kirill Marchenko');
    expect(m.map((p) => p.fam).sort()).toEqual(['assists', 'goals', 'points']);
    const pts = m.find((p) => p.fam === 'points')!;
    expect(pts.rungs.map((r) => r.k)).toEqual([1, 2, 3]);
    expect(pts).toMatchObject({ id: 'KXNHLPTS-26OCT26TORCGY-TORKMARCHENKO86', team: 'TOR', opp: 'CGY', histId: 'prt_781cdaaca7da77075b1c', history: { kind: 'nhl', col: 'p' }, playerStat: 'p', playerPage: true });
    expect(props.some((p) => p.fam === 'saves')).toBe(true);
  });
  it('reads sidelining from the hockey game\'s own injury rows', () => {
    const out = sidelinedByName(nhlDetail.context!.injuries as never);
    expect([...out.values()]).toContain('IR');
    expect([...sidelinedByName([{ status: 'Day-To-Day', player_name: 'A B' }, { status: 'Out', player_name: 'C D' }, { status: 'QUESTIONABLE', detail: 'E F (WR, DAL): x' }, { status: 'DOUBTFUL', detail: 'G H (WR, DAL): x' }]).entries()]).toEqual([['cd', 'OUT'], ['gh', 'DOUBTFUL']]);
  });
  it('shows baseball as price-only: no history lane, no opponent unit, team from the contract\'s own participant', () => {
    const props = parseGameProps(MLB_GAME, mlbDetail.markets, hints({ ...nhlIndex, files: {}, players_by_team: {} }, false));
    const diaz = props.find((p) => /D[ií]az/.test(p.name) && p.fam === 'hits')!;
    expect(diaz).toMatchObject({ team: 'TB', opp: 'MIL', history: null, histId: null, oppUnit: null, playerPage: false });
    expect(diaz.rungs.map((r) => r.k)).toEqual([1, 2, 3, 4]);
  });
});

describe('the History lane', () => {
  const lambDoc = load<PlayerHistoryDoc>('nfl-hist-00-0036358.json');
  const kickoff = '2026-10-27T00:15:00Z';
  it('reads the last games he played before this kickoff, oldest first, for the prop\'s own statistic', () => {
    const vals = recentValues({ kind: 'nfl', doc: lambDoc }, { kind: 'nfl', stat: 'receptions' }, kickoff);
    expect(vals.length).toBeGreaterThan(3);
    expect(vals.length).toBeLessThanOrEqual(10);
    const asDated = [...lambDoc.games.filter((g) => g.date && g.date < '2026-10-26')];
    expect(vals.at(-1)).toBe(asDated.sort((a, b) => a.week - b.week).at(-1)!.receiving.rec);
  });
  it('counts hits as games that reached the rung and never calls them a probability', () => {
    expect(hitsAt([0, 3, 7, 7, 1], 3)).toBe(3);
    expect(hitCount([0, 3, 7, 7, 1, 2, 9, 4, 4, 8, 6, 1], 4, 10)).toEqual({ h: 7, n: 10 });
    expect(hitCount([1, 2, 3, 4, 5, 6], 4, 5)).toEqual({ h: 3, n: 5 });
    expect(hitCount([], 1)).toBeNull();
  });
  it('reads hockey points from the profile\'s own game log, only games before the kickoff', () => {
    const prof = load<{ extensions: { game_log: unknown } }>('nhl-profile-marchenko.json');
    const rows = readBoxLog(prof.extensions.game_log)!;
    const log: PlayerLog = { kind: 'nhl', rows };
    const vals = recentValues(log, { kind: 'nhl', col: 'p' }, '2026-10-27T00:30:00Z');
    expect(vals.length).toBeGreaterThan(5);
    expect(vals.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    expect(recentValues(log, { kind: 'nfl', stat: 'receptions' }, kickoff)).toEqual([]); // a log never answers another sport's statistic
  });
});

describe('the opponent chip', () => {
  const rk = loadTop<RankingDoc>('nfl-ranking-adj-def-db-epa.json');
  const idx = loadTop<ExplorerIndexDoc>('nfl-index.json');
  const codes = codeById(idx);
  const map = rankMap(rk, (id, short) => codes.get(id) || short);
  it('uses the ranking\'s own universe size and its worst-to-best track', () => {
    const dal = map.get('DAL')!;
    expect(dal).toMatchObject({ rank: 28, n: 28 });
    expect(trackPct(28, 28)).toBe(0);
    expect(trackPct(1, 28)).toBe(100);
  });
  it('builds the chip text from the opposing team', () => {
    const ranks = new Map([['nfl:adj_def_db_epa', map]]);
    const m = matchupOf({ slug: 'nfl', oppUnit: { metric: 'adj_def_db_epa', chip: 'pass D', long: 'pass defense', short: 'pass D', perGame: false }, opp: 'DAL', team: 'PHI' }, ranks)!;
    expect(m.text).toBe('DAL pass D · 28th of 28');
    expect(m).toMatchObject({ statId: 'adj_def_db_epa', oppCode: 'DAL', selfCode: 'PHI' });
    expect(matchupOf({ slug: 'nfl', oppUnit: null, opp: 'DAL', team: 'PHI' }, ranks)).toBeNull();
    expect(matchupOf({ slug: 'nfl', oppUnit: { metric: 'nope', chip: 'x', long: 'x', short: 'x', perGame: false }, opp: 'DAL', team: 'PHI' }, ranks)).toBeNull();
  });
  it('prefers the sport\'s adjusted view, then the season, then the latest season-shaped window', () => {
    expect(pickWindow(['SEASON', 'ADJ_RIDGE', 'L6'])).toBe('ADJ_RIDGE');
    expect(pickWindow(['2025-26', '2026-27', 'L10'])).toBe('2026-27');
    expect(pickWindow(['L10'])).toBe('L10');
    expect(pickWindow([])).toBeNull();
  });
  it('ranks hockey goals against by the published rank, 1 being the fewest', () => {
    const ga = load<RankingDoc>('nhl-ranking-ga.json');
    const m = rankMap(ga, (id, short) => short ?? id);
    expect(m.size).toBeGreaterThan(20);
    const worst = [...m.entries()].sort((a, b) => b[1].rank - a[1].rank)[0];
    expect(worst[1].rank).toBe(worst[1].n);
  });
});

describe('the SIFT model lane', () => {
  const doc = decodeProjections(load<unknown>('nfl-projections.json'));
  const authority = makeAuthority('NFL', doc, Date.parse('2026-10-26T20:00:00Z'));
  const props = parseGameProps(NFL_GAME, nflDetail.markets, hints(nflIndex, true, nflHist.players));
  it('only a sport with an approved statistic reads a projection feed', () => {
    expect(sportHasApprovedModel('nfl')).toBe(true);
    expect(sportHasApprovedModel('nhl')).toBe(false);
    expect(sportHasApprovedModel('cbb')).toBe(false);
  });
  it('shows an estimate only where the ledger approves the statistic and the projection passes its checks', () => {
    const lamb = props.find((p) => p.name === 'CeeDee Lamb' && p.stat === 'receptions')!;
    const lane = modelLaneFor(lamb, authority);
    expect(lane.state).toBe('published');
    expect(modelPercent(lane, 7)).not.toBeNull();
    expect(modelPercent(lane, 4)).toBeNull(); // a rung the model does not publish is "—", never interpolated
    const prescott = props.find((p) => p.name === 'Dak Prescott' && p.stat === 'passing_yards')!;
    expect(modelLaneFor(prescott, authority)).toMatchObject({ state: 'none', reason: expect.stringMatching(/not approved for display/) });
  });
  it('is "—" with the reason when there is no authority at all (hockey, or an unreadable feed)', () => {
    const p = props[0];
    expect(modelLaneFor(p, null)).toMatchObject({ state: 'none' });
  });
});

describe('the universe', () => {
  it('counts what it holds and lists the sports in declaration order, with no sport or slate named in code', () => {
    const a = parseGameProps(NFL_GAME, nflDetail.markets, hints(nflIndex, true, nflHist.players));
    const b = parseGameProps(NHL_GAME, nhlDetail.markets, hints(nhlIndex, true));
    const u: Universe = summarize([...b, ...a] as Prop[], new Map(), [], 0, false);
    expect(u.sports.map((s) => s.slug)).toEqual(['nfl', 'nhl']);
    expect(u.stats.props).toBe(a.length + b.length);
    expect(u.stats.contracts).toBe([...a, ...b].reduce((n, p) => n + p.rungs.length, 0));
    expect(u.byId.get('KXNFLREC-26OCT26DALPHI-DALCLAMB88')).toBeTruthy();
  });
});

describe('contracts carry an open status and a price', () => {
  it('skips closed contracts and contracts with no ask', () => {
    const m = nflDetail.markets.find((x) => x.extensions?.stat === 'receptions')!;
    const closed = { ...m, market_status: 'CLOSED' } as Market;
    const noAsk = { ...m, kalshi_ticker: `${m.kalshi_ticker}x`, yes_ask: null } as Market;
    expect(parseGameProps(NFL_GAME, [closed, noAsk], {})).toEqual([]);
  });
});
