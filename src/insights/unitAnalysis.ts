// UNIT BY UNIT — each offense against the defense it faces, one football unit at a time (quarterback and passing
// game, run game, line vs pass rush, receivers vs coverage, downs, red zone, turnovers, special teams), each with a
// plain conclusion.
//
// Every number is a published observation: the opponent-adjusted ratings from the game's matchup rows (or the team
// profile), the raw measures from the team profile (the publication's last-34-games window), and the box-score
// basics from nflverse play-by-play (insights/basics.ts). The conclusion compares the two units' league ranks
// (direction-aware: #1 is the best unit for its job) — it says who holds the advantage and how clearly, never by how
// many points (Sift does not combine an offense and a defense rating; docs/MATCHUP_MATH.md). It is an OBSERVATION,
// not a projection and not a bet.
import type { EntityProfileDoc, EventResearchDoc, Observation } from '../contract/types';
import type { StatMode } from '../state/statMode';
import type { BasicKey, BasicValue, TeamBasics } from './basics';
import { matchupObs, type GameSides, type Side } from './game';

export type SectionKey = 'pass' | 'run' | 'protection' | 'explosive' | 'downs' | 'redzone' | 'turnovers' | 'special';

interface PairDef {
  label: string;
  /** [opponent-adjusted metric, raw metric]; null where the publication has no such version. */
  off: [string | null, string | null];
  def: [string | null, string | null];
}

interface SectionDef {
  key: SectionKey;
  title: string;
  offUnit: string;
  defUnit: string;
  pairs: PairDef[];
  basics: BasicKey[];
  /** What the publication does not measure for this unit, in one line. */
  limit?: string;
}

const A = (s: string) => `met_nfl.${s}`;

export const SECTIONS: SectionDef[] = [
  {
    key: 'pass', title: 'Quarterback & passing game', offUnit: 'passing offense', defUnit: 'pass defense',
    pairs: [
      { label: 'Efficiency per dropback', off: [A('adj_off_db_epa'), A('off_dropback_epa')], def: [A('adj_def_db_epa'), A('def_dropback_epa')] },
      { label: 'Completion % over expected', off: [null, A('off_cpoe')], def: [null, null] },
    ],
    basics: ['pass_yds'],
  },
  {
    key: 'run', title: 'Run game', offUnit: 'run offense', defUnit: 'run defense',
    pairs: [
      { label: 'Efficiency per designed run', off: [A('adj_off_rush_epa'), A('off_rush_epa')], def: [A('adj_def_rush_epa'), A('def_rush_epa')] },
      { label: 'Success rate (all plays)', off: [A('adj_off_sr'), A('off_success_rate')], def: [A('adj_def_sr'), A('def_success_rate')] },
    ],
    basics: ['rush_yds'],
  },
  {
    key: 'protection', title: 'Offensive line vs pass rush', offUnit: 'pass protection', defUnit: 'pass rush',
    pairs: [
      { label: 'Sack rate', off: [A('adj_off_sack_rate'), A('off_sack_rate_allowed')], def: [A('adj_def_sack_rate'), A('def_sack_rate')] },
      { label: 'QB hit rate', off: [null, null], def: [null, A('def_qb_hit_rate')] },
    ],
    basics: ['sacks'],
    limit: 'No pass-block or run-block grades are published: sack and hit rates mix the line, the quarterback and the scheme.',
  },
  {
    key: 'explosive', title: 'Receivers vs coverage', offUnit: 'big-play offense', defUnit: 'big-play defense',
    pairs: [
      { label: 'Explosive-play rate', off: [A('adj_off_explosive'), A('off_explosive_rate')], def: [A('adj_def_explosive'), A('def_explosive_rate')] },
      { label: 'Average depth of target', off: [null, A('off_adot')], def: [null, null] },
    ],
    basics: ['yds_play'],
    limit: 'Man/zone coverage and routes are not published for 2026; explosive-play rates are the closest published measure.',
  },
  {
    key: 'downs', title: 'Early downs & third downs', offUnit: 'early-down offense', defUnit: 'early-down defense',
    pairs: [{ label: 'Early-down efficiency', off: [A('adj_off_ed_epa'), A('off_early_down_epa')], def: [A('adj_def_ed_epa'), A('def_early_down_epa')] }],
    basics: ['third'],
  },
  {
    key: 'redzone', title: 'Red zone', offUnit: 'red-zone offense', defUnit: 'red-zone defense',
    pairs: [
      { label: 'EPA per red-zone play', off: [null, A('off_rz_epa')], def: [null, A('def_rz_epa')] },
      { label: 'Touchdown drives', off: [null, A('off_td_drive_rate')], def: [null, null] },
    ],
    basics: ['redzone', 'points'],
    limit: 'The publication rates the red zone raw only (no opponent-adjusted version).',
  },
  {
    key: 'turnovers', title: 'Turnovers', offUnit: 'ball security', defUnit: 'takeaways',
    pairs: [{ label: 'Turnover rate (per play)', off: [A('adj_off_to_rate'), A('off_turnover_rate')], def: [A('adj_def_to_rate'), A('def_takeaway_rate')] }],
    basics: ['turnovers'],
    limit: 'Turnovers swing on small samples; the rate is per play, the count beside it per game.',
  },
  {
    key: 'special', title: 'Special teams', offUnit: 'special teams', defUnit: 'special-teams defense',
    pairs: [{ label: 'Special-teams EPA', off: [A('adj_off_st_epa'), null], def: [A('adj_def_st_epa'), null] }],
    basics: [],
    limit: 'Opponent-adjusted only: the publication carries no raw special-teams measure.',
  },
];

export interface ObsPick {
  obs: Observation;
  /** The footing actually shown; differs from the requested mode when only one version exists. */
  basis: StatMode;
  /** True when the requested footing was not published and the other one is shown. */
  fallback: boolean;
}

export interface PairView {
  label: string;
  off: ObsPick | null;
  def: ObsPick | null;
}

export type Lean = 'offense' | 'defense' | 'even';

export interface Conclusion {
  lean: Lean;
  size: 'slight' | 'clear' | 'major' | null;
  text: string;
}

export interface UnitSection {
  key: SectionKey;
  title: string;
  offense: Side;
  defense: Side;
  offUnit: string;
  defUnit: string;
  pairs: PairView[];
  basics: { off: BasicValue | null; def: BasicValue | null }[];
  conclusion: Conclusion | null;
  limit: string | null;
}

type Profiles = { home?: EntityProfileDoc | null; away?: EntityProfileDoc | null };

function profileObs(p: EntityProfileDoc | null | undefined, id: string): Observation | null {
  return p?.metrics.find((m) => m.metric_id === id && !m.split) ?? null;
}

/** An observation for one team: the game's matchup rows first (adjusted), then the team's profile. */
function obsFor(r: EventResearchDoc | null, profiles: Profiles, team: Side, id: string | null): Observation | null {
  if (!id) return null;
  return (r ? matchupObs(r, id, team) : null) ?? profileObs(team.home ? profiles.home : profiles.away, id);
}

export function pick(pair: [string | null, string | null], get: (id: string | null) => Observation | null, mode: StatMode): ObsPick | null {
  const adj = get(pair[0]);
  const raw = get(pair[1]);
  const want = mode === 'adjusted' ? adj : raw;
  if (want) return { obs: want, basis: mode, fallback: false };
  const other = mode === 'adjusted' ? raw : adj;
  return other ? { obs: other, basis: mode === 'adjusted' ? 'raw' : 'adjusted', fallback: true } : null;
}

const strength = (rank: number, of: number) => (of > 1 ? (of - rank) / (of - 1) : 0.5);
const directional = (o: Observation | null | undefined) => o?.context?.rank != null && !!o.context.universe_size && o.context.higher_is_better != null;

/** The plain conclusion for one unit pair, from the two league ranks. */
export function conclude(offense: Side, defense: Side, offUnit: string, defUnit: string, o: Observation, d: Observation): Conclusion | null {
  if (!directional(o) || !directional(d)) return null;
  const ro = o.context!.rank!;
  const rd = d.context!.rank!;
  const n = Math.max(o.context!.universe_size!, d.context!.universe_size!);
  const gap = strength(ro, o.context!.universe_size!) - strength(rd, d.context!.universe_size!);
  const mag = Math.abs(gap);
  const topTier = (r: number) => r <= Math.round(n * 0.3);
  const bottomTier = (r: number) => r > n - Math.round(n * 0.3);
  if (mag < 0.2) {
    if (topTier(ro) && topTier(rd)) return { lean: 'even', size: null, text: `Strength meets strength: the ${offense.nick} ${offUnit} (#${ro}) against the ${defense.nick} ${defUnit} (#${rd}).` };
    if (bottomTier(ro) && bottomTier(rd)) return { lean: 'even', size: null, text: `Weakness meets weakness: the ${offense.nick} ${offUnit} (#${ro}) against the ${defense.nick} ${defUnit} (#${rd}).` };
    return { lean: 'even', size: null, text: `Evenly matched: the ${offense.nick} ${offUnit} is #${ro}, the ${defense.nick} ${defUnit} #${rd}.` };
  }
  const winR = gap > 0 ? ro : rd;
  const loseR = gap > 0 ? rd : ro;
  const size = mag >= 0.55 && winR <= Math.round(n * 0.4) && loseR > n - Math.round(n * 0.4) ? 'major' : mag >= 0.35 ? 'clear' : 'slight';
  return gap > 0
    ? { lean: 'offense', size, text: `${size === 'major' ? 'Major' : size === 'clear' ? 'Clear' : 'Slight'} edge to the ${offense.nick} ${offUnit}: #${ro} in the league against a #${rd} ${defUnit}.` }
    : { lean: 'defense', size, text: `${size === 'major' ? 'Major' : size === 'clear' ? 'Clear' : 'Slight'} edge to the ${defense.nick} ${defUnit}: #${rd} in the league against a #${ro} ${offUnit}.` };
}

/**
 * Every unit section for one offense against the defense it faces, in the reader's footing (adjusted or raw). A pair
 * the publication does not carry for either team is dropped; a section with nothing left is dropped.
 */
export function unitSections(r: EventResearchDoc | null, profiles: Profiles, g: GameSides, offense: Side, mode: StatMode, basics?: Map<string, TeamBasics> | null): UnitSection[] {
  const defense = g.opp(offense.abbr);
  const out: UnitSection[] = [];
  for (const s of SECTIONS) {
    const pairs = s.pairs
      .map((p) => ({ label: p.label, off: pick(p.off, (id) => obsFor(r, profiles, offense, id), mode), def: pick(p.def, (id) => obsFor(r, profiles, defense, id), mode) }))
      .filter((p) => p.off || p.def);
    const bs = s.basics
      .map((k) => ({ off: basics?.get(offense.abbr)?.off.find((v) => v.def.key === k) ?? null, def: basics?.get(defense.abbr)?.def.find((v) => v.def.key === k) ?? null }))
      .filter((b) => b.off || b.def);
    if (!pairs.length && !bs.length) continue;
    const lead = pairs.find((p) => p.off && p.def && directional(p.off.obs) && directional(p.def.obs));
    out.push({
      key: s.key, title: s.title, offense, defense, offUnit: s.offUnit, defUnit: s.defUnit, pairs, basics: bs,
      conclusion: lead ? conclude(offense, defense, s.offUnit, s.defUnit, lead.off!.obs, lead.def!.obs) : null,
      limit: s.limit ?? null,
    });
  }
  return out;
}
