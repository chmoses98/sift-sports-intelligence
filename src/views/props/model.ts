// Pure helpers behind the Player Prop Explorer screens (views/props/*): a game's prop board grouped by player, the
// matchup said in plain words, the per-game supporting metrics a game log actually carries, and the slate-wide
// discovery ranking. Every number is a published field or a stated arithmetic on published fields.
import type { GameLogRow } from '../../history/types';
import { PROP_STAT_DEFS, type PropRow } from '../../insights/propBoard';

export interface PlayerGroup {
  playerId: string;
  name: string;
  role: string | null;
  team: PropRow['team'];
  opp: PropRow['opp'];
  injury: string | null;
  /** Every market of this player, in stat order (yards, then counts, then touchdowns). */
  rows: PropRow[];
  /** The player's most interesting prop (the board's own ordering). */
  lead: PropRow;
  /** Markets with a priced main line. */
  priced: number;
  /** Rungs across every ladder (main lines and alternates). */
  rungs: number;
}

const statOrder = (stat: string) => {
  const i = PROP_STAT_DEFS.findIndex((d) => d.stat === stat);
  return i < 0 ? 99 : i;
};

/** One group per player, ordered by the player's most interesting prop (rows arrive in board order). */
export function groupByPlayer(rows: PropRow[]): PlayerGroup[] {
  const by = new Map<string, PropRow[]>();
  for (const r of rows) by.set(r.playerId, [...(by.get(r.playerId) ?? []), r]);
  const out: PlayerGroup[] = [];
  for (const [playerId, rs] of by) {
    const lead = rs.reduce((a, b) => (b.interest > a.interest ? b : a));
    out.push({
      playerId, name: lead.name, role: lead.role, team: lead.team, opp: lead.opp, injury: rs.find((r) => r.injury)?.injury ?? null,
      rows: [...rs].sort((a, b) => statOrder(a.def.stat) - statOrder(b.def.stat)),
      lead, priced: rs.filter((r) => r.main).length, rungs: rs.reduce((n, r) => n + r.ladder.length, 0),
    });
  }
  return out.sort((a, b) => b.lead.interest - a.lead.interest || a.name.localeCompare(b.name));
}

/** The matchup from the player's side, in plain words. #1 is the best defensive unit (it allows the least). */
export function matchupSentence(row: Pick<PropRow, 'matchup' | 'name' | 'def' | 'opp'>): { word: 'tough' | 'favorable' | 'neutral'; text: string } | null {
  const m = row.matchup;
  if (!m) return null;
  if (!m.rank.directional) return { word: 'neutral', text: `The ${row.opp.nick} ${row.def.defUnit ?? 'defense'} ranks #${m.rank.rank} of ${m.rank.of} on ${m.label}.` };
  const t = m.rank.tier;
  const word = t === 'elite' || t === 'strong' ? 'tough' : t === 'weak' || t === 'poor' ? 'favorable' : 'neutral';
  const where = t === 'elite' ? 'one of the league’s best' : t === 'strong' ? 'better than most' : t === 'poor' ? 'one of the league’s weakest' : t === 'weak' ? 'weaker than most' : 'in the middle of the league';
  const unit = row.def.defUnit ?? 'defense';
  const last = row.name.split(' ').slice(-1)[0];
  const lead = `The ${row.opp.nick} ${unit} ranks #${m.rank.rank} of ${m.rank.of}, ${where}`;
  const tail = word === 'tough' ? `a tough draw for ${last}’s ${row.def.label.toLowerCase()}` : word === 'favorable' ? `a favorable draw for ${last}’s ${row.def.label.toLowerCase()}` : `no clear help or hurt for ${last}’s ${row.def.label.toLowerCase()}`;
  return { word, text: `${lead}: ${tail}.` };
}

export interface SupportMetric {
  key: string;
  label: string;
  value: string;
  /** How it was computed and over how many games, in words. */
  basis: string;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
const pctOf = (v: number) => `${Math.round(v * 100)}%`;
const gamesWord = (n: number) => `${n} game${n === 1 ? '' : 's'}`;

/**
 * The supporting usage of a window of games, from the history layer's own fields only: snap share, targets, target
 * share, share of team air yards, catches per target, carries, yards per carry, pass attempts, completion rate, sacks.
 * Percentages stay percentages (a share is never relabelled a per-game count); a measure appears only when the games
 * carry it.
 */
export function supportMetrics(games: GameLogRow[], family: PropRow['family'], role: string | null): SupportMetric[] {
  if (!games.length) return [];
  const out: SupportMetric[] = [];
  const n = games.length;
  const snaps = games.map((g) => g.snaps?.pct).filter((v): v is number => v != null);
  if (snaps.length) out.push({ key: 'snap', label: 'Snap share', value: pctOf(avg(snaps)!), basis: `average of ${gamesWord(snaps.length)} with a snap count` });
  const qb = role === 'QB' || family === 'passing';
  if (qb) {
    const p = games.map((g) => g.passing).filter((x): x is NonNullable<GameLogRow['passing']> => !!x && x.att > 0);
    if (p.length) {
      const att = p.reduce((a, x) => a + x.att, 0);
      const cmp = p.reduce((a, x) => a + x.cmp, 0);
      out.push({ key: 'att', label: 'Pass attempts', value: `${one(att / p.length)}/g`, basis: `per game, ${gamesWord(p.length)}` });
      out.push({ key: 'cmp', label: 'Completion rate', value: pctOf(cmp / att), basis: `${cmp} of ${att} attempts` });
      out.push({ key: 'sk', label: 'Sacks taken', value: `${one(p.reduce((a, x) => a + x.sacks, 0) / p.length)}/g`, basis: `per game, ${gamesWord(p.length)}` });
    }
  }
  const car = games.reduce((a, g) => a + g.rushing.car, 0);
  if (car > 0 && (family === 'rushing' || role === 'RB' || role === 'FB' || (qb && car / n >= 3) || family === 'touchdowns' || family === 'other')) {
    const yds = games.reduce((a, g) => a + g.rushing.yds, 0);
    out.push({ key: 'car', label: 'Carries', value: `${one(car / n)}/g`, basis: `per game, ${gamesWord(n)}` });
    out.push({ key: 'ypc', label: 'Yards per carry', value: one(yds / car), basis: `${yds} yards on ${car} carries` });
  }
  const tgt = games.reduce((a, g) => a + g.receiving.tgt, 0);
  if (tgt > 0 && !(qb && role === 'QB')) {
    const rec = games.reduce((a, g) => a + g.receiving.rec, 0);
    out.push({ key: 'tgt', label: 'Targets', value: `${one(tgt / n)}/g`, basis: `per game, ${gamesWord(n)}` });
    const ts = games.map((g) => g.receiving.target_share).filter((v): v is number => v != null);
    if (ts.length) out.push({ key: 'ts', label: 'Target share', value: pctOf(avg(ts)!), basis: `share of team targets, average of ${gamesWord(ts.length)}` });
    const as = games.map((g) => g.receiving.air_share).filter((v): v is number => v != null);
    if (as.length) out.push({ key: 'air', label: 'Air-yard share', value: pctOf(avg(as)!), basis: `share of team air yards, average of ${gamesWord(as.length)}` });
    out.push({ key: 'catch', label: 'Catch rate', value: pctOf(rec / tgt), basis: `${rec} catches on ${tgt} targets` });
  }
  return out;
}

/** What a game log does not carry, said once, so a missing measure is never mistaken for a zero. */
export const NOT_IN_HISTORY = 'Routes run, yards after contact and per-play air yards are not in the public game logs Sift reads, so they are not shown.';

export type DiscoverySort = 'gap' | 'history';

export interface DiscoveryRow {
  row: PropRow;
  eventId: string;
  kickoff: string;
  game: string;
}

/**
 * The market line sits outside the simulation's own 5th–95th range: the two are pricing different roles (a backup
 * projected for garbage time against a starter's line, or a player the market expects to sit). Such a gap is a data
 * question, not a finding, so it is never ranked.
 */
export function roleDisagreement(row: Pick<PropRow, 'range' | 'line'>): boolean {
  return !!row.range && row.line != null && (row.line < row.range.full[0] || row.line > row.range.full[1]);
}

/**
 * The slate's top props by a published criterion. 'gap': the simulation's projection against the main line, in widths
 * of its own typical (25th–75th) range (the board's separation; larger = the published projection sits further from
 * the line). Only priced props with a simulation qualify; a line outside the simulated 5th–95th range is set aside
 * (roleDisagreement). Touchdown ladders rank only on their own (touchdowns: true): their simulated quartiles collapse
 * to 0, so the range-width measure is not comparable with yardage. Not a probability and not a validated edge.
 */
export function rankByGap(rows: DiscoveryRow[], opts: { touchdowns?: boolean } = {}): { ranked: DiscoveryRow[]; setAside: DiscoveryRow[] } {
  const eligible = rows.filter((d) => d.row.main && d.row.separation != null && d.row.projection != null && (opts.touchdowns ? d.row.family === 'touchdowns' : d.row.family !== 'touchdowns'));
  return {
    ranked: eligible.filter((d) => !roleDisagreement(d.row)).sort((a, b) => Math.abs(b.row.separation!) - Math.abs(a.row.separation!) || b.row.interest - a.row.interest),
    setAside: eligible.filter((d) => roleDisagreement(d.row)),
  };
}

/**
 * 'history': how one-sided the last N played games were against today's line — the larger of games over and games
 * under, as a share of games played; most one-sided first (ties: the larger sample). Rows with fewer than `minGames`
 * played sink. History, not a probability.
 */
export function rankByHistory<T extends { over: number; under: number; n: number }>(rows: { d: DiscoveryRow; h: T | null }[], minGames = 5): { d: DiscoveryRow; h: T | null }[] {
  const share = (h: T | null) => (h && h.n >= minGames ? Math.max(h.over, h.under) / h.n : -1);
  return [...rows].sort((a, b) => share(b.h) - share(a.h) || (b.h?.n ?? 0) - (a.h?.n ?? 0) || b.d.row.interest - a.d.row.interest);
}

/** The side his recent games favoured against today's line, and the count: "8 of 10 under 54.5". */
export function historySide(h: { over: number; under: number; n: number; push: number; line: number }): { side: 'over' | 'under' | 'even'; count: number; text: string } {
  const side = h.over > h.under ? 'over' : h.under > h.over ? 'under' : 'even';
  const count = side === 'under' ? h.under : h.over;
  const l = Number.isInteger(h.line) ? String(h.line) : String(Math.round(h.line * 10) / 10);
  const text = side === 'even' ? `${h.over} over, ${h.under} under ${l} in ${h.n}` : `${count} of ${h.n} ${side} ${l}`;
  return { side, count, text: h.push ? `${text}, ${h.push} push${h.push > 1 ? 'es' : ''}` : text };
}
