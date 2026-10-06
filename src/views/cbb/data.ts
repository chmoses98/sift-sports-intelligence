// Typed views over the CBB publication's documented extensions (cbb-edge-finder docs/SIFT_APP.md).
// Sift never reads a CBB archive: every field here was translated by the CBB app publisher from the
// immutable pre-tip projection archive, roster truth and the prospective scoreboard. Presentation only —
// nothing in this file computes a projection, a rating or an edge.
import type { EntityProfileDoc, EventDoc, EventResearchDoc, HealthDoc } from '../../contract/types';

export type ProjectionState = 'PROJECTED' | 'PENDING_WINDOW' | 'AWAITING_CAPTURE' | 'UNAVAILABLE';
export type Confidence = 'CONFIRMED' | 'LIKELY' | 'CONFLICTED' | 'STALE' | 'UNKNOWN';
export type Role = 'incumbent' | 'shadow' | 'roster_overlay' | 'other';

export interface CompactProjection {
  version: string;
  role: Role;
  role_label: string;
  as_of: string;
  home_score: number | null;
  away_score: number | null;
  margin: number | null;
  total: number | null;
  home_win_prob: number | null;
  possessions: number | null;
  margin_sd: number | null;
  total_sd: number | null;
}

export interface Integrity {
  status: 'VALID' | 'INVALID' | 'UNSCORABLE' | 'PENDING' | 'NOT_SCORED' | string;
  text: string | null;
  reasons: string[];
  identity_changed_versions: string[];
  conflicting_versions: string[];
  post_tip_records_ignored: number;
  scoreboard: string | null;
}

export interface CbbEventExt {
  cbb_game_id: string;
  espn_game_id: number;
  date_et: string;
  time_state: string;
  tbd: boolean;
  site: 'home' | 'neutral';
  neutral_site: boolean;
  conference_game: boolean;
  event_name: string | null;
  schedule_source: 'SDV' | 'ESPN_FALLBACK' | string;
  reconciled_fields: string[];
  projection_state: ProjectionState;
  projection_message: string;
  primary: CompactProjection | null;
  models: string[];
  roster_confidence: { home: Confidence; away: Confidence };
  integrity: Integrity;
  result: { home_score: number; away_score: number } | null;
  conferences: { home: string | null; away: string | null };
}

export interface RotationPlayer {
  player_id: string;
  name: string | null;
  position: string | null;
  minutes: number | null;
  class: string;
  class_label: string;
  prior_team: string | null;
  expected_starter: boolean | null;
}

export interface TeamRoster {
  available: boolean;
  snapshot?: string;
  snapshot_at?: string | null;
  confidence: Confidence;
  explanation: string;
  reason?: string | null;
  reason_text?: string | null;
  official_identity_coverage?: number | null;
  fresh_sources?: string[];
  counts?: Record<string, number>;
  continuity?: {
    returning_minutes_share: number | null;
    expected_returning_share: number | null;
    incoming_transfer_prev_share: number | null;
    first_d1_expected_to_play: number | null;
    minutes: { returning: number | null; transfer: number | null; first_d1: number | null };
    game1_continuity_correction: number | null;
    audit_snapshot: string | null;
  };
  rotation_valid?: boolean;
  rotation_note?: string | null;
  expected_rotation?: RotationPlayer[];
}

export interface ModelRow extends CompactProjection {
  model_name: string | null;
  arm: string | null;
  info_cutoff: string | null;
  pretip_basis: string;
  home_team_id: string;
  away_team_id: string;
  home_ppp: number | null;
  away_ppp: number | null;
  margin_range_50: [number, number] | null;
  margin_range_80: [number, number] | null;
  total_range_50: [number, number] | null;
  total_range_80: [number, number] | null;
  games_seen: { home: number | null; away: number | null };
  info_games: number | null;
  provenance: Record<string, unknown> & {
    archive_path?: string | null;
    record_sha256?: string | null;
    code_sha?: string | null;
    code_version?: string | null;
    model_sha256?: string | null;
    roster_archive_commit?: string | null;
    truth_snapshot?: string | null;
    schedule_source?: string | null;
    schedule_window?: string | null;
    schedule_listed_start?: string | null;
    schedule_reconciled_fields?: string[];
  };
}

export interface ProsterSide {
  team_id: string;
  roster_confidence: Confidence;
  games_seen: number | null;
  input_substitution_active: boolean;
  continuity_correction_active: boolean;
  returning_minutes_share: number | null;
  expected_returning_share: number | null;
  first_d1_expected_to_play: number | null;
  incoming_transfer_prev_share: number | null;
  minutes: { returning: number | null; transfer: number | null; unseen: number | null };
  expected_rotation: RotationPlayer[];
}

export interface Proster {
  component: string | null;
  truth_snapshot: string | null;
  truth_snapshot_at: string | null;
  truth_archive_commit: string | null;
  spec_sha256: string | null;
  margin_base: number | null;
  total_base: number | null;
  adjustment_input_substitution: number | null;
  adjustment_continuity: number | null;
  adjustment_total: number | null;
  sides: { home: ProsterSide; away: ProsterSide };
}

export interface CbbResearchExt extends CbbEventExt {
  models_detail: ModelRow[];
  primary_version: string | null;
  model_order_note: string;
  rejected_records: { version: string; as_of: string | null; reason: string }[];
  ratings_source: { version: string; as_of: string } | null;
  matchup_pairs: { offense: string; defense: string; label: string }[];
  roster: { basis: 'pretip_record' | 'current_truth' | 'none'; basis_text: string; home: TeamRoster | null; away: TeamRoster | null };
  proster: Proster | null;
  venue: { name: string | null; city: string | null; region: string | null; neutral: boolean };
  schedule: { source: string; source_observed_at: string | null; reconciled_fields: string[]; listed_start: string; time_state: string; state: string | null; status_name: string | null };
  markets_published: number;
}

export interface CbbTeamExt {
  team_id: string;
  espn_team_id: number;
  conference: string | null;
  logo_url: string | null;
  roster: TeamRoster;
  ratings: (Record<string, number | null> & { as_of: string; version: string; games_seen: number | null; event: string }) | null;
  upcoming: { event_id: string; cbb_game_id: string; start: string; tbd: boolean; date_et: string; opponent: string; home_away: string; projection_state: ProjectionState; primary: CompactProjection | null; path: string | null }[];
  schedule_games: number;
  completed_games: number;
}

export interface ScoreSlice {
  N: number;
  base?: { MAE: number | null; RMSE: number | null; bias: number | null };
  roster?: { MAE: number | null; RMSE: number | null; bias: number | null };
  incumbent?: { MAE: number | null; RMSE: number | null; bias: number | null };
  delta_MAE?: number | null;
  delta_RMSE?: number | null;
  pct_games_improved?: number | null;
  ci90?: unknown;
}

export interface CbbStatus {
  research_status: 'PRESEASON' | 'IN_SEASON' | string;
  season: string;
  first_game_utc: string | null;
  games_in_capture_window: number;
  projection_states: Partial<Record<ProjectionState, number>>;
  models: { version: string; role: Role; role_label: string }[];
  model_note: string;
  prospective: {
    scoreboard_stamp: string | null;
    scoreboard_path: string | null;
    protocol: string | null;
    versions: Record<string, string> | null;
    game_1: ScoreSlice;
    game_2: ScoreSlice;
    game_3: ScoreSlice;
    gate: Record<string, number>;
    note: string | null;
    min_n_for_inference: number;
    min_days_for_inference: number;
    inference_allowed: boolean;
  };
  roster_readiness: { counts: Partial<Record<Confidence, number>>; snapshot: string | null; snapshot_at: string | null };
  schedule: { d1_games: number; sdv_games: number | null; fallback_games: number | null; reconciled_games: number | null; excluded: number; observed_at: string | null };
  markets: { published: number; captured_at: string | null; note: string | null };
  capabilities: Record<string, string>;
  provenance: Record<string, unknown>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const eventExt = (e: EventDoc | null | undefined): CbbEventExt | null => ((e?.extensions as any)?.cbb ?? null) as CbbEventExt | null;

export function researchExt(r: EventResearchDoc | null | undefined): CbbResearchExt | null {
  const c = (r?.extensions as any)?.cbb;
  if (!c) return null;
  // the research document carries the full model rows under `models` (the event's compact list is versions)
  return { ...c, models_detail: (c.models ?? []) as ModelRow[] } as CbbResearchExt;
}

export const teamExt = (p: EntityProfileDoc | null | undefined): CbbTeamExt | null => ((p?.extensions as any)?.cbb ?? null) as CbbTeamExt | null;
export const statusExt = (h: HealthDoc | null | undefined): CbbStatus | null => ((h?.extensions as any)?.cbb ?? null) as CbbStatus | null;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------------ plain language

export const CONFIDENCE_ORDER: Confidence[] = ['CONFIRMED', 'LIKELY', 'CONFLICTED', 'STALE', 'UNKNOWN'];

export const CONFIDENCE_TEXT: Record<Confidence, string> = {
  CONFIRMED: 'Official current roster available, or two independent current sources agree.',
  LIKELY: 'One current source lists the roster; not independently confirmed.',
  CONFLICTED: 'Current sources place at least one player on more than one team.',
  STALE: 'No current-season roster source; only older or copied listings.',
  UNKNOWN: 'The official roster could not be matched to player identities.',
};

export const STATE_TEXT: Record<ProjectionState, string> = {
  PROJECTED: 'Projection published before tip.',
  PENDING_WINDOW: 'Projection pending — game has not entered the prospective capture window.',
  AWAITING_CAPTURE: 'Inside the 30-hour capture window — the next scheduled run records the projection before tip.',
  UNAVAILABLE: 'No projection was archived before tip for this game; none is shown.',
};

export const ROLE_SHORT: Record<string, string> = { incumbent: 'Incumbent', shadow: 'Shadow', roster_overlay: 'Roster overlay', other: 'Overlay' };

/** "Kansas" from a participant; the CBB location reads better than the full display name in dense rows. */
export function teamShort(p: { display_name: string; short_name?: string | null; metadata?: Record<string, unknown> | null } | null | undefined): string {
  const loc = p?.metadata?.location;
  return typeof loc === 'string' && loc ? loc : p?.display_name ?? '?';
}

/** The ET calendar date of a game ("Sun, Nov 8"): TBD tips are a 00:00 ET placeholder, never a time. */
export function etDate(dateEt: string): string {
  const [y, m, d] = dateEt.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function tipLabel(startIso: string, ext: Pick<CbbEventExt, 'tbd' | 'date_et'> | null): string {
  if (ext?.tbd) return `${etDate(ext.date_et)} · time TBD`;
  return new Date(startIso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export const fmt1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1));
export const signed1 = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`);
export const pct0 = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** "Kansas by 1.8" from a home-minus-away margin. */
export function marginWords(margin: number | null | undefined, home: string, away: string): string {
  if (margin == null) return '—';
  if (Math.abs(margin) < 0.05) return 'Even';
  return `${margin > 0 ? home : away} by ${Math.abs(margin).toFixed(1)}`;
}

export function shortSha(s: unknown): string {
  return typeof s === 'string' && s ? s.slice(0, 12) : '—';
}

export function stampTime(stamp: string | null | undefined): string | null {
  // 20261101T120000Z -> ISO
  if (!stamp) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : stamp;
}
