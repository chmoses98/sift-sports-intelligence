// The model scorecard, exactly as the NFL publication states it. Sole source: the metric registry entry
// `met_nfl.incumbent_fair_probability`, field `extensions.scorecard` (the repository's cumulative shadow
// scorecard), plus that entry's own published limitations. Nothing here is recomputed, back-tested or
// re-weighted; every number shown is a published field. The owner's wager ledger (performance.json) is a
// different thing — personal bets, not model performance — and is never read for this.
//
// Brier score, log loss and payout error are LOWER-is-better. A comparison only names a leader when the
// gap is at least SAME_SHARE of the larger value; smaller gaps read "about even" (no fake precision).
import type { MetricDef } from '../contract/types';

export const SCORECARD_METRIC = 'met_nfl.incumbent_fair_probability';
export const SAME_SHARE = 0.01;

export type Leader = 'model' | 'market' | 'even';

export interface ScoreRow {
  model: number;
  market: number;
  leader: Leader;
  /** Samples behind each side, when the publication gives them. */
  nModel: number | null;
  nMarket: number | null;
}

export interface FamilyRow extends ScoreRow { family: string; label: string }
export interface Band { band: string; predicted: number; actual: number; n: number }

export interface Scorecard {
  /** Same contracts, same moment: model contract value vs the market price at the snapshot (payout MSE). */
  headToHead: ScoreRow | null;
  brier: ScoreRow | null;
  logLoss: ScoreRow | null;
  /** The market's Brier/log loss are measured only where the two probability spaces coincide (a subset). */
  marketSubset: boolean;
  clv: { meanExecutable: number | null; meanMid: number | null; towardShare: number | null; positiveShare: number | null; n: number | null } | null;
  calibration: { meanPredicted: number; actualRate: number; signedError: number | null; bands: Band[] } | null;
  families: FamilyRow[];
  games: number | null;
  contracts: number | null;
  sampleUnit: string | null;
  asOf: string | null;
  source: string | null;
  /** The publication's own caveats about this model (registry limitations + capability limitations). */
  caveats: string[];
  /** Overall reading: which side the like-for-like comparison favours. */
  overall: Leader | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function lowerWins(model: number | null, market: number | null, nModel: number | null = null, nMarket: number | null = null): ScoreRow | null {
  if (model == null || market == null) return null;
  const gap = Math.abs(model - market);
  const leader: Leader = gap < SAME_SHARE * Math.max(Math.abs(model), Math.abs(market)) ? 'even' : model < market ? 'model' : 'market';
  return { model, market, leader, nModel, nMarket };
}

const FAMILY_LABEL: Record<string, string> = {
  GAME_WINNER: 'Moneyline', SPREAD: 'Spread', TOTAL: 'Game total', TEAM_TOTAL: 'Team total',
  PLAYER_STAT: 'Player props', BOTH_TEAMS_SCORE_N: 'Both teams score N+',
};

/** "…/scorecards/20261002T132336Z/…" → "2026-10-02T13:23:36Z" (the scorecard's own stamp in its source path). */
function stampOf(source: string | null): string | null {
  const m = source?.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function readScorecard(def: MetricDef | undefined | null, capabilityLimitations: string[] = []): Scorecard | null {
  const sc = (def?.extensions as any)?.scorecard;
  if (!sc || typeof sc !== 'object') return null;
  const mev = sc.model_event_probability ?? {};
  const mkt = sc.market_where_spaces_coincide ?? {};
  const cpq = sc.contract_payout_quality ?? {};
  const modelCv = cpq.model_contract_value ?? {};
  const marketSnap = cpq.market_at_snapshot ?? {};
  const headToHead = lowerWins(num(modelCv.mean_squared_payout_error), num(marketSnap.mean_squared_payout_error), num(modelCv.n), num(marketSnap.n));
  const brier = lowerWins(num(mev.brier), num(mkt.brier), num(mev.n), num(mkt.n));
  const logLoss = lowerWins(num(mev.log_loss), num(mkt.log_loss), num(mev.n), num(mkt.n));
  const clvRaw = sc.clv;
  const clv = clvRaw
    ? { meanExecutable: num(clvRaw.mean_signed_clv_executable), meanMid: num(clvRaw.mean_signed_clv_mid), towardShare: num(clvRaw.toward_share_of_directional), positiveShare: num(clvRaw.positive_clv_share), n: num(clvRaw.n) }
    : null;
  const bands: Band[] = (Array.isArray(sc.calibration_by_event_probability) ? sc.calibration_by_event_probability : [])
    .map((b: any) => ({ band: String(b.band), predicted: num(b.mean_event_probability), actual: num(b.actual_event_rate), n: num(b.n) }))
    .filter((b: any) => b.predicted != null && b.actual != null && b.n != null);
  const mp = num(mev.mean_predicted);
  const ar = num(mev.actual_rate);
  const calibration = mp != null && ar != null ? { meanPredicted: mp, actualRate: ar, signedError: num(mev.mean_signed_error), bands } : null;
  const families: FamilyRow[] = Object.entries((sc.by_family ?? {}) as Record<string, any>)
    .map(([family, f]) => {
      const r = lowerWins(num(f.model_payout_mse), num(f.market_payout_mse), num(f.n_contracts), num(f.n_contracts));
      return r ? { ...r, family, label: FAMILY_LABEL[family] ?? family.replace(/_/g, ' ').toLowerCase() } : null;
    })
    .filter((x): x is FamilyRow => x != null)
    .sort((a, b) => (b.nModel ?? 0) - (a.nModel ?? 0));
  const source = typeof sc.source === 'string' ? sc.source : null;
  return {
    headToHead,
    brier,
    logLoss,
    marketSubset: num(mkt.n) != null && num(mev.n) != null && num(mkt.n) !== num(mev.n),
    clv,
    calibration,
    families,
    games: num(sc.n_games),
    contracts: num(modelCv.n) ?? num(mev.n),
    sampleUnit: typeof sc.primary_sample_unit === 'string' ? sc.primary_sample_unit : null,
    asOf: stampOf(source) ?? def?.quality?.data_as_of ?? null,
    source,
    caveats: [...new Set([...(def?.known_limitations ?? []), ...capabilityLimitations])],
    overall: headToHead?.leader ?? brier?.leader ?? null,
  };
}

export function verdictHeadline(sc: Scorecard): string {
  if (sc.overall === 'market') return 'Market currently stronger overall';
  if (sc.overall === 'model') return 'Model currently ahead of the market overall';
  if (sc.overall === 'even') return 'Model and market about even overall';
  return 'No overall comparison published';
}

export function verdictText(sc: Scorecard): string {
  if (sc.overall === 'market' || sc.overall === 'even') {
    return 'The model is not currently beating the market overall. Use its projections as research evidence, not as a validated betting edge.';
  }
  if (sc.overall === 'model') {
    return 'On this published sample the model’s probabilities were more accurate than the market’s. That is research evidence about past accuracy, not a promise about future results.';
  }
  return 'The publication does not include a like-for-like model-versus-market comparison.';
}

/** The calibration summary, from the published mean prediction and actual rate (no new calculation). */
export function calibrationText(c: NonNullable<Scorecard['calibration']>): string {
  const gap = c.signedError ?? c.meanPredicted - c.actualRate;
  const p = (v: number) => `${(v * 100).toFixed(0)}%`;
  if (Math.abs(gap) < 0.02) return `On average the model said ${p(c.meanPredicted)} and events happened ${p(c.actualRate)} of the time: close on average.`;
  return gap < 0
    ? `Its probabilities run low: on average the model said ${p(c.meanPredicted)}, and events happened ${p(c.actualRate)} of the time.`
    : `Its probabilities run high: on average the model said ${p(c.meanPredicted)}, and events happened ${p(c.actualRate)} of the time.`;
}

export const LEADER_WORD: Record<Leader, string> = { model: 'Model lower', market: 'Market lower', even: 'About even' };
