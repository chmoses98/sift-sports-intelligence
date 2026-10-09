// CORRELATION AND CONTRADICTION — two cards on the same game are one exposure, never two independent edges; and two
// positions that cannot both win rely on opposite scenarios, which Sift says out loud rather than featuring both as if
// they agreed (live, 2026-10-09: "YES Result: away" beside "NO away team total over 0.5" on the same fixture).
//
// A position's settlement is read from the publication's own contract words, never inferred from a price:
//   soccer full-time contracts   a rule over the final score (result, both teams score, totals, team totals, margins,
//                                exact score); two positions contradict when no final score pays both
//   match / game winners         the participant who must win (tennis match winner, MLB moneyline)
//   any contract                 YES and NO on the same ticker
// First-half and other period contracts carry no full-time rule and are only compared by ticker.
import type { Opportunity } from './types';

export type ScoreRule =
  | { k: 'result'; who: 'home' | 'away' | 'draw' }
  | { k: 'btts' }
  | { k: 'total'; over: number }
  | { k: 'teamTotal'; team: 'home' | 'away'; over: number }
  | { k: 'margin'; team: 'home' | 'away'; over: number }
  | { k: 'exact'; h: number; a: number };

/** What must happen for a position to pay, as far as the contract words say. */
export interface Outcome {
  /** Soccer full-time contracts: the rule over the final score that the YES side pays on. */
  score?: ScoreRule | null;
  /** The participant who must win for the position (after its side) to pay. */
  winner?: string | null;
}

/** A soccer full-time contract's YES rule from the publication's market description; null for any other period or family. */
export function soccerScoreRule(desc: string): ScoreRule | null {
  const d = desc.trim().toLowerCase();
  if (/first.half|second.half|1st half|2nd half|first team to score/.test(d)) return null;
  let m = /^result:\s*(home|away|draw)$/.exec(d);
  if (m) return { k: 'result', who: m[1] as 'home' | 'away' | 'draw' };
  if (d === 'btts' || /^both teams (to )?score$/.test(d)) return { k: 'btts' };
  m = /^total goals over ([\d.]+)$/.exec(d);
  if (m) return { k: 'total', over: Number(m[1]) };
  m = /^(home|away) team total over ([\d.]+)$/.exec(d);
  if (m) return { k: 'teamTotal', team: m[1] as 'home' | 'away', over: Number(m[2]) };
  m = /^(home|away) wins by more than ([\d.]+)$/.exec(d);
  if (m) return { k: 'margin', team: m[1] as 'home' | 'away', over: Number(m[2]) };
  m = /^exact score (\d+)-(\d+) \(home-away\)$/.exec(d);
  if (m) return { k: 'exact', h: Number(m[1]), a: Number(m[2]) };
  return null;
}

export function ruleHolds(r: ScoreRule, h: number, a: number): boolean {
  switch (r.k) {
    case 'result': return r.who === 'home' ? h > a : r.who === 'away' ? a > h : h === a;
    case 'btts': return h > 0 && a > 0;
    case 'total': return h + a > r.over;
    case 'teamTotal': return (r.team === 'home' ? h : a) > r.over;
    case 'margin': return (r.team === 'home' ? h - a : a - h) > r.over;
    case 'exact': return h === r.h && a === r.a;
  }
}

const MAX_GOALS = 15;

/** True when no final score pays both positions (each rule read on its side: YES pays when it holds, NO when it fails). */
export function scoreRulesExclusive(a: ScoreRule, aSide: 'YES' | 'NO', b: ScoreRule, bSide: 'YES' | 'NO'): boolean {
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let g = 0; g <= MAX_GOALS; g++) {
      if (ruleHolds(a, h, g) === (aSide === 'YES') && ruleHolds(b, h, g) === (bSide === 'YES')) return false;
    }
  }
  return true;
}

/** True when the two positions cannot both win: they rely on opposite scenarios of the same game. */
export function contradicts(a: Opportunity, b: Opportunity): boolean {
  if (a.id === b.id || a.sport !== b.sport || a.eventId !== b.eventId) return false;
  if (a.ticker && a.ticker === b.ticker) return a.what.side !== b.what.side;
  const sa = a.outcome?.score;
  const sb = b.outcome?.score;
  if (sa && sb) return scoreRulesExclusive(sa, a.what.side, sb, b.what.side);
  const wa = a.outcome?.winner;
  const wb = b.outcome?.winner;
  return !!wa && !!wb && wa !== wb;
}
