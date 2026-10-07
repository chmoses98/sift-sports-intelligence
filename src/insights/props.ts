// PROPS TO WATCH — the handful of player props a reader has a reason to care about, with the projection,
// its range, the market's line and the matchup that bears on it.
//
// "Reason to care" is about information, not picks: a featured player (large projected role), an extreme
// matchup (the opposing unit is among the league's best or worst at stopping this), and a projection that
// sits well away from the line relative to its own spread. The projection, quantiles and line are
// published numbers; nothing here prices a contract or calls an edge.
import type { Distribution, EventResearchDoc, Market } from '../contract/types';
import { describeMarket, overLine } from '../lib/marketLabel';
import { rankView, type RankView } from '../lib/rank';
import { gameSides, matchupObs, type GameSides, type Side } from './game';
import { nameKey } from './context';
import { isFullGame } from '../lib/period';

export const PROP_STATS: { stat: string; sim: string; label: string; unit: string; star: number; def: string; defUnit: string }[] = [
  { stat: 'rushing_yards', sim: 'met_nfl.sim_rushing_yards', label: 'Rushing yards', unit: 'yds', star: 80, def: 'met_nfl.adj_def_rush_epa', defUnit: 'run defense' },
  { stat: 'receiving_yards', sim: 'met_nfl.sim_receiving_yards', label: 'Receiving yards', unit: 'yds', star: 75, def: 'met_nfl.adj_def_db_epa', defUnit: 'pass defense' },
  { stat: 'receptions', sim: 'met_nfl.sim_receptions', label: 'Receptions', unit: 'rec', star: 6, def: 'met_nfl.adj_def_db_epa', defUnit: 'pass defense' },
  { stat: 'passing_yards', sim: 'met_nfl.sim_passing_yards', label: 'Passing yards', unit: 'yds', star: 250, def: 'met_nfl.adj_def_db_epa', defUnit: 'pass defense' },
];

export interface PropRange {
  /** Middle half of simulated games (25th–75th percentile). */
  typical: [number, number];
  /** 5th–95th percentile: the low-end and high-end outcomes. */
  full: [number, number];
  median: number | null;
}

export interface PropCard {
  id: string;
  playerId: string;
  name: string;
  role: string | null;
  team: Side;
  opp: Side;
  stat: string;
  statLabel: string;
  unit: string;
  projection: number;
  range: PropRange;
  /** The over line nearest a coin flip ("79.5"), and its market. */
  line: number | null;
  market: Market | null;
  marketTitle: string | null;
  marketMid: number | null;
  matchup: { label: string; rank: RankView; metricId: string } | null;
  /** Ordering key (0..1). */
  interest: number;
  /** Plain reasons this prop is on the list. */
  reasons: string[];
}

export function rangeOf(d: Pick<Distribution, 'quantiles'>): PropRange | null {
  const q = d.quantiles;
  if (!q || q.p25 == null || q.p75 == null || q.p05 == null || q.p95 == null) return null;
  return { typical: [q.p25, q.p75], full: [q.p05, q.p95], median: q.p50 ?? null };
}

const mid = (m: Pick<Market, 'yes_bid' | 'yes_ask'>) => (m.yes_bid != null && m.yes_ask != null && m.yes_ask > 0 ? (m.yes_bid + m.yes_ask) / 2 : null);

/** The rung priced closest to a coin flip, among two-sided quotes between 15¢ and 85¢. */
export function mainLine(markets: Market[]): Market | null {
  return markets
    .filter((m) => m.threshold != null && mid(m) != null && mid(m)! >= 0.15 && mid(m)! <= 0.85)
    .sort((a, b) => Math.abs(mid(a)! - 0.5) - Math.abs(mid(b)! - 0.5))[0] ?? null;
}

/** Every prop candidate for a game, most interesting first. */
export function propCards(r: EventResearchDoc, markets: Market[], g: GameSides | null = gameSides(r)): PropCard[] {
  if (!g) return [];
  const out: PropCard[] = [];
  const out_ = new Set((r.context?.injuries ?? []).filter((i) => ['OUT', 'INJURED_RESERVE', 'DOUBTFUL', 'SUSPENDED'].includes(i.status)).map((i) => nameKey(/^(.+?) \(/.exec(i.detail ?? '')?.[1])));
  const byPlayerStat = new Map<string, Market[]>();
  for (const m of markets) {
    const stat = (m.extensions as { stat?: string } | null)?.stat;
    if (m.market_family !== 'player_stat' || !m.player_id || !stat || !isFullGame(m.period)) continue;
    const k = `${m.player_id}|${stat}`;
    byPlayerStat.set(k, [...(byPlayerStat.get(k) ?? []), m]);
  }
  for (const p of r.players) {
    const team = g.byPid(p.team_id ?? null);
    if (!team || out_.has(nameKey(p.display_name))) continue;
    const opp = g.opp(team.abbr);
    for (const s of PROP_STATS) {
      if (s.stat === 'passing_yards' && p.role !== 'QB') continue;
      if (s.stat !== 'passing_yards' && p.role === 'QB') continue;
      const d = r.distributions.find((x) => x.entity_id === p.participant_id && x.metric_id === s.sim);
      const range = d ? rangeOf(d) : null;
      if (!d || d.mean == null || !range) continue;
      const main = mainLine(byPlayerStat.get(`${p.participant_id}|${s.stat}`) ?? []);
      const line = main?.threshold != null ? Number(overLine(main.threshold)) : null;
      const defObs = matchupObs(r, s.def, opp);
      const rank = rankView(defObs?.context);
      const star = Math.min(1, d.mean / s.star);
      const extreme = rank ? Math.abs(rank.strength - 0.5) * 2 : 0;
      const width = Math.max(1, range.typical[1] - range.typical[0]);
      const sep = line != null ? Math.min(1, Math.abs(d.mean - line) / width) : 0;
      const reasons: string[] = [];
      if (rank && rank.tier !== 'average') reasons.push(`${opp.nick} ${s.defUnit} ${rank.text}`);
      if (line != null && sep >= 0.35) reasons.push(`Projection ${d.mean > line ? 'above' : 'below'} the line`);
      if (star >= 0.85) reasons.push('Featured role');
      out.push({
        id: `${p.participant_id}|${s.stat}`,
        playerId: p.participant_id,
        name: p.display_name,
        role: p.role ?? null,
        team, opp,
        stat: s.stat,
        statLabel: s.label,
        unit: s.unit,
        projection: d.mean,
        range,
        line,
        market: main,
        marketTitle: main ? describeMarket(main, { playerName: () => p.display_name }).title : null,
        marketMid: main ? mid(main) : null,
        matchup: rank ? { label: `${opp.nick} ${s.defUnit}`, rank, metricId: s.def } : null,
        // Lines matter: a prop with no market at all is a projection, not a prop.
        interest: (0.5 * star + 0.3 * extreme + 0.2 * sep) * (main ? 1 : 0.4),
        reasons,
      });
    }
  }
  return out.sort((a, b) => b.interest - a.interest);
}

/** A short list: at most one prop per player and `perTeam` per team. */
export function propsToWatch(cards: PropCard[], n = 4, perTeam = 3): PropCard[] {
  const out: PropCard[] = [];
  const players = new Set<string>();
  const teams = new Map<string, number>();
  let passing = 0;
  for (const c of cards) {
    if (!c.market) continue;
    if (players.has(c.playerId) || (teams.get(c.team.abbr) ?? 0) >= perTeam) continue;
    // Variety: one quarterback passing line per list; the rest of the list is skill players.
    if (c.stat === 'passing_yards' && passing >= 1) continue;
    if (c.stat === 'passing_yards') passing++;
    out.push(c);
    players.add(c.playerId);
    teams.set(c.team.abbr, (teams.get(c.team.abbr) ?? 0) + 1);
    if (out.length >= n) break;
  }
  return out;
}

/** "78–108 yds" with values rounded the way the stat is counted. */
export function rangeText(r: [number, number], unit: string): string {
  const f = (v: number) => (unit === 'rec' || unit === 'TD' ? String(Math.round(v * 10) / 10).replace(/\.0$/, '') : String(Math.round(v)));
  return `${f(r[0])}–${f(r[1])} ${unit}`;
}

export function valueText(v: number, unit: string): string {
  return unit === 'rec' || unit === 'TD' ? `${(Math.round(v * 10) / 10).toFixed(1)} ${unit}` : `${Math.round(v)} ${unit}`;
}
