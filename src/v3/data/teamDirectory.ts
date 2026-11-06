// The favorites picker's teams, from SIFT's committed identity data (nothing fetched, nothing guessed):
//   NFL / NBA / NHL / MLB   the clubs' identity tables (src/lib/nfl.ts, nba.ts, nhlTeams.ts, mlb.ts)
//   NCAAF                   src/lib/cfb-teams.json (contract code -> school) with src/lib/cfb-conferences.json (code -> conference)
//   NCAAB                   every team in src/lib/cbb-teams.json (365), keyed by its abbreviation `a`, which is the publication's participant short_name and so
//                           the id the slate gives the same team (checked against the live board); a game is not needed to follow a team
// A team that is also on the slate takes the slate's own id, so a follow written here is exactly the one the card's star writes.
import { useEffect, useMemo, useState } from 'react';
import { cfbCodes, cfbName, cfbTeam } from '../../lib/cfbTeams';
import { heroTeam } from '../../lib/hero/input';
import { MLB_CLUBS, mlbCode } from '../../lib/mlb';
import { NBA_TEAMS, nbaCode } from '../../lib/nba';
import { NFL_TEAM_NAMES } from '../../lib/nfl';
import { NHL_TEAMS, nhlCode } from '../../lib/nhlTeams';
import { cbbLogo, cbbColors } from '../../lib/cbbTeams';
import { buildLeagues, type LeagueInput, type PickLeague, type PickTeam } from '../model/favorites';
import { CONFERENCE_ORDER, unifyLabel } from '../model/conference';
import type { V3Game, V3Team } from '../model/types';
import { loadConferences, type ConferenceSource } from './conference';

const NFL_ALIAS: Record<string, string> = { JAC: 'JAX', LA: 'LAR', WSH: 'WAS' };
/** The canonical code of a club in its sport, so a directory entry and a slate team are recognised as one. */
const canon: Record<string, (code: string) => string | null> = {
  nfl: (c) => { const u = c.toUpperCase(); return NFL_TEAM_NAMES[NFL_ALIAS[u] ?? u] ? NFL_ALIAS[u] ?? u : null; },
  nba: (c) => nbaCode(c), nhl: (c) => nhlCode(c), mlb: (c) => mlbCode(c),
};

function pick(slug: string, id: string, name: string, conference: string | null): PickTeam {
  const h = heroTeam(slug.toUpperCase(), id, name);
  return { key: `${slug}:${id}`, slug, name: h?.name ?? name, nick: h?.short ?? name, abbr: id, conference, logo: h?.logo ?? null, colors: h?.colors ?? ['#1d2d52', '#3f5079'] };
}
const fromSlate = (t: V3Team): PickTeam => ({ key: `${t.slug}:${t.id}`, slug: t.slug, name: t.name, nick: t.nick, abbr: t.abbr, conference: t.conference ?? null, logo: t.logo, colors: t.colors });

/** The four professional leagues' clubs. */
export function proTeams(): Record<'nfl' | 'nba' | 'nhl' | 'mlb', PickTeam[]> {
  return {
    nfl: Object.entries(NFL_TEAM_NAMES).map(([c, n]) => pick('nfl', c, n, null)),
    nba: NBA_TEAMS.map((t) => pick('nba', t.code, `${t.city} ${t.name}`, null)),
    nhl: NHL_TEAMS.map((t) => pick('nhl', t.code, `${t.city} ${t.name}`, null)),
    mlb: Object.entries(MLB_CLUBS).map(([c, club]) => pick('mlb', c, club.nick, null)),
  };
}

/** NCAAF schools from the identity map, each with the conference the publication states (none when it states none). */
export function cfbTeams(src: ConferenceSource, codes: readonly string[]): PickTeam[] {
  return codes.filter((c) => cfbTeam(c)).map((c) => pick('cfb', c, cfbName(c), src.cfb(c)));
}

/** Every NCAAB team in the committed identity table, as a pickable team under the id the published slate uses for it (the participant short_name). */
export function cbbTeams(rows: readonly { abbr: string | null; name: string; full: string; conference: string | null }[]): PickTeam[] {
  const out: PickTeam[] = [];
  for (const r of rows) {
    if (!r.abbr) continue;
    out.push({ key: `cbb:${r.abbr}`, slug: 'cbb', name: r.name, nick: r.name, abbr: r.abbr, conference: r.conference, logo: cbbLogo(r.abbr), colors: cbbColors(r.abbr) ?? ['#1d2d52', '#3f5079'] });
  }
  return out;
}

/** Everything the picker lists, as leagues: the identity tables plus the teams on the slate (which add sports without a table, and ids a table spells differently). */
export function buildDirectory(o: { games: readonly V3Game[]; cfbCodes: readonly string[]; college: ConferenceSource | null; cbbConferences: readonly { label: string; count: number }[]; cbbRows?: readonly { abbr: string | null; name: string; full: string; conference: string | null }[] }): PickLeague[] {
  const slate = new Map<string, PickTeam[]>();
  for (const g of o.games) for (const t of [g.away, g.home]) slate.set(t.slug, [...(slate.get(t.slug) ?? []), fromSlate(t)]);
  const pro = proTeams();
  const input: LeagueInput[] = [];
  for (const slug of ['nfl', 'nba', 'nhl', 'mlb'] as const) {
    // The slate's id for a club wins over the table's code: "ARI" and "AZ" are one club, and the card's star writes the slate's.
    const onSlate = new Map<string, PickTeam>();
    for (const t of slate.get(slug) ?? []) { const c = canon[slug](t.abbr); if (c) onSlate.set(c, t); }
    const teams = pro[slug].map((t) => { const s = onSlate.get(canon[slug](t.abbr) ?? ''); return s ? { ...t, key: s.key, abbr: s.abbr } : t; });
    input.push({ slug, teams });
  }
  const confs = o.college;
  const cfbSlate = slate.get('cfb') ?? [];
  input.push({ slug: 'cfb', teams: [...(confs ? cfbTeams(confs, o.cfbCodes) : []), ...cfbSlate] });
  input.push({ slug: 'cbb', teams: [...cbbTeams(o.cbbRows ?? []), ...(slate.get('cbb') ?? [])], conferences: o.cbbConferences });
  for (const slug of ['soccer', 'tennis']) if (slate.has(slug)) input.push({ slug, teams: slate.get(slug)! });
  return buildLeagues(input, CONFERENCE_ORDER);
}

type CbbRow = { abbr: string | null; name: string; full: string; conference: string | null };
interface College { src: ConferenceSource; cfbCodes: string[]; cbbConferences: { label: string; count: number }[]; cbbRows: CbbRow[] }
let college: Promise<College> | null = null;
/** The college identity (one lazy read, shared with the Home conference filter): school codes, conference lookups and the NCAAB conference list. */
function loadCollege(): Promise<College> {
  college ??= Promise.all([loadConferences(), import('../../views/cbb/identity')]).then(([src, id]) => {
    const counts = new Map<string, number>();
    const cbbRows: CbbRow[] = [];
    for (const t of id.allTeams()) {
      const l = id.confShort(t.conference);
      const label = l ? unifyLabel(l) : null;
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
      cbbRows.push({ abbr: t.abbr, name: t.name, full: t.full, conference: label });
    }
    return { src, cfbCodes: cfbCodes(), cbbConferences: [...counts].map(([label, count]) => ({ label, count })), cbbRows };
  });
  return college;
}

/** The picker's leagues. Professional leagues are available at once; the college lists (a few hundred schools) arrive a moment later from their lazy chunk. */
export function useDirectory(games: readonly V3Game[]): { leagues: PickLeague[]; collegeReady: boolean } {
  const [c, setC] = useState<College | null>(null);
  useEffect(() => {
    let live = true;
    loadCollege().then((x) => { if (live) setC(x); }, () => { /* the college lists stay empty; leagues still work */ });
    return () => { live = false; };
  }, []);
  const leagues = useMemo(() => buildDirectory({ games, cfbCodes: c?.cfbCodes ?? [], college: c?.src ?? null, cbbConferences: c?.cbbConferences ?? [], cbbRows: c?.cbbRows }), [games, c]);
  return { leagues, collegeReady: !!c };
}
