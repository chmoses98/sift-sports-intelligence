// Loading every sport's candidate layer for the global home: each explorable sport's board and recommendations
// (and soccer's theses, CFB's research-signals document), normalised through sources.ts. One read per document,
// memoised with the research clock; a sport that cannot be read says so instead of disappearing.
import { useMemo } from 'react';
import type { BoardItem, Recommendation, Thesis } from '../contract/types';
import { useAsync } from '../data/hooks';
import { useLiveQuotes } from '../live/hooks';
import { repriceAll } from './live';
import { SportRepo } from '../data/repo';
import { resolveSource } from '../data/source';
import { explorable, SPORTS, type SportConfig } from '../data/sports';
import { loadSignals } from '../data/cfbSignals';
import type { SignalsDoc } from '../lib/cfbSignals';
import { readLearning, type Learning } from '../lib/nhl';
import { tennisRecord } from '../lib/tennis';
import { cfbOpportunities, mlbOpportunities, nflOpportunities, nhlOpportunities, soccerOpportunities, tennisOpportunities, verdict } from './sources';
import type { Opportunity, SportVerdict } from './types';

export interface SportBundle {
  sport: SportConfig;
  board: BoardItem[];
  recommendations: Recommendation[] | null;
  theses: Thesis[] | null;
  signals: SignalsDoc | null;
  /** NHL: the learning scorecard, for each candidate's family record (src/opportunity/record.ts). */
  learning?: Learning | null;
  /** Tennis: the settled model-vs-market record, for each candidate's risk line. */
  tennisRecord?: { n: number; model: number; market: number } | null;
  modelState: string | null;
  marketCaptureAt: string | null;
  error: string | null;
}

/** A sport's bundle through an already-resolved repo (a sport page's own source, or a test fixture). */
export async function loadBundle(repo: SportRepo): Promise<SportBundle> {
  const sport = repo.sport;
  try {
    const src = repo.source;
    if (!src.root) return { sport, board: [], recommendations: null, theses: null, signals: null, modelState: src.liveHealth?.overall_status ?? null, marketCaptureAt: src.liveHealth?.last_market_capture ?? null, error: src.reason };
    const board = await repo.board();
    const [recs, theses, signals, learning, tennisRec] = await Promise.all([
      repo.recommendations().then((d) => d.items as Recommendation[]).catch(() => null),
      sport.code === 'SOCCER' ? repo.theses().then((d) => d.items).catch(() => null) : Promise.resolve(null),
      sport.researchSignalsUrl ? loadSignals(sport.researchSignalsUrl).catch(() => null) : Promise.resolve(null),
      sport.code === 'NHL' ? repo.metricMap().then(readLearning).catch(() => null) : Promise.resolve(null),
      sport.code === 'TENNIS' ? repo.metricMap().then(tennisRecord).catch(() => null) : Promise.resolve(null),
    ]);
    return { sport, board: board.items, recommendations: recs, theses, signals, learning, tennisRecord: tennisRec, modelState: src.liveHealth?.overall_status ?? null, marketCaptureAt: src.liveHealth?.last_market_capture ?? board.generated_at ?? null, error: null };
  } catch (e) {
    return { sport, board: [], recommendations: null, theses: null, signals: null, modelState: null, marketCaptureAt: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function loadSport(sport: SportConfig): Promise<SportBundle> {
  try {
    return await loadBundle(new SportRepo(await resolveSource(sport)));
  } catch (e) {
    return { sport, board: [], recommendations: null, theses: null, signals: null, modelState: null, marketCaptureAt: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Opportunities and the sport verdict for one loaded bundle, at `now`. */
export function evaluate(b: SportBundle, now: number): { opportunities: Opportunity[]; verdict: SportVerdict } {
  const code = b.sport.code;
  const inputs = { sport: { code, slug: b.sport.slug, label: b.sport.label }, board: b.board, recommendations: b.recommendations as never, theses: b.theses, learning: b.learning ?? null, tennisRecord: b.tennisRecord ?? null, now };
  const opps: Opportunity[] = (() => {
    switch (code) {
      case 'SOCCER': return soccerOpportunities(inputs);
      case 'TENNIS': return tennisOpportunities(inputs);
      case 'NHL': return nhlOpportunities(inputs);
      case 'MLB': return mlbOpportunities(inputs);
      case 'NFL': return nflOpportunities(inputs);
      case 'CFB': return cfbOpportunities(b.board, b.signals, b.sport.slug, now);
      default: return [];
    }
  })();
  return { opportunities: opps, verdict: verdict(code, b.sport.slug, b.sport.label, b.board, opps, b.recommendations != null || code === 'CFB' || code === 'NBA' || code === 'CBB', b.modelState, !b.error, b.error, now, b.marketCaptureAt) };
}

/** The live tickers worth a quote: every opportunity that is not already a PASS. */
const liveTickers = (opps: Opportunity[]) => [...new Set(opps.filter((o) => o.status !== 'PASS' && o.ticker).map((o) => o.ticker!))];

/** A verdict's counts after live repricing (the pass reason stays the publication's). */
const recount = (v: SportVerdict, opps: Opportunity[]): SportVerdict => {
  const mine = opps.filter((o) => o.slug === v.slug);
  return { ...v, opportunities: mine.filter((o) => o.status !== 'PASS').length, passes: mine.filter((o) => o.status === 'PASS').length };
};

/** One sport's opportunities and verdict (for that sport's home), repriced by the live quote where one exists. */
export function useSportOpportunities(repo: SportRepo, now: number) {
  const bundle = useAsync(`opportunities:${repo.sport.code}:${repo.source.root}`, () => loadBundle(repo));
  const evaluated = useMemo(() => (bundle.data ? evaluate(bundle.data, now) : null), [bundle.data, now]);
  const live = useLiveQuotes(useMemo(() => liveTickers(evaluated?.opportunities ?? []), [evaluated]), 'slate');
  return useMemo(() => {
    const opportunities = evaluated ? repriceAll(evaluated.opportunities, live.quote, now) : [];
    return { loading: bundle.loading, error: bundle.error, opportunities, verdict: evaluated ? recount(evaluated.verdict, opportunities) : null };
  }, [evaluated, bundle.loading, bundle.error, live, now]);
}

export function useAllOpportunities(now: number) {
  const bundles = useAsync('opportunities:all', () => Promise.all(SPORTS.filter(explorable).map(loadSport)));
  const evaluated = useMemo(() => (bundles.data ?? []).map((b) => evaluate(b, now)), [bundles.data, now]);
  const live = useLiveQuotes(useMemo(() => liveTickers(evaluated.flatMap((e) => e.opportunities)), [evaluated]), 'slate');
  return useMemo(() => {
    const opportunities = repriceAll(evaluated.flatMap((e) => e.opportunities), live.quote, now);
    return {
      loading: bundles.loading,
      error: bundles.error,
      bundles: bundles.data ?? [],
      opportunities,
      verdicts: evaluated.map((e) => recount(e.verdict, opportunities)),
    };
  }, [evaluated, bundles.data, bundles.loading, bundles.error, live, now]);
}
