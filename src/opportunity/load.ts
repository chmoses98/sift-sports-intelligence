// Loading every sport's candidate layer for the global home: each explorable sport's board and recommendations
// (and soccer's theses, CFB's research-signals document), normalised through sources.ts. One read per document,
// memoised with the research clock; a sport that cannot be read says so instead of disappearing.
import { useMemo } from 'react';
import type { BoardItem, Recommendation, Thesis } from '../contract/types';
import { useAsync } from '../data/hooks';
import { SportRepo } from '../data/repo';
import { resolveSource } from '../data/source';
import { explorable, SPORTS, type SportConfig } from '../data/sports';
import { loadSignals } from '../data/cfbSignals';
import type { SignalsDoc } from '../lib/cfbSignals';
import { cfbOpportunities, mlbOpportunities, nflOpportunities, nhlOpportunities, soccerOpportunities, tennisOpportunities, verdict } from './sources';
import type { Opportunity, SportVerdict } from './types';

export interface SportBundle {
  sport: SportConfig;
  board: BoardItem[];
  recommendations: Recommendation[] | null;
  theses: Thesis[] | null;
  signals: SignalsDoc | null;
  modelState: string | null;
  error: string | null;
}

/** A sport's bundle through an already-resolved repo (a sport page's own source, or a test fixture). */
export async function loadBundle(repo: SportRepo): Promise<SportBundle> {
  const sport = repo.sport;
  try {
    const src = repo.source;
    if (!src.root) return { sport, board: [], recommendations: null, theses: null, signals: null, modelState: src.liveHealth?.overall_status ?? null, error: src.reason };
    const board = await repo.board();
    const [recs, theses, signals] = await Promise.all([
      repo.recommendations().then((d) => d.items as Recommendation[]).catch(() => null),
      sport.code === 'SOCCER' ? repo.theses().then((d) => d.items).catch(() => null) : Promise.resolve(null),
      sport.researchSignalsUrl ? loadSignals(sport.researchSignalsUrl).catch(() => null) : Promise.resolve(null),
    ]);
    return { sport, board: board.items, recommendations: recs, theses, signals, modelState: src.liveHealth?.overall_status ?? null, error: null };
  } catch (e) {
    return { sport, board: [], recommendations: null, theses: null, signals: null, modelState: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function loadSport(sport: SportConfig): Promise<SportBundle> {
  try {
    return await loadBundle(new SportRepo(await resolveSource(sport)));
  } catch (e) {
    return { sport, board: [], recommendations: null, theses: null, signals: null, modelState: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Opportunities and the sport verdict for one loaded bundle, at `now`. */
export function evaluate(b: SportBundle, now: number): { opportunities: Opportunity[]; verdict: SportVerdict } {
  const code = b.sport.code;
  const inputs = { sport: { code, slug: b.sport.slug, label: b.sport.label }, board: b.board, recommendations: b.recommendations as never, theses: b.theses, now };
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
  return { opportunities: opps, verdict: verdict(code, b.sport.slug, b.sport.label, b.board, opps, b.recommendations != null || code === 'CFB' || code === 'NBA' || code === 'CBB', b.modelState, !b.error, b.error) };
}

/** One sport's opportunities and verdict (for that sport's home). */
export function useSportOpportunities(repo: SportRepo, now: number) {
  const bundle = useAsync(`opportunities:${repo.sport.code}:${repo.source.root}`, () => loadBundle(repo));
  return useMemo(() => {
    const b = bundle.data;
    const ev = b ? evaluate(b, now) : null;
    return { loading: bundle.loading, error: bundle.error, opportunities: ev?.opportunities ?? [], verdict: ev?.verdict ?? null };
  }, [bundle.data, bundle.loading, bundle.error, now]);
}

export function useAllOpportunities(now: number) {
  const bundles = useAsync('opportunities:all', () => Promise.all(SPORTS.filter(explorable).map(loadSport)));
  return useMemo(() => {
    const list = bundles.data ?? [];
    const evaluated = list.map((b) => evaluate(b, now));
    return {
      loading: bundles.loading,
      error: bundles.error,
      bundles: list,
      opportunities: evaluated.flatMap((e) => e.opportunities),
      verdicts: evaluated.map((e) => e.verdict),
    };
  }, [bundles.data, bundles.loading, bundles.error, now]);
}
