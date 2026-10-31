// Types for scripts/teams/cfb-conferences.mjs (imported by tests/cfbConferences.test.ts).
export interface ConferencePair { code: string; conference: string; event: string }
export function conferencePairs(doc: unknown): ConferencePair[];
export function mergeConferences(base: Record<string, string>, pairs: ConferencePair[]): { teams: Record<string, string>; conflicts: string[] };
