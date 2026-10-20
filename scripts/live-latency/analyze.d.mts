export interface Rec { type: string; [k: string]: unknown }
export interface Mark { kind: 'real' | 'truth' | 'undo'; game: string; team?: 'away' | 'home'; at: number; of?: string }
export interface Step { key: string; score: string; a: number; h: number; total: number; team: string | null; time: number | null; obs: Map<string, { baseline: boolean; seenAt: number; prevPollAt: number }> }
export interface Delay { game: string; key: string; src: string; delayMs: number; uncertaintyMs: number; confidence: 'exact' | 'high' | 'low' }
export interface Stat { n: number; medianMs: number; p90Ms: number; maxMs: number; minMs: number; medianUncertaintyMs: number }
export interface Result {
  ref: string; delays: Delay[]; stats: Record<string, Stat>; statsLowConfidence: Record<string, Stat>;
  coverage: Record<string, { steps: number; observed: number; missed: number; missedRate: number | null }>;
  unmatched: { taps: { game: string; kind: string; team: string; at: number }[]; steps: { game: string; kind: string; key: string; team: string | null }[] };
  clock: { n: number; offsetMs: number | null; halfWidthMs: number | null }; warnings: string[];
}
export const HUMAN_MS: number;
export const WINDOW_MS: number;
export const MARGIN_MS: number;
export const OUTLIER_MS: number;
export function quantile(xs: number[], q: number): number | null;
export function cleanMarks(marks: Mark[]): (Mark & { of: string })[];
export function buildChains(records: Rec[]): Map<string, Step[]>;
export function alignTaps(taps: { team: string; at: number }[], steps: Step[], windowMs?: number): { pairs: { tap: { team: string; at: number }; step: Step; confidence: 'high' | 'low' }[]; unmatchedTaps: { team: string; at: number }[]; unmatchedSteps: Step[] };
export function clockCheck(records: Rec[]): { n: number; offsetMs: number | null; halfWidthMs: number | null };
export function compare(records: Rec[], marks?: Mark[], o?: { ref?: string; windowMs?: number }): Result;
export function toMarkdown(r: Result): string;
