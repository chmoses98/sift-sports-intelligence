// CFB team identity: the ONE map from a CFB contract team code (the publication's participant short_name, Kalshi's
// code: "ISU") to its ESPN team id ("66"), name, colors and whether a committed logo exists. Built from the CFB
// publication's own identity-verified game pairs (scripts/teams/fetch-cfb-teams.mjs; logos under
// public/teams/cfb/<espn id>.webp). Nothing here guesses from a display name: an unknown code has no entry.
import data from './cfb-teams.json';

export interface CfbTeam {
  /** ESPN team id (the logo file name). */
  e: string;
  /** The football schedule's team name. */
  n: string;
  /** 1 when public/teams/cfb/<e>.webp is committed. */
  l: 0 | 1;
  c?: string | null;
  c2?: string | null;
}

const TEAMS = (data as unknown as { teams: Record<string, CfbTeam> }).teams;

export function cfbTeam(code: string | null | undefined): CfbTeam | null {
  return code ? TEAMS[code] ?? null : null;
}
