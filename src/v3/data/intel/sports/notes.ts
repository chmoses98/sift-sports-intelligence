// Availability notes for the sports whose publication lists designations without the football depth chart the generic news ranking needs (NBA, NHL):
// the lines that matter on game day first (out, doubtful, questionable), long-term injured reserve last, and a team named only when the game's own
// roster (the projected players the research document lists with their team) or the publication's text says it. A designation whose team cannot be
// established is counted, never guessed onto a team.
import type { EventResearchDoc } from '../../../../contract/types';
import type { NewsItem } from '../../../../insights/news';
import { injurySource } from '../../../../lib/injurySource';
import { nameKey } from '../../../../insights/context';
import type { V3Game } from '../../../model/types';
import type { IntelNotes } from '../build';
import { str } from './shared';

const WORD: Record<string, string> = { OUT: 'out', DOUBTFUL: 'doubtful', QUESTIONABLE: 'questionable', PROBABLE: 'probable', INJURED_RESERVE: 'on injured reserve', SUSPENDED: 'suspended', DAY_TO_DAY: 'day to day' };
const ORDER = ['OUT', 'DOUBTFUL', 'QUESTIONABLE', 'DAY_TO_DAY', 'PROBABLE', 'SUSPENDED', 'INJURED_RESERVE'];
const rank = (s: string) => { const i = ORDER.indexOf(s); return i < 0 ? ORDER.length : i; };

/** team code by player-name key, from the players the research document lists (each carries its team's participant). */
export function teamByPlayer(g: Pick<V3Game, 'away' | 'home'>, research: EventResearchDoc): Map<string, string> {
  const code = new Map<string, string>();
  for (const p of research.participants ?? []) code.set(p.participant_id, p.home_away === 'AWAY' ? g.away.id : p.home_away === 'HOME' ? g.home.id : '');
  const out = new Map<string, string>();
  for (const p of research.players ?? []) { const t = p.team_id ? code.get(p.team_id) : null; if (t) out.set(nameKey(p.display_name), t); }
  return out;
}

export interface Designation { player: string; status: string; note: string | null; team: string | null; asOf: string | null }

/** Designations of an NBA-style feed: "Name (reason)" with the status in its own field and no team. */
export function parseParenthetical(research: EventResearchDoc, teams: Map<string, string>): Designation[] {
  return (research.context?.injuries ?? [])
    .filter((i) => i.status && i.status !== 'ACTIVE')
    .map((i) => {
      const m = /^(.+?)\s*\((.+)\)\s*$/.exec(i.detail ?? '');
      const player = (m?.[1] ?? i.detail ?? '').trim();
      return { player, status: i.status, note: m?.[2]?.trim() ?? null, team: teams.get(nameKey(player)) ?? null, asOf: i.as_of ?? null };
    })
    .filter((d) => d.player);
}

/** Designations of an NHL-style feed: "Name (POS): Status, reason; return YYYY-MM-DD". */
export function parseColon(research: EventResearchDoc, teams: Map<string, string>): Designation[] {
  return (research.context?.injuries ?? [])
    .filter((i) => i.status && i.status !== 'ACTIVE')
    .map((i) => {
      const m = /^(.+?) \(([^)]+)\):\s*(.*)$/.exec(i.detail ?? '');
      const player = (m?.[1] ?? i.detail ?? '').trim();
      const pos = m?.[2] ?? null;
      const note = (m?.[3] ?? '').replace(/^(Injured Reserve|Out|Day-To-Day|Questionable|Doubtful)[,\s]*/i, '').replace(/^Undisclosed;?\s*/i, '').trim();
      const ret = /return (\d{4}-\d{2}-\d{2})/.exec(m?.[3] ?? '')?.[1];
      const reason = note.replace(/;?\s*return \d{4}-\d{2}-\d{2}/, '').trim();
      return { player, status: i.status, note: [pos, reason && reason !== 'Undisclosed' ? reason : null, ret ? `return ${ret}` : null].filter(Boolean).join(' · ') || null, team: teams.get(nameKey(player)) ?? null, asOf: i.as_of ?? null };
    })
    .filter((d) => d.player);
}

const MAX = 5;

export function notesFrom(g: Pick<V3Game, 'sport' | 'away' | 'home'>, research: EventResearchDoc, now: number, designations: Designation[], extra: NewsItem[] = []): IntelNotes | null {
  // Only a designation placed on one of the two teams is listed as a note; the rest are counted.
  const placed = designations.filter((d) => d.team).sort((a, b) => rank(a.status) - rank(b.status));
  const items: NewsItem[] = placed.slice(0, Math.max(0, MAX - extra.length)).map((d) => {
    const word = WORD[d.status] ?? d.status.toLowerCase().replace(/_/g, ' ');
    const serious = d.status === 'OUT' || d.status === 'DOUBTFUL';
    return {
      id: `des:${research.event.event_id}:${nameKey(d.player)}`, kind: 'injury', level: serious ? 'high' : 'medium', score: serious ? 5 : 3, team: d.team,
      headline: `${d.player} ${word}`, detail: d.note, eventId: research.event.event_id, asOf: d.asOf,
    };
  });
  const all = [...extra, ...items];
  if (!all.length) return null;
  const unplaced = designations.length - placed.length;
  return {
    items: all,
    more: Math.max(0, placed.length - items.length) + unplaced,
    source: research.context?.injuries?.length ? injurySource(research.context.injuries, now, g.sport) : null,
  };
}

export const noteItem = (research: EventResearchDoc, id: string, team: string | null, headline: string, detail: string | null, asOf: string | null): NewsItem => ({
  id: `st:${research.event.event_id}:${id}`, kind: 'injury', level: 'high', score: 6, team, headline, detail, eventId: research.event.event_id, asOf: asOf ?? str(research.generated_at),
});
