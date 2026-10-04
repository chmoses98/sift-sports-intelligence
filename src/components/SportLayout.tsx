import { Suspense } from 'react';
import { Outlet, useParams } from 'react-router';
import type { CapabilityManifestDoc, HealthDoc, MetricDef } from '../contract/types';
import { useAsync, useRepo } from '../data/hooks';
import { explorable, sportBySlug } from '../data/sports';
import { SportProvider } from '../state/sport';
import { SportOverview } from '../views/SportOverview';
import { NotFound } from '../views/NotFound';
import { ErrorState, Notice, Skeleton } from './ui';
import type { SportSource } from '../data/source';
import type { SportConfig } from '../data/sports';
import { SourceBanner } from './SourceBanner';

export function SportLayout() {
  const { sport: slug } = useParams();
  const sport = sportBySlug(slug);
  const repo = useRepo(sport);
  const meta = useAsync(repo.data?.hasExplorer ? `meta:${sport!.code}:${repo.data.source.root}` : null, async () => {
    const r = repo.data!;
    const [capDoc, metrics, health] = await Promise.all([
      r.capabilities().catch(() => null as CapabilityManifestDoc | null),
      r.metricMap(),
      r.health().catch(() => null as HealthDoc | null),
    ]);
    return { capDoc, metrics, health };
  });

  if (!sport) return <NotFound />;
  if (!explorable(sport)) return <SportOverview sport={sport} />;
  if (repo.loading || (repo.data?.hasExplorer && meta.loading)) {
    return (
      <div className="page">
        <Skeleton lines={5} tall />
      </div>
    );
  }
  if (!repo.data) return <div className="page"><ErrorState error={repo.error} what={`${sport.label} data`} /></div>;
  if (!repo.data.hasExplorer) return explorable(sport) ? <ResearchUnavailable sport={sport} source={repo.data.source} /> : <SportOverview sport={sport} />;
  const caps = new Map((meta.data?.capDoc?.items ?? []).map((c) => [c.capability, c]));
  const metrics = meta.data?.metrics ?? new Map<string, MetricDef>();
  return (
    <SportProvider value={{ sport, slug: sport.slug, repo: repo.data, caps, capDoc: meta.data?.capDoc ?? null, metrics }}>
      <SourceBanner source={repo.data.source} shown={meta.data?.health ?? null} />
      <Suspense fallback={<div className="page"><Skeleton lines={6} tall /></div>}>
        <Outlet />
      </Suspense>
    </SportProvider>
  );
}

/** An explorable sport whose research could not be read: say so plainly; show nothing in its place. */
function ResearchUnavailable({ sport, source }: { sport: SportConfig; source: SportSource }) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <div className="page">
      <Notice tone="error" title={`${sport.label} research is unavailable right now`}>
        <p>
          {offline ? 'You are offline and this research has not been opened on this device before. ' : ''}
          Sift could not read a research explorer for {sport.label} ({source.mode === 'live-v1' ? 'the live publication has only the v1 board' : source.reason}).
          Nothing is shown in its place: no stale or invented research.
        </p>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.location.reload()}>Try again</button>
      </Notice>
    </div>
  );
}
