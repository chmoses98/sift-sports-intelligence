// Types for handover.mjs (tests import it from TypeScript).
export const LOOP_TITLE: string;
export interface HandoverConfig { cycleMs: number; minAgeMs: number; dispatchAtMin: number; capMin: number; staleRestartMin: number }
export const HANDOVER: Readonly<HandoverConfig>;
export interface RunInfo { id: number; event: string; status: string; display_title?: string }
export interface Successor { exists: boolean; started: boolean; ids: number[] }
export function nextSlot(slot: string | undefined): 'a' | 'b';
export function activeLoops(runs: RunInfo[] | null | undefined, myRunId: number): RunInfo[];
export function successorOf(runs: RunInfo[] | null | undefined, myRunId: number): Successor;
export function newestWins(localGeneratedAt: string | null | undefined, remoteGeneratedAt: string | null | undefined): boolean;
export function cadenceWaitMs(remoteGeneratedAt: string | null | undefined, nowMs: number, minAgeMs?: number): number;
export function decide(s: { elapsedMin: number; successor: Successor | null; dispatched: boolean; handedOver: boolean }, cfg?: HandoverConfig): { action: 'publish' | 'dispatch' | 'finish'; reason: string };
