// Game matchup, as pure functions over team profiles (no fetching, no React, no clock, no prices): the offense-against-defense unit rows,
// the tilt, the summary counts and the SIFT Lens text. Everything is observed or published: league ranks come from the two team
// profiles, percentiles from the design system's own formula, and a unit a team has no published rank for is simply not a row.
//
// Tilt (docs/sift3/redesign/DESIGN_SYSTEM.md, "Matchup tilt"): gap = offense league percentile - opposing defense league percentile,
// percentile = (n - rank) / (n - 1) x 100 (100 best). The gap is compared AS DISPLAYED, rounded to a whole percentile point:
// |gap| <= 15 is Even (a gap of exactly 15 is Even); only |gap| > 15 has a direction. Summary counts use this same function, so they
// always add up to the number of units shown. It is a descriptive heuristic over season-long, opponent-adjusted unit strength:
// not a prediction and not a validated betting edge.
import { percentileOf } from './normalize';
import type { TeamProfile } from './types';

/** The Even band, in whole percentile points. */
export const EVEN_BAND = 15;
/** The window of the opponent-adjusted statistics (a season-long ridge rating). */
export const MATCHUP_WINDOW = 'ADJ_RIDGE';

export type Tilt = 'off' | 'def' | 'even';

export interface UnitDef {
  id: string;
  title: string;
  /** What the value measures ("EPA per dropback"). */
  unit: string;
  /** Opponent-adjusted statistic ids (published, without the sport prefix). */
  off: string;
  def: string;
  /** The unit in a sentence ("the passing game"). */
  phr: string;
  /** The offense's statistic and the defense's statistic, as named in the Lens evidence. */
  oL: string;
  dL: string;
  /** 'epa': +0.051. 'pts': a rate published as a fraction, shown in percentage points. */
  fmt: 'epa' | 'pts';
  /** The word after a defense value: "allowed" for what a defense gives up; empty when the statistic is what it produces (sacks, takeaways). */
  defWord: string;
}

/** NFL, in the order the rows and the seven-segment meter use. A sport adds its own declaration here. */
export const NFL_UNITS: UnitDef[] = [
  { id: 'epa', title: 'Overall', unit: 'EPA per play', off: 'adj_off_epa', def: 'adj_def_epa', phr: 'overall efficiency', oL: 'EPA per play', dL: 'EPA per play allowed', fmt: 'epa', defWord: 'allowed' },
  { id: 'pass', title: 'Passing', unit: 'EPA per dropback', off: 'adj_off_db_epa', def: 'adj_def_db_epa', phr: 'the passing game', oL: 'EPA per dropback', dL: 'EPA per dropback allowed', fmt: 'epa', defWord: 'allowed' },
  { id: 'rush', title: 'Rushing', unit: 'EPA per rush', off: 'adj_off_rush_epa', def: 'adj_def_rush_epa', phr: 'the running game', oL: 'EPA per rush', dL: 'EPA per rush allowed', fmt: 'epa', defWord: 'allowed' },
  { id: 'ed', title: 'Early downs', unit: 'EPA per early-down play', off: 'adj_off_ed_epa', def: 'adj_def_ed_epa', phr: 'early downs', oL: 'early-down EPA', dL: 'early-down EPA allowed', fmt: 'epa', defWord: 'allowed' },
  { id: 'xp', title: 'Explosive plays', unit: 'play rate', off: 'adj_off_explosive', def: 'adj_def_explosive', phr: 'explosive plays', oL: 'explosive-play rate', dL: 'explosive plays allowed', fmt: 'pts', defWord: 'allowed' },
  { id: 'press', title: 'Pass rush', unit: 'sack rate', off: 'adj_off_sack_rate', def: 'adj_def_sack_rate', phr: 'pass protection vs pass rush', oL: 'sack rate allowed', dL: 'sack rate', fmt: 'pts', defWord: '' },
  { id: 'to', title: 'Turnovers', unit: 'turnover rate', off: 'adj_off_to_rate', def: 'adj_def_to_rate', phr: 'ball security vs takeaways', oL: 'turnover rate', dL: 'takeaway rate', fmt: 'pts', defWord: '' },
];

/** What each sport declares. A sport with no entry has no unit matchup (the capability stays closed). */
export const UNIT_SETS: Record<string, UnitDef[]> = { nfl: NFL_UNITS };
export const unitsFor = (slug: string): UnitDef[] => UNIT_SETS[slug.toLowerCase()] ?? [];

/** One side of a unit: a published league rank and the universe it is out of. */
export interface UnitSide {
  rank: number;
  n: number;
  value: number | null;
  /** League percentile by the design system's formula, 0 worst to 100 best. Not the publication's own percentile field. */
  pct: number;
  rankingId: string | null;
  higherIsBetter: boolean | null;
}

export interface UnitRow {
  unit: UnitDef;
  offTeam: string;
  defTeam: string;
  o: UnitSide;
  d: UnitSide;
  /** Offense percentile minus defense percentile, rounded to a whole point (the displayed gap). */
  gap: number;
  tilt: Tilt;
  /** The team the tilt favours: the offense team, the defense team, or null for Even. */
  favours: string | null;
}

/** Round half away from zero, tolerant of float noise (a gap of 14.4999999 is 14, of 15.0000001 is 15). */
export const roundGap = (x: number): number => {
  const a = Math.round(Math.abs(x) * 1e6) / 1e6;
  const r = Math.round(a);
  return x < 0 ? -r : r;
};

export const gapOf = (offPct: number, defPct: number): number => roundGap(offPct - defPct);
/** The one tilt rule. |gap| <= 15 is Even, including exactly 15. */
export const tiltOf = (gap: number): Tilt => (Math.abs(gap) > EVEN_BAND ? (gap > 0 ? 'off' : 'def') : 'even');

export function sideOf(profile: TeamProfile | null | undefined, statId: string): UnitSide | null {
  const w = profile?.metrics.get(statId)?.windows[MATCHUP_WINDOW];
  if (!w || w.rank == null || w.n == null || w.n < 2) return null;
  const pct = percentileOf(w.rank, w.n);
  if (pct == null) return null;
  return { rank: w.rank, n: w.n, value: w.value, pct, rankingId: w.rankingId, higherIsBetter: w.higherIsBetter };
}

/** One unit for one direction, or null when either team has no published rank for it. */
export function unitRow(unit: UnitDef, offTeam: string, defTeam: string, offProfile: TeamProfile | null | undefined, defProfile: TeamProfile | null | undefined): UnitRow | null {
  const o = sideOf(offProfile, unit.off), d = sideOf(defProfile, unit.def);
  if (!o || !d) return null;
  const gap = gapOf(o.pct, d.pct);
  const tilt = tiltOf(gap);
  return { unit, offTeam, defTeam, o, d, gap, tilt, favours: tilt === 'off' ? offTeam : tilt === 'def' ? defTeam : null };
}

/** Every unit with published ranks for both teams, in the sport's declared order. */
export const unitRows = (units: UnitDef[], offTeam: string, defTeam: string, offProfile: TeamProfile | null | undefined, defProfile: TeamProfile | null | undefined): UnitRow[] =>
  units.map((u) => unitRow(u, offTeam, defTeam, offProfile, defProfile)).filter((r): r is UnitRow => r != null);

export interface TiltCounts { off: number; even: number; def: number; total: number }
/** The summary counts: the same rule as the rows, so off + even + def is always the number of units shown. */
export function tiltCounts(rows: UnitRow[]): TiltCounts {
  const c = { off: 0, even: 0, def: 0, total: rows.length };
  for (const r of rows) c[r.tilt]++;
  return c;
}

const MINUS = '−';
export const signed = (v: number, digits: number) => `${v >= 0 ? '+' : MINUS}${Math.abs(v).toFixed(digits)}`;

/** A unit value as the row prints it: "+0.051" for EPA, "−0.9 pts" for a rate published as a fraction. */
export function fmtUnitValue(unit: UnitDef, v: number | null): string {
  if (v == null) return '—';
  return unit.fmt === 'pts' ? `${signed(v * 100, 1)} pts` : signed(v, 3);
}

/** A raw (not opponent-adjusted) value: the statistic as published, so a rate prints as a percentage and nothing is signed as a deviation. */
export function fmtRawValue(unit: UnitDef, v: number | null): string {
  if (v == null) return '—';
  return unit.fmt === 'pts' ? `${(v * 100).toFixed(1)}%` : signed(v, 3);
}

export const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };
export const signedGap = (gap: number) => `${gap >= 0 ? '+' : MINUS}${Math.abs(gap)}`;

// ------------------------------------------------------------------------------------------------------------------ the SIFT Lens

export interface LensEvidence {
  row: UnitRow;
  /** The advantaged side of the unit. */
  side: 'off' | 'def';
  team: string;
  phrase: string;
  /** "PHI 3rd in turnover rate · DAL 28th of 28 in takeaway rate". */
  detail: string;
}

export interface MatchupLens {
  /** "Widest gap:" and what follows; null when every unit is Even. */
  observation: { lead: string; text: string } | null;
  counter: { lead: string; text: string } | null;
  /** The three widest directional gaps across both directions. */
  evidence: LensEvidence[];
  allEven: boolean;
}

const byWidth = (rows: UnitRow[]) => rows.map((r, i) => ({ r, i })).sort((a, b) => Math.abs(b.r.gap) - Math.abs(a.r.gap) || a.i - b.i).map((x) => x.r);

/**
 * The Lens: one observation, one counter-case and the evidence, built only from the unit rows (observed league ranks). `rowsA` and
 * `rowsB` are the two directions. It states no probability, price or pick; a unit that is Even has no direction and is never
 * promoted into one.
 */
export function buildLens(rowsA: UnitRow[], rowsB: UnitRow[]): MatchupLens {
  const all = byWidth([...rowsA, ...rowsB]);
  const directional = all.filter((r) => r.tilt !== 'even');
  const evidence: LensEvidence[] = directional.slice(0, 3).map((r) => {
    const side = r.tilt as 'off' | 'def';
    return {
      row: r, side, team: r.favours!, phrase: r.unit.phr,
      detail: `${r.offTeam} ${ordinal(r.o.rank)} in ${r.unit.oL} · ${r.defTeam} ${ordinal(r.d.rank)} of ${r.d.n} in ${r.unit.dL}`,
    };
  });
  const top = directional[0];
  if (!top) return { observation: null, counter: null, evidence: [], allEven: all.length > 0 };
  const lead = top.tilt === 'off'
    ? `${top.offTeam}’s offense vs ${top.defTeam}’s defense in ${top.unit.phr}; ${top.defTeam} is ${ordinal(top.d.rank)} of ${top.d.n} in ${top.unit.dL}.`
    : `${top.defTeam}’s defense vs ${top.offTeam}’s offense in ${top.unit.phr}; ${top.defTeam} is ${ordinal(top.d.rank)} of ${top.d.n} in ${top.unit.dL}.`;
  const other = top.favours === top.offTeam ? top.defTeam : top.offTeam;
  const best = directional.find((r) => r.favours === other);
  const counter = best
    ? { lead: 'Counter-case:', text: `${other}’s best matchup is ${best.unit.phr} (${ordinal(best.favours === best.offTeam ? best.o.rank : best.d.rank)} against ${ordinal(best.favours === best.offTeam ? best.d.rank : best.o.rank)}).` }
    : { lead: 'Counter-case:', text: `no unit tilts toward ${other} by more than ${EVEN_BAND} points.` };
  return { observation: { lead: 'Widest gap:', text: lead }, counter, evidence, allEven: false };
}

/** The copy that states what the tilt is and is not. Fixed wording: the product says it wherever the tilt is explained. */
export const HOW_TO_READ = 'A gap is the offense’s league percentile minus the opposing defense’s. Only gaps larger than 15 points get a direction; 15 or less is Even. It is a descriptive visual heuristic over season-long, opponent-adjusted unit strength: not a prediction, and not a validated betting edge.';
