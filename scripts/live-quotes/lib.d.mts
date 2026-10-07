// Types for lib.mjs (tests import it from TypeScript).
export const FEED_SCHEMA: string;
export const INDEX_SCHEMA: string;
export const KALSHI: string;
export const KEEP: string[];
export interface Game { key: string; sport?: string; event_id: string; tickers: string[]; series: string[] }
export type Get = (url: string) => Promise<{ body: any; at: string }>; // eslint-disable-line @typescript-eslint/no-explicit-any
export function gameKeyOf(ticker: string): string | null;
export function observedAt(res: Response, fallbackMs: number): string;
export function compact(m: Record<string, unknown>, at: string): Record<string, unknown>;
export function makeGet(o?: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; pauseMs?: number; log?: (s: string) => void }): { get: Get; count: () => number };
export interface Publication {
  sport?: string | null; status: 'CURRENT_SLATE' | 'NO_CURRENT_GAMES' | 'STALE_PUBLICATION' | 'UNREADABLE_PUBLICATION'; source: string | null; generated_at: string | null;
  age_seconds: number | null; eligible_games: number; eligible_event_ids: string[]; latest_event: { event_id: string; status: string; start_time_utc: string } | null;
  stale_events: { event_id: string; status: string; start_time_utc: string }[]; reasons: string[]; horizon_days: number; lookback_hours: number;
}
export function readPublication(rawBase: string, get: Get, o?: { now?: () => number; horizonDays?: number; lookbackHours?: number; sport?: string | null }): Promise<{ games: Game[]; publication: Publication }>;
export function feedStatus(publications: Publication[]): Publication['status'];
export const UNUSABLE: string[];
export function unreadablePublication(sport: string, source: string, error: unknown, o?: { horizonDays?: number; lookbackHours?: number }): Publication;
export interface SportStatus { sport: string | null | undefined; status: Publication['status']; published: boolean; reason: string; games: number; markets: number | null }
export function planFeed(publications: Publication[], games: Game[], byKey?: Map<string, Map<string, Record<string, unknown>>> | null): { publish: boolean; reason: string; sports: SportStatus[]; games?: Game[] };
export function publicationGames(rawBase: string, get: Get, o?: { now?: () => number; horizonDays?: number; lookbackHours?: number }): Promise<Game[]>;
export function sweep(games: Game[], get: Get, o?: { api?: string; maxPages?: number; log?: (s: string) => void }): Promise<{ byKey: Map<string, Map<string, Record<string, unknown>>>; errors: string[] }>;
export function buildFiles(games: Game[], byKey: Map<string, Map<string, Record<string, unknown>>>, o: { generatedAt: string; source?: string; sports?: string[]; errors?: string[]; requests?: number; publications?: Publication[] | null; sportStatus?: SportStatus[] | null }): Map<string, Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
