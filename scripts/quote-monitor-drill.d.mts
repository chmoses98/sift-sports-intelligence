// Types for quote-monitor-drill.mjs (tests import it from TypeScript).
import type { MonitorResult } from './quote-monitor.mjs';
export interface Scenario { feedAgeS: number; heartbeat: string; relay: string; games: { key: string; tickers: string[] }[]; gameStatus?: string; env?: Record<string, string>; expect: { ok: boolean; status?: string; statusIn?: string[]; checks?: [string, RegExp][]; checkStatus?: [string, string][] } }
export const SCENARIOS: Record<string, Scenario>;
export const STAGE3_SCENARIOS: string[];
export const STAGE_NAMES: Record<number, string>;
export function neutralise(text: string): string;
export function startFakeWorld(): Promise<{ state: { scenario: Scenario; healthReads: number; relayCalls: number; relayRequests: string[][] }; base: string; close: () => Promise<void> }>;
export function mismatches(result: MonitorResult, ex: Scenario['expect']): string[];
export interface DrillItem { name: string; expected: string; observed: string; ok: boolean; problems: string[]; result?: MonitorResult }
export interface DrillStage { stage: number; name: string; ok: boolean; items: DrillItem[] }
export function runCiDrill(o?: { env?: Record<string, string | undefined>; stages?: number[] | null; log?: (line: string) => void; deps?: { fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>; now?: () => number; sleep?: (ms: number) => Promise<void> }; tune?: Record<string, string>; summaryFile?: string }): Promise<{ ok: boolean; stages: DrillStage[]; failedStages: number[] }>;
