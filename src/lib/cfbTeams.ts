// CFB team identity: the ONE map from a CFB contract team code (the publication's participant short_name, Kalshi's
// code: "ISU") to its ESPN team id ("66"), name, colors and whether a committed logo exists. Built from the CFB
// publication's own identity-verified game pairs (scripts/teams/fetch-cfb-teams.mjs; logos under
// public/teams/cfb/<espn id>.webp). Nothing here guesses from a display name: an unknown code has no entry.
import data from './cfb-teams.json';
import publicNames from './cfb-public-names.json';

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
 * Where the football schedule's name is not the one fans use (cfb-public-names.json: Penn, UMass, LIU, and Miami (FL)
 * so the two Miamis always carry their state). Kept tiny on
 * purpose: the schedule name already is the sports-facing one for almost every school ("Iowa State", "Ole Miss",
 * "NC State", "Miami (OH)", "Southern Miss", "UAlbany"). The production check reads the same file.
 */
const PUBLIC_NAME: Record<string, string> = (publicNames as unknown as { names: Record<string, string> }).names;

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

/** One school, as SIFT knows it: the canonical name every surface shows, and the ids behind it. */
export interface CfbIdentity {
  /** Contract / Kalshi team code ("ISU"). */
  code: string;
  /** The one public-facing name ("Iowa State"). */
  name: string;
  /** ESPN team id (the logo file name), when the identity map has the school. */
  espnId: string | null;
  /** True when public/teams/cfb/<espnId>.webp is committed. */
  logo: boolean;
  /** The football schedule's name when it differs from `name` ("Massachusetts" for UMass). */
  scheduleName: string | null;
}

/** The identity record for a contract code, or null when the identity map does not have the school. */
export function cfbIdentity(code: string | null | undefined): CfbIdentity | null {
  const t = cfbTeam(code);
  if (!t || !code) return null;
  const name = cfbName(code);
  return { code, name, espnId: t.e, logo: t.l === 1, scheduleName: t.n !== name ? t.n : null };
}

// ------------------------------------------------------------------ names inside text

/**
 * Raw spellings of a school that reach SIFT inside text — Kalshi's market labels ("Utah St. wins 1st Half"), the
 * football schedule's names in Script Engine and research-signals sentences ("Massachusetts controls") — and the
 * canonical name each stands for. Seeded from the identity map (the schedule name of every override, and the
 * "X St." form of every "X State"), and extended by every (code, published name) pair a CFB document carries
 * (`normalizeCfbNames`). Only spellings that DIFFER from the canonical name are kept.
 */
const aliases = new Map<string, string>();
/** Spellings two schools have claimed: never rewritten (a wrong school is worse than a raw one). */
const contested = new Set<string>();
let aliasRe: RegExp | null = null;

/** `known`: the spelling is tied to a code in the identity map, so it is a real school name even when it contains
 * " at " ("University at Albany"); an unknown spelling must not look like a fragment or a whole matchup. */
function addAlias(raw: string, canonical: string, known = false) {
  const r = raw.trim().replace(/\s+/g, ' ');
  if (!r || r === canonical || contested.has(r) || aliases.get(r) === canonical) return;
  if (FRAGMENT.test(r) || (!known && MATCHUP_IN_NAME.test(r))) return;
  if (aliases.has(r)) {
    aliases.delete(r);
    contested.add(r);
  } else aliases.set(r, canonical);
  aliasRe = null;
}

/** Abbreviations Kalshi prints that the "X St." rule cannot derive. */
const EXTRA_ALIASES: Record<string, string> = { 'Miss St.': 'MSST', 'Appalachian St.': 'APP' };

for (const [code, t] of Object.entries(TEAMS)) {
  const name = cfbName(code);
  addAlias(t.n, name, true);
  const st = /^(.+) State$/.exec(t.n);
  if (st) addAlias(`${st[1]} St.`, name, true);
}
for (const [raw, code] of Object.entries(EXTRA_ALIASES)) if (TEAMS[code]) addAlias(raw, cfbName(code), true);

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `text` with every known raw school spelling replaced by its canonical name: "Utah St. wins 1st Half" → "Utah State
 * wins 1st Half", "Massachusetts controls" → "UMass controls". Whole names only (never inside a longer word or a
 * longer school name: "Miami (OH)" is untouched by "Miami (FL)"), longest first. Display-only: callers keep the raw
 * text beside it.
 */
export function cfbDisplayText(text: string): string;
export function cfbDisplayText(text: string | null | undefined): string | null | undefined;
export function cfbDisplayText(text: string | null | undefined): string | null | undefined {
  if (!text || !aliases.size) return text;
  aliasRe ??= new RegExp(`(?<![\\w&'’-])(${[...aliases.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})(?![\\w&-]|\\s\\()`, 'g');
  return text.replace(aliasRe, (m) => aliases.get(m) ?? m);
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

/** Learn a (code, published name) pair: the name it maps to, and the raw spelling as a text alias. */
function learn(code: string, published: string): string {
  const name = cfbName(code, published);
  const raw = published.trim().replace(/\s+/g, ' ');
  const known = !!cfbTeam(code);
  // Only a real name is learned: a fragment ("University") says nothing about any other row, and a code-less-looking
  // matchup string only counts when the code behind it is a school the identity map knows ("University at Albany").
  if (raw && !FRAGMENT.test(raw) && (known || !MATCHUP_IN_NAME.test(raw))) {
    learned.set(raw, name);
    if (known) addAlias(raw, name, true);
  }
  return name;
}

const NAME_KEYS = new Set(['display_name', 'opponent_name', 'team_name']);
/** Free text that can carry a school's name: a market's YES/NO conditions, a title or a label ("Iowa St. at BYU"). */
const TEXT_KEYS = new Set(['yes_description', 'no_description', 'title', 'label']);

/**
 * Every CFB team name in a publication document, rewritten in place to the name a reader sees (cfbName). Applied
 * once by SportRepo to every CFB document it reads (and to CFB health.json), so no screen can show the
 * publication's "Iowa St." or a fragment of it. Two passes: first every coded participant in the document is
 * learned, then names and text are rewritten:
 *   { short_name, display_name }                        a participant: by its code (cfbName)
 *   display_name / opponent_name / team_name, no code   the learned or spelled-out name
 *   yes_description / no_description / title / label    every known raw school spelling inside the text
 *                                                       (cfbDisplayText: "Utah St. wins 1st Half" -> "Utah State …")
 * Whatever is rewritten keeps its published form beside it: `source_display_name` on a participant, and
 * `source_text: { <key>: <published text> }` on any object whose text changed — so a market can always be compared
 * to the publication. Tickers, ids, numbers and every other field are left exactly as published. Idempotent (a
 * canonical name maps to itself; the first published form is the one kept).
 */
export function normalizeCfbNames<T>(doc: T): T {
  const objects: Record<string, unknown>[] = [];
  const seen = new WeakSet<object>();
  const collect = (x: unknown): void => {
    if (!x || typeof x !== 'object' || seen.has(x)) return;
    seen.add(x);
    if (Array.isArray(x)) {
      for (const v of x) collect(v);
      return;
    }
    const o = x as Record<string, unknown>;
    objects.push(o);
    for (const v of Object.values(o)) if (v && typeof v === 'object') collect(v);
  };
  collect(doc);
  // Pass 1: learn every coded participant before any text is read.
  for (const o of objects) {
    if (typeof o.display_name === 'string' && typeof o.short_name === 'string' && o.short_name) learn(o.short_name, String(o.source_display_name ?? o.display_name));
  }
  // Pass 2: rewrite.
  for (const o of objects) {
    const coded = typeof o.short_name === 'string' && !!o.short_name;
    if (typeof o.display_name === 'string') {
      const raw = o.display_name;
      // A participant row with no code whose name cannot identify a school (an upstream defect) says "TBD".
      const unnamed = !coded && 'short_name' in o && (FRAGMENT.test(raw.trim()) || MATCHUP_IN_NAME.test(raw));
      const name = coded ? cfbName(o.short_name as string, String(o.source_display_name ?? raw)) : unnamed ? 'TBD' : cfbPublishedName(raw);
      if (name !== raw) {
        o.source_display_name ??= raw;
        o.display_name = name;
      }
    }
    for (const [k, v] of Object.entries(o)) {
      if (typeof v !== 'string' || k === 'display_name') continue;
      const next = NAME_KEYS.has(k) ? cfbPublishedName(v) : TEXT_KEYS.has(k) ? cfbDisplayText(v) : v;
      if (next !== v) {
        const src = (o.source_text && typeof o.source_text === 'object' ? o.source_text : (o.source_text = {})) as Record<string, string>;
        src[k] ??= v;
        o[k] = next;
      }
    }
  }
  return doc;
}
