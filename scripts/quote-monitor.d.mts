// Types for quote-monitor.mjs (tests import it from TypeScript).
export const FEED_SCHEMA: string;
export const INDEX_SCHEMA: string;
export const HEALTH_SCHEMA: string;
export const LIMITS: { feedMaxAgeMs: number; relayMaxAgeMs: number; sequenceWindowMs: number; pollMs: number; fetchTimeoutMs: number; relayBatch: number; retryDelayMs: number; retryAfterCapMs: number; relayGames: number; futureToleranceMs: number };
export type CheckStatus = 'pass' | 'fail' | 'skip' | 'note';
export interface Check { id: string; status: CheckStatus; title: string; detail: string; /** A transient failure that passed on the single retry. */ recovered?: boolean }
export interface MonitorResult { ok: boolean; status: 'PASS' | 'FAIL' | 'PASS_HEARTBEAT_NOT_PUBLISHED'; checks: Check[] }
export function advanced(a: { run_id: string; sequence: number }, b: { run_id: string; sequence: number }): boolean;
export function relayTickers(doc: unknown, max?: number): string[];
export function openTickers(doc: unknown, max?: number): string[];
export function runMonitor(o?: { env?: Record<string, string | undefined>; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>; now?: () => number; sleep?: (ms: number) => Promise<void> }): Promise<MonitorResult>;
export function report(r: MonitorResult): string;
export function summaryMarkdown(r: MonitorResult): string;
