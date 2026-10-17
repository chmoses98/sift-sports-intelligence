// Reads one sport's `sift.projections.v1` document. Missing, unreachable or unrecognised = null = "no projection published";
// every consumer degrades to its existing view, never to an error banner.
import { getJson } from './fetcher';
import { useAsync } from './hooks';
import { decodeProjections, decodeScorecard, decodeSummary, projectionsUrl, scorecardUrl, summaryUrl, type FoundationSummary, type LiveScorecard, type ProjectionDoc, type ProjSport } from '../lib/projections';

const SPORTS = new Set(['NFL', 'CFB', 'NBA', 'MLB', 'NHL']);

export function useProjections(sport: string | null | undefined): { doc: ProjectionDoc | null; loading: boolean } {
  const code = sport ? sport.toUpperCase() : null;
  const ok = code != null && SPORTS.has(code);
  const r = useAsync<ProjectionDoc | null>(ok ? `projections:${code}` : null,
    () => getJson<unknown>(projectionsUrl(code as ProjSport)).then(decodeProjections, () => null), { revalidate: true });
  return { doc: r.data ?? null, loading: r.loading };
}


export function useFoundationSummary(sport: string | null | undefined): { summary: FoundationSummary | null; loading: boolean } {
  const code = sport ? sport.toUpperCase() : null;
  const ok = code != null && SPORTS.has(code);
  const r = useAsync<FoundationSummary | null>(ok ? `pf-summary:${code}` : null,
    () => getJson<unknown>(summaryUrl(code as ProjSport)).then(decodeSummary, () => null));
  return { summary: r.data ?? null, loading: r.loading };
}

/** Season-to-date live scorecard (settled pregame forecasts). Null until the sport's workflow has settled games. */
export function useLiveScorecard(sport: string | null | undefined): { card: LiveScorecard | null; loading: boolean } {
  const code = sport ? sport.toUpperCase() : null;
  const ok = code != null && SPORTS.has(code);
  const r = useAsync<LiveScorecard | null>(ok ? `pf-live:${code}` : null,
    () => getJson<unknown>(scorecardUrl(code as ProjSport)).then(decodeScorecard, () => null));
  return { card: r.data ?? null, loading: r.loading };
}
