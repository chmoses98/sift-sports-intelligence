// MODEL EVIDENCE — the one adapter behind Public Model Pulse and the Advanced Model Lab. Every number is a published
// evaluation field read from the sport's own explorer (metric registry extensions or event research extensions);
// nothing is recomputed, back-tested or blended. Sources, per sport:
//   NFL     met_nfl.incumbent_fair_probability → extensions.scorecard (src/lib/scorecard.ts readScorecard)
//   NHL     met_nhl.calibration_v1 → extensions.overall / by_family; met_nhl.clv_v1
//   TENNIS  met_tennis.settled_brier_score → scorecard.forecasters; strict_executable_clv; projection_v2_backtest;
//           pinnacle_benchmark_brier
//   SOCCER  event research extensions.calibration[] (deduped by model family × market family)
//   NBA     event research extensions.model_vs_market (out-of-sample walk-forward, log loss)
//   MLB · CFB · CBB  no model-vs-market scorecard is published; the reason is stated, never filled.
// The owner's wager ledger (performance.json / settlements.json) is personal betting, not model performance, and
// is never read here. Lower is better for Brier, log loss and payout error (lowerWins).
import type { EventResearchDoc, MetricDef } from '../contract/types';
import { SportRepo } from '../data/repo';
import { resolveSource } from '../data/source';
import { SPORTS, type SportConfig } from '../data/sports';
import { lowerWins, readScorecard, SCORECARD_METRIC, type Leader } from '../lib/scorecard';
import { nbaModelVsMarket } from '../lib/nba';
import { soccerCalibration } from '../lib/soccer';
import { familyLabel as baseFamilyLabel } from '../lib/format';

/** Family words for a non-baseball sport: the shared map names MLB's game_total "Total runs". */
const familyLabel = (f: string) => (/^(game_)?total$/.test(f) ? 'Game total' : baseFamilyLabel(f));

/* eslint-disable @typescript-eslint/no-explicit-any */

export type MetricName = 'Brier' | 'Log loss' | 'Payout error';

export interface Comparison {
  label: string;
  metric: MetricName;
  model: number;
  market: number;
  /** Samples behind the comparison (the model side when they differ). */
  n: number | null;
  leader: Leader;
  /** Set when the two sides were not scored on the same rows. */
  note?: string;
}

export interface Bin { lo: number; hi: number; predicted: number; observed: number; n: number }

export interface Study {
  title: string;
  kind: 'walk_forward' | 'benchmark' | 'prospective';
  rows: { label: string; a: string; b: string; aVal: number | null; bVal: number | null; n: number | null; ci?: [number, number] | null }[];
  note: string;
}

export interface SportEvidence {
  code: string;
  slug: string;
  label: string;
  state: 'evidence' | 'none' | 'error';
  /** One plain sentence: what the published record shows. */
  verdict: string;
  headline: Comparison | null;
  families: Comparison[];
  bins: Bin[] | null;
  binsLabel: string | null;
  clv: { mean: number; n: number | null; note: string } | null;
  studies: Study[];
  modelVersion: string | null;
  asOf: string | null;
  source: string;
  limitations: string[];
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function cmp(label: string, metric: MetricName, model: number | null, market: number | null, n: number | null, note?: string): Comparison | null {
  const r = lowerWins(model, market, n, n);
  return r ? { label, metric, model: r.model, market: r.market, n, leader: r.leader, ...(note ? { note } : {}) } : null;
}

export function verdictOf(c: Comparison | null, families: Comparison[]): string {
  if (!c) return 'No like-for-like model-versus-market comparison is published.';
  const fam = families.length ? ` Across ${families.length} market families the market leads in ${families.filter((f) => f.leader === 'market').length}, the model in ${families.filter((f) => f.leader === 'model').length}.` : '';
  if (c.leader === 'market') return `The market has been the better forecaster (${c.metric.toLowerCase()} ${fmt(c.market)} vs the model’s ${fmt(c.model)}${c.n ? `, n = ${c.n.toLocaleString()}` : ''}).${fam}`;
  if (c.leader === 'model') return `The model has been the better forecaster on this published sample (${c.metric.toLowerCase()} ${fmt(c.model)} vs ${fmt(c.market)}${c.n ? `, n = ${c.n.toLocaleString()}` : ''}). Past accuracy, not a promise.${fam}`;
  return `Model and market are about even (${c.metric.toLowerCase()} ${fmt(c.model)} vs ${fmt(c.market)}).${fam}`;
}

export const fmt = (v: number) => (Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4));

const base = (s: SportConfig): SportEvidence => ({ code: s.code, slug: s.slug, label: s.label, state: 'none', verdict: '', headline: null, families: [], bins: null, binsLabel: null, clv: null, studies: [], modelVersion: null, asOf: null, source: '', limitations: [] });

async function metricsOf(repo: SportRepo): Promise<Map<string, MetricDef>> {
  return repo.hasExplorer ? repo.metricMap().catch(() => new Map()) : new Map();
}

async function firstResearch(repo: SportRepo, n: number): Promise<EventResearchDoc[]> {
  if (!repo.hasExplorer) return [];
  const idx = await repo.index();
  const ids = Object.values(idx.files).filter((f: any) => f.kind === 'event_research' && f.entity_id).map((f: any) => f.entity_id as string).slice(0, n);
  const out = await Promise.allSettled(ids.map((id) => repo.eventResearch(id)));
  return out.flatMap((o) => (o.status === 'fulfilled' ? [o.value] : []));
}

function nfl(s: SportConfig, m: Map<string, MetricDef>): SportEvidence {
  const e = base(s);
  const sc = readScorecard(m.get(SCORECARD_METRIC));
  if (!sc) return { ...e, verdict: 'The NFL scorecard is not in this publication.' };
  const headline = sc.headToHead ? { label: 'Contract payout error, same contracts and moment', metric: 'Payout error' as const, model: sc.headToHead.model, market: sc.headToHead.market, n: sc.headToHead.nModel, leader: sc.headToHead.leader } : null;
  const families = sc.families.map((f) => ({ label: f.label, metric: 'Payout error' as const, model: f.model, market: f.market, n: f.nModel, leader: f.leader }));
  const bins = sc.calibration?.bands.map((b) => {
    const m2 = b.band.match(/([\d.]+)\D+([\d.]+)/);
    return { lo: m2 ? Number(m2[1]) : b.predicted, hi: m2 ? Number(m2[2]) : b.predicted, predicted: b.predicted, observed: b.actual, n: b.n };
  }) ?? null;
  const brier = sc.brier ? cmp('Event probability Brier', 'Brier', sc.brier.model, sc.brier.market, sc.brier.nModel, sc.marketSubset ? `Market scored on ${sc.brier.nMarket?.toLocaleString()} rows where the two probability spaces coincide (a subset).` : undefined) : null;
  return {
    ...e, state: 'evidence', headline, families, bins, binsLabel: 'Model event probability by band',
    verdict: verdictOf(headline, families),
    clv: sc.clv?.meanExecutable != null ? { mean: sc.clv.meanExecutable, n: sc.clv.n, note: 'Mean signed closing-line value at the executable price (probability points).' } : null,
    studies: brier ? [{ title: 'Probability accuracy', kind: 'prospective', rows: [{ label: brier.label, a: 'Model', b: 'Market', aVal: brier.model, bVal: brier.market, n: brier.n }], note: brier.note ?? '' }] : [],
    modelVersion: (m.get(SCORECARD_METRIC)?.extensions as any)?.model_version ?? null, asOf: sc.asOf, source: `${SCORECARD_METRIC} · extensions.scorecard`, limitations: sc.caveats,
  };
}

function nhl(s: SportConfig, m: Map<string, MetricDef>): SportEvidence {
  const e = base(s);
  const def = m.get('met_nhl.calibration_v1');
  const c = (def?.extensions ?? null) as any;
  if (!c?.overall) return { ...e, verdict: 'The NHL calibration record is not in this publication.' };
  const v1 = c.overall.DATA_ONLY_V1 ?? {};
  const anchored = c.overall.MARKET_ANCHORED_V1 ?? {};
  const mk = c.overall.MARKET_BASELINE ?? {};
  const families = Object.entries((c.by_family ?? {}) as Record<string, any>)
    .map(([fam, f]) => cmp(familyLabel(fam), 'Brier', num(f.v1_brier), num(f.market_brier_same_rows), num(f.v1_n)))
    .filter((x): x is Comparison => !!x && (x.n ?? 0) > 0)
    .sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
  const pooled = families.reduce((acc, f) => ({ m: acc.m + f.model * (f.n ?? 0), k: acc.k + f.market * (f.n ?? 0), n: acc.n + (f.n ?? 0) }), { m: 0, k: 0, n: 0 });
  const headline = pooled.n ? cmp('Brier on the same settled rows (families pooled by n)', 'Brier', pooled.m / pooled.n, pooled.k / pooled.n, pooled.n) : null;
  const bins: Bin[] = (v1.calibration ?? []).map((b: any) => ({ lo: Number(b.bin_lo), hi: Number(b.bin_hi), predicted: Number(b.mean_p), observed: Number(b.mean_y), n: Number(b.n) })).filter((b: Bin) => b.n > 0);
  const clvDef = (m.get('met_nhl.clv_v1')?.extensions ?? null) as any;
  const clvFams = Object.values((clvDef?.by_family ?? {}) as Record<string, any>).map((f) => num(f?.clv_mean ?? f?.mean)).filter((x): x is number => x != null);
  return {
    ...e, state: 'evidence', headline, families, bins, binsLabel: 'DATA_ONLY_V1 predicted vs observed',
    verdict: verdictOf(headline, families),
    clv: clvFams.length ? { mean: clvFams.reduce((a, b) => a + b, 0) / clvFams.length, n: null, note: 'Unweighted mean of the published per-family closing-line values.' } : null,
    studies: [{
      title: 'Model variants, overall', kind: 'prospective',
      rows: [
        { label: 'Data-only model', a: 'Brier', b: 'Log loss', aVal: num(v1.brier), bVal: num(v1.log_loss), n: num(v1.n) },
        { label: 'Market-anchored model', a: 'Brier', b: 'Log loss', aVal: num(anchored.brier), bVal: num(anchored.log_loss), n: num(anchored.n) },
        { label: 'Market baseline (different rows)', a: 'Brier', b: 'Log loss', aVal: num(mk.brier), bVal: num(mk.log_loss), n: num(mk.n) },
      ],
      note: 'The market baseline is scored on a different, larger row set; compare families above for like-for-like.',
    }],
    modelVersion: 'DATA_ONLY_V1', asOf: c.evaluated_at_utc ?? null, source: 'met_nhl.calibration_v1 · extensions', limitations: def?.known_limitations ?? [],
  };
}

function tennis(s: SportConfig, m: Map<string, MetricDef>): SportEvidence {
  const e = base(s);
  const def = m.get('met_tennis.settled_brier_score');
  const sc = (def?.extensions as any)?.scorecard;
  if (!sc?.forecasters) return { ...e, verdict: 'The tennis settled scorecard is not in this publication.' };
  const mod = sc.forecasters.model_fair ?? {};
  const mkt = sc.forecasters.market_mid_at_decision ?? {};
  const headline = cmp('Settled match probabilities, same rows', 'Brier', num(mod.brier), num(mkt.brier), num(mod.n));
  const clvViews = (m.get('met_tennis.strict_executable_clv')?.extensions as any)?.clv_scorecard?.views?.A_all_strict_observations?.by_family ?? {};
  const studies: Study[] = [];
  const pin = (m.get('met_tennis.pinnacle_benchmark_brier')?.extensions as any);
  if (pin?.scores) {
    const boot = pin.bootstrap_model_minus_market_brier ?? {};
    studies.push({ title: 'Sharp-book benchmark (Pinnacle)', kind: 'benchmark', rows: [{ label: 'Model − Pinnacle Brier', a: 'Model', b: 'Pinnacle', aVal: num(pin.scores?.[pin.model_col]?.brier) ?? (num(pin.scores?.market_pinnacle?.brier) != null && num(boot.diff) != null ? num(pin.scores.market_pinnacle.brier)! + num(boot.diff)! : null), bVal: num(pin.scores?.market_pinnacle?.brier), n: num(boot.n ?? pin.n_linked), ci: boot.ci_low != null ? [Number(boot.ci_low), Number(boot.ci_high)] : null }], note: 'Positive difference = the model is worse; the 95% bootstrap interval excludes zero when both ends share a sign.' });
  }
  const bt = (m.get('met_tennis.projection_v2_backtest')?.extensions as any) ?? null;
  if (bt) {
    const rows = Object.entries(bt).filter(([, v]: [string, any]) => v?.challenger && v?.incumbent).map(([k, v]: [string, any]) => ({ label: k.replace(/_/g, ' '), a: 'Challenger', b: 'Incumbent', aVal: num(v.challenger.brier), bVal: num(v.incumbent.brier), n: num(v.challenger.n), ci: v.challenger_minus_incumbent?.brier_ci ?? null }));
    if (rows.length) studies.push({ title: 'Projection v2 walk-forward (model vs model, Brier)', kind: 'walk_forward', rows, note: `Pre-registered challenger vs incumbent. Verdict as published: ${bt.verdict ?? '—'}. This compares two models, not the model against the market.` });
  }
  const families = Object.entries(clvViews as Record<string, any>).map(([fam, f]) => ({ fam, mean: num(f?.mean_exec_clv), n: num(f?.n) })).filter((x) => x.mean != null);
  return {
    ...e, state: 'evidence', headline, families: [], bins: null, binsLabel: null,
    verdict: verdictOf(headline, []) + (num(mod.cal_slope) != null ? ` Calibration slope: model ${num(mod.cal_slope)!.toFixed(2)}, market ${num(mkt.cal_slope)?.toFixed(2)} (1.00 = perfectly scaled).` : ''),
    clv: num(sc.strict_executable_clv?.mean) != null ? { mean: num(sc.strict_executable_clv.mean)!, n: num(sc.strict_executable_clv.n), note: `Strict pregame executable CLV.${families.length ? ` By family: ${families.slice(0, 4).map((f) => `${familyLabel(f.fam)} ${(f.mean! * 100).toFixed(1)} pts (n ${f.n})`).join(', ')}.` : ''}` } : null,
    studies, modelVersion: null, asOf: sc.generated_at ?? null, source: 'met_tennis.settled_brier_score · extensions.scorecard', limitations: def?.known_limitations ?? [],
  };
}

function soccer(s: SportConfig, docs: EventResearchDoc[]): SportEvidence {
  const e = base(s);
  const seen = new Map<string, ReturnType<typeof soccerCalibration>[number]>();
  for (const r of docs) for (const c of soccerCalibration(r)) {
    // One row per market family: a validated model family first, then the largest settled sample.
    const k = c.family;
    const prev = seen.get(k);
    if (!prev || (c.validated && !prev.validated) || (c.validated === prev.validated && prev.n < c.n)) seen.set(k, c);
  }
  const rows = [...seen.values()].filter((c) => c.logLoss != null && c.marketLogLoss != null && c.n > 0).sort((a, b) => b.n - a.n);
  if (!rows.length) return { ...e, verdict: 'No settled soccer calibration is attached to the events read.' };
  const families = rows.map((c) => cmp(`${familyLabel(c.family)}${c.validated ? '' : ' (not validated)'}`, 'Log loss', c.logLoss, c.marketLogLoss, c.n, c.modelFamily ? `Model family ${c.modelFamily}` : undefined)).filter((x): x is Comparison => !!x);
  const headline = families.find((f) => /match.result|1x2|3way/i.test(f.label) && !/not validated/.test(f.label)) ?? families.find((f) => /match.result|1x2|3way/i.test(f.label)) ?? families[0] ?? null;
  return {
    ...e, state: 'evidence', headline, families, bins: null, binsLabel: null, verdict: verdictOf(headline, families),
    clv: null, studies: [], modelVersion: rows[0].modelFamily, asOf: rows.map((r) => r.evaluatedAt).filter(Boolean).sort().pop() ?? null,
    source: 'event research · extensions.calibration', limitations: ['Rows vary by competition pool; rows marked “not validated” have not passed the publication’s own gate.'],
  };
}

function nba(s: SportConfig, docs: EventResearchDoc[]): SportEvidence {
  const e = base(s);
  const fams = docs.length ? nbaModelVsMarket(docs[0]) : [];
  const families = fams.map((f) => cmp(familyLabel(f.family), 'Log loss', f.modelLogLoss, f.marketLogLoss, f.nOos)).filter((x): x is Comparison => !!x).sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
  if (!families.length) return { ...e, verdict: 'The NBA model-vs-market study is not attached to the events read.' };
  const headline = families.find((f) => /moneyline|winner/i.test(f.label)) ?? families[0];
  return {
    ...e, state: 'evidence', headline, families, bins: null, binsLabel: null, verdict: verdictOf(headline, families),
    clv: null, studies: [{ title: 'Out-of-sample walk-forward', kind: 'walk_forward', rows: fams.filter((f) => f.hybridLogLoss != null).map((f) => ({ label: familyLabel(f.family), a: 'Hybrid', b: 'Market', aVal: f.hybridLogLoss, bVal: f.marketLogLoss, n: f.nOos })), note: 'A frozen, one-off study; the publication has no settled prospective record yet.' }],
    modelVersion: null, asOf: docs[0]?.generated_at ?? null, source: 'event research · extensions.model_vs_market', limitations: ['Log loss only: no Brier, calibration bins or closing-line value are published.'],
  };
}

const NONE_REASON: Record<string, string> = {
  MLB: 'The MLB publication scores its routed wagers, not its model against the market, so there is no model-versus-market record to show here. Wager results are personal betting, not model accuracy.',
  CFB: 'The CFB model is retired and the Script Engine publishes no probabilities, so there is nothing to score. Its research-signal study finds the market approximately efficient.',
  CBB: 'The CBB model is in prospective evaluation: no settled games yet, and the publication does not allow inference below 20.',
};

async function one(s: SportConfig): Promise<SportEvidence> {
  try {
    const repo = new SportRepo(await resolveSource(s));
    switch (s.code) {
      case 'NFL': return nfl(s, await metricsOf(repo));
      case 'NHL': return nhl(s, await metricsOf(repo));
      case 'TENNIS': return tennis(s, await metricsOf(repo));
      case 'SOCCER': return soccer(s, await firstResearch(repo, 4));
      case 'NBA': return nba(s, await firstResearch(repo, 1));
      default: return { ...base(s), verdict: NONE_REASON[s.code] ?? 'No model evaluation is published.' };
    }
  } catch (e) {
    return { ...base(s), state: 'error', verdict: `The ${s.label} publication could not be read (${e instanceof Error ? e.message : String(e)}).` };
  }
}

export function loadEvidence(): Promise<SportEvidence[]> {
  return Promise.all(SPORTS.filter((s) => s.tier !== 'listed').map(one));
}

/** The per-sport readers, for tests over fixture metric maps and event documents. */
export const readers = { nfl, nhl, tennis, soccer, nba };
