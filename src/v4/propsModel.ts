// Pure view-model helpers for the v4 Props Explorer and Player detail. Nothing here fetches, projects or ranks:
// the rows (insights/propBoard.ts), their ordering (views/props/ranking.ts) and the projection choice
// (lib/projectionAuthority.ts) are the app's own. This file only (a) filters and groups those rows for a phone,
// (b) reads a quote's freshness, and (c) states a model-versus-market comparison side by side, fee included,
// without calling any row a pick.
import type { Opportunity } from '../opportunity/types';
import { breakEven, kalshiFee } from '../opportunity/pricing';
import { quoteAgeMs, quoteFreshness, type QuoteFreshness } from '../live/freshness';
import type { PropFamily, PropRow, Rung } from '../insights/propBoard';
import type { DiscoveryRow, DiscoverySort } from '../views/props/model';
import { propAuthority, rankSlate, type AuthorityView } from '../views/props/ranking';
import type { HitRate } from '../history/hitRate';

export type PropSort = 'featured' | DiscoverySort;
export const SORT_WORDS: Record<PropSort, string> = { featured: 'Featured', gap: 'Projection vs line', history: 'Last 10 history' };

// ------------------------------------------------------------------ quotes

export interface QuoteView {
  ask: number | null;
  freshness: QuoteFreshness;
  ageMs: number | null;
  /** A price may be read as executable only when it exists and its capture is recent (FRESH or AGING). Never when stale or undated. */
  executable: boolean;
}

export function quoteView(ask: number | null | undefined, capturedAt: string | null | undefined, now: number): QuoteView {
  const a = ask == null || ask <= 0 || ask >= 1 ? null : ask;
  const freshness = a == null ? 'UNKNOWN' : quoteFreshness(capturedAt, now);
  return { ask: a, freshness, ageMs: quoteAgeMs(capturedAt, now), executable: a != null && (freshness === 'FRESH' || freshness === 'AGING') };
}

// ------------------------------------------------------------------ the ladder: model and market on the same side

export type PropSide = 'over' | 'under';

export interface RungView {
  rung: Rung;
  isMain: boolean;
  /** "250+": the contract settles YES at this count or more; "under" reads the NO side of the same contract. */
  label: string;
  side: PropSide;
  /** The ask a buyer of this side pays (YES for over, NO for under); null when there is none. */
  quote: QuoteView;
  fee: number | null;
  /** ask + fee: the probability this side needs to break even. */
  breakEven: number | null;
  /** The projection's probability for THIS side (over = P(YES); under = 1 − P(YES)); null when the projection prices no probability here. */
  model: number | null;
  /** Model minus break-even, in percentage points: context only. Null unless the price is executable and the model prices the rung. */
  points: number | null;
}

const pts = (v: number) => Math.round(v * 100);

export function rungView(rung: Rung, side: PropSide, isMain: boolean, now: number): RungView {
  const ask = side === 'over' ? rung.yesAsk : rung.noAsk;
  const quote = quoteView(ask, rung.market.captured_at, now);
  const fee = quote.ask != null ? kalshiFee(quote.ask) : null;
  const be = quote.ask != null ? breakEven(quote.ask, fee) : null;
  const model = rung.modelP == null ? null : side === 'over' ? rung.modelP : 1 - rung.modelP;
  const points = quote.executable && be != null && model != null ? pts(model) - pts(be) : null;
  return { rung, isMain, label: `${rung.market.threshold}+`, side, quote, fee, breakEven: be, model, points };
}

export function ladderViews(row: Pick<PropRow, 'ladder' | 'main'>, side: PropSide, now: number): RungView[] {
  return row.ladder.map((r) => rungView(r, side, r.market.market_id === row.main?.market.market_id, now));
}

// ------------------------------------------------------------------ is a model-versus-market gap investigated, or unexplained?

export type Difference =
  | { kind: 'noProjection'; why: string }
  | { kind: 'noPrice'; why: string }
  | { kind: 'stale'; why: string }
  | { kind: 'close'; points: number }
  | { kind: 'signal'; points: number; authority: AuthorityView }
  | { kind: 'unexplained'; points: number };

/** Below this many points between the model and the break-even the two are read as close. */
export const CLOSE_POINTS = 3;

/**
 * What the gap on a contract is. A gap is an investigated research signal ONLY when the opportunity layer holds a
 * published opportunity for that exact contract (propAuthority reads it; this never judges one). A gap with no such
 * opportunity is an unexplained difference: a question for research, not a finding. No projection, no price or a stale
 * price is said as such, never as a zero.
 */
export function classifyDifference(v: RungView | null, projectionWhy: string | null, byMarket: ReadonlyMap<string, Pick<Opportunity, 'status' | 'authority' | 'statusReason'>>): Difference {
  if (!v) return { kind: 'noPrice', why: 'No priced line to compare with.' };
  if (v.model == null) return { kind: 'noProjection', why: projectionWhy ?? 'The projection prices no probability for this line.' };
  if (v.quote.ask == null) return { kind: 'noPrice', why: 'No Kalshi quote is published for this side.' };
  if (!v.quote.executable) return { kind: 'stale', why: v.quote.freshness === 'UNKNOWN' ? 'The quote has no capture time.' : 'The quote is stale.' };
  if (v.points == null) return { kind: 'noPrice', why: 'No comparison is available.' };
  if (Math.abs(v.points) < CLOSE_POINTS) return { kind: 'close', points: v.points };
  const authority = propAuthority(v.rung.market.market_id, byMarket);
  return authority.level === 'research' ? { kind: 'unexplained', points: v.points } : { kind: 'signal', points: v.points, authority };
}

// ------------------------------------------------------------------ the explorer list

export interface PropsFilter { game?: string | null; family?: PropFamily | 'all' | null; q?: string | null }

/** One search rule for players: name, role or team, case-insensitive, every word must match. */
export function matchesSearch(d: Pick<PropRow, 'name' | 'role' | 'team'>, q: string | null | undefined): boolean {
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${d.name} ${d.role ?? ''} ${d.team.abbr} ${d.team.nick} ${d.team.city}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function filterRows(rows: DiscoveryRow[], f: PropsFilter): DiscoveryRow[] {
  return rows.filter((d) => (!f.game || d.eventId === f.game) && (!f.family || f.family === 'all' || d.row.family === f.family) && matchesSearch(d.row, f.q));
}

export interface PlayerEntry {
  key: string;
  playerId: string;
  eventId: string;
  name: string;
  role: string | null;
  team: PropRow['team'];
  opp: PropRow['opp'];
  game: string;
  kickoff: string;
  /** The prop the row leads with: the player's highest-ranked priced prop in the filter. */
  lead: DiscoveryRow;
  /** Every prop of this player in the filter, in the order given. */
  rows: DiscoveryRow[];
  injury: string | null;
}

/** One entry per player (per game), in the order each player first appears; the lead is the player's first priced row, else his first row. */
export function groupPlayers(rows: DiscoveryRow[]): PlayerEntry[] {
  const by = new Map<string, DiscoveryRow[]>();
  for (const d of rows) {
    const k = `${d.eventId}|${d.row.playerId}`;
    by.set(k, [...(by.get(k) ?? []), d]);
  }
  return [...by.entries()].map(([key, rs]) => {
    const lead = rs.find((d) => d.row.main) ?? rs[0];
    const r = lead.row;
    return { key, playerId: r.playerId, eventId: lead.eventId, name: r.name, role: r.role, team: r.team, opp: r.opp, game: lead.game, kickoff: lead.kickoff, lead, rows: rs, injury: rs.find((d) => d.row.injury)?.row.injury ?? null };
  });
}

/**
 * The explorer's order, from the app's own rules. featured: the prop board's order (rows arrive in it). gap / history:
 * views/props/ranking.ts's rankSlate; props that ranking cannot place (no projection to compare, a role disagreement,
 * too few games) follow in the featured order, so nothing is dropped from the list, only unranked.
 */
export function orderRows(rows: DiscoveryRow[], sort: PropSort, hit?: (d: DiscoveryRow) => HitRate | null): { ordered: DiscoveryRow[]; unranked: number } {
  if (sort === 'featured') return { ordered: rows, unranked: 0 };
  const { ranked } = rankSlate<HitRate>(rows, { sort, hit });
  const first = new Set(ranked.map((x) => x.d));
  return { ordered: [...ranked.map((x) => x.d), ...rows.filter((d) => !first.has(d))], unranked: rows.length - first.size };
}

/** The families that actually have rows, in the app's order, with counts. */
export function familyCounts(rows: DiscoveryRow[], order: PropFamily[]): { family: PropFamily; n: number }[] {
  return order.map((family) => ({ family, n: rows.filter((d) => d.row.family === family).length })).filter((x) => x.n > 0);
}

// ------------------------------------------------------------------ the row's model figure

export interface ModelFigure {
  kind: 'probability' | 'projection' | 'withheld' | 'none';
  /** "45%" / "252 yds" / "Projection withheld" / "No projection". */
  text: string;
}

/** What the row shows beside the Kalshi price. Probability when the selected projection prices the main line; else the expected value; else why there is none. Never a zero. */
export function modelFigure(r: Pick<PropRow, 'main' | 'projection' | 'projectionStatus' | 'def'>, fmt: (v: number) => string): ModelFigure {
  if (r.main?.modelP != null) return { kind: 'probability', text: `${Math.round(r.main.modelP * 100)}%` };
  if (r.projectionStatus.kind === 'withheld') return { kind: 'withheld', text: 'Projection withheld' };
  if (r.projection != null) return { kind: 'projection', text: `Proj ${fmt(r.projection)}` };
  return { kind: 'none', text: 'No projection' };
}

// ------------------------------------------------------------------ words

const STAT_SHORT: Record<string, string> = {
  passing_yards: 'pass yds', attempts: 'pass att', completions: 'completions', passing_tds: 'pass TDs', interceptions: 'INTs',
  rushing_yards: 'rush yds', carries: 'carries', longest_rush: 'long rush', receiving_yards: 'rec yds', receptions: 'receptions',
  longest_reception: 'long rec', rush_rec_yards: 'rush+rec yds', touchdowns: 'anytime TD', fantasy_points: 'fantasy pts', field_goals: 'field goals',
};
/** The short stat word a row sets under its line ("pass yds"). */
export const statShort = (stat: string, fallback: string) => STAT_SHORT[stat] ?? fallback.toLowerCase();

/** The v4 address of a player's prop detail: sport, game and player in the path, the prop in the query. */
export const propHref = (slug: string, eventId: string, playerId: string, stat?: string | null) =>
  `/v4/props/${slug}/${encodeURIComponent(eventId)}/${encodeURIComponent(playerId)}${stat ? `?stat=${encodeURIComponent(stat)}` : ''}`;

/** The Props explorer with a game (or sport) already chosen. */
export const propsExplorerHref = (o: { sport?: string | null; game?: string | null } = {}) => {
  const q = new URLSearchParams();
  if (o.sport && o.sport !== 'nfl') q.set('sport', o.sport);
  if (o.game) q.set('game', o.game);
  const s = q.toString();
  return `/v4/props${s ? `?${s}` : ''}`;
};

/** How old a capture is, for a status line: "just now", "4m ago", "2h 05m ago". */
export { formatQuoteAgo as ageWords } from '../live/freshness';

/** Why a row has no projection to compare, in words (null when it has one). Withheld projections give the publication's own reason. */
export function projectionWhy(r: Pick<PropRow, 'projection' | 'projectionStatus' | 'def'>): string | null {
  if (r.projectionStatus.kind === 'withheld') return `Projection withheld: ${r.projectionStatus.reason}.`;
  if (r.projection != null) return null;
  return r.def.sim ? 'No simulation row for this player and stat this week.' : 'The publication simulates no distribution for this stat: market prices only.';
}
