// Reads one sport's `sift.projections.v1` document. Missing, unreachable or unrecognised = null = "no projection published";
// every consumer degrades to its existing view, never to an error banner.
import { getJson } from './fetcher';
import { useAsync } from './hooks';
import { useMemo } from 'react';
import { makeAuthority, type ProjectionAuthority } from '../lib/projectionAuthority';
import { attachDistributions, decodeDistributions, decodeProjections, decodeScorecard, decodeSummary, distributionsUrl, projectionsUrl, scorecardUrl, summaryUrl, type FoundationSummary, type LiveScorecard, type ProjectionDoc, type ProjSport } from '../lib/projections';

const SPORTS = new Set(['NFL', 'CFB', 'NBA', 'MLB', 'NHL']);

/**
 * One sport's projection feed with its distribution artifact joined (where the publisher writes one). The artifact is optional and
 * additive: a missing, unreadable or mismatched artifact leaves the feed exactly as published (rows then have no distribution).
 */
export async function loadProjectionDoc(code: ProjSport): Promise<ProjectionDoc | null> {
  const du = distributionsUrl(code);
  const [doc, dist] = await Promise.all([
    getJson<unknown>(projectionsUrl(code)).then(decodeProjections, () => null),
    du ? getJson<unknown>(du).then(decodeDistributions, () => null) : Promise.resolve(null),
  ]);
  return attachDistributions(doc, dist);
}

export function useProjections(sport: string | null | undefined): { doc: ProjectionDoc | null; loading: boolean } {
  const code = sport ? sport.toUpperCase() : null;
  const ok = code != null && SPORTS.has(code);
  const r = useAsync<ProjectionDoc | null>(ok ? `projections:${code}` : null, () => loadProjectionDoc(code as ProjSport), { revalidate: true });
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

/**
 * The authoritative-projection resolver for a sport, rebuilt when the feed changes. `ready` is false while the feed is
 * loading: a page waits rather than flashing a legacy number that the loaded feed would replace.
 */
export function useAuthority(sport: string | null | undefined, now: number = Date.now()): { authority: ProjectionAuthority | null; ready: boolean } {
  const { doc, loading } = useProjections(sport);
  const code = sport ? sport.toUpperCase() : null;
  const ok = code != null && SPORTS.has(code);
  // freshness is judged at minute granularity so the resolver is stable between renders
  const minute = Math.floor(now / 60000);
  const authority = useMemo(() => (ok && !loading ? makeAuthority(code as ProjSport, doc, minute * 60000) : null), [ok, loading, code, doc, minute]);
  return { authority, ready: !ok || !loading };
}

/** Non-hook form for async loaders (the slate loader): fetches the feed once and resolves against it. */
export async function loadAuthority(sport: string, now: number = Date.now()): Promise<ProjectionAuthority | null> {
  const code = sport.toUpperCase();
  if (!SPORTS.has(code)) return null;
  const doc = await loadProjectionDoc(code as ProjSport);
  return makeAuthority(code as ProjSport, doc, now);
}
