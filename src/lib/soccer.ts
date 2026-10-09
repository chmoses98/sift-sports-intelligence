// SOCCER on Sift: decoders over the soccer-edge-finder publication (data-archive/app/latest). Everything is read
// as published and labelled with the publication's own authority (every soccer model family is RESEARCH_ONLY):
//   event_research.extensions.board_summary        the model board: 1X2, BTTS, over 2.5, mean goals
//   event_research.extensions.soccer_script_engine soccer_script_engine.v1: six game scripts with simulation shares,
//                                                  the script-conditioned market matrix, survivability rows (fee-aware
//                                                  break-even, worst-case edge, counter-case) and a plain-English glance
//   event_research.extensions.calibration          settled calibration per market family (Brier, log loss vs market)
//   event_research.extensions.rest_congestion / head_to_head
// Sift computes no probability of its own here: the only arithmetic is formatting.
import type { EventResearchDoc, Market, ResearchMarket } from '../contract/types';
import { cleanDescription } from './marketLabel';

/* eslint-disable @typescript-eslint/no-explicit-any */

const n = (v: any): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export interface SoccerBoard {
  pHome: number | null;
  pDraw: number | null;
  pAway: number | null;
  pBtts: number | null;
  pOver25: number | null;
  meanHome: number | null;
  meanAway: number | null;
  generatedAt: string | null;
  quality: string | null;
}

/** The model board for a fixture, when the publication priced it. */
export function soccerBoard(r: EventResearchDoc): SoccerBoard | null {
  const b = (r.extensions as any)?.board_summary;
  if (!b || b.p_home == null) return null;
  return {
    pHome: n(b.p_home), pDraw: n(b.p_draw), pAway: n(b.p_away), pBtts: n(b.p_btts), pOver25: n(b.p_over_2_5),
    meanHome: n(b.mean_home_goals), meanAway: n(b.mean_away_goals), generatedAt: b.model_generated_at ?? null, quality: b.quality_status ?? null,
  };
}

export interface SoccerCalibration {
  family: string;
  n: number;
  brier: number | null;
  logLoss: number | null;
  marketLogLoss: number | null;
  ece: number | null;
  clv: number | null;
  validated: boolean;
  modelFamily: string | null;
  evaluatedAt: string | null;
}

/** Settled calibration by market family: the model's log loss next to the market's, on the same contracts. */
export function soccerCalibration(r: EventResearchDoc): SoccerCalibration[] {
  const rows = ((r.extensions as any)?.calibration ?? []) as any[];
  return rows
    .filter((c) => c && c.market_family)
    .map((c) => ({
      family: String(c.market_family), n: Number(c.n_settled ?? 0), brier: n(c.brier), logLoss: n(c.log_loss), marketLogLoss: n(c.market_log_loss),
      ece: n(c.ece), clv: n(c.clv_points_mean), validated: Boolean(c.validated), modelFamily: c.model_family ?? null, evaluatedAt: c.last_evaluated_at ?? null,
    }))
    .sort((a, b) => b.n - a.n);
}

export interface SoccerRest {
  home: { restDays: number | null; matches14d: number | null; matches28d: number | null };
  away: { restDays: number | null; matches14d: number | null; matches28d: number | null };
  quality: string | null;
}

export function soccerRest(r: EventResearchDoc): SoccerRest | null {
  const x = (r.extensions as any)?.rest_congestion;
  if (!x?.home || !x?.away) return null;
  const side = (s: any) => ({ restDays: n(s.rest_days), matches14d: n(s.matches_14d), matches28d: n(s.matches_28d) });
  return { home: side(x.home), away: side(x.away), quality: x.quality_status ?? null };
}

export interface SoccerH2H {
  n: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  homeGoals: number;
  awayGoals: number;
  recent: { date: string; score: string; competition: string | null; eventId: string | null; venueSide: string | null }[];
}

export function soccerH2H(r: EventResearchDoc): SoccerH2H | null {
  const h = (r.extensions as any)?.head_to_head?.espn;
  if (!h || !h.n) return null;
  return {
    n: Number(h.n), homeWins: Number(h.home_team_w ?? 0), awayWins: Number(h.away_team_w ?? 0), draws: Number(h.draws ?? 0),
    homeGoals: Number(h.home_team_goals ?? 0), awayGoals: Number(h.away_team_goals ?? 0),
    recent: ((h.recent ?? []) as any[]).map((x) => ({ date: String(x.date), score: String(x.score), competition: x.competition ?? null, eventId: x.event_id ?? null, venueSide: x.venue_side ?? null })).reverse(),
  };
}

// ------------------------------------------------------------------ script engine

export const SOCCER_SCRIPT_TITLE: Record<string, string> = {
  HOME_CONTROL: 'Home control', HOME_CHASE: 'Home chase', TIGHT_LOW_EVENT: 'Tight, low event',
  OPEN_END_TO_END: 'Open, end to end', AWAY_CHASE: 'Away chase', AWAY_CONTROL: 'Away control',
};
/** Fixed colour identity per script (always shown beside the name, never the only encoding). */
export const SOCCER_SCRIPT_TONE: Record<string, number> = {
  HOME_CONTROL: 1, HOME_CHASE: 2, TIGHT_LOW_EVENT: 3, OPEN_END_TO_END: 4, AWAY_CHASE: 5, AWAY_CONTROL: 6,
};

export interface SoccerScriptProfile {
  pHomeWin: number | null;
  pDraw: number | null;
  pAwayWin: number | null;
  expHomeGoals: number | null;
  expAwayGoals: number | null;
  pBtts: number | null;
  pOver25: number | null;
  typicalScores: { score: string; p: number }[];
}

export interface SoccerScript {
  id: string;
  title: string;
  rank: number;
  share: number;
  shareLow: number | null;
  shareHigh: number | null;
  definition: string;
  material: boolean;
  profile: SoccerScriptProfile;
  helped: { ticker: string; description: string; p: number; pGivenScript: number; lift: number }[];
  hurt: { ticker: string; description: string; p: number; pGivenScript: number; lift: number }[];
  tone: number;
}

export type SoccerExpressionLabel = 'VERY_ROBUST' | 'ROBUST' | 'MIXED' | 'FRAGILE' | 'SCRIPT_DEPENDENT' | 'NO_EDGE' | string;

export interface SoccerExpression {
  key: string;
  ticker: string;
  side: 'yes' | 'no';
  description: string;
  family: string;
  label: SoccerExpressionLabel;
  category: string;
  /** The YES ask the engine priced against (as published, a string in dollars). */
  price: number | null;
  breakEven: number | null;
  fairProbability: number | null;
  feeAdjustedEv: number | null;
  overallEdge: number | null;
  worstCaseEdge: number | null;
  edgeExTopScript: number | null;
  supportingScripts: number;
  opposingScripts: number;
  materialScripts: number;
  weightedSupportShare: number | null;
  conditionalEdges: (number | null)[];
  counterCase: { script: string; statement: string; share: number | null; edge: number | null; reason: string | null } | null;
  strongestSupport: { script: string; share: number | null; edge: number | null } | null;
  action: string;
  authority: string;
  thesisGroup: string | null;
  robustRank: number | null;
}

export interface SoccerMatchupSide {
  teamId: string | null;
  attack: { logRate: number | null; percentile: number | null; z: number | null };
  defence: { logRate: number | null; percentile: number | null; z: number | null };
  netRating: { value: number | null; percentile: number | null; z: number | null };
  effectiveMatches: number | null;
  sampleQuality: string | null;
  rawForm: { gf: number | null; ga: number | null; matches: number | null } | null;
  scheduleStrength: { meanOpponentNetRating: number | null; percentile: number | null; matches: number | null } | null;
}

export interface SoccerEngine {
  status: 'OK';
  researchOnly: boolean;
  contract: string | null;
  glance: {
    sentence: string | null;
    hda: { home: number | null; draw: number | null; away: number | null } | null;
    expectedGoals: { home: number | null; away: number | null; basis: string | null } | null;
    primaryScript: { id: string; share: number; title: string } | null;
    secondaryScript: { id: string; share: number; title: string } | null;
    primaryMismatch: { label: string; matchup: string; side: string; evidenceQuality: string | null; zGap: number | null } | null;
    bestRobust: SoccerExpression | null;
    bestScriptSpecific: SoccerExpression | null;
    noCompellingEdge: boolean;
    noCompellingEdgeReason: string | null;
    competition: { name: string | null; stage: string | null; type: string | null; flags: string[] } | null;
    lineup: { status: string | null; lastChangeAt: string | null } | null;
  };
  scripts: SoccerScript[]; // most likely first
  order: string[]; // the publication's column order for per-script arrays
  byId: Map<string, SoccerScript>;
  expressions: SoccerExpression[]; // every survivability row, publication order
  robustKeys: string[];
  mixedKeys: string[];
  researchEdgeMin: number | null;
  priceStatus: string | null;
  pricedAt: string | null;
  dataConfidence: { level: string; reasons: string[]; gates: Record<string, boolean> } | null;
  dataGaps: { code: string; detail: string }[];
  freshness: Record<string, { status: string | null; observedAt: string | null; currentUntil: string | null; staleAfter: string | null }>;
  matchup: {
    home: SoccerMatchupSide | null;
    away: SoccerMatchupSide | null;
    primaryMismatch: string | null;
    homeAdvantageLogRate: number | null;
    metricKind: string | null;
    pool: string | null;
    evidenceStatus: string | null;
  } | null;
  context: {
    competitionName: string | null;
    competitionType: string | null;
    stage: string | null;
    knockout: boolean | null;
    neutralSite: boolean | null;
    requiresWinner: boolean | null;
    legNumber: number | null;
    aggregate: string | null;
    modelEffect: string | null;
    flags: string[];
  } | null;
  feeModel: string | null;
  lineupStatus: string | null;
  modelGeneratedAt: string | null;
}

export interface SoccerEngineUnavailable {
  status: 'UNAVAILABLE' | 'ABSENT' | 'FAILED';
  reason: string;
}

export type SoccerEngineRead = SoccerEngine | SoccerEngineUnavailable;

export const isSoccerEngine = (x: SoccerEngineRead | null | undefined): x is SoccerEngine => !!x && x.status === 'OK';

function decodeExpression(row: any): SoccerExpression | null {
  if (!row || !row.ticker) return null;
  const side = String(row.side ?? 'yes').toLowerCase() === 'no' ? 'no' : 'yes';
  const cc = row.counter_case;
  const ss = row.strongest_support;
  return {
    key: String(row.key ?? `${row.ticker}|${side}`), ticker: String(row.ticker), side, description: String(row.description ?? ''), family: String(row.family ?? ''),
    label: String(row.label ?? row.category ?? 'UNKNOWN'), category: String(row.category ?? row.label ?? ''),
    price: n(row.price), breakEven: n(row.break_even), fairProbability: n(row.fair_probability ?? row.p_script), feeAdjustedEv: n(row.fee_adjusted_ev),
    overallEdge: n(row.overall_edge), worstCaseEdge: n(row.worst_case_edge), edgeExTopScript: n(row.edge_ex_top_script),
    supportingScripts: Number(row.supporting_scripts ?? 0), opposingScripts: Number(row.opposing_scripts ?? 0), materialScripts: Number(row.material_scripts ?? 0),
    weightedSupportShare: n(row.weighted_support_share), conditionalEdges: Array.isArray(row.conditional_edges) ? row.conditional_edges.map(n) : [],
    counterCase: cc ? { script: String(cc.script ?? ''), statement: String(cc.statement ?? ''), share: n(cc.share), edge: n(cc.edge), reason: cc.reason_code ?? null } : null,
    strongestSupport: ss ? { script: String(ss.script ?? ''), share: n(ss.share), edge: n(ss.edge) } : null,
    action: String(row.action ?? 'RESEARCH_CANDIDATE'), authority: String(row.authority ?? 'RESEARCH_ONLY'), thesisGroup: row.thesis_group ?? null, robustRank: n(row.robust_rank),
  };
}

function decodeSide(s: any): SoccerMatchupSide | null {
  if (!s) return null;
  const tri = (x: any) => ({ logRate: n(x?.log_rate), percentile: n(x?.percentile), z: n(x?.z) });
  return {
    teamId: s.team_id ?? null, attack: tri(s.attack), defence: tri(s.defence),
    netRating: { value: n(s.net_rating?.value), percentile: n(s.net_rating?.percentile), z: n(s.net_rating?.z) },
    effectiveMatches: n(s.effective_matches), sampleQuality: s.sample_quality ?? null,
    rawForm: s.raw_form ? { gf: n(s.raw_form.goals_for_per_match), ga: n(s.raw_form.goals_against_per_match), matches: n(s.raw_form.matches_365d) } : null,
    scheduleStrength: s.schedule_strength ? { meanOpponentNetRating: n(s.schedule_strength.mean_opponent_net_rating), percentile: n(s.schedule_strength.percentile_vs_pool), matches: n(s.schedule_strength.matches_in_window) } : null,
  };
}

const profileOf = (p: any): SoccerScriptProfile => ({
  pHomeWin: n(p?.p_home_win ?? p?.home_win), pDraw: n(p?.p_draw ?? p?.draw), pAwayWin: n(p?.p_away_win ?? p?.away_win),
  expHomeGoals: n(p?.exp_home_goals), expAwayGoals: n(p?.exp_away_goals), pBtts: n(p?.p_btts), pOver25: n(p?.p_over_2_5),
  typicalScores: ((p?.typical_scores ?? []) as any[]).map((x) => ({ score: String(x.score), p: Number(x.p) })),
});

/** The soccer script engine for a fixture, decoded as published; its absence or unavailability is a state, not an error. */
export function readSoccerEngine(r: EventResearchDoc | null | undefined): SoccerEngineRead {
  const se = (r?.extensions as any)?.soccer_script_engine;
  if (!se) return { status: 'ABSENT', reason: 'The publication attached no soccer script engine payload to this fixture.' };
  if (se.status !== 'OK') return { status: se.status === 'FAILED' ? 'FAILED' : 'UNAVAILABLE', reason: String(se.reason ?? 'The script engine did not run for this fixture.') };
  const order: string[] = Array.isArray(se.scripts?.canonical_order) ? se.scripts.canonical_order.map(String) : Object.keys(SOCCER_SCRIPT_TITLE);
  const cards = ((se.scripts?.cards ?? []) as any[]).map((c): SoccerScript => ({
    id: String(c.script_id), title: String(c.title ?? SOCCER_SCRIPT_TITLE[c.script_id] ?? c.script_id), rank: Number(c.rank ?? 0),
    share: Number(c.simulation_share ?? 0), shareLow: n(c.share_low), shareHigh: n(c.share_high), definition: String(c.definition ?? ''),
    material: Boolean(c.material), profile: profileOf(c.profile ?? c.primary),
    helped: ((c.markets_helped ?? []) as any[]).map((m) => ({ ticker: String(m.ticker), description: String(m.description ?? ''), p: Number(m.p), pGivenScript: Number(m.p_given_script), lift: Number(m.lift) })),
    hurt: ((c.markets_hurt ?? []) as any[]).map((m) => ({ ticker: String(m.ticker), description: String(m.description ?? ''), p: Number(m.p), pGivenScript: Number(m.p_given_script), lift: Number(m.lift) })),
    tone: SOCCER_SCRIPT_TONE[c.script_id] ?? 7,
  }));
  const scripts = [...cards].sort((a, b) => b.share - a.share || a.rank - b.rank);
  const byId = new Map(scripts.map((s) => [s.id, s]));
  const expressions = ((se.survivability?.rows ?? []) as any[]).map(decodeExpression).filter((x): x is SoccerExpression => !!x);
  const byKey = new Map(expressions.map((e) => [e.key, e]));
  const g = se.glance ?? {};
  const pick = (x: any): SoccerExpression | null => (x?.key ? byKey.get(String(x.key)) ?? decodeExpression(x) : null);
  const scr = (x: any) => (x?.script ? { id: String(x.script), share: Number(x.share ?? byId.get(x.script)?.share ?? 0), title: String(x.title ?? SOCCER_SCRIPT_TITLE[x.script] ?? x.script) } : null);
  const ctx = se.context ?? null;
  const val = (k: string) => (ctx?.[k]?.value ?? null);
  const fresh: SoccerEngine['freshness'] = {};
  for (const [k, v] of Object.entries((se.freshness ?? {}) as Record<string, any>)) {
    fresh[k] = { status: v?.status ?? null, observedAt: v?.observed_at ?? v?.generated_at ?? null, currentUntil: v?.current_until ?? null, staleAfter: v?.stale_after ?? null };
  }
  const mu = se.matchup ?? null;
  return {
    status: 'OK', researchOnly: se.research_only !== false, contract: se.contract ?? null,
    glance: {
      sentence: g.story?.sentence ?? null,
      hda: g.h_d_a ? { home: n(g.h_d_a.home), draw: n(g.h_d_a.draw), away: n(g.h_d_a.away) } : null,
      expectedGoals: g.expected_goals ? { home: n(g.expected_goals.home), away: n(g.expected_goals.away), basis: g.expected_goals.basis ?? null } : null,
      primaryScript: scr(g.primary_script), secondaryScript: scr(g.secondary_script),
      primaryMismatch: g.primary_mismatch ? { label: String(g.primary_mismatch.label ?? ''), matchup: String(g.primary_mismatch.matchup ?? ''), side: String(g.primary_mismatch.advantage_side ?? ''), evidenceQuality: g.primary_mismatch.evidence_quality ?? null, zGap: n(g.primary_mismatch.z_gap) } : null,
      bestRobust: pick(g.best_robust_expression), bestScriptSpecific: pick(g.best_script_specific_expression),
      noCompellingEdge: Boolean(g.no_compelling_edge), noCompellingEdgeReason: g.no_compelling_edge_reason ?? null,
      competition: g.competition ? { name: g.competition.name ?? null, stage: g.competition.stage ?? null, type: g.competition.type ?? null, flags: (g.competition.flags ?? []).map(String) } : null,
      lineup: g.lineup ? { status: g.lineup.status ?? null, lastChangeAt: g.lineup.last_change_at ?? null } : null,
    },
    scripts, order, byId, expressions,
    robustKeys: ((se.survivability?.robust_edges ?? []) as any[]).map(String), mixedKeys: ((se.survivability?.mixed_edges ?? []) as any[]).map(String),
    researchEdgeMin: n(se.survivability?.research_edge_min), priceStatus: se.survivability?.price_status ?? null, pricedAt: se.survivability?.priced_at ?? null,
    dataConfidence: se.data_confidence ? { level: String(se.data_confidence.level ?? 'UNKNOWN'), reasons: (se.data_confidence.reasons ?? []).map(String), gates: se.data_confidence.gates ?? {} } : null,
    dataGaps: ((se.data_gaps ?? []) as any[]).map((x) => ({ code: String(x.code), detail: String(x.detail ?? '') })),
    freshness: fresh,
    matchup: mu ? {
      home: decodeSide(mu.home), away: decodeSide(mu.away), primaryMismatch: mu.primary_mismatch ?? null, homeAdvantageLogRate: n(mu.home_advantage_log_rate),
      metricKind: mu.metric_kind ?? null, pool: mu.pool ?? null, evidenceStatus: mu.evidence_status ?? null,
    } : null,
    context: ctx ? {
      competitionName: val('competition_name'), competitionType: val('competition_type'), stage: g.competition?.stage ?? null, knockout: val('knockout'), neutralSite: val('neutral_site'),
      requiresWinner: val('requires_winner'), legNumber: n(val('leg_number')), aggregate: val('aggregate'), modelEffect: ctx.model_effect ?? null, flags: (ctx.flags ?? []).map(String),
    } : null,
    feeModel: se.methodology?.fee_model?.fee ?? null,
    lineupStatus: se.lineup_rescripting?.lineup_status ?? g.lineup?.status ?? null,
    modelGeneratedAt: se.freshness?.model?.generated_at ?? se.lineup_rescripting?.current?.model_generated_at ?? null,
  };
}

export const EXPRESSION_WORD: Record<string, string> = {
  VERY_ROBUST: 'Very robust', ROBUST: 'Robust', MIXED: 'Mixed', FRAGILE: 'Fragile', SCRIPT_DEPENDENT: 'Script-dependent', NO_EDGE: 'No edge',
};
export const EXPRESSION_HELP: Record<string, string> = {
  VERY_ROBUST: 'Positive after fees in nearly every material script, with a worst-case edge above zero.',
  ROBUST: 'Positive after fees across most material scripts (robust across scripts); the counter-case names the script that settles against it.',
  MIXED: 'Positive on average, but the edge sits in some scripts and not others.',
  FRAGILE: 'Positive only in a narrow set of scripts.',
  SCRIPT_DEPENDENT: 'Works only if one particular script plays out.',
  NO_EDGE: 'Not positive after fees at the current price.',
};

// ------------------------------------------------------------------ market language

type MarketLike = Partial<Pick<Market, 'market_family' | 'period' | 'participant_id' | 'threshold' | 'line' | 'yes_description' | 'extensions'>> & { kalshi_ticker: string };

const PERIOD_WORD: Record<string, string> = { first_half: 'First half', second_half: 'Second half', regulation: '', full_time: '', extra_time: 'Extra time' };

export interface SoccerNames {
  home: string;
  away: string;
  homeId?: string | null;
  awayId?: string | null;
}

/** "Result: home" → "Arsenal to win"; "Result: draw" → "Draw"; totals and team totals in goals; everything else from the YES wording. */
export function soccerMarketTitle(m: MarketLike, names: SoccerNames): string {
  const d = cleanDescription(m.yes_description);
  const fam = m.market_family ?? '';
  const per = PERIOD_WORD[(m.extensions as any)?.period ?? m.period ?? ''] ?? '';
  const pre = per ? `${per}: ` : '';
  const who = m.participant_id === names.homeId ? names.home : m.participant_id === names.awayId ? names.away : null;
  const sideWord = (s: string) => (s === 'home' ? `${names.home} to win` : s === 'away' ? `${names.away} to win` : 'Draw');
  let mm: RegExpExecArray | null;
  if ((fam === 'match_result_3way' || fam === 'first_half_result' || fam === 'second_half_result') && (mm = /Result:\s*(home|draw|away)/i.exec(d))) {
    return `${pre}${sideWord(mm[1].toLowerCase())}`;
  }
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase();
  if ((fam === 'total_goals' || fam === 'first_half_total') && (mm = /(Over|Under)\s*([\d.]+)/i.exec(d))) return `${pre}${cap(mm[1])} ${mm[2]} goals`;
  if (fam === 'team_total' && (mm = /(Over|Under)\s*([\d.]+)/i.exec(d))) return `${pre}${who ?? (/(home|away)/i.exec(d)?.[1] === 'home' ? names.home : names.away)} ${mm[1].toLowerCase()} ${mm[2]} goals`;
  if ((fam === 'handicap' || fam === 'first_half_handicap') && who) {
    // "home wins by more than 1.5" is the home side giving 1.5 goals: sportsbook language says "−1.5".
    const line = m.line ?? m.threshold;
    return line != null ? `${pre}${who} −${Math.abs(line)}` : `${pre}${who} handicap`;
  }
  if (fam === 'btts' || fam === 'first_half_btts') return `${pre}Both teams score`;
  if ((fam === 'exact_score' || fam === 'first_half_exact_score') && (mm = /(\d+)\s*[-–:]\s*(\d+)/.exec(d))) return `${pre}Exact score ${names.home} ${mm[1]}–${mm[2]} ${names.away}`;
  if (fam === 'first_to_score') return who ? `${who} score first` : d.replace(/^First to score:?\s*/i, 'First to score: ');
  return `${pre}${d || m.kalshi_ticker}`;
}

export const SOCCER_FAMILY_LABEL: Record<string, string> = {
  match_result_3way: 'Match result (1X2)', total_goals: 'Total goals', team_total: 'Team totals', handicap: 'Handicaps', btts: 'Both teams to score',
  first_half_result: 'First-half result', first_half_total: 'First-half total', first_half_handicap: 'First-half handicap', first_half_btts: 'First-half both teams score',
  second_half_result: 'Second-half result', exact_score: 'Exact score', first_half_exact_score: 'First-half exact score', first_to_score: 'First to score',
};
export const SOCCER_FAMILY_ORDER = Object.keys(SOCCER_FAMILY_LABEL);

export function soccerFamilyLabel(f: string): string {
  return SOCCER_FAMILY_LABEL[f] ?? f.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Club initials for a mark when no logo is committed ("Bayer Leverkusen" → "BL", "Arsenal" → "ARS"). */
export function clubInitials(name: string | null | undefined): string {
  const w = (name ?? '').replace(/[().]/g, '').split(/\s+/).filter((x) => x && !/^(fc|sc|cf|afc|club|de|the|\d+)$/i.test(x));
  if (!w.length) return '';
  if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
  return w.slice(0, 3).map((x) => x[0]).join('').toUpperCase();
}

/** Competition from a board row, with its league code as a stable key. */
export function competitionOf(item: { league: string | null; competition: string | null }): { key: string; name: string } {
  return { key: item.league ?? item.competition ?? 'other', name: item.competition ?? item.league ?? 'Other' };
}

export const LEAGUE_ORDER = ['eng.premier_league', 'esp.la_liga', 'ita.serie_a', 'ger.bundesliga', 'fra.ligue_1', 'usa.mls', 'mex.liga_mx', 'bra.serie_a', 'arg.primera'];

export type ResearchMarketLike = ResearchMarket | Market;
