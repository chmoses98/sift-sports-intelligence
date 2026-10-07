// The NHL research layer, read from the NHL publication (NHL-edge-finder docs/research/SCRIPTS_V1.md):
//   event_research.extensions.nhl_scripts_v1  NHL_SCRIPT_V1 game scripts, script-conditioned market pricing,
//                                             script survival and research candidates (RESEARCH_ONLY)
//   event_research.extensions.nhl_matchup_v1  ranked findings, each with its BASIS (opponent-adjusted, model,
//                                             availability, raw context)
//   metrics.json met_nhl.model_learning_stage extensions.learning_v1: the learning scorecard
// Everything is decoded as published: Sift computes no probability of its own. The only arithmetic here is
// formatting, plus EV at a live ask (P(side | script) − haircut − cost), shown only beside the published value.
import type { EventResearchDoc, MetricDef } from '../contract/types';
import { describeNhlMarket } from './marketLabel';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Tier = 'ROBUST' | 'MODERATE' | 'FRAGILE' | 'DOES_NOT_SURVIVE' | 'UNAVAILABLE';
export type Basis = 'OPPONENT_ADJUSTED' | 'MODEL' | 'AVAILABILITY' | 'CONTEXT' | 'RAW';

export interface NhlScript {
  id: string;
  code: number;
  rank: number;
  label: string;
  short: string;
  summary: string;
  needs: string;
  breaks: string;
  rule: string;
  side: 'home' | 'away' | null;
  leagueBaseRate: number | null;
  probability: number;
  major: boolean;
  draws: number;
  pHomeWin: number | null;
  pAwayWin: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  totalGoals: number | null;
  totalRange: { p10: number; p50: number; p90: number } | null;
  homeShots: number | null;
  awayShots: number | null;
  homeSaves: number | null;
  awaySaves: number | null;
  pOvertime: number | null;
  ppShare: number | null;
  enShare: number | null;
  players: { player: string; p_point: number; lift: number }[];
  helps: { ticker: string; side: 'yes' | 'no'; title: string; family: string; p: number; p_given_script: number; lift: number }[];
  hurts: { bet_id: string; ev_drop: number }[];
  /** Fixed colour identity (1..7), never the only encoding. */
  tone: number;
}

export interface NhlSide {
  ask: number | null;
  cost: number | null;
  delta: number | null;
  ev: number | null;
  mass: number | null;
  tier: Tier;
  survives: boolean[] | null;
  failure: string | null;
}

export interface NhlMarketRow {
  ticker: string;
  family: string | null;
  team: string | null;
  pYes: number | null;
  pYesMid: number | null;
  pYesByScript: (number | null)[];
  yes: NhlSide | null;
  no: NhlSide | null;
}

export interface NhlFindingLine { text: string; basis: string; source: string }

export interface NhlCandidate {
  rank: number;
  bet_id: string;
  ticker: string;
  side: 'yes' | 'no';
  title: string;
  family: string;
  team: string | null;
  opponent: string | null;
  price: { ask_cents: number | null; cost: number | null; fee: number | null; observed_at_utc: string | null; spread_cents: number | null; data_quality: string };
  p_model: number;
  p_conservative: number;
  p_market_mid: number | null;
  edge_vs_mid: number | null;
  ev_raw: number | null;
  ev_adjusted: number | null;
  bet_up_to_cents: number | null;
  uncertainty: { confidence_k: number | null; large_market_disagreement: boolean; disagreement_pts: number | null; notes: string[] };
  survival: { p: number; delta: number; cost: number | null; ev_by_script: (number | null)[] | null; survives: boolean[] | null; mass_survived: number | null; n_major_survived: number | null; n_major: number; worst_major_ev: number | null; best_major_ev: number | null; expected_ev: number | null; failure_script: string | null; downside_concentration: number | null; tier: Tier; data_quality: string };
  robustness: Tier;
  robustness_word: string;
  family_reliability: string;
  benchmark_category: string | null;
  expression_fidelity: string | null;
  primary_thesis: { key: string | null; label: string | null };
  thesis_concentration: number | null;
  dependencies: { flag: string; text: string }[];
  governance: { status: 'FUNDED_RESEARCH' | 'SHADOW_ONLY' | 'REJECTED'; status_word: string; reasons: string[]; label: string | null; stake_dollars: number; stake_kind: string };
  exposure_group: string;
  duplicate_of: string | null;
  research_score: number;
  authority: string;
  supporting: NhlFindingLine[];
  opposing: NhlFindingLine[];
  relations: { bet_id: string; kind: string; phi: number; relationship: string | null; script_overlap: number | null; text: string }[];
}

export interface NhlScripts {
  status: 'OK';
  generatedAt: string | null;
  pregame: boolean | null;
  nDraws: number;
  drawSource: string | null;
  scripts: NhlScript[]; // most likely first
  order: string[]; // the publication's column order (taxonomy order) for per-script arrays
  byId: Map<string, NhlScript>;
  markets: Map<string, NhlMarketRow>;
  candidates: NhlCandidate[];
  candidatesTotal: number;
  summary: { n: number; by_tier: Record<string, number>; best: { bet_id: string; title: string; side: string; robustness: string } | null } | null;
  context: { goalies?: Record<'home' | 'away', { status: string | null; name: string | null; confidence: number | null } | null>; lam_home?: number | null; lam_away?: number | null; home_b2b?: boolean | null; away_b2b?: boolean | null } | null;
  rules: { min_ev_per_contract: number; tiers: Record<string, string>; ordering: string; conservative_probability: string; taxonomy: any } | null;
  unpriced: { ticker: string; family: string; title: string | null; reason: string | null }[];
  versions: { script: string; survival: string; candidates: string };
}

export interface NhlScriptsUnavailable {
  status: 'NOT_SIMULATED' | 'FAILED' | 'ABSENT';
  reason: string;
}

export interface NhlFinding {
  id: string;
  title: string;
  text: string;
  basis: Basis;
  evidence_eligible: boolean;
  importance: number;
  team: string | null;
  values: Record<string, unknown>;
  metric_ids: string[];
  source: string;
}

export const SCRIPT_TONE: Record<string, number> = {
  HOME_CONTROL: 1, OPEN_GAME: 2, TIGHT_LOW_EVENT: 3, AWAY_CONTROL: 4, SPECIAL_TEAMS: 5, GOALIE_DRIVEN: 6, BACK_AND_FORTH: 7,
};

export const TIER_WORD: Record<Tier, string> = {
  ROBUST: 'Robust', MODERATE: 'Moderate', FRAGILE: 'Fragile', DOES_NOT_SURVIVE: 'Does not survive', UNAVAILABLE: 'Unavailable',
};
export const TIER_HELP: Record<Tier, string> = {
  ROBUST: 'Stays positive after fees and the conservative haircut in scripts covering at least 65% of simulated games, including 3+ major scripts, with an adjusted edge of 2¢ or more.',
  MODERATE: 'Stays positive in scripts covering at least 45% of simulated games, including 2+ major scripts.',
  FRAGILE: 'Positive on average, but the value sits in a narrow set of scripts.',
  DOES_NOT_SURVIVE: 'Not positive after fees and the conservative haircut.',
  UNAVAILABLE: 'No executable price, a stale or crossed quote, or the game has started.',
};
export const TIER_CODE: Record<string, Tier> = { R: 'ROBUST', M: 'MODERATE', F: 'FRAGILE', X: 'DOES_NOT_SURVIVE', U: 'UNAVAILABLE' };

export const BASIS_WORD: Record<Basis, string> = {
  OPPONENT_ADJUSTED: 'Opponent-adjusted', MODEL: 'Model', AVAILABILITY: 'Availability', CONTEXT: 'Context', RAW: 'Raw context',
};
export const BASIS_HELP: Record<Basis, string> = {
  OPPONENT_ADJUSTED: 'Computed with each opponent’s strength removed (nhl-oppadj-1.0, a research layer). Can be cited as evidence.',
  MODEL: 'An output of the NHL model or simulation. Can be cited as evidence.',
  AVAILABILITY: 'Who plays: confirmed or projected goalies, injuries. Can be cited as evidence.',
  CONTEXT: 'Background only.',
  RAW: 'A raw statistic, not adjusted for opponents. Shown for context; never the reason an edge exists.',
};

export const STATUS_WORD: Record<string, string> = {
  FUNDED_RESEARCH: 'Funded research', SHADOW_ONLY: 'Shadow only', REJECTED: 'Rejected',
};
export const STATUS_HELP: Record<string, string> = {
  FUNDED_RESEARCH: 'Passed research governance; carries a nominal whole-dollar research stake on a $250 research bankroll. Nothing is placed.',
  SHADOW_ONLY: 'Tracked for learning with no stake.',
  REJECTED: 'Superseded by a higher-fidelity expression of the same idea.',
};

const n = (v: any): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

function decodeSide(row: any[] | null | undefined, order: string[]): NhlSide | null {
  if (!Array.isArray(row)) return null;
  const [ask, cost, delta, ev, mass, tier, bits, failure] = row;
  return {
    ask: n(ask), cost: n(cost), delta: n(delta), ev: n(ev), mass: n(mass), tier: TIER_CODE[tier] ?? 'UNAVAILABLE',
    survives: typeof bits === 'string' && bits.length === order.length ? [...bits].map((c) => c === '1') : null,
    failure: failure ?? null,
  };
}

function decodeScript(s: any): NhlScript {
  return {
    id: s.id, code: s.code, rank: s.rank, label: s.label, short: s.short ?? s.label, summary: s.summary, needs: s.needs, breaks: s.breaks, rule: s.rule,
    side: s.side ?? null, leagueBaseRate: n(s.league_base_rate), probability: Number(s.probability), major: Boolean(s.major), draws: Number(s.draws ?? 0),
    pHomeWin: n(s.p_home_win), pAwayWin: n(s.p_away_win), homeGoals: n(s.home_goals), awayGoals: n(s.away_goals), totalGoals: n(s.total_goals),
    totalRange: s.total_goals_range ?? null, homeShots: n(s.home_shots), awayShots: n(s.away_shots), homeSaves: n(s.home_starter_saves),
    awaySaves: n(s.away_starter_saves), pOvertime: n(s.p_overtime), ppShare: n(s.pp_goal_share), enShare: n(s.en_goal_share),
    players: s.players_most_involved ?? [], helps: s.helps ?? [], hurts: s.hurts ?? [], tone: SCRIPT_TONE[s.id] ?? 7,
  };
}

/** The NHL script block of a game: decoded, or why there is none. `null` for a non-NHL document. */
export function readNhl(r: EventResearchDoc | null | undefined): NhlScripts | NhlScriptsUnavailable | null {
  if (!r || r.event?.sport !== 'NHL') return null;
  const x = (r.extensions as any)?.nhl_scripts_v1;
  if (!x) return { status: 'ABSENT', reason: 'This publication carries no NHL script layer for the game.' };
  if (x.status !== 'OK') return { status: x.status === 'FAILED' ? 'FAILED' : 'NOT_SIMULATED', reason: String(x.reason ?? 'not simulated') };
  const order: string[] = x.script_order ?? [];
  const scripts = (x.scripts ?? []).map(decodeScript).sort((a: NhlScript, b: NhlScript) => b.probability - a.probability || a.code - b.code);
  const markets = new Map<string, NhlMarketRow>();
  for (const row of x.markets ?? []) {
    const [ticker, family, team, pYes, pYesMid, byScript, yes, no] = row as any[];
    markets.set(ticker, { ticker, family, team, pYes: n(pYes), pYesMid: n(pYesMid), pYesByScript: (byScript ?? []).map(n), yes: decodeSide(yes, order), no: decodeSide(no, order) });
  }
  return {
    status: 'OK', generatedAt: x.generated_at ?? null, pregame: x.pregame ?? null, nDraws: Number(x.n_draws ?? 0), drawSource: x.draw_source ?? null,
    scripts, order, byId: new Map(scripts.map((s: NhlScript) => [s.id, s])), markets, candidates: (x.candidates ?? []) as NhlCandidate[],
    candidatesTotal: Number(x.candidates_total ?? (x.candidates ?? []).length), summary: x.candidate_summary ?? null, context: x.context ?? null,
    rules: x.rules ?? null, unpriced: x.unpriced ?? [],
    versions: { script: x.script_version, survival: x.survival_version, candidates: x.candidate_rules_version },
  };
}

export const isNhlScripts = (x: NhlScripts | NhlScriptsUnavailable | null): x is NhlScripts => x != null && x.status === 'OK';

export function readFindings(r: EventResearchDoc | null | undefined): { findings: NhlFinding[]; whatMatters: NhlFinding[]; rule: string | null } {
  const x = (r?.extensions as any)?.nhl_matchup_v1;
  const findings: NhlFinding[] = (x?.findings ?? []).map((f: any) => ({ ...f, basis: f.basis as Basis }));
  const ids: string[] = x?.what_matters ?? [];
  return { findings, whatMatters: ids.map((id) => findings.find((f) => f.id === id)).filter((f): f is NhlFinding => !!f && f.basis !== 'RAW'), rule: x?.rule ?? null };
}

// ------------------------------------------------------------------ arithmetic & words

/** Script ids aligned with a published per-script array (taxonomy order). */
export function scriptAt(s: NhlScripts, i: number): NhlScript | undefined {
  return s.byId.get(s.order[i]);
}

/** P(this side | script) for every script, in taxonomy order. */
export function sideProbabilities(row: NhlMarketRow, side: 'yes' | 'no'): (number | null)[] {
  return row.pYesByScript.map((p) => (p == null ? null : side === 'yes' ? p : 1 - p));
}

/** EV per contract in each script at a given cost: P(side | script) − haircut − cost (the published identity). */
export function evAt(row: NhlMarketRow, side: 'yes' | 'no', cost: number | null): (number | null)[] {
  const sd = side === 'yes' ? row.yes : row.no;
  if (!sd || cost == null) return row.pYesByScript.map(() => null);
  return sideProbabilities(row, side).map((p) => (p == null ? null : p - (sd.delta ?? 0) - cost));
}

export function survivalText(mass: number | null | undefined, survives: boolean[] | null | undefined, nScripts: number): string {
  if (mass == null || !survives) return 'Survival not computed';
  const k = survives.filter(Boolean).length;
  return `Survives ${Math.round(mass * 100)}% of simulated games · ${k} of ${nScripts} scripts`;
}

export function centsText(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v)}¢`;
}

/** +2.3¢ per contract from a dollar EV. */
export function evText(v: number | null | undefined): string {
  if (v == null) return '—';
  const c = v * 100;
  return `${c > 0 ? '+' : c < 0 ? '−' : ''}${Math.abs(c).toFixed(1)}¢`;
}

export function probText(v: number | null | undefined, dp = 0): string {
  return v == null ? '—' : `${(v * 100).toFixed(dp)}%`;
}

/** Readable side of a candidate, in hockey language when the market is known ("Florida −1.5 — NO"). */
export function candidateTitle(c: Pick<NhlCandidate, 'title' | 'side'> & { market_family?: string; family?: string }, m?: { kalshi_ticker: string; yes_description?: string; market_family?: string; period?: string | null } | null): string {
  const t = (m ? describeNhlMarket(m as any)?.title : null) ?? c.title.replace(/^Full Game: /, 'Game total: ');
  return c.side === 'no' ? `${t} — NO` : t;
}

export function sideLabel(side: 'yes' | 'no'): string {
  return side === 'yes' ? 'YES' : 'NO';
}

/** The candidate's live ask in cents for its side, from a live-overlaid market (yes_ask / no_ask in dollars). */
export function liveAskCents(m: { yes_ask?: number | null; no_ask?: number | null } | undefined, side: 'yes' | 'no'): number | null {
  const v = side === 'yes' ? m?.yes_ask : m?.no_ask;
  return v == null ? null : Math.round(v * 100);
}

export type PriceCheck = 'OK' | 'ABOVE_BET_UP_TO' | 'UNKNOWN';
export function priceCheck(live: number | null, betUpTo: number | null): PriceCheck {
  if (live == null || betUpTo == null) return 'UNKNOWN';
  return live > betUpTo ? 'ABOVE_BET_UP_TO' : 'OK';
}

export const DEPENDENCY_SHORT: Record<string, string> = {
  ROLE_NOT_CONFIRMED: 'Lines not confirmed', PROJECTION_QUALITY_LOW: 'Thin projection', WIDE_SPREAD: 'Wide quote',
};
export function dependencyShort(flag: string): string {
  const g = /^GOALIE_(\w+?)_(HOME|AWAY)$/.exec(flag);
  if (g) return `${g[2] === 'HOME' ? 'Home' : 'Away'} goalie ${g[1].toLowerCase()}`;
  return DEPENDENCY_SHORT[flag] ?? flag.toLowerCase().replace(/_/g, ' ');
}

export const FAMILY_WORD: Record<string, string> = {
  game_winner: 'Moneyline', game_spread: 'Puck line', game_total: 'Game total', team_total: 'Team total', period_winner: 'Period winner',
  period_total: 'Period total', period_spread: 'Period spread', game_overtime: 'Overtime', player_goals: 'Goal scorer', player_assists: 'Assists',
  player_points: 'Points', goalie_saves: 'Goalie saves', first_goal: 'First goal', game_early_goal: 'Early goal',
};

export function familyGroup(family: string | null | undefined): 'game' | 'player' | 'other' {
  if (!family) return 'other';
  if (family.startsWith('player_') || family === 'goalie_saves' || family === 'first_goal') return 'player';
  if (family.startsWith('game_') || family.startsWith('period_') || family === 'team_total') return 'game';
  return 'other';
}

// ------------------------------------------------------------------ learning scorecard

export interface Learning {
  status: 'OK' | 'STALE_LAST_RUN_FAILED' | 'UNAVAILABLE';
  reason?: string;
  generated_at_utc?: string;
  versions?: Record<string, string>;
  counts?: Record<string, any>;
  stage?: { stage: string; label: string; next_stage: string | null; progress_to_next: Record<string, { have: number; need: number }>; gates: { stage: string; rule: string }[]; checks: Record<string, boolean>; note: string };
  probability?: any;
  windows?: any[];
  projection?: any;
  scripts?: any;
  research_candidates?: any;
  script_candidates?: any;
  unknowns?: string[];
  job?: { evaluated_at: string | null; learning_step: string | null; steps: Record<string, string> };
}

export const LEARNING_METRIC = 'met_nhl.model_learning_stage';

export function readLearning(metrics: Map<string, MetricDef> | null | undefined): Learning | null {
  const m = metrics?.get(LEARNING_METRIC) as any;
  const l = m?.extensions?.learning_v1;
  return l ? (l as Learning) : null;
}

export const STAGE_WORD: Record<string, string> = {
  EARLY_LEARNING: 'Learning', CALIBRATION_BUILDING: 'Calibration building', EVIDENCE_EMERGING: 'Evidence emerging', VALIDATED: 'Validated',
};

/** "43 games settled · 9 script forecasts · 1,025 market snapshots", from real counts only. */
export function learningLine(l: Learning | null): string | null {
  const c = l?.counts;
  if (!c) return null;
  const f = (v: any) => Number(v ?? 0).toLocaleString('en-US');
  const parts = [`${f(c.games_projected)} games projected`, `${f(c.games_settled)} settled`, `${f(c.market_snapshots)} market snapshots`];
  if (c.script_forecasts) parts.push(`${f(c.script_forecasts_settled)} of ${f(c.script_forecasts)} script forecasts settled`);
  return parts.join(' · ');
}
