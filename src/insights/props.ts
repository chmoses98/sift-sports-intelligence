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
import { typicalWidth, usesEstablished, type ProjectionAuthority } from '../lib/projectionAuthority';
import type { LegacyCandidate } from '../lib/projectionFallback';

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
  /** THE projection for this stat (one engine: see lib/projectionAuthority.ts) */
  projection: number;
  /** the legacy simulation's quartile/90% range, or the selected model's when the feed publishes the full quantile set */
  range: PropRange | null;
  /** the selected model's realistic 80% range (p10–p90) when it publishes no quantile set; null otherwise */
  band: { lo: number; hi: number } | null;
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

/** How many player props carry a priced line for this game (one per player and stat), whether or not a projection is published for
 *  them: the total the Explorer's "All N priced props" link stands for. */
export function pricedPropCount(markets: Market[]): number {
  const byPlayerStat = new Map<string, Market[]>();
  for (const m of markets) {
    const stat = (m.extensions as { stat?: string } | null)?.stat;
    if (m.market_family !== 'player_stat' || !m.player_id || !stat || !isFullGame(m.period)) continue;
    const k = `${m.player_id}|${stat}`;
    byPlayerStat.set(k, [...(byPlayerStat.get(k) ?? []), m]);
  }
  return [...byPlayerStat.values()].filter((ms) => mainLine(ms) != null).length;
}

/** Every prop candidate for a game, most interesting first. */
export function propCards(r: EventResearchDoc, markets: Market[], g: GameSides | null = gameSides(r), authority: ProjectionAuthority | null = null): PropCard[] {
  if (!g) return [];
  const out: PropCard[] = [];
  const out_ = new Set((r.context?.injuries ?? []).filter((i) => ['OUT', 'INJURED_RESERVE', 'DOUBTFUL', 'SUSPENDED'].includes(i.status)).map((i) => nameKey(/^(.+?) \(/.exec(i.detail ?? '')?.[1])));
  // the listed designation of every player, for the established-model fallback's availability check
  const injuryDesignation = new Map<string, string>();
  for (const i of r.context?.injuries ?? []) {
    const nm = /^(.+?) \(/.exec(i.detail ?? '')?.[1];
    if (nm) injuryDesignation.set(nameKey(nm), i.status);
  }
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
      // one engine per stat: a stat whose projection is withheld has no card (the prop board says why)
      const dEstablished = r.distributions.find((x) => x.entity_id === p.participant_id && x.metric_id === s.sim);
      const rangeEstablished = dEstablished ? rangeOf(dEstablished) : null;
      const mainEarly = mainLine(byPlayerStat.get(`${p.participant_id}|${s.stat}`) ?? []);
      const nameKeyP = nameKey(p.display_name);
      const candidate: LegacyCandidate | null = dEstablished && dEstablished.mean != null ? {
        mean: dEstablished.mean, interval: rangeEstablished ? { lo: rangeEstablished.full[0], hi: rangeEstablished.full[1] } : null,
        generatedAt: r.generated_at ?? null, designation: injuryDesignation.get(nameKeyP) ?? null,
        line: mainEarly?.threshold != null ? Number(overLine(mainEarly.threshold)) : null, checkLine: true,
      } : null;
      const res = authority ? authority.resolve({ stat: s.stat, playerId: p.participant_id, name: p.display_name, team: team.abbr, opponent: opp.abbr }, candidate) : { kind: 'legacy' as const };
      if (res.kind === 'withheld') continue;
      const d = usesEstablished(res) ? dEstablished : null;
      const auth = res.kind === 'authoritative' ? res.value : null;
      const range: PropRange | null = auth ? (auth.quantiles ? { typical: [auth.quantiles.p25, auth.quantiles.p75], full: [auth.quantiles.p05, auth.quantiles.p95], median: auth.quantiles.p50 } : null) : d ? rangeOf(d) : null;
      const band = auth && !range && auth.p10 != null && auth.p90 != null ? { lo: auth.p10, hi: auth.p90 } : null;
      const mean = auth ? auth.mean : d?.mean ?? null;
      if (mean == null || (!range && !band)) continue;
      const main = mainLine(byPlayerStat.get(`${p.participant_id}|${s.stat}`) ?? []);
      const line = main?.threshold != null ? Number(overLine(main.threshold)) : null;
      const defObs = matchupObs(r, s.def, opp);
      const rank = rankView(defObs?.context);
      const star = Math.min(1, mean / s.star);
      const extreme = rank ? Math.abs(rank.strength - 0.5) * 2 : 0;
      const width = Math.max(1, range ? range.typical[1] - range.typical[0] : (auth ? typicalWidth(auth) : null) ?? 1);
      const sep = line != null ? Math.min(1, Math.abs(mean - line) / width) : 0;
      const reasons: string[] = [];
      if (rank && rank.tier !== 'average') reasons.push(`${opp.nick} ${s.defUnit} ${rank.text}`);
      if (line != null && sep >= 0.35) reasons.push(`Projection ${mean > line ? 'above' : 'below'} the line`);
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
        projection: mean,
        range,
        band,
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

/** The range line for a card: the quartile range when there is one, else the selected model's realistic 80% range. */
export function cardRange(c: Pick<PropCard, 'range' | 'band'>, fmt: (v: number) => string): { label: string; text: string } | null {
  if (c.range) return { label: 'Typical range', text: `${fmt(c.range.typical[0])}–${fmt(c.range.typical[1])}` };
  if (c.band) return { label: 'Realistic range (80%)', text: `${fmt(c.band.lo)}–${fmt(c.band.hi)}` };
  return null;
}
