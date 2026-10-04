import type { CapabilityManifestDoc } from '../contract/types';
import { getJson, joinUrl } from '../data/fetcher';
import { useAsync } from '../data/hooks';
import { SportRepo } from '../data/repo';
import { resolveSource, type SportSource } from '../data/source';
import { SPORTS, type SportConfig } from '../data/sports';

export interface SportStatus {
  sport: SportConfig;
  source: SportSource | null;
  caps: CapabilityManifestDoc | null;
  counts: Record<string, number>;
  /** Whether the live root itself publishes an explorer (independent of Sift's snapshot fallback). */
  liveExplorer: boolean;
}

async function statusFor(sport: SportConfig): Promise<SportStatus> {
  const source: SportSource | null = await resolveSource(sport).catch(() => null);
  let caps: CapabilityManifestDoc | null = null;
  let liveExplorer = false;
  try {
    // The live manifest says what the sport itself can show, even for sports Sift does not explore yet.
    const idx = await getJson<{ capabilities_path: string }>(joinUrl(sport.rawBase, 'explorer/index.json'));
    liveExplorer = true;
    caps = await getJson<CapabilityManifestDoc>(joinUrl(sport.rawBase, idx.capabilities_path));
  } catch {
    if (source && (source.mode === 'snapshot' || source.mode === 'live')) {
      try {
        caps = await new SportRepo(source).capabilities();
      } catch {
        caps = null;
      }
    }
  }
  const counts: Record<string, number> = {};
  for (const c of caps?.items ?? []) counts[c.status] = (counts[c.status] ?? 0) + 1;
  return { sport, source, caps, counts, liveExplorer };
}

export function useAllSports() {
  return useAsync('allSports', () => Promise.all(SPORTS.map(statusFor)));
}

export const ROUTER_HEALTH_URL = 'https://raw.githubusercontent.com/chmoses98/kalshi-bet-router/app-data/app/latest/router_health.json';
