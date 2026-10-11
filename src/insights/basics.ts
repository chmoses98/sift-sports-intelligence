// THE BASICS — box-score numbers a fan reads first (points, yards, turnovers, sacks, third downs, red zone),
// per game or as a stated percentage, from nflverse play-by-play counts (history/teams.json, built by
// scripts/history/build-nfl-history.mjs). Every value is a sum of published counts divided by games played (or by
// its own denominator for a percentage) over the weeks before a game, so a game's pregame view never includes it.
// Ranks are among all 32 teams over the same weeks, #1 = best for the job (most points scored, fewest allowed);
// ties share a rank. Nothing is modelled or adjusted: these are raw results.
import type { TeamHistoryDoc, TeamWeek, UnitCounts } from '../history/types';

export type BasicKey =
  | 'points' | 'yards' | 'pass_yds' | 'rush_yds' | 'yds_play' | 'turnovers' | 'sacks' | 'third' | 'redzone';

export interface BasicDef {
  key: BasicKey;
  /** "Points per game" (offense) / "Points allowed per game" (defense). */
  label: { off: string; def: string };
  /** Short column label. */
  short: { off: string; def: string };
  /** What the number is per: "per game", "% of third downs", "per play". */
  per: string;
  /** How it is counted, in a few words ("net of sack yards"); shown under the label. */
  note: string;
  /** For the OFFENSE: higher is better (points, yards) or lower (turnovers, sacks taken). Defense is the mirror. */
  offHigherBetter: boolean;
  /** Present when every team-week in the document carries the counts it needs (older documents do not). */
  needs: (keyof UnitCounts)[];
  value: (u: Totals) => number | null;
  /** "36 of 99 third downs" — the counts behind a percentage. */
  sample?: (u: Totals) => string;
  pct?: boolean;
}

/** Sums of a unit's counts over a set of games. */
export type Totals = Record<keyof UnitCounts, number> & { games: number };

const per = (n: number, g: number) => (g > 0 ? n / g : null);

export const BASICS: BasicDef[] = [
  { key: 'points', label: { off: 'Points per game', def: 'Points allowed per game' }, short: { off: 'Points', def: 'Points allowed' }, note: 'from final scores', per: 'per game', offHigherBetter: true, needs: ['points'], value: (u) => per(u.points, u.games) },
  { key: 'yards', label: { off: 'Total yards per game', def: 'Yards allowed per game' }, short: { off: 'Total yards', def: 'Yards allowed' }, note: 'net passing + rushing yards', per: 'per game', offHigherBetter: true, needs: ['pass_yds', 'sack_yds', 'rush_yds'], value: (u) => per(u.pass_yds - u.sack_yds + u.rush_yds, u.games) },
  { key: 'pass_yds', label: { off: 'Passing yards per game', def: 'Passing yards allowed per game' }, short: { off: 'Pass yards', def: 'Pass yards allowed' }, note: 'net of sack yards', per: 'per game', offHigherBetter: true, needs: ['pass_yds', 'sack_yds'], value: (u) => per(u.pass_yds - u.sack_yds, u.games) },
  { key: 'rush_yds', label: { off: 'Rushing yards per game', def: 'Rushing yards allowed per game' }, short: { off: 'Rush yards', def: 'Rush yards allowed' }, note: 'QB scrambles and kneels included', per: 'per game', offHigherBetter: true, needs: ['rush_yds'], value: (u) => per(u.rush_yds, u.games) },
  { key: 'yds_play', label: { off: 'Yards per play', def: 'Yards allowed per play' }, short: { off: 'Yards / play', def: 'Yards / play allowed' }, note: 'net yards ÷ offensive plays', per: 'per play', offHigherBetter: true, needs: ['pass_yds', 'sack_yds', 'rush_yds', 'plays'], value: (u) => (u.plays > 0 ? (u.pass_yds - u.sack_yds + u.rush_yds) / u.plays : null) },
  { key: 'turnovers', label: { off: 'Turnovers per game', def: 'Takeaways per game' }, short: { off: 'Turnovers', def: 'Takeaways' }, note: 'interceptions + fumbles lost', per: 'per game', offHigherBetter: false, needs: ['ints', 'fum_lost'], value: (u) => per(u.ints + u.fum_lost, u.games) },
  { key: 'sacks', label: { off: 'Sacks taken per game', def: 'Sacks per game' }, short: { off: 'Sacks taken', def: 'Sacks' }, note: '', per: 'per game', offHigherBetter: false, needs: ['sacks'], value: (u) => per(u.sacks, u.games) },
  { key: 'third', label: { off: 'Third-down conversion rate', def: 'Opponent third-down rate' }, short: { off: '3rd down', def: 'Opp. 3rd down' }, note: '% of third downs converted', per: '% of third downs converted', offHigherBetter: true, pct: true, needs: ['third_att', 'third_conv'], value: (u) => (u.third_att > 0 ? u.third_conv / u.third_att : null), sample: (u) => `${u.third_conv} of ${u.third_att} third downs` },
  { key: 'redzone', label: { off: 'Red-zone touchdown rate', def: 'Opponent red-zone TD rate' }, short: { off: 'Red zone TD', def: 'Opp. red zone TD' }, note: '% of red-zone trips ending in a TD', per: '% of red-zone trips ending in a touchdown', offHigherBetter: true, pct: true, needs: ['rz_trips', 'rz_td'], value: (u) => (u.rz_trips > 0 ? u.rz_td / u.rz_trips : null), sample: (u) => `${u.rz_td} TDs in ${u.rz_trips} trips` },
];

export interface BasicValue {
  def: BasicDef;
  side: 'off' | 'def';
  value: number | null;
  rank: number | null;
  of: number;
  sample: string | null;
  /** Higher is better for the team that owns this side. */
  higherBetter: boolean;
}

export interface TeamBasics {
  team: string;
  games: number;
  /** Weeks included (all before `beforeWeek`). */
  weeks: number[];
  off: BasicValue[];
  def: BasicValue[];
}

function totals(weeks: TeamWeek[], side: 'off' | 'def'): Totals {
  const t = { games: weeks.length } as Totals;
  for (const w of weeks) {
    for (const [k, v] of Object.entries(w[side])) {
      const key = k as keyof UnitCounts;
      t[key] = (t[key] ?? 0) + (typeof v === 'number' ? v : 0);
    }
  }
  return t;
}

const has = (weeks: TeamWeek[], side: 'off' | 'def', keys: (keyof UnitCounts)[]) =>
  weeks.length > 0 && weeks.every((w) => keys.every((k) => typeof (w[side] as unknown as Record<string, unknown>)[k] === 'number'));

/**
 * Every team's basics over the weeks before `beforeWeek` (null = every week in the document), ranked across the
 * league. A stat whose counts the document does not carry is left out, never estimated.
 */
export function leagueBasics(doc: TeamHistoryDoc, beforeWeek: number | null): Map<string, TeamBasics> {
  const teams = Object.values(doc.teams).map((t) => {
    const weeks = t.weeks.filter((w) => beforeWeek == null || w.week < beforeWeek);
    return { team: t.team, weeks, off: totals(weeks, 'off'), def: totals(weeks, 'def'), okOff: (d: BasicDef) => has(weeks, 'off', d.needs), okDef: (d: BasicDef) => has(weeks, 'def', d.needs) };
  });
  const out = new Map<string, TeamBasics>();
  for (const t of teams) out.set(t.team, { team: t.team, games: t.weeks.length, weeks: t.weeks.map((w) => w.week), off: [], def: [] });
  for (const d of BASICS) {
    for (const side of ['off', 'def'] as const) {
      const hb = side === 'off' ? d.offHigherBetter : !d.offHigherBetter;
      const rows = teams
        .filter((t) => (side === 'off' ? t.okOff(d) : t.okDef(d)))
        .map((t) => ({ team: t.team, tot: side === 'off' ? t.off : t.def, v: d.value(side === 'off' ? t.off : t.def) }));
      const ranked = rows.filter((r) => r.v != null);
      for (const r of rows) {
        const rank = r.v == null ? null : 1 + ranked.filter((o) => (hb ? (o.v as number) > (r.v as number) + 1e-9 : (o.v as number) < (r.v as number) - 1e-9)).length;
        out.get(r.team)![side].push({ def: d, side, value: r.v, rank, of: ranked.length, sample: d.sample ? d.sample(r.tot) : null, higherBetter: hb });
      }
    }
  }
  return out;
}

export function teamBasics(doc: TeamHistoryDoc | null | undefined, team: string, beforeWeek: number | null): TeamBasics | null {
  if (!doc || !doc.teams[team]) return null;
  const b = leagueBasics(doc, beforeWeek).get(team) ?? null;
  return b && b.games > 0 && (b.off.length || b.def.length) ? b : null;
}

/** "27.5" for per-game counts, "41%" for percentages. */
export function basicText(v: BasicValue): string {
  if (v.value == null) return '—';
  if (v.def.pct) return `${Math.round(v.value * 100)}%`;
  return v.value.toFixed(1);
}

export const basicLabel = (v: BasicValue) => v.def.label[v.side];
export const basicShort = (v: BasicValue) => v.def.short[v.side];
