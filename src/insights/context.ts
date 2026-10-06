// CONTEXT THAT MATTERS — facts that can make a season-long ranking misleading for THIS game.
//
// Sources are factual only: who started at quarterback each week (play-by-play dropbacks), the
// publication's depth chart and injury designations, and players' own game logs. Sift never adjusts a
// metric for them: a note explains what the season aggregate mixes together and points at the ranks it
// affects, with the split as observed (and its sample size) where one exists.
import type { EventResearchDoc } from '../contract/types';
import { qbStarts, epaPerDropback } from '../history/team';
import type { PlayerHistoryDoc, TeamHistoryDoc } from '../history/types';
import { gameSides, matchupObs, type GameSides, type Side } from './game';
import { rankView } from '../lib/rank';

export type ContextKind = 'qb-change' | 'key-absence' | 'returning';

export interface ContextNote {
  id: string;
  kind: ContextKind;
  team: Side;
  headline: string;
  detail: string;
  /** Observed facts with sample sizes, for the evidence layer. */
  facts: string[];
  /** The season ranks this context distorts, with their current value. */
  affects: { label: string; metricId: string; rank: string | null }[];
  /** Always 'none': context notes never change a published number. */
  adjustment: 'none';
}

/** Name key that survives "Jr.", "III", punctuation and ESPN/Sleeper spelling differences. */
export const nameKey = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');

const weekList = (ws: number[]) => {
  if (!ws.length) return '';
  const sorted = [...ws].sort((a, b) => a - b);
  const contiguous = sorted.every((w, i) => i === 0 || w === sorted[i - 1] + 1);
  if (sorted.length === 1) return `week ${sorted[0]}`;
  return contiguous ? `weeks ${sorted[0]}–${sorted[sorted.length - 1]}` : `weeks ${sorted.join(', ')}`;
};

const fmtEpa = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);

interface QbRow { player?: string; depth_chart_order?: number; status?: string }

/** The quarterback the publication's depth chart lists first for a team (active). */
export function currentQb(r: EventResearchDoc, abbr: string): string | null {
  const qbs = ((r.extensions as Record<string, unknown> | null)?.quarterbacks as Record<string, QbRow[]> | undefined)?.[abbr] ?? [];
  const q = [...qbs].sort((a, b) => (a.depth_chart_order ?? 9) - (b.depth_chart_order ?? 9)).find((x) => !x.status || /active/i.test(x.status));
  return q?.player ?? null;
}

/** A quarterback change inside the season window: the current starter did not start every game. */
export function qbChangeNote(r: EventResearchDoc, g: GameSides, team: Side, hist: TeamHistoryDoc | null): ContextNote | null {
  if (!hist || g.week == null) return null;
  const weeks = hist.teams[team.abbr]?.weeks ?? [];
  const stints = qbStarts(weeks, g.week);
  const played = weeks.filter((w) => w.week < g.week!).length;
  if (!stints.length) return null;
  const qb1 = currentQb(r, team.abbr);
  const cur = stints.find((s) => nameKey(s.name) === nameKey(qb1)) ?? null;
  const others = stints.filter((s) => s !== cur);
  if (!cur && !qb1) return null;
  if (cur && cur.weeks.length === played) return null;
  const curName = cur?.name ?? qb1!;
  const started = cur?.weeks.length ?? 0;
  const pass = matchupObs(r, 'met_nfl.adj_off_db_epa', team);
  const passRank = rankView(pass?.context);
  const facts = [
    ...(cur ? [`${cur.name}: started ${weekList(cur.weeks)} · ${fmtEpa(epaPerDropback(cur))} EPA per dropback on ${cur.dropbacks} dropbacks`] : [`${curName}: no starts yet this season`]),
    ...others.map((s) => `${s.name}: started ${weekList(s.weeks)} · ${fmtEpa(epaPerDropback(s))} EPA per dropback on ${s.dropbacks} dropbacks`),
  ];
  const startedText = started === 0 ? `has not started a game yet this season` : `has started ${started} of the ${team.nick}' ${played} games (${weekList(cur!.weeks)})`;
  const otherText = others.map((s) => `${s.name} started ${weekList(s.weeks)}`).join('; ');
  // Only call a direction when the gap is large (0.15 EPA per dropback); small samples swing easily.
  const mine = cur ? epaPerDropback(cur) : null;
  const theirs = others.map((o) => epaPerDropback(o)).filter((v): v is number => v != null);
  const better = mine != null && theirs.length > 0 && theirs.every((v) => mine - v >= 0.15);
  const worse = mine != null && theirs.length > 0 && theirs.every((v) => v - mine >= 0.15);
  return {
    id: `qb-change:${team.abbr}`,
    kind: 'qb-change',
    team,
    headline: !cur ? `${curName} takes over at quarterback for the ${team.nick}` : `${team.nick} season passing numbers mix ${stints.length} starting quarterbacks`,
    detail: `${curName} ${startedText}. ${otherText ? `${otherText}. ` : ''}Season-long passing ranks${passRank ? ` (passing offense ${passRank.text})` : ''} include those games${better ? `, so they may understate the offense he runs now` : worse ? `, so they may overstate the offense he runs now` : ''}.`,
    facts,
    affects: [
      { label: 'Passing offense', metricId: 'met_nfl.adj_off_db_epa', rank: passRank?.text ?? null },
      { label: 'Offense overall', metricId: 'met_nfl.adj_off_epa', rank: rankView(matchupObs(r, 'met_nfl.adj_off_epa', team)?.context)?.text ?? null },
    ],
    adjustment: 'none',
  };
}

const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);

interface LineupRow { player?: string; position?: string; depth_chart_order?: number; team?: string; status?: string }

/** Depth-chart starters (order 1, plus WR2) at the skill positions, per team. */
export function starters(r: EventResearchDoc, abbr: string): LineupRow[] {
  const rows = (r.context?.lineups ?? []) as LineupRow[];
  return rows.filter((l) => l.team === abbr && SKILL.has(l.position ?? '') && (l.depth_chart_order === 1 || (l.position === 'WR' && (l.depth_chart_order ?? 9) <= 2)));
}

/**
 * Key absences and returns that change what the season numbers describe. `players` holds game logs for
 * the players worth checking (keyed by nameKey + team); a player without a log is not judged.
 */
export function personnelNotes(r: EventResearchDoc, g: GameSides, players: Map<string, PlayerHistoryDoc | null>, hist: TeamHistoryDoc | null): ContextNote[] {
  if (g.week == null) return [];
  const out: ContextNote[] = [];
  const injuries = r.context?.injuries ?? [];
  for (const team of [g.away, g.home]) {
    const teamGames = (hist?.teams[team.abbr]?.weeks ?? []).filter((w) => w.week < g.week!).length;
    for (const inj of injuries) {
      const m = /^(.+?) \(([^,]+), ([A-Z]{2,3})\)/.exec(inj.detail ?? '');
      if (!m || m[3] !== team.abbr || !SKILL.has(m[2])) continue;
      if (!['OUT', 'DOUBTFUL', 'INJURED_RESERVE', 'SUSPENDED'].includes(inj.status)) continue;
      const log = players.get(`${nameKey(m[1])}|${team.abbr}`);
      if (!log) continue;
      const played = log.games.filter((x) => x.week < g.week!).length;
      if (played === 0 || teamGames === 0) continue; // already absent all season: the numbers reflect it
      const ruled = inj.status === 'DOUBTFUL' ? 'is doubtful' : 'is out';
      out.push({
        id: `absence:${team.abbr}:${nameKey(m[1])}`,
        kind: 'key-absence',
        team,
        headline: `${team.nick} without ${m[2]} ${m[1]}`,
        detail: `${m[1]} ${ruled} for this game. He played in ${played} of the ${team.nick}' ${teamGames} games, so their season ${m[2] === 'QB' ? 'passing' : m[2] === 'RB' ? 'rushing' : 'passing'} numbers were built with him.`,
        facts: [`${m[1]}: ${played} games played before week ${g.week}`, `Designation: ${inj.status.replace('_', ' ').toLowerCase()} (${inj.source})`],
        affects: [{ label: m[2] === 'RB' ? 'Rush offense' : 'Passing offense', metricId: m[2] === 'RB' ? 'met_nfl.adj_off_rush_epa' : 'met_nfl.adj_off_db_epa', rank: rankView(matchupObs(r, m[2] === 'RB' ? 'met_nfl.adj_off_rush_epa' : 'met_nfl.adj_off_db_epa', team)?.context)?.text ?? null }],
        adjustment: 'none',
      });
    }
    for (const s of starters(r, team.abbr)) {
      if (s.position === 'QB') continue; // the quarterback case is qbChangeNote
      const log = players.get(`${nameKey(s.player)}|${team.abbr}`);
      if (!log || teamGames < 2) continue;
      const played = log.games.filter((x) => x.week < g.week! && x.team === team.abbr);
      const missed = teamGames - played.length;
      if (missed < 2 && !(missed >= 1 && teamGames <= 3)) continue;
      const injured = injuries.some((i) => nameKey(/^(.+?) \(/.exec(i.detail ?? '')?.[1]) === nameKey(s.player) && i.status !== 'ACTIVE' && i.status !== 'QUESTIONABLE');
      if (injured) continue;
      out.push({
        id: `returning:${team.abbr}:${nameKey(s.player)}`,
        kind: 'returning',
        team,
        headline: `${s.player} is back in the ${team.nick} lineup`,
        detail: `${s.player} (${s.position}${s.depth_chart_order}) played in ${played.length} of ${teamGames} games before this one. Season ${s.position === 'RB' ? 'rushing' : 'passing'} numbers were built mostly ${played.length === 0 ? 'without' : 'with limited time from'} him.`,
        facts: [`Games played: ${played.length ? played.map((x) => `week ${x.week}`).join(', ') : 'none'}`],
        affects: [{ label: s.position === 'RB' ? 'Rush offense' : 'Passing offense', metricId: s.position === 'RB' ? 'met_nfl.adj_off_rush_epa' : 'met_nfl.adj_off_db_epa', rank: rankView(matchupObs(r, s.position === 'RB' ? 'met_nfl.adj_off_rush_epa' : 'met_nfl.adj_off_db_epa', team)?.context)?.text ?? null }],
        adjustment: 'none',
      });
    }
  }
  return out;
}

/** Every context note for a game, most consequential first (quarterbacks first). */
export function contextNotes(r: EventResearchDoc, hist: TeamHistoryDoc | null, players: Map<string, PlayerHistoryDoc | null> = new Map(), g: GameSides | null = gameSides(r)): ContextNote[] {
  if (!g) return [];
  const qb = [g.away, g.home].map((t) => qbChangeNote(r, g, t, hist)).filter((x): x is ContextNote => !!x);
  return [...qb, ...personnelNotes(r, g, players, hist)];
}
