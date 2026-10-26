// The cross-game prop index. There is no published all-games manifest, so the universe is a client-side join of documents SIFT already
// publishes, read lazily and shared with the rest of the app through the research fetch cache:
//
//   per upcoming game   event_detail            the contract ladders (one document per game; also what Game Detail reads)
//   per sport           explorer index          team codes, the published roster (player id to team), which players have a profile
//   NFL only            history index           gsis id to team and position (the join key the contracts carry)
//   where needed        event research          availability (OUT, doubtful) when the game's own document carries none
//   per sport with an   projection feed         the SIFT model lane, resolved through the approval ledger (never for a sport with none)
//   approved model
//   per ranked unit     one ranking document    the opponent chip for the whole league (a team profile is read once for the ranking ids)
//
// No player game log is read here: History is computed lazily from logs for rows on screen (bank.ts). Nothing is hard-coded to a slate,
// a sport or a player: the sports are those the capability table marks as pricing props, the statistics are the families declared in
// families.ts (unknown ones stay price-only).
import type { EventDetailDoc, EventResearchDoc, ExplorerIndexDoc, RankingDoc } from '../../../contract/types';
import { SportRepo } from '../../../data/repo';
import { loadAuthority } from '../../../data/projections';
import { resolveSource } from '../../../data/source';
import { sportBySlug } from '../../../data/sports';
import { historyAvailable, historyIndex } from '../../../history/load';
import { nameKey } from '../../../insights/context';
import { CAPABILITIES, isReady } from '../../model/capabilities';
import type { V3Game } from '../../model/types';
import { buildRankingCatalog } from '../research/normalize';
import { modelLaneFor, projSportOf, sportHasApprovedModel } from './model';
import { parseGameProps, sidelinedByName, type GameCtx, type IdentityHints } from './parse';
import { pickWindow, rankMap } from './rank';
import type { Prop, Universe, UnitRank } from './types';

/** The games whose props belong in the universe: real slate games still to start, in sports that price props. */
export const propGames = (games: V3Game[]): V3Game[] => games.filter((g) => g.phase === 'pregame' && g.provenance === 'publication' && isReady(g.slug, 'propPrices'));

const settle = <T,>(p: Promise<T>): Promise<T | null> => p.then((v) => v, () => null);

interface SportCtx {
  slug: string;
  repo: SportRepo | null;
  index: ExplorerIndexDoc | null;
  hist: Awaited<ReturnType<typeof historyIndex>> | null;
}

function hintsFor(c: SportCtx, injuries: Map<string, string>): IdentityHints {
  const codeById = new Map((c.index?.teams ?? []).map((t) => [t.participant_id, t.short_name ?? '']));
  const teamOf = new Map<string, string>();
  for (const [teamId, players] of Object.entries(c.index?.players_by_team ?? {})) for (const p of players) teamOf.set(p, codeById.get(teamId) ?? '');
  const profiles = new Set(Object.values(c.index?.files ?? {}).filter((f) => f.kind === 'entity_profile' && f.entity_id).map((f) => f.entity_id!));
  const byName = new Map<string, { team: string | null; position: string | null }[]>();
  for (const p of Object.values(c.hist?.players ?? {})) { const k = nameKey(p.name); byName.set(k, [...(byName.get(k) ?? []), { team: p.team, position: p.position }]); }
  const playerResearch = isReady(c.slug, 'playerResearch');
  return {
    teamOfPlayer: (pid) => teamOf.get(pid) || null,
    history: (gsis, name) => {
      const hit = gsis ? c.hist?.players?.[gsis] : null;
      if (hit) return { team: hit.team, position: hit.position };
      const same = byName.get(nameKey(name)) ?? [];
      return same.length === 1 ? same[0] : null;
    },
    hasPlayerPage: (pid) => playerResearch && !!pid && profiles.has(pid),
    outOf: (name) => injuries.get(nameKey(name)) ?? null,
  };
}

async function sportContext(slug: string): Promise<SportCtx> {
  const sport = sportBySlug(slug);
  if (!sport) return { slug, repo: null, index: null, hist: null };
  const repo = new SportRepo(await resolveSource(sport));
  const [index, hist] = await Promise.all([
    repo.hasExplorer ? settle(repo.index()) : Promise.resolve(null),
    historyAvailable(sport.code) ? settle(historyIndex()) : Promise.resolve(null),
  ]);
  return { slug, repo, index, hist };
}

/** The ranking each unit statistic needs, resolved to one league-wide document and read once. */
async function loadRanks(c: SportCtx, metrics: string[]): Promise<Map<string, Map<string, UnitRank>>> {
  const out = new Map<string, Map<string, UnitRank>>();
  if (!c.repo || !c.index || !metrics.length) return out;
  const first = c.index.teams[0]?.participant_id;
  const prof = first ? await settle(c.repo.profile(first)) : null;
  if (!prof) return out;
  const catalog = buildRankingCatalog([prof]);
  const codeById = new Map(c.index.teams.map((t) => [t.participant_id, t.short_name ?? '']));
  await Promise.all(metrics.map(async (metric) => {
    const windows = catalog.windows.get(`met_${c.slug}.${metric}`);
    const w = windows ? pickWindow([...windows.keys()]) : null;
    const id = w ? windows!.get(w) : null;
    if (!id) return;
    const doc: RankingDoc | null = await settle(c.repo!.ranking(id));
    if (doc) out.set(`${c.slug}:${metric}`, rankMap(doc, (eid, short) => codeById.get(eid) || short));
  }));
  return out;
}

export async function loadUniverse(games: V3Game[]): Promise<Universe> {
  const slugs = [...new Set(games.map((g) => g.slug))];
  const ctxs = new Map((await Promise.all(slugs.map(sportContext))).map((c) => [c.slug, c]));
  const authorities = new Map(await Promise.all(slugs.map(async (s) => {
    const code = projSportOf(s);
    return [s, code && sportHasApprovedModel(s) ? await settle(loadAuthority(code)) : null] as const;
  })));
  const unreadable: string[] = [];
  let availabilityGaps = 0;
  const perGame = await Promise.all(games.map(async (g): Promise<Prop[]> => {
    const c = ctxs.get(g.slug)!;
    if (!c.repo) { unreadable.push(`${g.away.abbr} at ${g.home.abbr}`); return []; }
    const detail: EventDetailDoc | null = await settle(c.repo.eventDetail(g.eventId));
    if (!detail) { unreadable.push(`${g.away.abbr} at ${g.home.abbr}`); return []; }
    // Availability: the game's own document when it carries injuries (hockey), else the event research document (football).
    const own = (detail.context as { injuries?: unknown } | null)?.injuries;
    let injuryRows: { detail?: string | null; player_name?: string | null; status: string }[] | null = Array.isArray(own) ? (own as never) : null;
    if (!injuryRows && c.repo.hasExplorer) {
      const r: EventResearchDoc | null = await settle(c.repo.eventResearch(g.eventId));
      injuryRows = r?.context?.injuries ?? null;
    }
    if (!injuryRows) availabilityGaps++;
    const ctx: GameCtx = {
      slug: g.slug, sportLabel: CAPABILITIES[g.slug]?.label ?? g.sport, eventId: g.eventId, key: g.key, startMs: g.startMs, away: g.away, home: g.home,
      awayId: detail.event.away_participant, homeId: detail.event.home_participant, availKnown: !!injuryRows,
    };
    const props = parseGameProps(ctx, detail.markets, hintsFor(c, sidelinedByName(injuryRows)));
    const authority = authorities.get(g.slug) ?? null;
    return props.map((p) => ({ ...p, model: modelLaneFor(p, authority) }));
  }));
  const props = perGame.flat().sort((a, b) => a.startMs - b.startMs || a.name.localeCompare(b.name) || a.fam.localeCompare(b.fam));
  // Opponent rankings: only the units the props on this slate actually use.
  const ranks = new Map<string, Map<string, UnitRank>>();
  await Promise.all(slugs.map(async (s) => {
    const metrics = [...new Set(props.filter((p) => p.slug === s && p.oppUnit).map((p) => p.oppUnit!.metric))];
    for (const [k, v] of await loadRanks(ctxs.get(s)!, metrics)) ranks.set(k, v);
  }));
  return summarize(props, ranks, unreadable, availabilityGaps, false);
}

export function summarize(props: Prop[], ranks: Universe['ranks'], unreadable: string[], availabilityGaps: number, demo: boolean): Universe {
  const bySport: Record<string, number> = {};
  const byFam: Record<string, number> = {};
  for (const p of props) { bySport[p.slug] = (bySport[p.slug] ?? 0) + 1; byFam[p.fam] = (byFam[p.fam] ?? 0) + 1; }
  const order = Object.keys(CAPABILITIES);
  const sports = Object.keys(bySport).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((slug) => ({ slug, label: CAPABILITIES[slug]?.label ?? slug.toUpperCase(), count: bySport[slug] }));
  return {
    props, byId: new Map(props.map((p) => [p.id, p])), ranks,
    stats: { games: new Set(props.map((p) => p.eventId)).size, props: props.length, contracts: props.reduce((n, p) => n + p.rungs.length, 0), bySport, byFam },
    sports, unreadable, availabilityGaps, demo, loadedAt: Date.now(),
  };
}

