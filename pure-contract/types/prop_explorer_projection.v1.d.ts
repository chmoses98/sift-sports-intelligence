// Type declarations for the Combined Player Prop Explorer contract (pure-contract/PROP_EXPLORER.md).
//
// The app MAY import these later (`import type { PropExplorerProjectionV1 } from '../../pure-contract/types/...'`).
// Nothing in src/ imports them today. The normative validator is pure-contract/prop_explorer.py; these types
// mirror schema/prop_explorer_projection.v1.schema.json (a unit test keeps the field names in sync).
//
// Hard rule: a projection never carries a market price, a line, a recommendation or a stake. Market quotes
// travel in the separate PropExplorerMarketComparisonV1 record, keyed by the same identity.

/** ISO-8601 timestamp with an explicit offset or Z. */
export type IsoTimestamp = string;
/** "sha256:<64 hex>" of a pure_forecast.v1 row's model-owned fields (pure_gate.model_signature). */
export type ModelSignature = string;

// ---------------------------------------------------------------------------------------------------------------
// pure_forecast.v1 (pure-contract/schema/pure_forecast.v1.schema.json)
// ---------------------------------------------------------------------------------------------------------------

export interface PureThreshold {
  /** Strike t; probability is P(stat >= t). Strikes strictly ascending, probabilities non-increasing. */
  at_least: number;
  probability: number;
}

export interface PureQuantile {
  q: number;
  value: number;
}

export interface PureProjection {
  mean: number;
  median: number;
  p10: number;
  p90: number;
  quantiles?: PureQuantile[];
  /** The ladder sits inside the row, never one row per rung. */
  thresholds: PureThreshold[];
}

export interface PureSource {
  source_id: string;
  class: 'sports_only';
  max_observed_at: IsoTimestamp;
  uri?: string;
  snapshot_sha256?: string;
  description?: string;
}

export interface PureFeature {
  name: string;
  value: number | string | boolean | null;
  source: string;
  observed_at: IsoTimestamp;
  class: 'sports_only';
}

export interface PureForecastV1 {
  schema_version: 'pure_forecast.v1';
  sport: string;
  game_id: string;
  player_id: string;
  statistic: string;
  as_of: IsoTimestamp;
  kickoff: IsoTimestamp;
  source_max_observed_at: IsoTimestamp;
  projection_mode: 'PURE_INDEPENDENT';
  model_version: string;
  model_frozen_hash: string;
  conditional_on_playing: boolean;
  /** null = participation explicitly not modeled. */
  participation_probability: number | null;
  projection: PureProjection;
  sources: PureSource[];
  feature_lineage: PureFeature[];
  /** Producer metadata (x_*), not model-owned. */
  [producerMetadata: `x_${string}`]: unknown;
}

// ---------------------------------------------------------------------------------------------------------------
// prop_explorer_projection.v1
// ---------------------------------------------------------------------------------------------------------------

export type CaptureMode = 'prospective_pregame' | 'historical_research_replay';
export type SeasonType = 'preseason' | 'regular' | 'play_in' | 'postseason';
export type WorkloadMeasure =
  | 'snaps' | 'snap_share' | 'routes_run' | 'targets' | 'carries' | 'touches' | 'pass_attempts' | 'minutes'
  | 'plate_appearances' | 'batters_faced' | 'pitches' | 'outs_recorded' | 'time_on_ice' | 'shifts';
export type DriverRole =
  | 'opportunity' | 'efficiency' | 'workload' | 'team_environment' | 'participation' | 'rest_schedule'
  | 'history_depth' | 'opponent' | 'other';
/** opponent_input: describes the opponent. opponent_adjusted: a model stage that consumed opponent inputs. */
export type MatchupRole = 'opponent_input' | 'opponent_adjusted' | 'not_matchup';
export type ProbabilityKind = 'simulation_share' | 'model_probability';
/** Closed enum. Words such as "validated" or "profitable" are refused by the validator. */
export type ValidationStatus =
  | 'RESEARCH_HISTORICAL_ACCEPTED' | 'SHADOW_PROSPECTIVE' | 'INCONCLUSIVE' | 'REJECTED' | 'BLOCKED_DATA'
  | 'NOT_VALIDATED';
export type EvidenceKind =
  | 'preregistration' | 'results' | 'scorecard' | 'source_audit' | 'rerun' | 'pull_request' | 'shadow_collection'
  | 'sidecar_sample' | 'other';
export type ChangeMethod = 'driver_value_diff' | 'producer_attribution';

export interface ExplorerIdentity {
  sport: string;
  game_id: string;
  player_id: string;
  statistic: string;
  model_version: string;
  model_frozen_hash: string;
  conditional_on_playing: boolean;
  as_of: IsoTimestamp;
}

export interface ExplorerCapture {
  captured_at: IsoTimestamp;
  capture_mode: CaptureMode;
  builder: string;
}

export interface ExplorerPlayer {
  name: string | null;
  position: string | null;
  team_id: string | null;
  team_abbr: string | null;
}

export interface ExplorerGame {
  kickoff: IsoTimestamp;
  season: string | null;
  season_type: SeasonType | null;
  week: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  opponent_team_id: string | null;
  is_home: boolean | null;
}

export interface ExplorerPmfPoint {
  value: number;
  probability: number;
}

export interface ExplorerDistribution {
  unit: string | null;
  /** Includes and agrees with every forecast quantile (p10, median, p90, forecast.projection.quantiles). */
  quantiles: PureQuantile[];
  pmf: ExplorerPmfPoint[] | null;
}

export type WorkloadLineage =
  | { kind: 'self' }
  | { kind: 'sibling_forecast'; statistic: string; model_signature: ModelSignature }
  | { kind: 'feature'; feature: string };

export interface ExplorerWorkload {
  measure: WorkloadMeasure;
  unit: string;
  mean: number;
  median: number | null;
  p10: number | null;
  p90: number | null;
  lineage: WorkloadLineage;
}

export interface ExplorerDriver {
  /** A feature_lineage name of the embedded forecast; value/source/observed_at equal that entry. */
  feature: string;
  label: string | null;
  role: DriverRole;
  matchup_role: MatchupRole | null;
  value: number | string | boolean | null;
  source: string;
  observed_at: IsoTimestamp;
}

export interface ScenarioProjection {
  mean: number;
  median: number | null;
  p10: number | null;
  p90: number | null;
}

export interface GameScriptScenario {
  scenario_id: string;
  label: string;
  /** Final margin from perspective_team_id's side, inclusive; null = unbounded. */
  margin_min: number | null;
  margin_max: number | null;
  probability: number;
  probability_kind: ProbabilityKind;
  projection: ScenarioProjection | null;
}

export interface ExplorerGameScript {
  conditioning: 'team_final_margin';
  perspective_team_id: string | null;
  exhaustive: boolean;
  source: { model_version: string; model_frozen_hash: string; class: 'sports_only'; description: string | null };
  scenarios: GameScriptScenario[];
}

export interface HoldoutIntervalCoverage {
  observed: number;
  n_rows: number;
  n_games: number | null;
  scope: string;
  /** An ExplorerEvidence.id of this row's validation block. */
  evidence_id: string;
}

export interface ExplorerUncertainty {
  p10_p90_width: number;
  interval_nominal_coverage: 0.8;
  holdout_interval_coverage: HoldoutIntervalCoverage | null;
}

export interface ExplorerFreshness {
  as_of: IsoTimestamp;
  source_max_observed_at: IsoTimestamp;
  /** as_of - source_max_observed_at, seconds. */
  staleness_seconds: number;
  oldest_input_observed_at: IsoTimestamp;
  /** kickoff - as_of, seconds. */
  kickoff_lead_seconds: number;
}

export interface ExplorerEvidence {
  id: string;
  kind: EvidenceKind;
  repo: string;
  commit: string;
  path: string;
  url: string | null;
}

export interface ExplorerValidation {
  status: ValidationStatus;
  research_only: true;
  scope: {
    season_type: SeasonType | null;
    seasons: string[] | null;
    statistics: string[] | null;
    population: string | null;
  };
  /** The source's own verdict, verbatim. */
  source_verdict: string | null;
  compared_against: string[] | null;
  evidence: ExplorerEvidence[];
  caveats: string[];
}

export interface AttributedDriver {
  feature: string;
  prior_value: number | string | boolean | null;
  current_value: number | string | boolean | null;
  /** producer_attribution only. */
  contribution?: number;
}

export interface ExplorerChangeExplanation {
  prior: { explorer_id: string; as_of: IsoTimestamp; model_version: string; model_signature: ModelSignature };
  model_changed: boolean;
  /** current - prior. */
  delta: { mean: number; median: number; p10: number; p90: number };
  method: ChangeMethod;
  attributed_drivers: AttributedDriver[];
  /** producer_attribution only: residual so that sum(contribution) + unattributed = delta.mean. */
  unattributed?: number;
}

export interface ExplorerProvenance {
  repo: string;
  commit: string;
  path: string;
  file_sha256: string | null;
  selection: string | null;
  conversion: string | null;
}

export interface PropExplorerProjectionV1 {
  schema_version: 'prop_explorer_projection.v1';
  record_type: 'projection';
  /** sport|game_id|player_id|statistic|model_version|cond or unc|as_of */
  explorer_id: string;
  research_only: true;
  identity: ExplorerIdentity;
  capture: ExplorerCapture;
  player: ExplorerPlayer;
  game: ExplorerGame;
  distribution: ExplorerDistribution;
  expected_workload: ExplorerWorkload | null;
  drivers: ExplorerDriver[] | null;
  game_script: ExplorerGameScript | null;
  uncertainty: ExplorerUncertainty;
  freshness: ExplorerFreshness;
  validation: ExplorerValidation;
  change_explanation: ExplorerChangeExplanation | null;
  /** Dotted path of every null field -> why the source does not provide it. */
  null_reasons: Record<string, string>;
  /** Embedded pure_forecast.v1 row (or reference it with forecast_ref). */
  forecast?: PureForecastV1;
  forecast_ref?: { uri: string; model_signature: ModelSignature };
  provenance?: ExplorerProvenance;
  [producerMetadata: `x_${string}`]: unknown;
}

// ---------------------------------------------------------------------------------------------------------------
// prop_explorer_market_comparison.v1 (separate file; display only)
// ---------------------------------------------------------------------------------------------------------------

export interface MarketComparisonRung {
  at_least: number;
  yes_bid: number | null;
  yes_ask: number | null;
  no_bid: number | null;
  no_ask: number | null;
  quote_probability: number | null;
}

export interface PropExplorerMarketComparisonV1 {
  schema_version: 'prop_explorer_market_comparison.v1';
  record_type: 'market_comparison';
  research_only: true;
  identity: { sport: string; game_id: string; player_id: string; statistic: string };
  projection_explorer_id: string | null;
  venue: string;
  market_ref: string;
  listed_at: IsoTimestamp | null;
  quoted_at: IsoTimestamp;
  captured_at: IsoTimestamp;
  rungs: MarketComparisonRung[];
  null_reasons: Record<string, string>;
  [producerMetadata: `x_${string}`]: unknown;
}

export type PropExplorerRecordV1 = PropExplorerProjectionV1 | PropExplorerMarketComparisonV1;
