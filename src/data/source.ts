// Which published root Sift reads for a sport.
//
//   live       the sport's own raw GitHub root has an explorer: everything comes from it.
//   snapshot   the live root publishes v1 but no explorer (NFL today: an upstream exporter bug), so the
//              research graph comes from a bundled same-run snapshot; live health is still shown.
//   live-v1    live v1 only, no explorer anywhere: health and the board, no research screens.
//   unavailable  nothing could be read.
import type { ExplorerIndexDoc, HealthDoc } from '../contract/types';
import { getJson, joinUrl, NotFoundError } from './fetcher';
import type { SportConfig } from './sports';

export type SourceMode = 'live' | 'snapshot' | 'live-v1' | 'unavailable';

export interface SnapshotInfo {
  reason: string;
  run_id: string;
  v1_generated_at: string;
  explorer_built_at: string;
  inputs: Record<string, string>;
  verification: string;
  note: string;
}

export interface SportSource {
  sport: SportConfig;
  mode: SourceMode;
  /** The app root every document path is resolved against. */
  root: string | null;
  liveHealth: HealthDoc | null;
  liveError: string | null;
  snapshot: SnapshotInfo | null;
  /** Why the mode is what it is, in one sentence for the provenance panel. */
  reason: string;
}

export type SourcePreference = 'auto' | 'snapshot';
const PREF_KEY = 'sift.sourcePreference';

export function getSourcePreference(): SourcePreference {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('source');
    if (q === 'snapshot' || q === 'auto') {
      localStorage.setItem(PREF_KEY, q);
      return q;
    }
    return (localStorage.getItem(PREF_KEY) as SourcePreference) || 'auto';
  } catch {
    return 'auto';
  }
}

export function setSourcePreference(p: SourcePreference): void {
  try {
    localStorage.setItem(PREF_KEY, p);
  } catch {
    /* private mode: the preference just doesn't persist */
  }
  cache.clear();
}

const cache = new Map<string, Promise<SportSource>>();

export function resolveSource(sport: SportConfig, pref: SourcePreference = getSourcePreference()): Promise<SportSource> {
  const key = `${sport.code}:${pref}`;
  let p = cache.get(key);
  if (!p) {
    p = doResolve(sport, pref);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

async function doResolve(sport: SportConfig, pref: SourcePreference): Promise<SportSource> {
  let liveHealth: HealthDoc | null = null;
  let liveError: string | null = null;
  try {
    liveHealth = await getJson<HealthDoc>(joinUrl(sport.rawBase, 'health.json'));
  } catch (e) {
    liveError = e instanceof Error ? e.message : String(e);
  }

  let liveExplorer = false;
  if (liveHealth && pref !== 'snapshot') {
    try {
      await getJson<ExplorerIndexDoc>(joinUrl(sport.rawBase, 'explorer/index.json'));
      liveExplorer = true;
    } catch (e) {
      if (!(e instanceof NotFoundError)) liveError = e instanceof Error ? e.message : String(e);
    }
  }
  const base = { sport, liveHealth, liveError, snapshot: null as SnapshotInfo | null };
  if (liveExplorer) {
    return { ...base, mode: 'live', root: sport.rawBase, reason: `Live ${sport.label} publication from ${sport.repo}@${sport.branch}.` };
  }
  if (sport.snapshotBase) {
    try {
      const info = await getJson<SnapshotInfo>(joinUrl(sport.snapshotBase.replace(/\/app\/latest$/, ''), 'SNAPSHOT.json'));
      await getJson<ExplorerIndexDoc>(joinUrl(sport.snapshotBase, 'explorer/index.json'));
      const why =
        pref === 'snapshot'
          ? 'Snapshot selected in settings.'
          : `The live ${sport.label} root publishes no research explorer, so the research graph comes from a same-run snapshot.`;
      return { ...base, snapshot: info, mode: 'snapshot', root: sport.snapshotBase, reason: why };
    } catch {
      /* fall through */
    }
  }
  if (liveHealth) {
    return { ...base, mode: 'live-v1', root: sport.rawBase, reason: `${sport.label} publishes the v1 board but no research explorer.` };
  }
  return { ...base, mode: 'unavailable', root: null, reason: liveError ?? `${sport.label} could not be read.` };
}
