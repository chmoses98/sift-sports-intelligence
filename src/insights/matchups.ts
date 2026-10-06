// WHERE THIS GAME TILTS — the few offense-vs-defense relationships that matter most, ranked.
//
// Each candidate pairs one team's unit with the opposing unit it plays against, on the publication's
// opponent-adjusted ratings (direction-aware league ranks: #1 is the best unit for that job). A unit's
// strength is (N − rank) / (N − 1): 1 for the league's best, 0 for its worst. The edge is the gap between
// the two strengths; it says who holds the advantage, never by how many points (Sift does not combine the
// ratings — see docs/MATCHUP_MATH.md). Only gaps with real separation are surfaced, and each area at most
// once per offense, so the list stays short and readable.
import type { EntityProfileDoc, EventResearchDoc, Observation } from '../contract/types';
import { rankView, type RankView } from '../lib/rank';
import { gameSides, matchupObs, type GameSides, type Side } from './game';

export type AreaKey = 'run' | 'pass' | 'protection' | 'explosive' | 'turnovers' | 'early' | 'overall' | 'redzone';

interface Area {
  key: AreaKey;
  label: string;
  offense: string;
  defense: string;
  offUnit: string;
  defUnit: string;
  /** How much this area tends to drive a game script (relative). */
  weight: number;
  /** Raw (season) metrics behind the area, for the evidence layer: [offense metric, defense metric]. */
  evidence: [string, string][];
  /** Where the ranks come from: the matchup rows (adjusted) or the team profiles (raw season). */
  source: 'matchup' | 'profile';
}

export const AREAS: Area[] = [
  {
    key: 'run', label: 'Run game', offense: 'met_nfl.adj_off_rush_epa', defense: 'met_nfl.adj_def_rush_epa', offUnit: 'rush offense', defUnit: 'run defense', weight: 1,
    evidence: [['met_nfl.off_rush_epa', 'met_nfl.def_rush_epa'], ['met_nfl.off_success_rate', 'met_nfl.def_success_rate']], source: 'matchup',
  },
  {
    key: 'pass', label: 'Passing game', offense: 'met_nfl.adj_off_db_epa', defense: 'met_nfl.adj_def_db_epa', offUnit: 'passing offense', defUnit: 'pass defense', weight: 1,
    evidence: [['met_nfl.off_dropback_epa', 'met_nfl.def_dropback_epa'], ['met_nfl.off_explosive_rate', 'met_nfl.def_explosive_rate']], source: 'matchup',
  },
  {
    key: 'protection', label: 'Pass rush vs protection', offense: 'met_nfl.adj_off_sack_rate', defense: 'met_nfl.adj_def_sack_rate', offUnit: 'pass protection', defUnit: 'pass rush', weight: 0.85,
    evidence: [['met_nfl.off_sack_rate_allowed', 'met_nfl.def_sack_rate'], ['met_nfl.off_sack_rate_allowed', 'met_nfl.def_qb_hit_rate']], source: 'matchup',
  },
  {
    key: 'explosive', label: 'Big plays', offense: 'met_nfl.adj_off_explosive', defense: 'met_nfl.adj_def_explosive', offUnit: 'big-play offense', defUnit: 'big-play defense', weight: 0.8,
    evidence: [['met_nfl.off_explosive_rate', 'met_nfl.def_explosive_rate']], source: 'matchup',
  },
  {
    key: 'turnovers', label: 'Turnovers', offense: 'met_nfl.adj_off_to_rate', defense: 'met_nfl.adj_def_to_rate', offUnit: 'ball security', defUnit: 'takeaways', weight: 0.6,
    evidence: [['met_nfl.off_turnover_rate', 'met_nfl.def_takeaway_rate']], source: 'matchup',
  },
  {
    key: 'early', label: 'Early downs', offense: 'met_nfl.adj_off_ed_epa', defense: 'met_nfl.adj_def_ed_epa', offUnit: 'early-down offense', defUnit: 'early-down defense', weight: 0.6,
    evidence: [['met_nfl.off_early_down_epa', 'met_nfl.def_early_down_epa']], source: 'matchup',
  },
  {
    key: 'redzone', label: 'Red zone', offense: 'met_nfl.off_rz_epa', defense: 'met_nfl.def_rz_epa', offUnit: 'red-zone offense', defUnit: 'red-zone defense', weight: 0.55,
    evidence: [['met_nfl.off_rz_epa', 'met_nfl.def_rz_epa'], ['met_nfl.off_td_drive_rate', 'met_nfl.def_rz_epa']], source: 'profile',
  },
  {
    key: 'overall', label: 'Overall', offense: 'met_nfl.adj_off_epa', defense: 'met_nfl.adj_def_epa', offUnit: 'offense', defUnit: 'defense', weight: 0.75,
    evidence: [['met_nfl.off_epa_play', 'met_nfl.def_epa_play'], ['met_nfl.off_success_rate', 'met_nfl.def_success_rate']], source: 'matchup',
  },
];

export interface UnitRank {
  team: Side;
  unit: string;
  metricId: string;
  obs: Observation;
  rank: RankView;
}

export type EdgeSize = 'major' | 'clear';

export interface MatchupInsight {
  id: string;
  area: AreaKey;
  areaLabel: string;
  /** The team that holds the advantage. */
  beneficiary: Side;
  /** Whether the advantage belongs to that team's offense or its defense. */
  side: 'offense' | 'defense';
  size: EdgeSize;
  /** Strength gap (0..1) × the area's weight: the ordering key. */
  score: number;
  headline: string;
  offense: UnitRank;
  defense: UnitRank;
  /** Raw season metrics for the evidence layer. */
  evidence: [string, string][];
}

/** Gap thresholds: a #8 unit against a #22 unit is about 0.45 apart. */
export const MAJOR = 0.55;
export const CLEAR = 0.35;

function profileObs(p: EntityProfileDoc | null | undefined, metricId: string): Observation | null {
  return p?.metrics.find((m) => m.metric_id === metricId) ?? null;
}

function unit(obs: Observation | null, team: Side, unitName: string, metricId: string): UnitRank | null {
  const rank = rankView(obs?.context);
  if (!obs || !rank || !rank.directional) return null;
  return { team, unit: unitName, metricId, obs, rank };
}

/**
 * Every qualifying matchup edge in a game, strongest first. `profiles` supplies season metrics the
 * matchup rows do not carry (red zone); without them those areas are skipped, never guessed.
 */
export function matchupInsights(r: EventResearchDoc, profiles: { home?: EntityProfileDoc | null; away?: EntityProfileDoc | null } = {}, g: GameSides | null = gameSides(r)): MatchupInsight[] {
  if (!g) return [];
  const out: MatchupInsight[] = [];
  for (const off of [g.away, g.home]) {
    const def = g.opp(off.abbr);
    for (const a of AREAS) {
      const oObs = a.source === 'matchup' ? matchupObs(r, a.offense, off) : profileObs(off.home ? profiles.home : profiles.away, a.offense);
      const dObs = a.source === 'matchup' ? matchupObs(r, a.defense, def) : profileObs(def.home ? profiles.home : profiles.away, a.defense);
      const o = unit(oObs, off, a.offUnit, a.offense);
      const d = unit(dObs, def, a.defUnit, a.defense);
      if (!o || !d) continue;
      const gap = o.rank.strength - d.rank.strength;
      const mag = Math.abs(gap);
      if (mag < CLEAR) continue;
      const winner = gap > 0 ? o : d;
      const loser = gap > 0 ? d : o;
      // A "major" edge needs the stronger unit in the league's top 40% and the weaker in its bottom 40%.
      const n = winner.rank.of;
      const size: EdgeSize = mag >= MAJOR && winner.rank.rank <= Math.round(n * 0.4) && loser.rank.rank > n - Math.round(n * 0.4) ? 'major' : 'clear';
      const beneficiary = gap > 0 ? off : def;
      out.push({
        id: `${a.key}:${off.abbr}`,
        area: a.key,
        areaLabel: a.label,
        beneficiary,
        side: gap > 0 ? 'offense' : 'defense',
        size,
        score: mag * a.weight * (size === 'major' ? 1.15 : 1),
        headline: headline(a, beneficiary, winner, size),
        offense: o,
        defense: d,
        evidence: a.evidence,
      });
    }
  }
  return dedupe(out.sort((a, b) => b.score - a.score));
}

/** One sentence shape everywhere, so the eye learns it: "<Team> <unit> has a <major|clear> edge". */
function headline(a: Area, team: Side, winner: UnitRank, size: EdgeSize): string {
  if (a.key === 'turnovers') return `Turnovers tilt toward the ${team.nick}`;
  return `${team.nick} ${winner.unit} has a ${size} edge`;
}

/**
 * Keep the list readable: the overall-efficiency pair only when neither the run nor the pass pair
 * already explains that offense; early downs only when overall/run/pass do not; at most two per offense.
 */
function dedupe(xs: MatchupInsight[]): MatchupInsight[] {
  const kept: MatchupInsight[] = [];
  const perOffense = new Map<string, number>();
  for (const x of xs) {
    const off = x.offense.team.abbr;
    const has = (k: AreaKey) => kept.some((y) => y.offense.team.abbr === off && y.area === k);
    if (x.area === 'overall' && (has('run') || has('pass'))) continue;
    if (x.area === 'early' && (has('overall') || has('run') || has('pass'))) continue;
    if ((x.area === 'run' || x.area === 'pass') && has('overall')) {
      // A specific unit explains the game better than the aggregate: replace it.
      const i = kept.findIndex((y) => y.offense.team.abbr === off && y.area === 'overall');
      kept.splice(i, 1);
      perOffense.set(off, (perOffense.get(off) ?? 1) - 1);
    }
    if ((perOffense.get(off) ?? 0) >= 2) continue;
    kept.push(x);
    perOffense.set(off, (perOffense.get(off) ?? 0) + 1);
  }
  return kept;
}

/** "Falcons rush offense · #3 NFL" */
export const unitLine = (u: UnitRank) => `${u.team.nick} ${u.unit} · ${u.rank.text}`;
