export interface Row { sport: string; game: string; away: string; home: string; awayScore: number | null; homeScore: number | null; status: string | null; period: number | null; clock: string | null; live: boolean }
export type RightsStatus = 'TERMS_REPORTED_TO_PROHIBIT_AUTOMATION' | 'NON_COMMERCIAL_NOTICE_REPORTED' | 'NO_LICENCE_PUBLISHED' | 'LICENSED_TRIAL';
export interface Rights { status: RightsStatus; minIntervalMs: number; note: string }
export interface Extractor { sport: string; rights: Rights; url: (ymd: string) => string; extract: (body: unknown) => Row[]; auth?: { header?: string; query?: string; env: string } }
export const abbr: (sport: string, a: unknown) => string;
export const EXTRACTORS: Record<string, Extractor>;
