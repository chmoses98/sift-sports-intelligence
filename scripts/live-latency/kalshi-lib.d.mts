export interface Leaf { path: string; value: unknown; array?: number }
export function flatten(v: unknown, path?: string, out?: Leaf[], depth?: number): Leaf[];
export function parseTime(v: unknown): number | null;
export function tagsOf(path: string, value: unknown): string[];
export interface SchemaEntry { path: string; seen: number; example: unknown; tags: string[] }
export function summarizeSchema(payloads: unknown[]): SchemaEntry[];
export function capabilities(schema: SchemaEntry[]): Record<'score' | 'clock' | 'period' | 'status' | 'timestamp' | 'player' | 'play', string[]>;
export function mapEventsToMilestones(...responses: unknown[]): { map: Map<string, Set<string>>; meta: Map<string, { type: string | null; category: string | null }> };
export function eventTickerOf(marketTicker: unknown): string | null;
export function cadence(obs: Record<string, { t: number; hash: string; scoreHash?: string; clockHash?: string }[]>, key?: 'hash' | 'scoreHash' | 'clockHash'): { perMilestone: Record<string, { polls: number; changes: number; medianGapMs: number | null; maxWindowMs: number | null }>; changes: number; medianGapMs: number | null; minGapMs: number | null };
export function timestampLags(payload: unknown, receivedAt: number): { path: string; lagMs: number }[];
export function fingerprints(details: unknown, hashFn: (s: string) => string): { scoreHash: string; clockHash: string; hash: string };
export const GAME_SERIES: Record<string, string>;
export function gameEventTicker(sport: string, key: string): string | null;
export const KALSHI_CLAUSES: string[];
export function kalshiGate(o?: { ackTerms?: boolean; ackBenchmark?: boolean }): { ok: boolean; discovery: boolean; cadence: boolean; errors: string[] };
