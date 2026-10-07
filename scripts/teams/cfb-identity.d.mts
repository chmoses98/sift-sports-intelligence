// Types for scripts/teams/cfb-identity.mjs (imported by tests/cfbTeams.test.ts).
export interface Pair { code: string; espn: string; name: string; participant: string; event: string }
export interface MapEntry { e: string; n: string; l?: 0 | 1; c?: string | null; c2?: string | null }
export function pairsOf(doc: unknown): Pair[];
export function mergePairs(base: Record<string, MapEntry>, pairs: Pair[]): { teams: Record<string, MapEntry>; conflicts: string[] };
