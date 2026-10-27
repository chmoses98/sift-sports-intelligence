// SAMPLE DATA. Everything in this file is fictional: scores, clocks, records, ranks, prices, drives and research text are
// invented so the interface can be exercised and compared against the approved designs. Team identities and logos are the
// repository's real ones; the games, numbers and quotes are not real and must never be presented as such. The app shows an
// unmistakable "Sample data" strip whenever these are in use, and nothing outside src/v3/demo imports this file except the
// demo slate provider (tests/v3/isolation.test.ts enforces that).
import { heroTeam } from '../../lib/hero/input';
import { cfbTeam } from '../../lib/cfbTeams';
import { zonedMs } from '../model/time';
import type { MarketLine, Phase, Price, V3Game, V3Team } from '../model/types';

const NAMES: Record<string, Record<string, string>> = {
  NFL: { BUF: 'Buffalo Bills', NYJ: 'New York Jets', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', KC: 'Kansas City Chiefs', SF: 'San Francisco 49ers', DEN: 'Denver Broncos', ATL: 'Atlanta Falcons' },
  NBA: { BOS: 'Boston Celtics', NYK: 'New York Knicks', LAL: 'Los Angeles Lakers', DEN: 'Denver Nuggets', MIA: 'Miami Heat', OKC: 'Oklahoma City Thunder', CLE: 'Cleveland Cavaliers', MIN: 'Minnesota Timberwolves' },
  NHL: { VAN: 'Vancouver Canucks', TBL: 'Tampa Bay Lightning' },
  MLB: { LAD: 'Los Angeles Dodgers', SD: 'San Diego Padres' },
};

function team(sport: string, code: string, extra: Partial<V3Team> = {}): V3Team {
  const slug = sport.toLowerCase();
  const name = sport === 'CFB' ? cfbTeam(code)?.n ?? code : NAMES[sport]?.[code] ?? code;
  const h = heroTeam(sport, code, name);
  return { id: code, slug, sport, name: h?.name ?? name, nick: h?.short ?? name, abbr: code, logo: h?.logo ?? null, colors: h?.colors ?? ['#1d2d52', '#3f5079'], ...extra };
}

const price = (ticker: string, ask: number, description: string): Price => ({
  ask, bid: ask - 1, implied: ask - 0.5, ticker, side: 'YES', description, observedAt: new Date().toISOString(), source: 'Sample',
});
function lines(sport: string, away: V3Team, home: V3Team, o: { spread?: [V3Team, number, number]; total?: [number, number]; ml?: [V3Team, number] }): MarketLine[] {
  const out: MarketLine[] = [];
  if (o.spread) {
    const [t, v, ask] = o.spread;
    out.push({ kind: 'spread', label: `${t.abbr} −${v.toFixed(1)}`, line: v, teamId: t.id, price: price(`SAMPLE-${sport}-SPREAD-${t.abbr}${v}`, ask, `SAMPLE: ${t.abbr} wins by more than ${v}`) });
  }
  if (o.total) out.push({ kind: 'total', label: `O/U ${o.total[0].toFixed(1)}`, line: o.total[0], price: price(`SAMPLE-${sport}-TOTAL-${o.total[0]}`, o.total[1], `SAMPLE: total points over ${o.total[0]}`) });
  if (o.ml) {
    const other = o.ml[0].id === away.id ? home : away;
    const fav = price(`SAMPLE-${sport}-WIN-${o.ml[0].abbr}`, o.ml[1], `SAMPLE: ${o.ml[0].name} win`);
    const dog = price(`SAMPLE-${sport}-WIN-${other.abbr}`, 101 - o.ml[1], `SAMPLE: ${other.name} win`);
    out.push({ kind: 'moneyline', label: `${o.ml[0].abbr} to win`, line: null, teamId: o.ml[0].id, price: fav, alternates: o.ml[0].id === away.id ? [fav, dog] : [dog, fav] });
  }
  return out;
}

interface Spec {
  sport: string; away: string; home: string; phase: Phase; hh: number; mm: number; network?: string;
  score?: [number, number]; clock?: string; awayRec?: string; homeRec?: string; awayRank?: number; homeRank?: number;
  spread?: [string, number, number]; total?: [number, number]; ml?: [string, number]; signals?: number; situation?: V3Game['situation'];
}

const mk = (day: string, s: Spec): V3Game => {
  const away = team(s.sport, s.away, { record: s.awayRec, rank: s.awayRank });
  const home = team(s.sport, s.home, { record: s.homeRec, rank: s.homeRank });
  const pick = (c: string) => (c === away.abbr ? away : home);
  return {
    key: `${s.sport.toLowerCase()}:demo_${s.away}_${s.home}`.toLowerCase(),
    slug: s.sport.toLowerCase(), sport: s.sport, eventId: `demo_${s.away}_${s.home}`.toLowerCase(),
    league: s.sport === 'CFB' ? 'NCAAF' : s.sport, phase: s.phase,
    startMs: zonedMs(day, s.hh, s.mm), network: s.network ?? null,
    away, home,
    score: s.score ? { away: s.score[0], home: s.score[1], clock: s.phase === 'final' ? 'Final' : s.clock ?? null, source: 'demo', asOf: null } : null,
    situation: s.situation ?? null,
    lines: lines(s.sport, away, home, { spread: s.spread ? [pick(s.spread[0]), s.spread[1], s.spread[2]] : undefined, total: s.total, ml: s.ml ? [pick(s.ml[0]), s.ml[1]] : undefined }),
    signals: s.signals ?? 0, provenance: 'demo', photo: null,
  };
};

const CFB = (a: string, h: string, o: Omit<Spec, 'sport' | 'away' | 'home'>): Spec => ({ sport: 'CFB', away: a, home: h, ...o });

const SPECS: Spec[] = [
  // The six live games of the picker reference, favourites among them.
  CFB('UGA', 'FLA', { phase: 'live', hh: 15, mm: 30, network: 'CBS', score: [24, 10], clock: 'Q3 6:24', awayRank: 1, awayRec: '6-1', homeRec: '4-3', spread: ['UGA', 5.5, 53], total: [50.5, 51], ml: ['UGA', 74], signals: 2, situation: { possession: 'away', text: '1st & 10 · FLA 28' } }),
  CFB('LSU', 'AUB', { phase: 'live', hh: 12, mm: 0, network: 'ESPN', score: [17, 14], clock: 'Q2 3:11', awayRec: '5-2', homeRec: '4-3', spread: ['LSU', 3.5, 55], total: [47.5, 52] }),
  CFB('TEX', 'OKLA', { phase: 'live', hh: 12, mm: 0, network: 'ABC', score: [7, 0], clock: 'Q1 8:52', awayRank: 5, awayRec: '6-1', homeRec: '5-2', spread: ['TEX', 6.5, 54], total: [52.5, 49] }),
  CFB('ALA', 'TENN', { phase: 'live', hh: 15, mm: 30, network: 'CBS', score: [14, 14], clock: 'Q2 1:08', awayRank: 3, awayRec: '6-1', homeRank: 11, homeRec: '5-2', spread: ['ALA', 2.5, 51], total: [58.5, 50] }),
  CFB('ND', 'USC', { phase: 'live', hh: 19, mm: 30, network: 'NBC', score: [0, 3], clock: 'Q1 4:21', awayRank: 8, awayRec: '5-2', homeRec: '4-3', spread: ['ND', 4.5, 52], total: [53.5, 51] }),
  CFB('MICH', 'ILL', { phase: 'live', hh: 12, mm: 0, network: 'FOX', score: [10, 7], clock: 'Q2 10:33', awayRec: '5-2', homeRec: '4-3', spread: ['MICH', 6.0, 56], total: [44.5, 50] }),
  // Finals
  CFB('OSU', 'PSU', { phase: 'final', hh: 12, mm: 0, network: 'FOX', score: [31, 24], awayRank: 2, awayRec: '7-0', homeRank: 9, homeRec: '5-2' }),
  CFB('CLEM', 'WAKE', { phase: 'final', hh: 12, mm: 0, network: 'ACCN', score: [38, 14], awayRec: '5-2', homeRec: '3-4' }),
  CFB('MISS', 'ARK', { phase: 'final', hh: 12, mm: 0, network: 'SEC', score: [27, 30], awayRank: 14, awayRec: '5-2', homeRec: '4-3' }),
  CFB('WIS', 'IOWA', { phase: 'final', hh: 12, mm: 0, network: 'BTN', score: [13, 20], awayRec: '3-4', homeRec: '5-2' }),
  CFB('BAY', 'TCU', { phase: 'final', hh: 12, mm: 0, network: 'ESPN2', score: [21, 17], awayRec: '4-3', homeRec: '4-3' }),
  // Still to come today
  CFB('ORE', 'WASH', { phase: 'pregame', hh: 19, mm: 0, network: 'ESPN', awayRank: 4, awayRec: '7-0', homeRec: '5-2', spread: ['ORE', 7.0, 52], total: [56.5, 50], ml: ['ORE', 81], signals: 1 }),
  CFB('FSU', 'MIA', { phase: 'pregame', hh: 19, mm: 30, network: 'ABC', awayRec: '4-3', homeRank: 13, homeRec: '6-1', spread: ['MIA', 3.5, 54], total: [55.5, 50] }),
  CFB('UK', 'MIZZ', { phase: 'pregame', hh: 19, mm: 0, network: 'SECN', awayRec: '4-3', homeRec: '5-2', spread: ['MIZZ', 4.5, 53], total: [46.5, 49] }),
  CFB('TXAM', 'SCAR', { phase: 'pregame', hh: 19, mm: 30, network: 'ESPN2', awayRank: 18, awayRec: '6-1', homeRec: '3-4', spread: ['TXAM', 3.0, 52], total: [48.5, 50] }),
  CFB('UCLA', 'ORST', { phase: 'pregame', hh: 20, mm: 0, network: 'FS1', awayRec: '3-4', homeRec: '4-3', spread: ['ORST', 2.5, 51], total: [49.5, 50] }),
  CFB('STAN', 'UTAH', { phase: 'pregame', hh: 20, mm: 30, network: 'ESPN', awayRec: '2-5', homeRec: '5-2', spread: ['UTAH', 9.5, 52], total: [45.5, 49] }),
  CFB('COLO', 'ASU', { phase: 'pregame', hh: 21, mm: 0, network: 'FOX', awayRec: '4-3', homeRec: '5-2', spread: ['ASU', 3.5, 53], total: [60.5, 50] }),
  CFB('BSU', 'NAVY', { phase: 'pregame', hh: 21, mm: 30, network: 'CBSSN', awayRec: '5-2', homeRec: '5-2', spread: ['BSU', 1.5, 51], total: [51.5, 50] }),
  CFB('KU', 'KSU', { phase: 'pregame', hh: 18, mm: 0, network: 'FS1', awayRec: '4-3', homeRec: '4-3', spread: ['KSU', 2.5, 52], total: [54.5, 50] }),
  CFB('LOU', 'SYR', { phase: 'pregame', hh: 18, mm: 0, network: 'ACCN', awayRank: 16, awayRec: '6-1', homeRec: '4-3', spread: ['LOU', 5.5, 54], total: [57.5, 50] }),
  CFB('NCST', 'UNC', { phase: 'pregame', hh: 17, mm: 30, network: 'ESPN2', awayRec: '5-2', homeRec: '4-3', spread: ['NCST', 1.5, 51], total: [53.5, 50] }),
  CFB('VT', 'PITT', { phase: 'pregame', hh: 17, mm: 30, network: 'ACCN', awayRec: '4-3', homeRec: '5-2', spread: ['PITT', 4.5, 53], total: [47.5, 49] }),
  CFB('OKST', 'BYU', { phase: 'pregame', hh: 22, mm: 0, network: 'ESPN', awayRec: '3-4', homeRank: 20, homeRec: '6-1', spread: ['BYU', 8.5, 53], total: [55.5, 50] }),
  CFB('GT', 'UVA', { phase: 'pregame', hh: 16, mm: 0, network: 'ACCN', awayRec: '5-2', homeRec: '3-4', spread: ['GT', 2.5, 52], total: [51.5, 50] }),
  // The other sports
  { sport: 'NBA', away: 'BOS', home: 'NYK', phase: 'live', hh: 19, mm: 30, network: 'ESPN', score: [98, 102], clock: 'Q4 6:24', spread: ['NYK', 2.5, 54], total: [214.5, 50], ml: ['NYK', 66], signals: 1 },
  { sport: 'NBA', away: 'LAL', home: 'DEN', phase: 'pregame', hh: 22, mm: 0, network: 'TNT', spread: ['DEN', 4.5, 53], total: [231.5, 50], ml: ['DEN', 70] },
  { sport: 'NBA', away: 'MIA', home: 'BOS', phase: 'pregame', hh: 19, mm: 30, network: 'TNT', spread: ['BOS', 4.5, 53], total: [226.5, 50] },
  { sport: 'NFL', away: 'BUF', home: 'NYJ', phase: 'pregame', hh: 13, mm: 0, network: 'FOX', spread: ['BUF', 6.5, 54], total: [47.5, 50], signals: 3 },
  { sport: 'NFL', away: 'CIN', home: 'CLE', phase: 'pregame', hh: 13, mm: 0, network: 'CBS', spread: ['CIN', 3.0, 52], total: [42.5, 50] },
  { sport: 'NFL', away: 'KC', home: 'SF', phase: 'pregame', hh: 20, mm: 15, network: 'NBC', spread: ['KC', 1.5, 51], total: [48.5, 50] },
  { sport: 'NHL', away: 'VAN', home: 'TBL', phase: 'live', hh: 19, mm: 0, network: 'ESPN+', score: [2, 1], clock: 'P2 4:17' },
  { sport: 'MLB', away: 'LAD', home: 'SD', phase: 'pregame', hh: 20, mm: 0, network: 'FS1', spread: ['LAD', 1.5, 52], total: [7.5, 50] },
];

/** The sample slate on one LOCAL calendar day (a day key): kick-offs are fixed local clock times, so the slate reads the same every day, including on a daylight-saving change. */
export const demoGames = (day: string): V3Game[] => SPECS.map((s) => mk(day, s));

/** Fixture-only live detail for the featured football game (drive, last play, Lens): the contract has no live feed for these. */
export interface DemoLive {
  drive?: { team: string; plays: number; yards: number; time: string; fromYard: number; toYard: number; ball: number; down: string };
  lastPlay?: { clock: string; text: string; situation: string };
  lens?: { title: string; text: string; evidence: { label: string; value: string }[]; counter: string };
  winProb?: { team: string; pct: number; text: string };
}
export const DEMO_LIVE: Record<string, DemoLive> = {
  'cfb:demo_uga_fla': {
    drive: { team: 'UGA', plays: 7, yards: 68, time: '3:12', fromYard: 18, toYard: 72, ball: 72, down: '1st & 10 · FLA 28' },
    lastPlay: { clock: '6:24', situation: '2nd & 6', text: 'Sample play: the quarterback completes a 14-yard pass to the FLA 28.' },
    lens: { title: 'SIFT Lens', text: 'Sample: the run game matches up well against this front.', evidence: [{ label: 'Rush EPA, offense', value: 'Sample 0.18' }, { label: 'Rush EPA allowed, defense', value: 'Sample 0.11' }], counter: 'Sample counter-case: a high pass rate on early downs would reduce how often the run matchup is used.' },
    winProb: { team: 'UGA', pct: 72, text: 'Sample: UGA has a 72% win probability after the three-and-out.' },
  },
};

export interface DemoProp { player: string; stat: string; line: number; ask: number; team: string }
export const DEMO_PROPS: DemoProp[] = [
  { player: 'Sample Quarterback A', stat: 'Passing yards', line: 247.5, ask: 52, team: 'away' },
  { player: 'Sample Running Back B', stat: 'Rushing yards', line: 68.5, ask: 49, team: 'away' },
  { player: 'Sample Receiver C', stat: 'Receiving yards', line: 61.5, ask: 51, team: 'home' },
  { player: 'Sample Tight End D', stat: 'Receptions', line: 4.5, ask: 47, team: 'home' },
];
export const DEMO_PBP: { clock: string; side: 'away' | 'home' | 'none'; kind: string; text: string; down: string }[] = [
  { clock: '6:24', side: 'away', kind: 'Pass', text: 'Sample play: pass complete for 14 yards to the FLA 28.', down: '2nd & 6' },
  { clock: '6:58', side: 'away', kind: 'Run', text: 'Sample play: rush for 6 yards to the FLA 42.', down: '1st & 10' },
  { clock: '7:32', side: 'home', kind: 'Pass', text: 'Sample play: pass incomplete under pressure.', down: '3rd & 8' },
  { clock: '7:58', side: 'none', kind: 'Timeout', text: 'Sample play: Florida timeout.', down: '' },
  { clock: '8:14', side: 'home', kind: 'Pass', text: 'Sample play: pass complete for 12 yards to the FLA 36.', down: '2nd & 10' },
];
