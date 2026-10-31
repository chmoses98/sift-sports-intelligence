// Small pure helpers the per-sport intel readers share. Nothing here estimates a number: it reads published fields, formats them, and says how old
// the statistics are. A reader that cannot find a field returns nothing for it.
import type { EventResearchDoc, MatchupRow, Observation } from '../../../../contract/types';
import type { V3Game } from '../../../model/types';
import type { StatPair } from '../../matchup';
import { ordinal } from '../../research/matchup';
import { shortMetricId } from '../../research/normalize';
import { isCurrent } from '../../../model/capabilities';

export const rec = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
export const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : x != null && x !== '' && typeof x === 'string' && Number.isFinite(Number(x)) ? Number(x) : null);
export const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null);
export const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
export const ext = (r: EventResearchDoc | null | undefined): Record<string, unknown> | null => rec(r?.extensions);
export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const one = (n: number) => (Math.round(n * 10) / 10).toString();
export const two = (n: number) => (Math.round(n * 100) / 100).toString();
/** 8934 -> "8,934" (the digits are grouped by rule, never by the device's locale). */
export const grp = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Which side of the game a participant id or name is (tennis has no home and away; the board's first-named player is the "away" side). */
export function sideOfParticipant(g: Pick<V3Game, 'away' | 'home'>, idOrName: string | null | undefined): 'away' | 'home' | null {
  if (!idOrName) return null;
  if (idOrName === g.away.id || idOrName === g.away.name) return 'away';
  if (idOrName === g.home.id || idOrName === g.home.name) return 'home';
  return null;
}

/**
 * The matchup row for a statistic. A publication can carry the same statistic for more than one window (a season, the last ten games): the row for the
 * `prefer` window kind wins (default the season), then the first.
 */
export function matchupRow(research: EventResearchDoc | null | undefined, shortId: string, prefer: (o: Observation) => boolean = (o) => o.window?.kind === 'SEASON'): MatchupRow | null {
  const rows = (research?.matchup ?? []).filter((m) => shortMetricId(m.metric_id) === shortId);
  if (!rows.length) return null;
  return rows.find((m) => [m.away, m.home].some((o) => o && prefer(o))) ?? rows[0];
}

/** "4.2 per game (28th of 32)" for one side of a matchup row, or null when that side carries no value. */
export function sideText(o: Observation | null | undefined, fmt: (n: number) => string = one, suffix = ''): string | null {
  if (!o || o.value == null) return null;
  const r = o.context?.rank, n = o.context?.universe_size;
  return `${fmt(o.value)}${suffix}${r && n ? ` (${ordinal(r)} of ${n})` : ''}`;
}

/** The newest `as_of` among the observations of the matchup rows, as ms, or null. */
export function statsAsOf(research: EventResearchDoc | null | undefined): number | null {
  let best: number | null = null;
  for (const m of research?.matchup ?? []) for (const o of [m.away, m.home]) {
    const t = o?.as_of ? Date.parse(o.as_of) : NaN;
    if (Number.isFinite(t) && (best == null || t > best)) best = t;
  }
  return best;
}

/**
 * League-rank pairs for the teams' season statistics, one row per statistic (the publication can carry the same statistic for a season and for the last
 * ten games: the season one is the comparison, the recent one is a different question). `ids` restricts and orders to the statistics a sport names;
 * without it every season statistic with a rank for both teams is taken, largest rank gap first. Run-scoped model ratings (kind RUN) are the model's
 * inputs, not team statistics, and are left out.
 */
export function seasonPairs(research: EventResearchDoc | null | undefined, g: Pick<V3Game, 'slug'>, ids?: readonly string[], max = 6): StatPair[] {
  const rows = (research?.matchup ?? []).filter((m) => {
    const o = m.away ?? m.home;
    return o && o.window?.kind === 'SEASON' && m.away?.context?.rank != null && m.home?.context?.rank != null;
  });
  const side = (o: Observation | null) => ({ value: o?.display_value ?? (o?.value != null ? String(Math.round(o.value * 100) / 100) : '—'), rank: o?.context?.rank ?? null, n: o?.context?.universe_size ?? null });
  const pairs = rows.map((m) => {
    const a = side(m.away), h = side(m.home);
    const gap = a.rank != null && h.rank != null && a.n && h.n ? Math.abs(a.rank - h.rank) / (Math.max(a.n, h.n) - 1) : 0;
    const rid = (m.home ?? m.away)?.context?.ranking_id;
    return { id: m.metric_id, name: m.name, away: a, home: h, gap, route: rid ? `/v3/stat/${g.slug}/${encodeURIComponent(rid)}` : undefined };
  });
  if (ids) {
    const at = (p: { id: string }) => ids.indexOf(shortMetricId(p.id));
    return pairs.filter((p) => at(p) >= 0).sort((x, y) => at(x) - at(y)).slice(0, max);
  }
  return pairs.sort((x, y) => y.gap - x.gap).slice(0, max);
}

/** Season statistics older than this are described as old, not as the team's current form. */
export const STATS_CURRENT_DAYS = 21;

export interface StatsAge { asOf: number; days: number; current: boolean; label: string }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * How old the published team statistics behind a game's matchup rows are. `current` is the same freshness rule capabilities.ts uses (`isCurrent`).
 * The label is for a footnote: a team's last-season figures (a preseason game) must say so.
 */
export function statsAge(research: EventResearchDoc | null | undefined, now: number): StatsAge | null {
  const asOf = statsAsOf(research);
  if (asOf == null) return null;
  const days = Math.max(0, Math.floor((now - asOf) / 86_400_000));
  const iso = new Date(asOf).toISOString();
  const date = `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
  const current = isCurrent(iso, STATS_CURRENT_DAYS, now);
  return { asOf, days, current, label: current ? `Team statistics run through ${date}.` : `These team statistics run through ${date} and do not include games played since.` };
}
