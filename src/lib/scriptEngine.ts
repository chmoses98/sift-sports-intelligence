// The CFB Script Engine payload (event_research.extensions.script_engine), typed and decoded.
//
// The publication answers three questions separately and Sift keeps them separate:
//   1. what the football matchup says          (matchup_profile, matchup_findings)
//   2. how the game can plausibly unfold       (game_scripts: PRIMARY / SECONDARY / ALTERNATE / DANGER)
//   3. which bets express those possibilities  (script_market_map, built AFTER the scripts were frozen)
// Nothing here turns a script count into a probability, and nothing calls a contract "+EV": the payload has
// no pricing source, and Sift never invents one.
import type { EventResearchDoc, Market } from '../contract/types';
import { cfbCodeOfEspn, cfbDisplayText, cfbName } from './cfbTeams';

export type Role = 'PRIMARY' | 'SECONDARY' | 'ALTERNATE' | 'DANGER';
export type Compat = 'SUPPORTED' | 'PARTIAL' | 'CONTRADICTED' | 'NEUTRAL' | 'UNMAPPABLE' | 'RESEARCH_UNCALIBRATED';
/** Where a numeric band comes from, and so whether a market classification may rest on it. */
export type BandAuthority = 'ARCHETYPE_DEFINITION' | 'UNCALIBRATED_DESCRIPTIVE' | 'CALIBRATED';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export const ROLE_ORDER: Role[] = ['PRIMARY', 'SECONDARY', 'ALTERNATE', 'DANGER'];
/** Role -> the design system's four script identity colours (tokens --script-1..4). */
export const ROLE_INDEX: Record<Role, 1 | 2 | 3 | 4> = { PRIMARY: 1, SECONDARY: 2, ALTERNATE: 3, DANGER: 4 };
export const ROLE_WORD: Record<Role, string> = { PRIMARY: 'Primary', SECONDARY: 'Secondary', ALTERNATE: 'Alternate', DANGER: 'Danger' };

export interface CausalStep { step: string; findings: string[] }

export interface Bands {
  home_margin: [number, number] | null;
  total_points: [number, number] | null;
  home_points?: [number, number] | null;
  away_points?: [number, number] | null;
}

export interface EngineScript {
  script_id: string;
  rank: number;
  role: Role;
  archetype: string;
  lead_side: 'home' | 'away' | null;
  title: string;
  summary: string;
  causal_chain: CausalStep[];
  required_findings: string[];
  supporting_findings: string[];
  contradicting_findings: string[];
  evidence_score: number;
  outcome_shape: Record<string, unknown> & {
    winner_lean: string;
    margin_environment: string;
    total_environment: string;
    bands: Bands;
    band_authority?: Partial<Record<keyof Bands, BandAuthority>>;
    /** The findings that authorise the margin band (empty when the script states no margin). */
    margin_authority_evidence?: string[];
  };
  data_confidence: Confidence;
  probability: null;
}

export interface Finding {
  code: string;
  side: 'home' | 'away' | 'game';
  dimension: string;
  category: 'MATCHUP' | 'ENVIRONMENT' | 'DEPENDENCE' | 'DATA';
  strength: 'MODERATE' | 'STRONG';
  value: number | null;
  threshold: number | null;
  uncertainty: number | null;
  metric_refs: string[];
  statement: string;
}

export interface DirectionEdge {
  edge: number | null;
  uncertainty: number | null;
  components: { metric_id: string; tier: string; offense_z: number; defense_z: number; edge: number; uncertainty: number; offense_ref: string; defense_ref: string }[];
  enhanced_components: number;
}

export interface Dimension {
  edge_metrics?: string[];
  context_metrics?: string[];
  home_offense_vs_away_defense?: DirectionEdge;
  away_offense_vs_home_defense?: DirectionEdge;
  net_home_advantage?: number | null;
  possession_environment?: number | null;
  tempo_environment?: number | null;
  definition?: string;
}

export interface MetricRow {
  key: string;
  metric_id: string;
  unit: 'offense' | 'defense';
  raw: number | null;
  adjusted: number | null;
  adjusted_available: boolean;
  adjusted_unavailable_reason: string | null;
  standard_error: number | null;
  rank: number | null;
  universe_size: number;
  rank_basis: string;
  direction: 'higher_is_better' | 'lower_is_better';
  games: number;
  effective_n: number | null;
  prior_weight: number | null;
  source: string | null;
  observed_at: string | null;
  quality: string;
}

export interface EngineTeam {
  team_id: string;
  name: string;
  division: string;
  games_observed: number;
  games_with_play_log: number;
  record_in_window: { wins: number; losses: number };
  quarterback: { season_primary: string | null; last_game_primary: string | null; changed: boolean | null; games: number };
  season: number | null;
  window: { type: string; through_exclusive: string } | null;
  metrics: Record<string, MetricRow>;
}

export interface RegistryEntry { metric_id: string; name: string; dimension: string; tier: string; unit: string; offense_higher_is_better: boolean; adjusted: boolean; secondary_evidence: boolean; regression_prone: boolean; description?: string }

export interface Survival { supported: number; partial: number; contradicted: number; neutral: number; total_scripts: number; meaningful_scripts: number; weighted_score: number; research_uncalibrated?: number }

export interface Expression {
  id: string;
  ticker: string;
  side: 'YES' | 'NO';
  wins_when: string | null;
  thesis: string;
  compat: Compat[];
  coverage: (number | null)[];
  survival: Survival;
  labels: string[];
  /** ACTIVE, or RESEARCH_UNCALIBRATED for a total / team-total contract whose scoring bands are not calibrated. */
  authority: 'ACTIVE' | 'RESEARCH_UNCALIBRATED' | null;
  /** Per script, what an uncalibrated scoring band would have said ('-' where not applicable). Research only. */
  research: (Compat | null)[];
  correlation: { with: string; relation: string; both_can_cash: boolean | null; both_lose_when: string | null }[];
}

export interface Rung { expression_id: string; is_core: boolean; relation_to_core: string; additional_requirement_points: number | null; cashes_when_core_fails: boolean | null; scripts_supported: number; scripts_lost_vs_core_ranks: number[] }
export interface Thesis { thesis: string; core_expression: string; rungs: Rung[] }

export interface Generation {
  generated_at: string;
  football_data_cutoff: string;
  market_blind: boolean;
  artifact_hash: string;
  data_confidence: Confidence;
  methodology_version: string;
  adjustment_version: string;
  regeneration_reasons: string[];
  mapped_at: string | null;
  prices_captured_at: string | null;
  identity: { status: string; reason?: string; orientation_swapped?: boolean };
}

export interface DataConfidence {
  level: Confidence;
  describes: string;
  gates: Record<string, boolean>;
  all_gates_pass: boolean;
  reasons: string[];
  known: string[];
  unknown: string[];
  core_coverage: Record<string, number>;
  enhanced_dimensions: string[];
  games_observed: Record<string, number>;
  adjustment_stable: boolean;
  availability_status: Record<string, string>;
  freshness: { status: string; expected_prior_games?: number; missing_game_ids?: string[] };
}

export interface Engine {
  status: string;
  generation: Generation;
  read: { headline: string; headline_findings: string[]; points: { text: string; findings: string[] }[]; caveats: string[]; data_confidence: Confidence };
  confidence: DataConfidence;
  teams: { home: EngineTeam; away: EngineTeam };
  dimensions: Record<string, Dimension>;
  baseline: { home_points: number | null; away_points: number | null; total_points: number | null; home_margin: number | null; uncertainty_points: number | null; label: string };
  adjustment: { cutoff_exclusive: string; stable: boolean; fbs_schedule_components: number; median_fbs_games: number; games_in_window: number };
  findings: Finding[];
  scripts: EngineScript[];
  expressions: Expression[];
  survivors: string[];
  theses: Thesis[];
  disagreement: {
    flag: string;
    football_primary: string;
    flags: { kind: 'WINNER' | 'TOTAL'; thesis: string; rule: string; band_authority?: BandAuthority | null; evidence_of_value?: boolean; note?: string }[];
    rule: string;
    note: string;
  } | null;
  registry: Record<string, RegistryEntry>;
  /** True when total and team-total markets are research only (scoring bands not calibrated). */
  scoringResearchOnly: boolean;
  unmappableByFamily: Record<string, number>;
  coverage: Record<string, unknown> | null;
  researchOnly: boolean;
  pricingNote: string;
  /** The V2 claims published beside the scripts; null when the payload predates them (1.1.0) or trimmed them. */
  claimsV2: ClaimsV2 | null;
}

export interface EngineUnavailable { status: string; reason: string | null }

// ------------------------------------------------------------------ V2 claims (cfb-script-engine/2.0.0)
//
// Independent football claims published beside the V1 scripts (`claims_v2`, payload 1.2.0). While
// `activation` is SHADOW the V1 scripts stay the active read and Sift labels V2 as a preview. Nothing here
// is a probability: the CONTROL range is a HISTORICAL EMPIRICAL RANGE (margins of past games that carried
// the same football claim), never a prediction interval, and the historical win count is a frequency of
// those past games, never this game's chance.

export interface HistoricalRange {
  label: string;
  not: string;
  tier: string;
  n: number;
  win_rate: { rate: number; hits: number; n: number; ci95?: [number, number] };
  median: number;
  central_50: [number, number];
  central_80: [number, number];
  development_seasons: number[];
  validation: { seasons: number[]; n: number; median: number; coverage_50: number; coverage_80: number };
  calibration_sha256: string;
}

export interface ControlClaim {
  family: 'CONTROL';
  side: 'home' | 'away';
  strength: 'MODERATE' | 'STRONG';
  tier: string;
  evidence: string[];
  statement: string;
  context?: { same_side: string[]; opposing: string[] };
  historical_range: HistoricalRange | null;
}

export interface ClaimsV2 {
  methodology_version: string;
  activation: 'SHADOW' | 'ACTIVE' | string;
  status: 'CLAIMS_PUBLISHED' | 'NO_SUPPORTED_CLAIM' | string;
  status_statement: string | null;
  data_quality: { level: Confidence; describes: string };
  claims: {
    control: ControlClaim | null;
    closeness: { evidence: string[]; statement: string } | null;
    pace: { level: 'HIGH' | 'LOW'; strength: string; evidence: string[]; statement: string } | null;
    scoring_environment: { level: 'ELEVATED' | 'SUPPRESSED'; strengthened: boolean; incremental_over_baseline: boolean; evidence: string[]; statement: string } | null;
    defensive_suppression: { evidence: string[]; statement: string } | null;
    disruption: { side: 'home' | 'away'; strength: string; evidence: string[]; aligned_with_control: boolean | null; statement: string }[];
    explosive_upset: { status: string; script_ids: string[] };
  };
  story: { headline: string; clauses: { text: string; claims: string[] }[] };
  calibration?: { sha256?: string; calibration_version?: string };
  claims_artifact_hash: string;
  generated_at: string;
  market_authority: { counts: Record<string, number>; moneyline: [string, 'ALIGNED' | 'OPPOSED'][] } | null;
}

const CODE: Record<string, Compat> = { S: 'SUPPORTED', P: 'PARTIAL', C: 'CONTRADICTED', N: 'NEUTRAL', U: 'UNMAPPABLE', R: 'RESEARCH_UNCALIBRATED' };

/* eslint-disable @typescript-eslint/no-explicit-any */

function decodeTeam(t: any, columns: string[], legend: Record<string, string[]>): EngineTeam {
  const metrics: Record<string, MetricRow> = {};
  for (const [key, row] of Object.entries<any[]>(t.metrics ?? {})) {
    const rec: any = {};
    columns.forEach((c, i) => {
      const v = row[i];
      rec[c] = legend[c] && typeof v === 'number' ? legend[c][v] ?? null : v;
    });
    const [unit, metric_id] = key.split('.', 2);
    metrics[key] = { key, metric_id, unit: unit as MetricRow['unit'], ...rec };
  }
  // The engine names teams by the football schedule; Sift shows the name fans use (lib/cfbTeams.ts), by ESPN id.
  // The schedule's own name stays beside it (source_name).
  const code = cfbCodeOfEspn(t.team_id);
  return { ...t, name: code ? cfbName(code, t.name) : cfbDisplayText(t.name), source_name: t.name, metrics };
}

/** The payload, decoded; `null` when the event has none; `{status, reason}` when it explains why not. */
export function readEngine(r: EventResearchDoc | null | undefined): Engine | EngineUnavailable | null {
  const p = (r?.extensions as any)?.script_engine;
  if (!p) return null;
  if (!p.script_generation) return { status: String(p.status ?? 'UNAVAILABLE'), reason: p.reason ?? null };
  const mp = p.matchup_profile ?? {};
  const columns: string[] = mp.metric_columns ?? [];
  const legend: Record<string, string[]> = mp.legend ?? {};
  const smm = p.script_market_map ?? {};
  const survCols: string[] = smm.survival_columns ?? [];
  const expressions: Expression[] = (smm.expressions ?? []).map((e: any) => ({
    id: `${e.ticker}:${e.side}`,
    ticker: e.ticker,
    side: e.side,
    wins_when: e.wins_when ?? null,
    thesis: e.thesis,
    compat: String(e.compat ?? '').split('').map((c) => CODE[c] ?? 'UNMAPPABLE'),
    coverage: e.coverage ?? [],
    survival: Object.fromEntries(survCols.map((c, i) => [c, e.survival?.[i]])) as unknown as Survival,
    labels: e.labels ?? [],
    authority: e.authority ?? null,
    research: String(e.research ?? '').split('').map((c) => (c === '-' ? null : CODE[c] ?? null)),
    correlation: (e.correlation ?? []).map((c: any[]) => ({ with: c[0], relation: c[1], both_can_cash: c[2] ?? null, both_lose_when: c[3] ?? null })),
  }));
  const rungCols: string[] = p.rung_columns ?? [];
  const theses: Thesis[] = (p.theses ?? []).map((t: any) => ({
    thesis: t.thesis,
    core_expression: t.core_expression,
    rungs: (t.rungs ?? []).map((row: any[]) => Object.fromEntries(rungCols.map((c, i) => [c, row[i]])) as unknown as Rung),
  }));
  return {
    status: p.status,
    generation: p.script_generation,
    // Every sentence below is the engine's own, with each school said by its canonical name (cfbDisplayText:
    // "Massachusetts controls" -> "UMass controls"). The published payload itself is never modified — it stays in
    // r.extensions.script_engine — and each script keeps its published title as `title` (scriptTitle() is the display).
    read: p.sift_read ? { ...p.sift_read, headline: cfbDisplayText(p.sift_read.headline), points: (p.sift_read.points ?? []).map((x: any) => ({ ...x, text: cfbDisplayText(x.text) })) } : p.sift_read,
    confidence: p.data_confidence,
    teams: { home: decodeTeam(mp.teams?.home, columns, legend), away: decodeTeam(mp.teams?.away, columns, legend) },
    dimensions: mp.dimensions ?? {},
    baseline: mp.scoring_baseline ?? {},
    adjustment: mp.adjustment ?? {},
    findings: p.matchup_findings ?? [],
    scripts: [...(p.game_scripts ?? [])]
      .sort((a: EngineScript, b: EngineScript) => a.rank - b.rank)
      .map((x: EngineScript) => ({ ...x, summary: cfbDisplayText(x.summary), source_summary: x.summary, causal_chain: (x.causal_chain ?? []).map((c) => ({ ...c, step: cfbDisplayText(c.step) })) })),
    expressions,
    survivors: p.script_survivors ?? [],
    theses,
    disagreement: p.market_disagreement ?? null,
    registry: p.metric_registry ?? {},
    scoringResearchOnly: (p.band_policy?.total_points ?? 'UNCALIBRATED_DESCRIPTIVE') !== 'CALIBRATED',
    unmappableByFamily: smm.unmappable_by_family ?? {},
    coverage: smm.coverage ?? null,
    researchOnly: smm.research_only !== false,
    pricingNote: smm.pricing_note ?? '',
    claimsV2: p.claims_v2?.claims && p.claims_v2?.story
      ? ({ ...p.claims_v2, story: { ...p.claims_v2.story, headline: cfbDisplayText(p.claims_v2.story.headline), clauses: (p.claims_v2.story.clauses ?? []).map((c: any) => ({ ...c, text: cfbDisplayText(c.text) })) } } as ClaimsV2)
      : null,
  };
}

export function isEngine(e: Engine | EngineUnavailable | null): e is Engine {
  return !!e && 'generation' in e;
}

/** A metric key in the profile ("home.offense.success_rate") -> its decoded row. */
export function metricAt(engine: Engine, ref: string): (MetricRow & { side: 'home' | 'away'; team: string }) | null {
  const [side, unit, ...rest] = ref.split('.');
  const team = engine.teams[side as 'home' | 'away'];
  const row = team?.metrics[`${unit}.${rest.join('.')}`];
  return row ? { ...row, side: side as 'home' | 'away', team: team.name } : null;
}

export function findingByCode(engine: Engine, code: string): Finding | undefined {
  return engine.findings.find((f) => f.code === code);
}

export function scriptForRole(engine: Engine, role: Role): EngineScript | undefined {
  return engine.scripts.find((s) => s.role === role);
}

/** "survives 3/4 scripts" — supported out of all published scripts, partial support listed apart. */
export function survivalText(s: Survival): string {
  return `${s.supported}/${s.total_scripts}${s.partial ? ` +${s.partial} partly` : ''}`;
}

/** The expressions the publication featured (best or multi-script), in its own order. */
export function survivorExpressions(engine: Engine): Expression[] {
  const byId = new Map(engine.expressions.map((e) => [e.id, e]));
  return engine.survivors.map((id) => byId.get(id)).filter((e): e is Expression => !!e);
}

/**
 * Featured expressions with ladder rungs that survive exactly the same scripts collapsed to one row (the
 * publication's own first choice), so the list shows distinct ways to survive, not one ladder eight times.
 */
export function groupedSurvivors(engine: Engine): (Expression & { similar: number })[] {
  const groups = new Map<string, Expression[]>();
  for (const e of survivorExpressions(engine)) {
    const k = `${e.thesis}|${e.compat.join('')}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.values()].map((g) => ({ ...g[0], similar: g.length - 1 }));
}

/** The settlement condition in team names: "full game home margin >= 7" -> "Alabama margin ≥ 7". */
export function winsWhenText(e: Expression, engine: Engine): string | null {
  if (!e.wins_when) return null;
  const home = engine.teams.home.name;
  const away = engine.teams.away.name;
  return e.wins_when
    .replace(/full game home margin/g, `${home} margin over ${away}`)
    .replace(/full game home points/g, `${home} points`)
    .replace(/full game away points/g, `${away} points`)
    .replace(/full game total points/g, 'total points')
    .replace(/>=/g, '≥')
    .replace(/<=/g, '≤')
    .replace(/ between (-?\d+) and (-?\d+)/g, ' from $1 to $2');
}

/** A contract side's label from the published market row: YES reads as the market says; NO is its negation. */
export function expressionLabel(e: Expression, m: Market | undefined): string {
  const base = m?.yes_description || e.wins_when || e.ticker;
  return e.side === 'YES' ? base : `No — ${base}`;
}

/** The executable price of THIS side: the YES ask for YES, the NO ask for NO. Null when not quoted. */
export function sidePrice(e: Expression, m: Market | undefined): number | null {
  if (!m) return null;
  const v = e.side === 'YES' ? m.yes_ask : m.no_ask;
  return v == null || v <= 0 || v >= 1 ? null : v;
}

export const LABEL_WORD: Record<string, string> = {
  BEST_EXPRESSION: 'Best expression',
  MULTI_SCRIPT: 'Multi-script',
  SCRIPT_ALIGNED: 'Script aligned',
  AGGRESSIVE: 'Aggressive',
  SCRIPT_DEPENDENT: 'Script dependent',
  NARROW_SCRIPT: 'Narrow script',
  CONTRADICTED: 'Contradicted',
  LOW_DATA_CONFIDENCE: 'Low data confidence',
  MARKET_DISAGREEMENT: 'Market disagreement',
  RESEARCH_ONLY: 'Research only',
  SCORING_BAND_UNCALIBRATED: 'Scoring: research only',
};

export const LABEL_HELP: Record<string, string> = {
  BEST_EXPRESSION: 'The best market representation of one football thesis: the most script support; between rungs with identical support, the cheaper entry, whose extra requirement sits inside every supporting script.',
  MULTI_SCRIPT: 'Survives most of the meaningful scripts, the primary included, and neither the primary nor the secondary contradicts it.',
  SCRIPT_ALIGNED: 'The primary script supports it, fully or in part.',
  AGGRESSIVE: 'A stronger version of a supported thesis: it needs more than the best expression of that thesis and survives fewer scripts.',
  SCRIPT_DEPENDENT: 'Exactly one script supports it.',
  NARROW_SCRIPT: 'No script supports it outright; at least one does in part.',
  CONTRADICTED: 'The primary script contradicts it, or at least half of the meaningful scripts do.',
  LOW_DATA_CONFIDENCE: 'The football evidence behind these scripts is LOW confidence.',
  MARKET_DISAGREEMENT: 'The market baseline materially disagrees with the football primary script. Reported, never used to change the football read.',
  RESEARCH_ONLY: 'No validated CFB pricing source exists: nothing here is a fair price or an expected value.',
  SCORING_BAND_UNCALIBRATED: 'A total or team-total contract. The scripts describe the scoring environment, but their point ranges come from a descriptive, uncalibrated baseline, so they cannot support or contradict a scoring bet until they pass calibration.',
};

/** Is this numeric band only descriptive (drawn around the uncalibrated scoring baseline)? */
export function isDescriptiveBand(s: EngineScript, band: keyof Bands): boolean {
  const a = s.outcome_shape.band_authority?.[band];
  if (band === 'home_margin') return a != null && a !== 'ARCHETYPE_DEFINITION' && a !== 'CALIBRATED';
  return a !== 'CALIBRATED';
}

export const SCORING_RESEARCH_NOTE =
  'Total and team-total markets are research only. The scripts state the scoring environment, but their point ranges are drawn around a descriptive, uncalibrated baseline, so no scoring contract is supported or contradicted by them until the ranges pass out-of-sample calibration.';

/** Labels that describe a contract's fit, in the order Sift shows them. Never a price verdict. */
export function orderedLabels(labels: string[]): string[] {
  const order = Object.keys(LABEL_WORD);
  return [...labels].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export const DIMENSION_WORD: Record<string, string> = {
  scoring: 'Scoring',
  sustained_efficiency: 'Sustained efficiency',
  rushing: 'Rushing',
  passing: 'Passing',
  explosiveness: 'Explosiveness',
  disruption: 'Protection vs pressure',
  finishing: 'Finishing drives',
  pace: 'Pace & possessions',
  volatility: 'Volatility',
};

export const EDGE_DIMENSIONS = ['sustained_efficiency', 'rushing', 'passing', 'explosiveness', 'disruption', 'finishing', 'scoring'];

/** Format a metric value by its measure ("rate" -> 47.1%, "yards" -> 6.42, "points" -> 31.2). */
export function fmtMetric(value: number | null | undefined, measure: string | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (measure === 'rate') return `${(value * 100).toFixed(1)}%`;
  if (measure === 'seconds') return value.toFixed(1);
  if (measure === 'plays' || measure === 'points' || measure === 'count') return value.toFixed(1);
  return value.toFixed(2);
}

export function fmtEdge(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs']);

/** "Kent State hangs around" → "Kent State Hangs Around"; "Even matchup, one-score game" → "Even Matchup, One-Score Game". */
function headlineCase(t: string): string {
  return t
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.replace(/(^|-)([a-z])/g, (_, d, c) => d + c.toUpperCase())))
    .join(' ');
}

/**
 * The title a reader sees for a script; the engine's own title stays as `s.title` (rendered as data-canonical, and
 * checked against the publication by the production check).
 *  - The three game-environment archetypes ("Competitive grind", "Competitive shootout", "Pace-driven scoring") are
 *    said from the script's own outcome shape, and only what it states — a one-score margin, a suppressed or
 *    elevated total, more possessions. Never a game flow the engine does not model.
 *  - Every other title keeps its words, with each school said by its canonical name ("Massachusetts controls" →
 *    "UMass …") and headline capitalization, the NFL scripts' style ("Kent State Hangs Around").
 *  - A HOME_CONTROL / AWAY_CONTROL title ("Utah State controls") reads "Utah State Controls the Matchup", the
 *    phrasing SIFT uses for CONTROL everywhere else (the Slate Priorities rail).
 */
export function scriptTitle(s: Pick<EngineScript, 'archetype' | 'title' | 'outcome_shape'>): string {
  if (!['COMPETITIVE_GRIND', 'COMPETITIVE_SHOOTOUT', 'PACE_DRIVEN_OVER'].includes(s.archetype)) {
    const t = cfbDisplayText(s.title);
    const control = /^(.+?) controls$/i.exec(t);
    if (control && (s.archetype === 'HOME_CONTROL' || s.archetype === 'AWAY_CONTROL')) return `${control[1]} Controls the Matchup`;
    return headlineCase(t);
  }
  const o = s.outcome_shape ?? ({} as EngineScript['outcome_shape']);
  const close = o.margin_environment === 'ONE_SCORE';
  const fast = o.pace === 'MORE_POSSESSIONS';
  if (o.total_environment === 'SUPPRESSED') return close ? 'Close, Low-Scoring Game' : 'Low-Scoring Game';
  if (o.total_environment === 'ELEVATED') return close ? 'Close, High-Scoring Game' : fast ? 'Fast-Paced, High-Scoring Game' : 'High-Scoring Game';
  return s.title;
}

export const ARCHETYPE_WORD: Record<string, string> = {
  HOME_CONTROL: 'Home control',
  AWAY_CONTROL: 'Away control',
  FAVORITE_PULLS_AWAY: 'Pulls away',
  UNDERDOG_HANGS_AROUND: 'Hangs around',
  COMPETITIVE_SHOOTOUT: 'Shootout',
  COMPETITIVE_GRIND: 'Grind',
  COMPETITIVE_TOSSUP: 'Toss-up',
  PACE_DRIVEN_OVER: 'Pace-driven scoring',
  DEFENSIVE_SUPPRESSION: 'Defenses suppress',
  EXPLOSIVE_UPSET: 'Explosive upset',
  TURNOVER_DISRUPTION: 'Disruption',
};

/** "Alabama by 7–24" style text for a script's margin band (home margin, inclusive integers). */
export function marginBandText(b: [number, number] | null, home: string, away: string): string | null {
  if (!b) return null;
  const [lo, hi] = b;
  if (lo >= 0) return `${home} by ${Math.max(lo, 1)}–${hi}`;
  if (hi <= 0) return `${away} by ${Math.max(-hi, 1)}–${-lo}`;
  return `within ${Math.max(-lo, hi)} either way`;
}

export function bandText(b: [number, number] | null | undefined): string | null {
  return b ? `${b[0]}–${b[1]}` : null;
}

// ------------------------------------------------------------------ V2 words

export const PACE_WORD: Record<string, string> = { HIGH: 'Faster', LOW: 'Slower' };
export const SCORING_WORD: Record<string, string> = { ELEVATED: 'Elevated', SUPPRESSED: 'Lower (baseline already expects it)' };
export const STRENGTH_WORD: Record<string, string> = { MODERATE: 'Moderate', STRONG: 'Strong' };

/** A control-side margin as text: 3 -> "+3", -4 -> "−4". */
export function signedPoints(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}`;
}

/** "Alabama margin −4 to +18" for a historical range on the control side's margin. */
export function rangeText(team: string, range: [number, number]): string {
  return `${team} margin ${signedPoints(range[0])} to ${signedPoints(range[1])}`;
}

/** "323 of 404" — the historical frequency, deliberately a count and never a percentage or a chance. */
export function historicalWinsText(r: HistoricalRange): string {
  return `${r.win_rate.hits} of ${r.win_rate.n}`;
}

export function seasonsText(seasons: number[]): string {
  return seasons.length ? `${Math.min(...seasons)}–${Math.max(...seasons)}` : '—';
}
