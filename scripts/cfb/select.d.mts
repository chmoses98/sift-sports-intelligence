// Types for scripts/cfb/select.mjs (imported by tests/cfbScriptStates.test.tsx).
export interface Payload {
  eventId: string | null;
  gameKey: string | null;
  title: string | null;
  start: string | null;
  present: boolean;
  status: string | null;
  hasGeneration: boolean;
  scripts: { id: string; role: string; title: string; rank: number }[];
  sections: string[];
  home: string | null;
  away: string | null;
}
export const POSITIVE: Record<string, (n: number) => boolean>;
export const NEGATIVE: 'NO_SCRIPT_CLEARED_EVIDENCE';
export function upcoming(board: unknown, nowMs: number): { event_id: string; start_time_utc: string; status: string }[];
export function researchPath(explorerIndex: unknown, eventId: string): string | null;
export function payloadOf(doc: unknown): Payload;
export function agreement(indexStatus: string, p: Payload): string[];
export function selectGames(args: {
  board: unknown;
  explorerIndex: unknown;
  scriptIndex: unknown;
  readDoc: (path: string) => Promise<unknown>;
  nowMs: number;
  want?: string[];
  maxScan?: number;
}): Promise<{ picked: Record<string, Payload & { path: string; indexStatus: string }>; problems: string[]; scanned: number }>;
