export interface Row { sport: string; game: string; away: string; home: string; awayScore: number | null; homeScore: number | null; status: string | null; period: number | null; clock: string | null; live: boolean }
export const abbr: (sport: string, a: unknown) => string;
export const EXTRACTORS: Record<string, { sport: string; url: (ymd: string) => string; extract: (body: unknown) => Row[] }>;
