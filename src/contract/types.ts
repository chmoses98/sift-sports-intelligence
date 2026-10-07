// Types for the edge_finder.app.v1 documents Sift reads (contract 1.2.0, kalshi-bet-router
// contract/edge_finder_contract/schemas). Fields are typed as the schemas publish them; nullable
// fields stay nullable so every screen has to decide what "missing" looks like.

export const SCHEMA_VERSION = 'edge_finder.app.v1';

export type SportCode = 'NFL' | 'MLB' | 'CFB' | 'NBA' | 'NHL' | 'SOCCER' | 'TENNIS' | 'CBB';
export type QualityStatus = 'VERIFIED' | 'PARTIAL' | 'RESEARCH' | 'UNAVAILABLE' | 'UNKNOWN';
export type FreshnessState = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';
export type OverallStatus = 'HEALTHY' | 'DEGRADED' | 'STALE' | 'UNAVAILABLE' | 'RESEARCH_ONLY';

export interface Doc {
  schema_version: string;
  kind: string;
  sport?: string;
  run_id?: string;
  generated_at?: string;
}

export interface Quality {
  status: QualityStatus;
  source: string | null;
  source_version: string | null;
  methodology_version: string | null;
  production: boolean | null;
  generated_at: string | null;
  data_as_of: string | null;
  coverage: string | null;
  sample_size: number | null;
  missingness: number | null;
  limitations: string[];
}

export interface Link {
  rel: string;
  label: string;
  path: string;
  target_id: string;
  target_kind: string;
}

export interface Participant {
  participant_id: string;
  participant_type: 'TEAM' | 'PLAYER' | 'PAIR';
  display_name: string;
  short_name: string | null;
  metadata?: Record<string, unknown> | null;
  source_ids?: Record<string, string> | null;
}

export interface EventDoc {
  event_id: string;
  sport: string;
  league: string | null;
  season: string | null;
  competition: string | null;
  status: string;
  start_time_utc: string;
  effective_start_time_utc: string | null;
  start_time_confidence: string;
  start_time_source: string | null;
  home_participant: string | null;
  away_participant: string | null;
  participants: Participant[];
  venue: string | null;
  broadcast: string | null;
  last_updated_at: string | null;
  schedule_updated_at: string | null;
  source_ids: Record<string, string>;
  extensions: Record<string, unknown> | null;
}

export interface ComponentHealth {
  status: string;
  as_of: string | null;
  age_seconds: number | null;
  detail: string | null;
}

export interface Thresholds {
  fresh_after_seconds: number;
  stale_after_seconds: number;
}

export interface HealthDoc extends Doc {
  kind: 'health';
  sport: string;
  overall_status: OverallStatus;
  freshness_status: FreshnessState;
  bet_authority: string | null;
  components: Record<string, ComponentHealth>;
  thresholds: Record<string, Thresholds>;
  errors: string[];
  last_export_attempt: string | null;
  last_market_capture: string | null;
  last_model_generated: string | null;
  last_successful_run: string | null;
  next_scheduled_run: string | null;
  payload_run_id: string | null;
  data_age_seconds: number | null;
  commit_sha: string | null;
  /** Contract 1.2.0 (optional): sport-specific operational state (CBB: the prospective research status). */
  extensions?: Record<string, unknown> | null;
}

export interface BoardItem {
  event_id: string;
  league: string | null;
  competition: string | null;
  status: string;
  start_time_utc: string;
  home_participant: string | null;
  away_participant: string | null;
  participants: Pick<Participant, 'participant_id' | 'display_name' | 'short_name' | 'participant_type'>[];
  data_freshness: FreshnessState;
  health_flags: string[];
  detail_path: string;
  market_captured_at: string | null;
  model_generated_at: string | null;
  markets_available: number;
  markets_priced: number;
  recommendations_count: number;
  wagers_count: number;
}

export interface BoardDoc extends Doc {
  kind: 'board';
  overall_status: OverallStatus;
  bet_authority: string | null;
  items: BoardItem[];
}

export interface ItemsDoc<T> extends Doc {
  items: T[];
}

export interface Market {
  market_id: string;
  kalshi_ticker: string;
  kalshi_event_ticker?: string | null;
  kalshi_series_ticker?: string | null;
  event_id: string | null;
  sport?: string;
  market_family: string;
  market_type?: string | null;
  market_status?: string;
  yes_description: string;
  no_description?: string | null;
  yes_bid: number | null;
  yes_ask: number | null;
  no_bid?: number | null;
  no_ask?: number | null;
  last_price?: number | null;
  market_probability: number | null;
  volume?: number | null;
  open_interest?: number | null;
  captured_at: string | null;
  close_time_utc?: string | null;
  participant_id: string | null;
  player_id: string | null;
  period: string | null;
  side?: string | null;
  line: number | null;
  threshold: number | null;
  source?: string | null;
  raw_market_reference?: string | null;
  extensions?: Record<string, unknown> | null;
}

export interface ModelPrice {
  model_price_id: string;
  market_id: string;
  event_id: string | null;
  run_id: string;
  model_version: string | null;
  fair_probability: number | null;
  market_probability: number | null;
  edge: number | null;
  projection_value: number | null;
  projection_unit: string | null;
  lower_bound: number | null;
  upper_bound: number | null;
  uncertainty?: number | null;
  generated_at: string;
  inputs_as_of: string | null;
  freshness_status?: FreshnessState;
  data_quality_status?: string;
  support_status?: string;
  extensions?: Record<string, unknown> | null;
}

export interface Recommendation {
  recommendation_id: string;
  market_id: string;
  event_id: string | null;
  selection: string;
  status: string;
  authority: string;
  research_only: boolean;
  fair_probability: number | null;
  bet_up_to_price: number | null;
  created_at: string;
  expires_at?: string | null;
}

export interface Thesis {
  thesis_id: string;
  event_id: string;
  summary: string | null;
  supporting_factors: string[];
  opposing_factors: string[];
  key_dependencies?: string[];
  primary_game_script?: string | null;
  confidence_label?: string | null;
  context_notes?: Record<string, unknown> | null;
  evidence?: Record<string, unknown> | null;
  generated_at: string;
}

export interface EventDetailDoc extends Doc {
  kind: 'event_detail';
  event: EventDoc;
  data_freshness: FreshnessState;
  markets: Market[];
  model_prices: ModelPrice[];
  recommendations: Recommendation[];
  theses: Thesis[];
  wagers: unknown[];
  settlements: unknown[];
  price_history: unknown[];
  context: Record<string, unknown> | null;
}

export interface ManifestDoc extends Doc {
  kind: 'manifest';
  sport: string;
  generated_at: string;
  run_id: string;
  files?: unknown;
}

// ------------------------------------------------------------------ research graph (1.1.x)

export interface Window {
  kind: 'SEASON' | 'LAST_N' | 'DATE_RANGE' | 'GAME' | 'RUN' | 'CUSTOM';
  n: number | null;
  start: string | null;
  end: string | null;
  label: string;
}

export interface ObservationContext {
  rank: number | null;
  universe_size: number | null;
  percentile: number | null;
  ranking_id: string | null;
  universe_label: string | null;
  league_average: number | null;
  league_median: number | null;
  best_value: number | null;
  worst_value: number | null;
  best_entity_id: string | null;
  worst_entity_id: string | null;
  higher_is_better: boolean | null;
}

export interface Observation {
  observation_id: string;
  sport: string;
  metric_id: string;
  entity_id: string;
  entity_type: string;
  value: number | null;
  adjusted_value: number | null;
  display_value: string | null;
  unit: string | null;
  window: Window;
  split: { dimension: string; value: string } | null;
  sample_size: number | null;
  as_of: string;
  season: string | null;
  event_id: string | null;
  opponent_id: string | null;
  source: string;
  quality_status: QualityStatus;
  context: ObservationContext | null;
  extensions?: Record<string, unknown> | null;
}

export interface MetricDef {
  metric_id: string;
  sport: string;
  name: string;
  short_name: string | null;
  description: string;
  entity_type: 'TEAM' | 'PLAYER' | 'EVENT' | 'MARKET' | 'MATCHUP';
  category: string;
  subcategory: string | null;
  unit: string | null;
  stat_type: string;
  higher_is_better: boolean | null;
  comparison_universe: string | null;
  supports: Record<string, boolean>;
  windows: string[];
  splits: string[];
  source: string | null;
  source_version: string | null;
  methodology_version: string | null;
  quality: Quality;
  historical_start: string | null;
  update_frequency: string | null;
  freshness: string | null;
  known_limitations: string[];
  related_metrics: string[];
  extensions?: Record<string, unknown> | null;
}

export interface MetricRegistryDoc extends Doc {
  kind: 'metric_registry';
  items: MetricDef[];
}

export interface RankingEntry {
  rank: number;
  entity_id: string;
  display_name: string;
  short_name: string | null;
  value: number | null;
  adjusted_value: number | null;
  sample_size: number | null;
  percentile: number | null;
  path: string | null;
}

export interface RankingDoc extends Doc {
  kind: 'ranking';
  ranking_id: string;
  metric_id: string;
  as_of: string;
  higher_is_better: boolean | null;
  entries: RankingEntry[];
  summary: {
    mean: number | null;
    median: number | null;
    min: number | null;
    max: number | null;
    stdev: number | null;
    best_entity_id: string | null;
    worst_entity_id: string | null;
    sample_size_min?: number | null;
    sample_size_max?: number | null;
  };
  universe: { entity_type: string; filter: string | null; label: string; season: string | null; size: number };
  window: Window;
  split: { dimension: string; value: string } | null;
  quality: Quality;
  links: Link[];
}

export interface SeriesPoint {
  x: string;
  t: string;
  event_id: string | null;
  opponent_id: string | null;
  value: number | null;
  adjusted_value: number | null;
  rolling_value: number | null;
  sample_size: number | null;
  run_id: string | null;
  source: string | null;
  quality_status: QualityStatus;
  path: string | null;
}

export interface SeriesDoc extends Doc {
  kind: 'time_series';
  series_id: string;
  metric_id: string;
  entity_id: string;
  entity_type: string;
  x_axis: 'GAME' | 'WEEK' | 'DATE' | 'RUN' | 'CAPTURE';
  unit: string | null;
  as_of: string;
  rolling_window: number | null;
  split: { dimension: string; value: string } | null;
  points: SeriesPoint[];
  quality: Quality;
  links: Link[];
}

export interface ProfileGame {
  event_id: string;
  competition: string | null;
  home_away: 'HOME' | 'AWAY' | 'NEUTRAL' | null;
  opponent_id: string | null;
  opponent_name: string | null;
  path: string | null;
  result: { for: number | null; against: number | null; outcome: string | null } | null;
  start_time_utc: string;
  status: string;
}

export interface Availability {
  as_of: string | null;
  detail: string | null;
  event_id: string | null;
  source: string | null;
  status: string;
}

export interface ResearchMarket {
  market_id: string;
  kalshi_ticker: string;
  event_id: string | null;
  market_family: string;
  yes_description: string;
  yes_bid: number | null;
  yes_ask: number | null;
  market_probability: number | null;
  captured_at: string | null;
  participant_id: string | null;
  player_id: string | null;
  period: string | null;
  line: number | null;
  threshold: number | null;
}

export interface Projection {
  model_price_id: string | null;
  market_id: string | null;
  event_id: string | null;
  metric_id: string | null;
  fair_probability: number | null;
  market_probability: number | null;
  edge: number | null;
  projection_value: number | null;
  projection_unit: string | null;
  lower_bound: number | null;
  upper_bound: number | null;
  model_version: string | null;
  generated_at: string | null;
  run_id: string | null;
  authority: string | null;
  research_only: boolean;
  quality_status: QualityStatus;
}

export interface ProfileRef {
  participant_id: string;
  display_name: string;
  path: string | null;
  role?: string | null;
  short_name?: string | null;
  team_id?: string | null;
  event_ids?: string[];
}

export interface EntityProfileDoc extends Doc {
  kind: 'entity_profile';
  entity_type: 'TEAM' | 'PLAYER';
  entity: Participant;
  league: string | null;
  season: string | null;
  team: ProfileRef | null;
  metrics: Observation[];
  splits: Record<string, Observation[]>;
  rankings: { ranking_id: string; metric_id: string; path: string; window_label: string; split: unknown }[];
  series: { series_id: string; metric_id: string; path: string; x_axis: string; split: unknown }[];
  games: ProfileGame[];
  opponents: ProfileRef[];
  players: ProfileRef[];
  markets: ResearchMarket[];
  projections: Projection[];
  availability: Availability[];
  quality: Quality;
  links: Link[];
  extensions: Record<string, unknown> | null;
}

export interface Distribution {
  entity_id: string;
  label: string;
  metric_id: string;
  market_id: string | null;
  mean: number | null;
  stdev: number | null;
  quantiles: Record<string, number> | null;
  samples: number | null;
  generated_at: string | null;
  run_id: string | null;
  source: string | null;
  quality_status: QualityStatus;
}

export interface MatchupRow {
  metric_id: string;
  name: string;
  note: string | null;
  home: Observation | null;
  away: Observation | null;
}

export interface EventResearchDoc extends Doc {
  kind: 'event_research';
  event: EventDoc;
  participants: (ProfileRef & { home_away: string | null })[];
  players: ProfileRef[];
  matchup: MatchupRow[];
  distributions: Distribution[];
  projections: Projection[];
  markets: ResearchMarket[];
  market_history_path: string | null;
  wagers: string[];
  context: {
    injuries: Availability[];
    lineups: Record<string, unknown>[];
    notes: string[];
    venue: Record<string, unknown> | null;
    weather: Record<string, unknown> | null;
  };
  quality: Quality;
  links: Link[];
  extensions: Record<string, unknown> | null;
}

export interface HistoryPoint {
  captured_at: string;
  yes_bid: number | null;
  yes_ask: number | null;
  last_price: number | null;
  volume: number | null;
  open_interest: number | null;
  source: string | null;
}

export interface MarketHistoryDoc extends Doc {
  kind: 'market_history';
  event_id: string;
  as_of: string;
  series: { market_id: string; kalshi_ticker: string; points: HistoryPoint[] }[];
  quality: Quality;
  links: Link[];
}

export interface Capability {
  capability: string;
  status: QualityStatus;
  summary: string | null;
  reasons: string[];
  limitations: string[];
  evidence: string[];
  coverage: string | null;
  since: string | null;
  metrics: string[];
  windows: string[];
  splits: string[];
  entity_types: string[];
}

export interface CapabilityManifestDoc extends Doc {
  kind: 'capability_manifest';
  audit_date: string | null;
  items: Capability[];
  notes: string[];
  split_dimensions: { dimension: string; status: QualityStatus; values: string[] }[];
  windows: Window[];
}

export interface SearchEntry {
  id: string;
  kind: 'TEAM' | 'PLAYER' | 'EVENT' | 'METRIC' | 'RANKING' | 'SERIES';
  label: string;
  secondary: string | null;
  aliases: string[];
  tokens: string[];
  path: string;
  sport: string;
  context: { league: string | null; position: string | null; season: string | null; team: string | null };
}

export interface SearchIndexDoc extends Doc {
  kind: 'search_index';
  items: SearchEntry[];
}

export interface ExplorerIndexDoc extends Doc {
  kind: 'explorer_index';
  as_of: string;
  base_manifest_run_id: string | null;
  commit_sha: string | null;
  capabilities_path: string;
  metrics_path: string;
  search_index_path: string;
  counts: Record<string, number>;
  files: Record<string, { bytes: number; entity_id: string | null; kind: string; sha256: string }>;
  teams: { participant_id: string; display_name: string; short_name: string | null; path: string }[];
  players_by_team: Record<string, string[]>;
  events: {
    event_id: string;
    path: string;
    start_time_utc: string;
    status: string;
    home_participant: string | null;
    away_participant: string | null;
    participants: string[];
  }[];
  windows: Window[];
  quality: Quality;
  warnings: string[];
}

export interface HandicapProtocol {
  schema_version: string;
  kind: 'handicap_protocol';
  protocol_id: string;
  version: string;
  extends: string | null;
  title: string;
  sport: string;
  principles: string[];
  steps: { id: string; instruction: string }[];
  outputs_required: string[];
  forbidden: string[];
  evidence_weights: Record<string, string>;
  sport_notes?: string[];
}
