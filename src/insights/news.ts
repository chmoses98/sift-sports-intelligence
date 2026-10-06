// IMPORTANT NEWS — what changes a game, not every designation on the wire.
//
// Importance = how serious the designation is × how much the player matters to his team this week,
// plus a small boost when the publication itself flags the absence (its "packet key question" notes). Role comes
// from facts only: the depth chart (starter or not), the position, and whether the simulation projected the
// player. Quarterback changes and weather that plausibly matters are news too. Routine low-impact
// designations stay available under "all designations" but never lead.
import type { EventResearchDoc } from '../contract/types';
import { injuryRows, type InjuryRow } from '../lib/gamedata';
import { nameKey } from './context';
import { gameSides } from './game';

export type NewsLevel = 'critical' | 'high' | 'medium' | 'low';

export interface NewsItem {
  id: string;
  kind: 'injury' | 'qb-change' | 'weather';
  level: NewsLevel;
  score: number;
  team: string | null;
  headline: string;
  detail: string | null;
  eventId: string;
  asOf: string | null;
  injury?: InjuryRow;
}

// Injured reserve is usually known for weeks; a fresh "out" is more of a change.
const SEVERITY: Record<string, number> = { OUT: 3, SUSPENDED: 3, INJURED_RESERVE: 2.4, DOUBTFUL: 2.5, QUESTIONABLE: 1.3, PROBABLE: 0.4 };
const STATUS_WORD: Record<string, string> = { OUT: 'out', INJURED_RESERVE: 'on injured reserve', SUSPENDED: 'suspended', DOUBTFUL: 'doubtful', QUESTIONABLE: 'questionable', PROBABLE: 'probable' };
const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);

export function levelOf(score: number): NewsLevel {
  if (score >= 7) return 'critical';
  if (score >= 4) return 'high';
  if (score >= 2.2) return 'medium';
  return 'low';
}

interface Lineup { player?: string; position?: string; depth_chart_order?: number; team?: string }

/** How much a player matters to his team this week (facts only). */
export function roleWeight(row: Pick<InjuryRow, 'player' | 'position' | 'team'>, lineups: Lineup[], projected: Set<string>, qbStarters: Set<string> = new Set()): number {
  const depth = lineups.find((l) => nameKey(l.player) === nameKey(row.player) && (!row.team || l.team === row.team))?.depth_chart_order ?? null;
  const pos = row.position ?? '';
  // A quarterback who has started this season matters even after the depth chart moves him down.
  if (pos === 'QB') return depth === 1 || qbStarters.has(nameKey(row.player)) ? 3 : depth === 2 ? 0.8 : 0.4;
  if (SKILL.has(pos)) {
    if (depth === 1) return 2;
    if (depth === 2 && pos === 'WR') return 1.6;
    return projected.has(nameKey(row.player)) ? 1.1 : 0.5;
  }
  if (['K', 'PK', 'P', 'LS'].includes(pos)) return 0.3;
  return 0.6; // linemen and defenders: the publication has no depth order for them
}

/** Quarterbacks with real playing time this season (the publication's dropback counts). */
export function seasonQbs(r: EventResearchDoc): Set<string> {
  const q = ((r.extensions as Record<string, unknown> | null)?.quarterbacks ?? {}) as Record<string, { player?: string; profile?: { dropbacks?: number } | null }[]>;
  return new Set(Object.values(q).flat().filter((x) => (x.profile?.dropbacks ?? 0) >= 40).map((x) => nameKey(x.player)));
}

/**
 * `gamesPlayed(name, team)` (from the history layer) lets a long absence read as old news: a player who
 * has not played all season is already missing from every number on the page.
 */
export function injuryNews(r: EventResearchDoc, qbStarters: Set<string> = seasonQbs(r), gamesPlayed?: (name: string, team: string | null) => number | null): NewsItem[] {
  const g = gameSides(r);
  const lineups = (r.context?.lineups ?? []) as Lineup[];
  const projected = new Set(r.players.map((p) => nameKey(p.display_name)));
  const flagged = new Set((r.context?.notes ?? []).filter((n) => n.startsWith('packet key question:')).map((n) => nameKey(/question:\s*(.+?) \(/.exec(n)?.[1])));
  const nick = (abbr: string | null) => (g && abbr ? (abbr === g.home.abbr ? g.home.nick : abbr === g.away.abbr ? g.away.nick : abbr) : abbr ?? '');
  return injuryRows(r).map((x) => {
    const sev = SEVERITY[x.status] ?? 1;
    const role = roleWeight(x, lineups, projected, qbStarters);
    // The publication's own key questions name the absences it considers material.
    const played = gamesPlayed?.(x.player, x.team) ?? null;
    const stale = played === 0 && sev >= 2.4;
    const score = (sev * role + (flagged.has(nameKey(x.player)) ? 1.5 : 0)) * (stale ? 0.3 : 1);
    const word = STATUS_WORD[x.status] ?? x.status.toLowerCase();
    const serious = sev >= 2.5;
    return {
      id: `inj:${r.event.event_id}:${nameKey(x.player)}`,
      kind: 'injury' as const,
      level: levelOf(score),
      score,
      team: x.team,
      headline: serious ? `${nick(x.team)} without ${x.position ?? ''} ${x.player}`.replace(/\s+/g, ' ') : `${x.player} (${x.position}) ${word} for the ${nick(x.team)}`,
      detail: `${x.player} is ${word}${stale ? ' and has not played this season' : ''}${x.note && !/^Not Specified/i.test(x.note) ? ` — ${x.note.replace(/;?\s*impact:.*$/i, '').replace(/;?\s*return \d{4}-\d{2}-\d{2}/, '')}` : ''}.`,
      eventId: r.event.event_id,
      asOf: x.asOf,
      injury: x,
    };
  });
}

/** Split a feed into what leads and what stays one tap deeper. */
export function splitNews(items: NewsItem[]): { lead: NewsItem[]; more: NewsItem[] } {
  const sorted = [...items].sort((a, b) => b.score - a.score || (b.asOf ?? '').localeCompare(a.asOf ?? ''));
  return { lead: sorted.filter((x) => x.level === 'critical' || x.level === 'high'), more: sorted.filter((x) => x.level === 'medium' || x.level === 'low') };
}
