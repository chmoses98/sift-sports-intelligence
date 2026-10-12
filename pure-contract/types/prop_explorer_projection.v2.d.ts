// Type declarations for the Combined Player Prop Explorer row contract, v2 (pure-contract/PROP_EXPLORER.md).
//
// The app MAY import these (`import type { PropExplorerRowV2 } from '../../pure-contract/types/...'`). Nothing in
// src/ imports them today. The normative validator is pure-contract/prop_explorer_v2.py; these types mirror
// schema/prop_explorer_projection.v2.schema.json (a unit test keeps the field names in sync).
//
// Display rules the validator enforces (an adapter should show the computed labels, never re-derive them):
// * a market-informed primary projection is labelled MARKET_INFORMED, and its edge against the market is never
//   shown as independent value;
// * a model-market disagreement without demonstrated value (value_status other than VALIDATED_VALUE, or not
//   CALIBRATED) is RESEARCH, not an opportunity;
// * REJECTED / BLOCKED projections are never the best validated, primary or sports-only projection, and are never
//   priced.

import type {
  DriverRole,
  ExplorerCapture,
  ExplorerGame,
  ExplorerGameScript,
  ExplorerPlayer,
  ExplorerUncertainty,
  ExplorerWorkload,
  IsoTimestamp,
  MatchupRole,
  PropExplorerProjectionV1,
  SeasonType,
  StrictRuleVerdict,
} from './prop_explorer_projection.v1';

export type ProjectionRole = 'champion' | 'challenger' | 'baseline' | 'best_accuracy' | 'other';

/** Is this the most accurate projection we can show? (Not a statement about betting value.) */
export type AccuracyStatus =
  | 'ACCURACY_PROMOTED' | 'ACCURACY_ACCEPTED_RESEARCH' | 'ACCURACY_SHADOW_PROSPECTIVE' | 'ACCURACY_NOT_TESTED'
  | 'ACCURACY_INCONCLUSIVE' | 'ACCURACY_REJECTED' | 'ACCURACY_BLOCKED_DATA' | 'BLOCKED_NOT_VALIDATED_POSTSEASON';
/** Has value against executable Kalshi prices (after fees and spread) been demonstrated? */
export type ValueStatus =
  | 'VALIDATED_VALUE' | 'VALUE_SHADOW_PROSPECTIVE' | 'VALUE_NOT_TESTED' | 'VALUE_INCONCLUSIVE' | 'VALUE_REJECTED'
  | 'VALUE_BLOCKED_DATA';
export type CalibrationStatus = 'CALIBRATED' | 'ASSESSED' | 'MISCALIBRATED' | 'NOT_ASSESSED';
export type EvidenceKindV2 =
  | 'preregistration' | 'results' | 'scorecard' | 'source_audit' | 'rerun' | 'pull_request' | 'shadow_collection'
  | 'sidecar_sample' | 'other' | 'value_results' | 'calibration' | 'promotion_decision';
export type RungLabel =
  | 'VALIDATED_OPPORTUNITY' | 'NO_EDGE' | 'RESEARCH' | 'MARKET_INFORMED' | 'NOT_EXECUTABLE' | 'STALE_QUOTE';
export type RowLabel = 'VALIDATED_OPPORTUNITY' | 'MARKET_INFORMED' | 'RESEARCH' | 'NO_ELIGIBLE_PROJECTION';

export interface RowIdentity {
  sport: string;
  game_id: string;
  player_id: string;
  statistic: string;
  conditional_on_playing: boolean;
  snapshot_at: IsoTimestamp;
}

export interface ProjectionModel {
  /** Stable family id for the explorer, e.g. mlb.pitcher_workload_joint. */
  model_id: string;
  model_version: string;
  model_frozen_hash: string;
}

export interface MarketDerivedInput {
  input: string;
  /** indirect: derived from market data upstream, e.g. PROE / expected pass rate / team ratings fitted to lines. */
  dependency: 'direct' | 'indirect';
  market_source: 'sportsbook' | 'kalshi' | 'other_exchange' | 'settlement' | 'unknown';
  derivation: string;
}

export interface ModelProvenance {
  /** True exactly when market_derived_inputs is nonempty. */
  market_informed: boolean;
  market_derived_inputs: MarketDerivedInput[];
  source: { repo: string; commit: string; path: string } | null;
}

export interface OutcomeThreshold {
  at_least: number;
  /** P(stat >= at_least). */
  probability: number;
}

export interface ProjectionOutcome {
  unit: string | null;
  mean: number;
  median: number;
  p10: number;
  p90: number;
  quantiles: { q: number; value: number }[];
  thresholds: OutcomeThreshold[];
  pmf: { value: number; probability: number }[] | null;
}

export interface ProjectionMatchup {
  /** Mirrors game.opponent_team_id. */
  opponent_team_id: string | null;
  opponent_adjusted: boolean;
  /** Drivers whose matchup_role is opponent_input. */
  opponent_inputs: string[];
  /** Drivers whose matchup_role is opponent_adjusted. */
  opponent_adjusted_by: string[];
}

export interface ProjectionDriver {
  feature: string;
  label: string | null;
  role: DriverRole;
  matchup_role: MatchupRole | null;
  value: number | string | boolean | null;
  source: string;
  observed_at: IsoTimestamp;
  /** 1 = most important; null when importance_basis is not_ranked. */
  importance_rank: number | null;
  importance_basis: 'not_ranked' | 'producer_attribution' | 'model_structure';
}

export interface ProjectionCalibration {
  status: CalibrationStatus;
  metrics: {
    interval_coverage_80: number | null;
    threshold_ece: number | null;
    brier: number | null;
    log_loss: number | null;
    crps: number | null;
    calibration_slope: number | null;
  };
  sample_size: { n_rows: number; n_games: number | null } | null;
  scope: string | null;
  evidence_id: string | null;
}

export interface ProjectionFreshness {
  as_of: IsoTimestamp;
  inputs_max_observed_at: IsoTimestamp;
  staleness_seconds: number;
  oldest_input_observed_at: IsoTimestamp;
  kickoff_lead_seconds: number;
}

export interface EvidenceV2 {
  id: string;
  kind: EvidenceKindV2;
  repo: string;
  commit: string;
  path: string;
  url: string | null;
}

export interface StatusScope {
  season_type: SeasonType | null;
  seasons: string[] | null;
  statistics: string[] | null;
  population: string | null;
}

export interface ProjectionValidation {
  accuracy_status: AccuracyStatus;
  value_status: ValueStatus;
  research_only: true;
  accuracy_scope: StatusScope;
  /** Null when value_status is VALUE_NOT_TESTED. */
  value_scope: StatusScope | null;
  source_verdict: string | null;
  compared_against: string[] | null;
  evidence: EvidenceV2[];
  caveats: string[];
  strict_rule_verdicts: StrictRuleVerdict[];
}

export interface ExplorerProjectionV2 {
  projection_id: string;
  role: ProjectionRole;
  model: ProjectionModel;
  provenance: ModelProvenance;
  /** The sports-only proof: present exactly when provenance.market_informed is false. */
  explorer_projection: PropExplorerProjectionV1 | null;
  outcome: ProjectionOutcome;
  expected_workload: ExplorerWorkload | null;
  matchup: ProjectionMatchup | null;
  game_script: ExplorerGameScript | null;
  drivers: ProjectionDriver[] | null;
  uncertainty: ExplorerUncertainty;
  calibration: ProjectionCalibration;
  freshness: ProjectionFreshness;
  validation: ProjectionValidation;
}

export interface KalshiQuote {
  contract_ticker: string;
  /** YES pays when the statistic >= at_least. */
  at_least: number;
  /** Dollars in (0, 1); null = no resting order on that side. */
  yes_bid: number | null;
  yes_ask: number | null;
  no_bid: number | null;
  no_ask: number | null;
  last_price: number | null;
  observed_at: IsoTimestamp;
}

export interface RowMarket {
  venue: 'kalshi';
  event_ticker: string | null;
  captured_at: IsoTimestamp;
  quotes: KalshiQuote[];
}

export interface FeeModel {
  name: 'kalshi_general_taker' | 'flat_per_contract';
  rate: number;
  multiplier: number;
  rounding: 'ceil_cent' | 'none';
  price_tick: number;
}

export interface EvaluationRung {
  contract_ticker: string;
  at_least: number;
  side: 'yes' | 'no';
  model_probability: number;
  /** The ask on that side; null when nobody is offering. */
  executable_price: number | null;
  spread: number | null;
  fee_per_contract: number | null;
  /** model_probability - ask - fee(ask) - slippage, per $1 contract. */
  edge_after_fees: number | null;
  /** Highest tick price at which edge_after_fees >= min_edge (and > 0); null when none. */
  bet_up_to_price: number | null;
  quote_age_seconds: number;
  display_label: RungLabel;
}

export interface MarketEvaluation {
  evaluated_projection_id: string;
  fee_model: FeeModel;
  slippage_per_contract: number;
  min_edge: number;
  max_quote_age_seconds: number;
  rungs: EvaluationRung[];
}

export interface RowFreshness {
  snapshot_at: IsoTimestamp;
  projections_as_of_max: IsoTimestamp;
  inputs_max_observed_at: IsoTimestamp;
  market_observed_at_max: IsoTimestamp | null;
  kickoff_lead_seconds: number;
}

export interface PropExplorerRowV2 {
  schema_version: 'prop_explorer_projection.v2';
  record_type: 'explorer_row';
  /** sport|game_id|player_id|statistic|cond or unc|snapshot_at */
  row_id: string;
  research_only: true;
  identity: RowIdentity;
  capture: ExplorerCapture;
  player: ExplorerPlayer;
  game: ExplorerGame;
  projections: ExplorerProjectionV2[];
  /** Highest ACCURACY_PROMOTED / ACCURACY_ACCEPTED_RESEARCH projection; never REJECTED or BLOCKED. */
  best_validated_projection_id: string | null;
  /** Highest displayable projection with market_informed false. */
  sports_only_projection_id: string | null;
  /** The projection the explorer leads with: the best validated one, else the highest displayable one. */
  primary_projection_id: string | null;
  market: RowMarket | null;
  market_evaluation: MarketEvaluation | null;
  display_label: RowLabel;
  freshness: RowFreshness;
  /** Dotted path of every null field -> why. */
  null_reasons: Record<string, string>;
  [producerMetadata: `x_${string}`]: unknown;
}
