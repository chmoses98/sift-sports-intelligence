// The top matchup advantages, in plain English. Pure: a published unit row (an offense's league rank against the opposing defense's, both
// opponent-adjusted, season-long) goes in; a sentence, what the statistic means, why it matters and what it implies for the game come out.
//
// The copy is fixed per unit (written once, here, not generated from the numbers) and every number in a sentence is a published rank. A unit that
// is Even has no direction and is never promoted into an advantage. The implication line is descriptive ("if this holds, ...") and never a
// prediction, a probability or a price.
import { ordinal, type UnitRow } from '../../data/research/matchup';

export type Strength = 'modest' | 'strong' | 'major';

/** Percentile-point gap bands (the tilt rule already removed gaps of 15 or less). */
export const strengthOf = (gap: number): Strength => { const g = Math.abs(gap); return g > 55 ? 'major' : g > 30 ? 'strong' : 'modest'; };

interface UnitCopy {
  /** "passing": "The Bills have a strong passing advantage." */
  noun: string;
  /** The same unit when the defense holds the advantage ("pass-defense"). */
  defNoun: string;
  /** The offense's statistic and the defense's statistic, as a sentence names them. */
  offStat: string;
  defStat: string;
  /** What the statistic measures, in words a fan reads. */
  meaning: string;
  /** Why this unit matters to a game. */
  why: string;
  /** What an offense advantage lets the offense do, and what a defense advantage lets the defense do. */
  gain: string;
  deny: string;
}

const EPA = 'EPA (expected points added) is how many points a play adds compared with an average play in the same situation.';
const ADJ = 'Ranks are opponent-adjusted: they account for how good the teams each side has faced.';

/** NFL, keyed by the unit id in data/research/matchup.ts. A unit with no entry has no readable sentence (and is not offered as an advantage). */
export const UNIT_COPY: Record<string, UnitCopy> = {
  epa: { noun: 'overall efficiency', defNoun: 'defensive efficiency', offStat: 'EPA per play', defStat: 'EPA allowed per play', meaning: `${EPA} This is the average over every play. ${ADJ}`, why: 'It is the broadest single read of how well an offense moves the ball against a defense.', gain: 'sustain drives and score more than their average', deny: 'make this offense less efficient than usual' },
  pass: { noun: 'passing', defNoun: 'pass-defense', offStat: 'EPA per dropback', defStat: 'EPA allowed per dropback', meaning: `${EPA} A dropback is any play where the quarterback drops to pass, including sacks and scrambles. ${ADJ}`, why: 'Most NFL plays are passes, so this unit moves expected scoring more than most.', gain: 'move the ball through the air with room to work', deny: 'keep the passing game below its usual output' },
  rush: { noun: 'rushing', defNoun: 'run-defense', offStat: 'EPA per rush', defStat: 'EPA allowed per rush', meaning: `${EPA} Here it counts designed runs only. ${ADJ}`, why: 'The run game controls the clock and sets up play-action, so it shapes how a game is played as well as scored.', gain: 'lean on the run and shorten the game', deny: 'bottle up the run and force the offense to throw' },
  ed: { noun: 'early-down', defNoun: 'early-down defense', offStat: 'early-down EPA', defStat: 'early-down EPA allowed', meaning: `${EPA} Early downs are first and second down. ${ADJ}`, why: 'Winning first and second down keeps an offense out of third-and-long, which is where drives usually end.', gain: 'stay ahead of the chains', deny: 'push the offense into long third downs' },
  xp: { noun: 'explosive-play', defNoun: 'big-play defense', offStat: 'explosive-play rate', defStat: 'explosive plays allowed', meaning: `The explosive-play rate is the share of plays that gain a large chunk of yards. ${ADJ}`, why: 'Big plays can swing a game quickly, but they vary a lot from week to week.', gain: 'hit big plays', deny: 'keep plays in front of them' },
  press: { noun: 'pass-protection', defNoun: 'pass-rush', offStat: 'sack rate allowed', defStat: 'sack rate', meaning: `Sack rate is the share of dropbacks that end in a sack. For an offense it is sacks allowed, so a better rank means fewer. ${ADJ}`, why: 'Pressure and sacks end drives and take the quarterback out of rhythm.', gain: 'give the quarterback time to throw', deny: 'pressure the quarterback' },
  to: { noun: 'ball-security', defNoun: 'takeaway', offStat: 'turnover rate', defStat: 'takeaway rate', meaning: `Turnover rate is how often an offense gives the ball away; takeaway rate is how often a defense gets it. ${ADJ}`, why: 'Turnovers change possession and field position, and they are the least predictable part of a game.', gain: 'protect the ball', deny: 'create extra possessions' },
};

export interface RankBar {
  /** "Bills offense" / "Ravens defense". */
  label: string;
  role: 'off' | 'def';
  rank: number;
  n: number;
  /** League percentile 0..100 (100 best): the bar's length. */
  pct: number;
  /** "1st of 28". */
  rankText: string;
  /** The statistic this rank is in ("EPA per dropback"). */
  stat: string;
}

export interface Advantage {
  id: string;
  /** The team code the advantage belongs to. */
  team: string;
  side: 'off' | 'def';
  strength: Strength;
  /** "The Bills have a strong passing advantage." */
  headline: string;
  /** "Their offense ranks 1st of 28 in EPA per dropback, while the Ravens’ defense ranks 18th of 28 in EPA allowed per dropback." */
  detail: string;
  meaning: string;
  why: string;
  implies: string;
  /** The advantaged side's bar first. */
  bars: [RankBar, RankBar];
  row: UnitRow;
}

const possessive = (nick: string) => (nick.endsWith('s') ? `${nick}’` : `${nick}’s`);

export interface Names { nick: (code: string) => string }

export function advantageOf(row: UnitRow, names: Names): Advantage | null {
  const copy = UNIT_COPY[row.unit.id];
  if (!copy || row.tilt === 'even' || !row.favours) return null;
  const off = names.nick(row.offTeam), def = names.nick(row.defTeam);
  const strength = strengthOf(row.gap);
  const offBar: RankBar = { label: `${off} offense`, role: 'off', rank: row.o.rank, n: row.o.n, pct: row.o.pct, rankText: `${ordinal(row.o.rank)} of ${row.o.n}`, stat: copy.offStat };
  const defBar: RankBar = { label: `${def} defense`, role: 'def', rank: row.d.rank, n: row.d.n, pct: row.d.pct, rankText: `${ordinal(row.d.rank)} of ${row.d.n}`, stat: copy.defStat };
  const offWins = row.tilt === 'off';
  const winner = offWins ? off : def;
  const headline = `The ${winner} have a ${strength} ${offWins ? copy.noun : copy.defNoun} advantage.`;
  const detail = offWins
    ? `Their offense ranks ${ordinal(row.o.rank)} of ${row.o.n} in ${copy.offStat}, while the ${possessive(def)} defense ranks ${ordinal(row.d.rank)} of ${row.d.n} in ${copy.defStat}.`
    : `Their defense ranks ${ordinal(row.d.rank)} of ${row.d.n} in ${copy.defStat}, while the ${possessive(off)} offense ranks ${ordinal(row.o.rank)} of ${row.o.n} in ${copy.offStat}.`;
  const implies = offWins
    ? `If it holds, the ${off} should be able to ${copy.gain} against this defense. The ${def} would need to win elsewhere.`
    : `If it holds, the ${def} should be able to ${copy.deny}. The ${off} would need to win elsewhere.`;
  return { id: `${row.offTeam}-${row.unit.id}`, team: row.favours, side: row.tilt, strength, headline, detail, meaning: copy.meaning, why: copy.why, implies, bars: offWins ? [offBar, defBar] : [defBar, offBar], row };
}

/** Units whose ranks swing the most from week to week (explosive plays, turnovers): they lead only when too few steadier units have a direction. */
const VOLATILE = new Set(['xp', 'to']);

/**
 * The widest directional gaps across both directions, at most `max`, one per unit and direction, widest first (declared unit order breaks
 * ties). Steadier units (efficiency, passing, rushing, early downs, pass protection) come before the volatile ones.
 */
export function topAdvantages(rowsA: UnitRow[], rowsB: UnitRow[], names: Names, max = 3): Advantage[] {
  const all = [...rowsA, ...rowsB].map((r, i) => ({ r, i })).sort((a, b) => Number(VOLATILE.has(a.r.unit.id)) - Number(VOLATILE.has(b.r.unit.id)) || Math.abs(b.r.gap) - Math.abs(a.r.gap) || a.i - b.i).map((x) => x.r);
  const out: Advantage[] = [];
  for (const r of all) {
    const a = advantageOf(r, names);
    if (a) out.push(a);
    if (out.length >= max) break;
  }
  return out;
}

export interface RowReading {
  tilt: UnitRow['tilt'];
  /** One plain sentence: the advantage, or "about even". */
  headline: string;
  /** The two published ranks in words. */
  detail: string;
  /** Offense bar first, then the defense it faces (a fixed order, so a list of rows scans down the same columns). */
  bars: [RankBar, RankBar];
}

/** Any unit row, Even included, as a readable sentence and two rank bars (the default presentation of the Matchup tab). Null for a unit with no copy. */
export function readRow(row: UnitRow, names: Names): RowReading | null {
  const copy = UNIT_COPY[row.unit.id];
  if (!copy) return null;
  const off = names.nick(row.offTeam), def = names.nick(row.defTeam);
  const offBar: RankBar = { label: `${off} offense`, role: 'off', rank: row.o.rank, n: row.o.n, pct: row.o.pct, rankText: `${ordinal(row.o.rank)} of ${row.o.n}`, stat: copy.offStat };
  const defBar: RankBar = { label: `${def} defense`, role: 'def', rank: row.d.rank, n: row.d.n, pct: row.d.pct, rankText: `${ordinal(row.d.rank)} of ${row.d.n}`, stat: copy.defStat };
  const detail = `The ${off} offense ranks ${ordinal(row.o.rank)} of ${row.o.n} in ${copy.offStat}; the ${def} defense ranks ${ordinal(row.d.rank)} of ${row.d.n} in ${copy.defStat}.`;
  if (row.tilt === 'even') return { tilt: 'even', headline: `${off} offense against ${def} defense is about even in ${copy.noun}.`, detail, bars: [offBar, defBar] };
  const a = advantageOf(row, names);
  return { tilt: row.tilt, headline: a!.headline, detail, bars: [offBar, defBar] };
}

/** The line under the advantages: what they are and are not. */
export const ADVANTAGE_NOTE = 'Season-long, opponent-adjusted league ranks. A gap is the offense’s league percentile minus the defense’s; only gaps over 15 points get a direction. A description of how the units compare, not a prediction or a pick.';
