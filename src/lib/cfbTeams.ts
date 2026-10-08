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

let byEspn: Map<string, string> | null = null;

/** The contract code of an ESPN team id ("66" → "ISU"), from the same identity map. */
export function cfbCodeOfEspn(espnId: string | number | null | undefined): string | null {
  if (espnId == null) return null;
  byEspn ??= new Map(Object.entries(TEAMS).map(([code, t]) => [t.e, code]));
  return byEspn.get(String(espnId)) ?? null;
}

// ------------------------------------------------------------------ the name a reader sees

/**
 * Where the football schedule's name is not the one fans use. Kept tiny on purpose: the schedule name already is the
 * sports-facing one for almost every school ("Iowa State", "Ole Miss", "NC State", "Miami (OH)", "Southern Miss").
 */
const PUBLIC_NAME: Record<string, string> = {
  PENN: 'Penn', // schedule: "Pennsylvania"
  MASS: 'UMass', // schedule: "Massachusetts"
  LIU: 'LIU', // schedule: "Long Island University"
  ALBY: 'Albany', // not in the identity map yet; the publication's own row says only "University"
};

/**
 * A publication name that cannot identify a school on its own: a bare fragment ("St.", "State", "Miss", "Tech",
 * "University"), or a whole matchup in one participant's name ("Albany at Stony Brook").
 */
const FRAGMENT = /^(st\.?|state|miss\.?|tech|u\.?|univ\.?|university|college|a&m|the)$/i;
const MATCHUP_IN_NAME = /\s(at|vs\.?|v\.?|@)\s/i;

/** The publication abbreviates "State" ("Iowa St.", "Southeast Missouri St."): spell it out. "St. Thomas" keeps its saint. */
function expandState(name: string): string {
  return name.replace(/\s+St\.?$/, ' State').replace(/\s+St\.?\s+\(/, ' State (');
}

/**
 * The sports-facing name of a CFB school, from its contract code: "ISU" → "Iowa State", "MISS" → "Ole Miss",
 * "USM" → "Southern Miss", "MOH" → "Miami (OH)", "NCST" → "NC State". Every name in the identity map is unique, so
 * two schools never render the same. A code outside the map falls back to the publication's own name with "St."
 * spelled out; a name that cannot identify a school by itself (a fragment, or a whole matchup in one participant
 * row) is never shown as if it were one: the code stands in, or "TBD" when there is none.
 */
export function cfbName(code: string | null | undefined, published?: string | null): string {
  if (code && PUBLIC_NAME[code]) return PUBLIC_NAME[code];
  const t = cfbTeam(code);
  if (t) return t.n;
  const raw = (published ?? '').trim().replace(/\s+/g, ' ');
  if (raw && !FRAGMENT.test(raw) && !MATCHUP_IN_NAME.test(raw)) return expandState(raw);
  return code || 'TBD';
}

/**
 * Both sides of a CFB matchup, guaranteed distinguishable. With the identity map's unique names this is the two
 * names; if two fallbacks ever collide, each carries its code ("State (ABC)") so the header is never "X at X".
 */
export function cfbMatchupNames(away: { code?: string | null; name?: string | null }, home: { code?: string | null; name?: string | null }): { away: string; home: string } {
  const a = cfbName(away.code, away.name);
  const h = cfbName(home.code, home.name);
  if (a.toLowerCase() !== h.toLowerCase()) return { away: a, home: h };
  return { away: away.code && a !== away.code ? `${a} (${away.code})` : a, home: home.code && h !== home.code ? `${h} (${home.code})` : h };
}

// ------------------------------------------------------------------ one normalization, at the data layer

/** Published name → the name a reader sees, learned from every (code, name) pair this session has read. */
const learned = new Map<string, string>();

/** A published CFB team name without its code: what a coded row taught us, else "St." spelled out. */
export function cfbPublishedName(published: string): string {
  const raw = published.trim().replace(/\s+/g, ' ');
  return learned.get(raw) ?? expandState(raw);
}

const NAME_KEYS = new Set(['display_name', 'opponent_name', 'team_name']);
const MATCHUP_KEYS = new Set(['label', 'title']);

/**
 * Every CFB team name in a publication document, rewritten in place to the name a reader sees (cfbName). Applied
 * once by SportRepo to every CFB document it reads, so no screen can show the publication's "Iowa St." or a
 * fragment of it. Idempotent (a canonical name maps to itself) and limited to team-name fields:
 *   { short_name, display_name }          a participant: by its code (cfbName)
 *   display_name / opponent_name / team_name without a code: the learned or spelled-out name
 *   label / title of the form "A at B"     both halves, the same way
 * Market descriptions (yes_description, …) and every other field are left exactly as published.
 */
export function normalizeCfbNames<T>(doc: T): T {
  const seen = new WeakSet<object>();
  const walk = (x: unknown): void => {
    if (!x || typeof x !== 'object' || seen.has(x)) return;
    seen.add(x);
    if (Array.isArray(x)) {
      for (const v of x) walk(v);
      return;
    }
    const o = x as Record<string, unknown>;
    if (typeof o.display_name === 'string' && typeof o.short_name === 'string' && o.short_name) {
      const name = cfbName(o.short_name, o.display_name);
      const raw = o.display_name.trim();
      // Only a real name is learned: a fragment ("University") says nothing about any other row.
      if (raw && !FRAGMENT.test(raw) && !MATCHUP_IN_NAME.test(raw)) learned.set(raw, name);
      o.display_name = name;
    } else if (typeof o.display_name === 'string' && 'short_name' in o && !o.short_name && (FRAGMENT.test(o.display_name.trim()) || MATCHUP_IN_NAME.test(o.display_name))) {
      // A participant row with no code whose name cannot identify a school (an upstream defect): say so.
      o.display_name = 'TBD';
    }
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string') {
        if (NAME_KEYS.has(k) && !(k === 'display_name' && typeof o.short_name === 'string')) o[k] = cfbPublishedName(v);
        else if (MATCHUP_KEYS.has(k) && / at /.test(v) && v.split(' at ').length === 2) o[k] = v.split(' at ').map(cfbPublishedName).join(' at ');
      } else walk(v);
    }
  };
  walk(doc);
  return doc;
}
