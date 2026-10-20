import type { Extractor } from './feeds.mjs';
export const MAX_MINUTES: number;
export interface FeedPlan { id: string; sport: string; status: string; intervalMs: number; requests: number; perMinute: number; clamped: boolean }
export function planRun(feedIds: string[], extractors: Record<string, Extractor>, opts: { interval?: number; minutes?: number; ackUnlicensed?: boolean; ackProhibited?: string[] }): { ok: boolean; errors: string[]; feeds: FeedPlan[]; totalRequests: number };
export function afterResponse(status: number): 'STOP' | 'BACKOFF' | 'OK';
