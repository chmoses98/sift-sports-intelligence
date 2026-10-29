// Key matchups: players the market lists props for, set against the opposing unit's published league rank. Pure and price-free:
// the price shown beside a player is the Kalshi ask of his main line, passed through the quote gate by the screen, never here.
//
// Which players: those with the deepest listed ladders in the unit-mapped stats (a market lists more rungs for a player it expects to
// matter). That is observed market depth, not a SIFT judgement. The opposing unit is only named and ranked; no number here says
// which side "wins".
import type { PropRow } from '../adapt';
import type { Price } from '../../model/types';
import type { UnitDef, UnitSide } from './matchup';

/** A prop statistic that belongs to a unit: which unit's opposing defense it meets, how its line is labelled, and which prop to prefer. */
export interface StatUnit { unit: string; short: string; /** The stat in a sentence ("receptions"). */ word: string; prefer: number }
export const NFL_PROP_UNITS: Record<string, StatUnit> = {
  receptions: { unit: 'pass', short: 'Rec', word: 'receptions', prefer: 1 },
  receiving_yards: { unit: 'pass', short: 'Rec yds', word: 'receiving yards', prefer: 2 },
  completions: { unit: 'pass', short: 'Cmp', word: 'completions', prefer: 3 },
  passing_yards: { unit: 'pass', short: 'Pass yds', word: 'passing yards', prefer: 1 },
  attempts: { unit: 'pass', short: 'Att', word: 'pass attempts', prefer: 4 },
  rushing_yards: { unit: 'rush', short: 'Rush yds', word: 'rushing yards', prefer: 1 },
  carries: { unit: 'rush', short: 'Car', word: 'carries', prefer: 2 },
};

export interface RosterPlayer { id: string; name: string; role: string | null; team: string }

export interface KeyMatchup {
  playerId: string;
  name: string;
  role: string | null;
  team: string;
  oppTeam: string;
  unit: UnitDef;
  /** The opposing defense's published rank in this unit. */
  oppSide: UnitSide;
  stat: string;
  /** "Rec 7+". */
  label: string;
  /** "receptions 7+". */
  phrase: string;
  line: number;
  price: Price;
  /** How many rungs the market lists across this player's unit-mapped props (the ordering key). */
  depth: number;
}

/** "7+" for a half-point line of 6.5; the rung a buyer needs. */
export const rungOf = (line: number) => `${Math.ceil(line)}+`;

export function keyMatchups(o: {
  props: PropRow[];
  roster: RosterPlayer[];
  units: UnitDef[];
  statUnits: Record<string, StatUnit>;
  /** The opposing team's defense side for a unit (its published rank), or null. */
  defSide: (team: string, unit: UnitDef) => UnitSide | null;
  opponent: (team: string) => string | null;
  max?: number;
}): KeyMatchup[] {
  const players = new Map(o.roster.map((p) => [p.id, p]));
  const byId = new Map(o.units.map((u) => [u.id, u]));
  const cands: KeyMatchup[] = [];
  const mine = new Map<string, PropRow[]>();
  for (const r of o.props) {
    if (!r.playerId || !o.statUnits[r.stat] || !players.has(r.playerId)) continue;
    mine.set(r.playerId, [...(mine.get(r.playerId) ?? []), r]);
  }
  for (const [id, rows] of mine) {
    const p = players.get(id)!;
    const best = [...rows].sort((a, b) => o.statUnits[a.stat].prefer - o.statUnits[b.stat].prefer || b.ladder.length - a.ladder.length)[0];
    const unit = byId.get(o.statUnits[best.stat].unit);
    const opp = o.opponent(p.team);
    if (!unit || !opp) continue;
    const oppSide = o.defSide(opp, unit);
    if (!oppSide) continue;
    cands.push({
      playerId: id, name: p.name, role: p.role, team: p.team, oppTeam: opp, unit, oppSide, stat: best.stat,
      label: `${o.statUnits[best.stat].short} ${rungOf(best.line)}`, phrase: `${o.statUnits[best.stat].word} ${rungOf(best.line)}`, line: best.line, price: best.price,
      depth: rows.reduce((s, r) => s + r.ladder.length, 0),
    });
  }
  cands.sort((a, b) => b.depth - a.depth || a.name.localeCompare(b.name));
  const max = o.max ?? 3;
  const picks: KeyMatchup[] = [];
  // Both teams are represented when both have a candidate: the deepest of each first, then the deepest remaining.
  for (const team of [...new Set(cands.map((c) => c.team))]) { const first = cands.find((c) => c.team === team); if (first && picks.length < max) picks.push(first); }
  for (const c of cands) if (picks.length < max && !picks.includes(c)) picks.push(c);
  return picks.sort((a, b) => b.depth - a.depth || a.name.localeCompare(b.name));
}

export interface ResearchPlayer { playerId: string; name: string; role: string | null; team: string | null; stat: string; label: string; line: number; price: Price; depth: number }

/**
 * Players to research on the Overview: those the market lists the deepest ladders for. With `statUnits` (a sport with unit matchups)
 * only the stats that meet a unit count, the same players the Matchup tab's key matchups come from; otherwise every listed prop does.
 * Needs no team profile, so the Overview stays light. Both teams are represented when both have a candidate.
 */
export function playersToResearch(o: { props: PropRow[]; roster: RosterPlayer[]; statUnits?: Record<string, StatUnit>; max?: number }): ResearchPlayer[] {
  const who = new Map(o.roster.map((p) => [p.id, p]));
  const by = new Map<string, PropRow[]>();
  for (const r of o.props) {
    if (!r.playerId || (o.statUnits && !o.statUnits[r.stat])) continue;
    by.set(r.playerId, [...(by.get(r.playerId) ?? []), r]);
  }
  const cands: ResearchPlayer[] = [...by.entries()].map(([id, rows]) => {
    const main = [...rows].sort((a, b) => (o.statUnits ? o.statUnits[a.stat].prefer - o.statUnits[b.stat].prefer : 0) || b.ladder.length - a.ladder.length)[0];
    const p = who.get(id);
    const short = o.statUnits?.[main.stat]?.short ?? main.statLabel;
    return { playerId: id, name: main.player, role: p?.role ?? null, team: p?.team ?? null, stat: main.stat, label: `${short} ${rungOf(main.line)}`, line: main.line, price: main.price, depth: rows.reduce((s, r) => s + r.ladder.length, 0) };
  }).sort((a, b) => b.depth - a.depth || a.name.localeCompare(b.name));
  const max = o.max ?? 3;
  const picks: ResearchPlayer[] = [];
  for (const team of [...new Set(cands.map((c) => c.team).filter((t): t is string => !!t))]) { const first = cands.find((c) => c.team === team); if (first && picks.length < max) picks.push(first); }
  for (const c of cands) if (picks.length < max && !picks.includes(c)) picks.push(c);
  return picks.sort((a, b) => b.depth - a.depth || a.name.localeCompare(b.name));
}
