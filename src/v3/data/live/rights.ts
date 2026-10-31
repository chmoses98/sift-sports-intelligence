// WHICH live-detail sources this build may read. The registry is the rights decision, written down in code, next to the doc that makes it
// (docs/LIVE_SCORES_REAL.md section 1). A source that is not CLEARED is never requested: its adapter exists and is tested, the UI is built
// to show what it would carry, and enabling it is one owner decision (an entry here), not a rewrite.
//
//   sportscore  NBA score + period words. Cleared in writing (free tier + attribution), and the OWNER approved it for the current
//               non-commercial early access (docs/LIVE_SCORES_REAL.md, 2026-10-22). Carries NO plays, box score or situation, and no game
//               clock. Its score reaches Game Detail through the existing score store (no second request), so it has no adapter here.
//   mlb         MLB StatsAPI (statsapi.mlb.com): state, plays, box score. Its terms permit "individual, non-commercial, non-bulk use" and say
//               SIFT may not relay it; the docs list MLB as "not connected" and the owner has not decided. BLOCKED-ON-RIGHTS: off here.
//   (none)      NFL, CFB, NHL, NBA play-by-play, box scores: no source whose published terms permit this use (ESPN removed, NHL not
//               browser-readable, NBA.com's gambling clause unresolved). Honest "not available".
//
// The only way to turn a blocked source on is the build-time list below (default: cleared sources only). It is not a runtime switch, not a
// URL parameter and not a stored preference, so a viewer cannot enable a feed the owner has not cleared. Test builds (the Playwright dev
// server) name `mlb` explicitly so the adapter and screens are exercised against stubbed, test-fixture network answers.
import type { DetailCapabilities } from './types';

export type RightsStatus = 'cleared' | 'blocked-on-rights';

export interface DetailSourceInfo {
  id: string;
  label: string;
  sports: readonly string[];
  rights: RightsStatus;
  /** Why, in one sentence a PR or a screen reader can repeat. */
  reason: string;
  capabilities: DetailCapabilities;
  attribution: string | null;
  /** True when Game Detail must request this source itself (the sportscore score arrives through the score store instead). */
  fetchesDetail: boolean;
}

export const DETAIL_SOURCES: readonly DetailSourceInfo[] = [
  {
    id: 'sportscore', label: 'SportScore', sports: ['NBA'], rights: 'cleared', attribution: 'Powered by SportScore', fetchesDetail: false,
    reason: 'Free tier, key-free, attribution link; owner-approved for non-commercial early access (docs/LIVE_SCORES_REAL.md).',
    capabilities: { score: true, period: true, clock: false, situation: false, plays: false, leaders: false },
  },
  {
    id: 'mlb', label: 'MLB StatsAPI', sports: ['MLB'], rights: 'blocked-on-rights', attribution: null, fetchesDetail: true,
    reason: 'MLB terms allow only individual, non-commercial, non-bulk use and no relay; the repo docs list MLB as not connected and the owner has not cleared it.',
    capabilities: { score: true, period: true, clock: false, situation: true, plays: true, leaders: true },
  },
];

const envList = (): string[] => {
  const raw = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SIFT_LIVE_DETAIL_SOURCES;
  return typeof raw === 'string' ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
};

/** Is this source allowed to be requested by this build? Cleared sources always; a blocked one only when the build explicitly names it. */
export function sourceEnabled(s: DetailSourceInfo, enabledByBuild: readonly string[] = envList()): boolean {
  return s.rights === 'cleared' || enabledByBuild.includes(s.id);
}

export type SourceChoice =
  | { kind: 'source'; source: DetailSourceInfo }
  /** A source exists for this sport but is not cleared: nothing is requested, and the screen says why. */
  | { kind: 'blocked'; source: DetailSourceInfo }
  | { kind: 'none' };

/** The source for a sport: the richest cleared (or build-enabled) one; else the blocked one that exists; else none. */
export function chooseSource(sport: string, enabledByBuild: readonly string[] = envList()): SourceChoice {
  const forSport = DETAIL_SOURCES.filter((s) => s.sports.includes(sport));
  const richness = (s: DetailSourceInfo) => Object.values(s.capabilities).filter(Boolean).length;
  const best = forSport.filter((s) => sourceEnabled(s, enabledByBuild)).sort((a, b) => richness(b) - richness(a))[0];
  if (best) return { kind: 'source', source: best };
  const blocked = forSport[0];
  return blocked ? { kind: 'blocked', source: blocked } : { kind: 'none' };
}
