export interface ChangeRec { type: 'change'; kind: 'score' | 'status'; src: string; game: string; seenAt: number; prevPollAt: number; [k: string]: unknown }
export interface Mark { kind: 'real' | 'truth'; game: string; at: number }
export interface Delay { game: string; n: number; src: string; delayMs: number; uncertaintyMs: number }
export interface Result { ref: string; delays: Delay[]; unpaired: { game: string; src: string; got: number; expected: number }[]; stats: Record<string, { n: number; medianMs: number; p90Ms: number; maxMs: number; minMs: number; medianUncertaintyMs: number }> }
export const HUMAN_MS: number;
export function quantile(xs: number[], q: number): number | null;
export function scoreChanges(records: ChangeRec[]): Map<string, ChangeRec[]>;
export function compare(records: ChangeRec[], marks?: Mark[], o?: { ref?: string }): Result;
export function toMarkdown(r: Result): string;
