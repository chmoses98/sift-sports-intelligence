// The SIFT model's published view of one game, and the market's, read from the event's own research document. Pure, no fetching.
//
// Three sources can exist, never merged and never invented:
//   * `approved`  the app's one projection authority (lib/projectionAuthority.ts) resolved the sport's `team_points` family as authoritative
//                 for this game (a PROMOTED family that passed freshness, coherence and publication checks). Passed in by the caller.
//   * `research`  `extensions.model_view`: the publication's research simulation for the game (model version, feature cutoff, score and win
//                 probability). It is labelled as research, carries the publication's own caveat and is never called approved.
//   * `cbb`       `extensions.cbb.primary`: the CBB publisher's frozen pre-tip projection (model version, as-of, score, win probability).
// The market view is `extensions.market_implied` (Kalshi midpoints, "not executable"): always a separate lane, never blended with the model.
// When a model view does not exist the result names why. Nothing here estimates a number.
import type { EventResearchDoc } from '../../../contract/types';
import type { V3Game } from '../../model/types';
import { eventExt } from '../../../views/cbb/data';

export type ModelOrigin = 'approved' | 'research' | 'cbb';

export interface ModelView {
  origin: ModelOrigin;
  /** The publication's model name and version ("shadow-0.4.0"). */
  version: string | null;
  /** The instant the model's inputs were cut (ISO), when published. */
  asOf: string | null;
  awayScore: number | null;
  homeScore: number | null;
  /** Probability 0..1 that each side wins, when published. */
  awayWin: number | null;
  homeWin: number | null;
  total: number | null;
  /** The publication's own caveat on how to read the model, verbatim. */
  caveat: string | null;
  /** The words after "SIFT model" that say what kind of model output this is. */
  kind: string;
  /** 80% range of each team's points, only for the approved projection (which publishes one). */
  range: { away: [number, number] | null; home: [number, number] | null } | null;
}

export interface MarketView {
  awayScore: number | null;
  homeScore: number | null;
  awayWin: number | null;
  homeWin: number | null;
  total: number | null;
  /** The publication's own label ("inferred from midpoints, not executable"). */
  label: string | null;
}

export interface ProjectionRead {
  model: ModelView | null;
  /** Why there is no model view (shown verbatim as the absent state); null when there is one. */
  absent: string | null;
  market: MarketView | null;
}

export interface ApprovedTeams { away: { mean: number; p10: number | null; p90: number | null }; home: { mean: number; p10: number | null; p90: number | null }; asOf: string | null; version: string | null }

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const rec = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

/** A published `{ TEAM: value }` map read for the two teams (by team code, then abbreviation); null unless both sides are present. */
function pair(map: unknown, g: Pick<V3Game, 'away' | 'home'>): { away: number; home: number } | null {
  const m = rec(map);
  if (!m) return null;
  const at = (t: V3Game['away']) => num(m[t.id]) ?? num(m[t.abbr]) ?? num(m[t.id.toUpperCase()]) ?? num(m[t.abbr.toUpperCase()]);
  const away = at(g.away), home = at(g.home);
  return away != null && home != null ? { away, home } : null;
}

const probs = (map: unknown, g: Pick<V3Game, 'away' | 'home'>) => {
  const p = pair(map, g);
  return p && p.away >= 0 && p.away <= 1 && p.home >= 0 && p.home <= 1 ? p : null;
};

export function readMarket(research: EventResearchDoc | null | undefined, g: Pick<V3Game, 'away' | 'home'>): MarketView | null {
  const mi = rec((research?.extensions as Record<string, unknown> | null)?.market_implied);
  if (!mi) return null;
  const score = pair(mi.implied_score, g), win = probs(mi.win_probability, g);
  const total = num(mi.implied_total_median);
  if (!score && !win) return null;
  return { awayScore: score?.away ?? null, homeScore: score?.home ?? null, awayWin: win?.away ?? null, homeWin: win?.home ?? null, total, label: typeof mi.label === 'string' ? mi.label : null };
}

function researchModel(research: EventResearchDoc, g: Pick<V3Game, 'away' | 'home'>): ModelView | null {
  const mv = rec((research.extensions as Record<string, unknown> | null)?.model_view);
  if (!mv) return null;
  const score = pair(mv.model_score, g), win = probs(mv.model_win_probability, g);
  if (!score && !win) return null;
  return {
    origin: 'research', version: typeof mv.model_version === 'string' ? mv.model_version : null, asOf: typeof mv.feature_cutoff === 'string' ? mv.feature_cutoff : null,
    awayScore: score?.away ?? null, homeScore: score?.home ?? null, awayWin: win?.away ?? null, homeWin: win?.home ?? null, total: num(mv.model_total),
    caveat: typeof mv.caveat === 'string' ? mv.caveat : null, kind: 'research simulation', range: null,
  };
}

function cbbModel(research: EventResearchDoc): ModelView | null {
  const ext = eventExt(research.event);
  const p = ext?.primary;
  if (!ext || ext.projection_state !== 'PROJECTED' || !p) return null;
  const hw = num(p.home_win_prob);
  if (num(p.home_score) == null && hw == null) return null;
  return {
    origin: 'cbb', version: p.version || null, asOf: p.as_of || null, awayScore: num(p.away_score), homeScore: num(p.home_score),
    awayWin: hw != null ? 1 - hw : null, homeWin: hw, total: num(p.total),
    caveat: 'A prospectively frozen pre-tip projection, published as research. It is not a recommendation.', kind: p.role_label ? `${p.role_label.toLowerCase()} projection` : 'pre-tip projection', range: null,
  };
}

export function approvedModel(a: ApprovedTeams): ModelView {
  const r = (t: ApprovedTeams['away']): [number, number] | null => (t.p10 != null && t.p90 != null ? [t.p10, t.p90] : null);
  return {
    origin: 'approved', version: a.version, asOf: a.asOf, awayScore: a.away.mean, homeScore: a.home.mean, awayWin: null, homeWin: null, total: a.away.mean + a.home.mean,
    caveat: 'Opponent-adjusted pregame forecast of each team’s points; research context, not a recommendation.', kind: 'approved projection', range: { away: r(a.away), home: r(a.home) },
  };
}

/**
 * The SIFT model view for a game, or why there is none. `approved` (the projection authority's answer, when the sport has an approved
 * team-points family and it resolved) wins over the research simulation; CBB's frozen projection is its own source. The market lane is read
 * independently, so a game can have a market view and no model view (and the screen then says so).
 */
export function readProjection(research: EventResearchDoc | null | undefined, g: Pick<V3Game, 'away' | 'home' | 'slug'>, approved?: ApprovedTeams | null): ProjectionRead {
  const market = readMarket(research, g);
  if (approved) return { model: approvedModel(approved), absent: null, market };
  if (!research) return { model: null, absent: 'The research publication for this game is not available, so there is no SIFT model view to show.', market };
  const model = g.slug === 'cbb' ? cbbModel(research) : researchModel(research, g);
  if (model) return { model, absent: null, market };
  const why = g.slug === 'cbb'
    ? `The publication has not projected this game (${eventExt(research.event)?.projection_message || 'no pre-tip projection is on file'}).`
    : 'The publication carries no SIFT model view for this game, so none is shown. Nothing is estimated.';
  return { model: null, absent: why, market };
}

/** The favourite by a model view's win probability (or its score when only a score is published); null when it is a coin flip or unstated. */
export function modelLean(m: ModelView): 'away' | 'home' | null {
  if (m.awayWin != null && m.homeWin != null && m.awayWin !== m.homeWin) return m.awayWin > m.homeWin ? 'away' : 'home';
  if (m.awayScore != null && m.homeScore != null && m.awayScore !== m.homeScore) return m.awayScore > m.homeScore ? 'away' : 'home';
  return null;
}
