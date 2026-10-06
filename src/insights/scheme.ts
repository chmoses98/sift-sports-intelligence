// SCHEME — how one team's tendencies meet the other's habits, from FTN charting (via nflverse).
//
// What the data supports (2026, per week, before this game): how often a defense blitzes, how often a
// defense stacks the box against the run, an offense's EPA per dropback when blitzed, and how much more
// (or less) an offense throws to its backs against the blitz. What it does not: man/zone coverage, routes,
// pressure on non-sacks for every play. Insights here are descriptive pairings with their sample sizes —
// "when blitzed this season, Atlanta threw to its backs on 30% of targets (9 of 30)" — never claims that
// one causes the other. Each needs a minimum sample before it is shown.
import { rbShareNoBlitz, schemeFor, type SchemeValue } from '../history/team';
import type { TeamHistoryDoc } from '../history/types';
import { extremeWord } from '../lib/rank';
import type { GameSides, Side } from './game';

export interface SchemeInsight {
  id: string;
  team: Side;
  opp: Side;
  headline: string;
  lines: string[];
  /** Sample sizes the lines rest on. */
  samples: string[];
  /** The skill position this most concerns (for props). */
  position: 'RB' | 'QB' | null;
  /** 0..1 ordering key. */
  score: number;
  rows: SchemeValue[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** "the NFL's 2nd-highest rate" */
const rateRank = (v: SchemeValue) => (v.rank != null ? `the NFL's ${extremeWord(v.rank, v.of).toLowerCase()} rate` : 'unranked');

/** Blitz-heavy (top 6) or blitz-shy (bottom 6) defenses against the offense's record versus the blitz. */
export function blitzInsight(doc: TeamHistoryDoc, g: GameSides, offense: Side): SchemeInsight | null {
  if (g.week == null) return null;
  const def = g.opp(offense.abbr);
  const blitz = schemeFor(doc, 'blitz_rate', def.abbr, g.week);
  if (!blitz || blitz.rank == null || blitz.value == null) return null;
  const heavy = blitz.rank <= 6;
  const shy = blitz.rank > blitz.of - 6;
  if (!heavy && !shy) return null;
  const vs = schemeFor(doc, 'epa_vs_blitz', offense.abbr, g.week);
  const rb = schemeFor(doc, 'rb_target_share_vs_blitz', offense.abbr, g.week);
  const rbNo = rbShareNoBlitz(doc, offense.abbr, g.week);
  const lines: string[] = [];
  const samples: string[] = [`${def.nick}: ${blitz.n} charted dropbacks faced`];
  let position: SchemeInsight['position'] = null;
  let score = heavy ? (7 - blitz.rank) / 6 : (blitz.rank - (blitz.of - 6)) / 6;
  lines.push(`${def.nick} blitz on ${pct(blitz.value)} of dropbacks — ${rateRank(blitz)}.`);
  if (heavy && vs?.value != null && vs.rank != null) {
    const good = vs.rank <= Math.round(vs.of / 3);
    const bad = vs.rank > vs.of - Math.round(vs.of / 3);
    lines.push(`${offense.nick} vs the blitz: ${vs.value >= 0 ? '+' : '−'}${Math.abs(vs.value).toFixed(2)} EPA per dropback (#${vs.rank} of ${vs.of}${good ? ', among the best' : bad ? ', among the worst' : ''}).`);
    samples.push(`${offense.nick}: ${vs.n} blitzed dropbacks`);
    position = 'QB';
    if (good || bad) score += 0.3;
  }
  if (heavy && rb?.value != null && rbNo.value != null && rb.n >= rb.def.minSample && rbNo.n >= 40 && rb.value - rbNo.value >= 0.08) {
    lines.push(`When blitzed, ${offense.nick} throw to their running backs on ${pct(rb.value)} of targets (${Math.round(rb.value * rb.n)} of ${rb.n}), against ${pct(rbNo.value)} otherwise.`);
    samples.push(`${offense.nick}: ${rb.n} targets vs the blitz, ${rbNo.n} otherwise`);
    position = 'RB';
    score += 0.4;
  }
  if (lines.length < 2) return null;
  return {
    id: `blitz:${offense.abbr}`,
    team: def,
    opp: offense,
    headline: heavy ? `${def.nick} blitz often — watch how ${offense.nick} answer` : `${def.nick} rarely blitz`,
    lines,
    samples,
    position,
    score: Math.min(1, score),
    rows: [blitz, ...(vs ? [vs] : []), ...(rb ? [rb] : [])],
  };
}

/** Stacked boxes: a defense that loads the box often, against a run-first offense. */
export function boxInsight(doc: TeamHistoryDoc, g: GameSides, offense: Side): SchemeInsight | null {
  if (g.week == null) return null;
  const def = g.opp(offense.abbr);
  const box = schemeFor(doc, 'stacked_box_rate', def.abbr, g.week);
  if (!box || box.rank == null || box.value == null || box.rank > 5) return null;
  return {
    id: `box:${offense.abbr}`,
    team: def,
    opp: offense,
    headline: `${def.nick} load the box against the run`,
    lines: [`${def.nick} show 8+ defenders in the box on ${pct(box.value)} of runs — ${rateRank(box)}.`],
    samples: [`${def.nick}: ${box.n} charted runs faced`],
    position: 'RB',
    score: (6 - box.rank) / 6 * 0.6,
    rows: [box],
  };
}

export function schemeInsights(doc: TeamHistoryDoc | null, g: GameSides | null): SchemeInsight[] {
  if (!doc || !g) return [];
  return [g.away, g.home]
    .flatMap((o) => [blitzInsight(doc, g, o), boxInsight(doc, g, o)])
    .filter((x): x is SchemeInsight => !!x)
    .sort((a, b) => b.score - a.score);
}
