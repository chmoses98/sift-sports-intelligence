// CBB team identity by CONTRACT CODE: the publication's participant short_name ("LIB", "HPU") to the committed logo and school colours. The
// identity table (src/lib/cbb-teams.json) is keyed by participant id and carries each team's abbreviation `a`, which is that same short_name
// (checked against the live board: all 363 teams on it match, no abbreviation is shared). Nothing here guesses from a display name: an
// unknown code has no entry, and a team without a committed logo reads as its abbreviation.
import data from './cbb-teams.json';

export interface CbbTeamRow { e: number | null; a: string | null; n: string; f: string; cf: string | null; c?: string | null; c2?: string | null; l?: number }

const TEAMS = (data as unknown as { teams: Record<string, CbbTeamRow> }).teams;
const BY_CODE: Map<string, CbbTeamRow> = new Map(Object.values(TEAMS).filter((t) => t.a).map((t) => [t.a!, t]));

export function cbbTeamByCode(code: string | null | undefined): CbbTeamRow | null {
  return code ? BY_CODE.get(code) ?? null : null;
}

/** The committed logo (public/teams/cbb/<espn id>.webp), or null when none is committed for this code. */
export function cbbLogo(code: string | null | undefined): string | null {
  const t = cbbTeamByCode(code);
  return t?.l && t.e != null ? `${import.meta.env.BASE_URL}teams/cbb/${t.e}.webp` : null;
}

/** The school's published colours, or null when the table states none (the caller keeps its neutral pair). */
export function cbbColors(code: string | null | undefined): [string, string] | null {
  const t = cbbTeamByCode(code);
  return t?.c ? [t.c, t.c2 ?? t.c] : null;
}
