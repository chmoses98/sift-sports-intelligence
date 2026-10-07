// CBB team identity (presentation only): participant id → ESPN id, abbreviation, conference, school colors and
// whether a committed logo exists (scripts/teams/fetch-cbb-teams.mjs; logos under public/teams/cbb/). Loaded
// only by the CBB screens' chunk. Colors are accents — a stroke, a ring, a bar — never a page background, and
// never the only carrier of meaning (names and labels always sit beside them).
import data from '../../lib/cbb-teams.json';

export interface CbbTeamIdentity {
  pid: string;
  espn: number | null;
  abbr: string | null;
  name: string;
  full: string;
  conference: string | null;
  color: string | null;
  alt: string | null;
  logo: string | null;
}

type Raw = { e: number | null; a: string | null; n: string; f: string; cf: string | null; c?: string | null; c2?: string | null; l?: number };
const RAW = (data as { teams: Record<string, Raw> }).teams;
const BASE = import.meta.env.BASE_URL;

export function identity(pid: string | null | undefined): CbbTeamIdentity | null {
  const r = pid ? RAW[pid] : undefined;
  if (!r || !pid) return null;
  return {
    pid, espn: r.e, abbr: r.a, name: r.n, full: r.f, conference: r.cf, color: r.c ?? null, alt: r.c2 ?? null,
    logo: r.l && r.e != null ? `${BASE}teams/cbb/${r.e}.webp` : null,
  };
}

export function allTeams(): CbbTeamIdentity[] {
  return Object.keys(RAW).map((pid) => identity(pid)!);
}

function lum(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

const NEUTRAL = '#6f8aa3';

/** A team color that reads on Sift's near-black canvas: the primary, else the alternate, else a neutral. */
export function accent(t: CbbTeamIdentity | null | undefined): string {
  const cands = [t?.color, t?.alt].filter((c): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c));
  const ok = cands.find((c) => lum(c) >= 0.06 && lum(c) <= 0.85);
  return ok ?? NEUTRAL;
}

/** Two accents for a matchup that stay distinguishable: when both teams' colors are close, the home side
 *  takes its alternate (or a neutral). Identity never rests on color alone — names sit beside every mark. */
export function matchupAccents(away: CbbTeamIdentity | null, home: CbbTeamIdentity | null): [string, string] {
  const a = accent(away);
  let h = accent(home);
  const dist = (x: string, y: string) => {
    const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    const [u, v] = [p(x), p(y)];
    return Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  };
  if (dist(a, h) < 90) {
    const alt = home?.alt && /^#[0-9a-f]{6}$/i.test(home.alt) && lum(home.alt) >= 0.06 && lum(home.alt) <= 0.85 ? home.alt : null;
    h = alt && dist(a, alt) >= 90 ? alt : a === NEUTRAL ? '#c9b37e' : NEUTRAL;
  }
  return [a, h];
}

const CONF_SHORT: Record<string, string> = {
  'Southeastern Conference': 'SEC', 'Atlantic Coast Conference': 'ACC', 'Big Ten Conference': 'Big Ten',
  'Big 12 Conference': 'Big 12', 'Big East Conference': 'Big East', 'Atlantic 10 Conference': 'A-10',
  'West Coast Conference': 'WCC', 'Mountain West Conference': 'Mountain West', 'American Conference': 'American',
  'American Athletic Conference': 'American', 'Missouri Valley Conference': 'MVC', 'Conference USA': 'C-USA',
  'Mid-American Conference': 'MAC', 'Sun Belt Conference': 'Sun Belt', 'Coastal Athletic Association': 'CAA',
  'Atlantic Sun Conference': 'ASUN', 'Big Sky Conference': 'Big Sky', 'Big South Conference': 'Big South',
  'Big West Conference': 'Big West', 'Horizon League': 'Horizon', 'Ivy League': 'Ivy', 'Metro Atlantic Athletic Conference': 'MAAC',
  'Mid-Eastern Athletic Conference': 'MEAC', 'Northeast Conference': 'NEC', 'Ohio Valley Conference': 'OVC',
  'Patriot League': 'Patriot', 'Southern Conference': 'SoCon', 'Southland Conference': 'Southland',
  'Southwestern Athletic Conference': 'SWAC', 'Summit League': 'Summit', 'Western Athletic Conference': 'WAC',
  'America East Conference': 'America East', 'Southwestern Athletic Conf.': 'SWAC', 'Mid-Eastern Athletic Conf.': 'MEAC',
  'The Ivy League': 'Ivy', 'BIG EAST Conference': 'Big East', 'The Summit League': 'Summit', 'Metro Conference': 'Metro', 'United Athletic Conference': 'UAC', 'Pac-12 Conference': 'Pac-12',
};

export function confShort(c: string | null | undefined): string | null {
  if (!c) return null;
  return CONF_SHORT[c] ?? c.replace(/\s+(Athletic\s+)?Conference$/, '');
}
