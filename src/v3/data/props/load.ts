// The cross-game prop index. There is no published all-games manifest, so the universe is a client-side join of documents SIFT already
// publishes, read lazily and shared with the rest of the app through the research fetch cache:
//
//   per game in the horizon   event_detail      the contract ladders (one document per game; also what Game Detail reads)
//   per sport                 explorer index    team codes, the published roster (player id to team), which players have a profile
//                                               (already read by the shell's source resolution: a cached read here)
//   NFL only                  history index     gsis id to team and position (the join key the contracts carry)
//   per sport with an         projection feed   the SIFT model lane, resolved through the approval ledger (never for a sport with none)
//   approved model
//
// What is NOT read to draw the first rows, and is read only when a row needs it:
//   availability (OUT, doubtful)  the game's event research document where the game's own document carries none: read for the games
//                                 of the rows on screen (availability.ts); a row says "Checking availability" until it is read
//   opponent rankings             one ranking document per ranked unit, read for the rows that show the chip (ranks.ts)
//   player game logs              History, for rows on screen (bank.ts)
//
// Games are read soonest first, a few at a time, and the universe is PUBLISHED IN PREFIXES: as soon as the soonest games are read the list
// can draw them (Soonest order is exact for a prefix: later games only append). `complete` is false until every game of the horizon is read,
// and the screens say so wherever an order or a count would otherwise read as covering games not yet read.
import type { EventDetailDoc, ExplorerIndexDoc } from '../../../contract/types';
import { forgetJson, RESEARCH_REVALIDATE_MS } from '../../../data/fetcher';
import { SportRepo } from '../../../data/repo';
import { loadAuthority } from '../../../data/projections';
import { resolveSource } from '../../../data/source';
import { sportBySlug } from '../../../data/sports';
import { historyAvailable, historyIndex } from '../../../history/load';
import { nameKey } from '../../../insights/context';
import { CAPABILITIES, isReady } from '../../model/capabilities';
import type { V3Game } from '../../model/types';
import { HORIZON_MS, startsWithin, type Horizon } from './horizon';
import { modelLaneFor, projSportOf, sportHasApprovedModel } from './model';
import { parseGameProps, sidelinedByName, type GameCtx, type IdentityHints } from './parse';
import type { Prop, Universe } from './types';

/** The initial horizon: games starting within 48 hours. */
export const PROP_HORIZON_MS = HORIZON_MS['48h'];

/**
 * The games whose props can belong in a universe: real slate games still to start, in sports that price props, whose board row says at
 * least one market is listed (a game with none cannot carry a player ladder: skipping it costs nothing and is never wrong).
 */
export const eligibleGames = (games: V3Game[]): V3Game[] =>
  games
    .filter((g) => g.phase === 'pregame' && g.provenance === 'publication' && isReady(g.slug, 'propPrices') && (g.item?.markets_available ?? 1) > 0)
    .sort((a, b) => a.startMs - b.startMs);

/** The eligible games that start inside the horizon, soonest first. */
export const propGames = (games: V3Game[], now = Date.now(), horizon: Horizon = '48h'): V3Game[] => eligibleGames(games).filter((g) => startsWithin(g, now, horizon));

export const settle = <T,>(p: Promise<T>): Promise<T | null> => p.then((v) => v, () => null);
const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- memoised reads (expire with the research clock)

interface Memo<T> { at: number; p: Promise<T> }
function memoize<T>(map: Map<string, Memo<T>>, key: string, make: () => Promise<T>): Promise<T> {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at <= RESEARCH_REVALIDATE_MS) return hit.p;
  const e: Memo<T> = { at: Date.now(), p: make() };
  map.set(key, e);
  e.p.catch(() => { if (map.get(key) === e) map.delete(key); });
  return e.p;
}

export interface SportCtx {
  slug: string;
  repo: SportRepo | null;
  index: ExplorerIndexDoc | null;
  hist: Awaited<ReturnType<typeof historyIndex>> | null;
}

const repoMemo = new Map<string, Memo<SportRepo | null>>();
/** The sport's repository (its source resolution is the shell's, already cached). */
export const sportRepo = (slug: string): Promise<SportRepo | null> => memoize(repoMemo, slug, async () => {
  const sport = sportBySlug(slug);
  return sport ? new SportRepo(await resolveSource(sport)) : null;
});

const ctxMemo = new Map<string, Memo<SportCtx>>();
/** The identity documents a prop join needs for one sport: the explorer index and, for football, the history index. */
export const sportContext = (slug: string): Promise<SportCtx> => memoize(ctxMemo, slug, async () => {
  const sport = sportBySlug(slug);
  const repo = await sportRepo(slug);
  if (!sport || !repo) return { slug, repo: null, index: null, hist: null };
  const [index, hist] = await Promise.all([
    repo.hasExplorer ? settle(repo.index()) : Promise.resolve(null),
    historyAvailable(sport.code) ? settle(historyIndex()) : Promise.resolve(null),
  ]);
  return { slug, repo, index, hist };
});

const authMemo = new Map<string, Memo<Awaited<ReturnType<typeof loadAuthority>> | null>>();
const authorityFor = (slug: string) => memoize(authMemo, slug, async () => {
  const code = projSportOf(slug);
  return code && sportHasApprovedModel(slug) ? settle(loadAuthority(code)) : null;
});

/** The identity lookups of a sport (roster to team, which players have a profile, the football history index by name): built once per context, not once per game. */
const baseHints = new WeakMap<SportCtx, Omit<IdentityHints, 'outOf'>>();
function hintsFor(c: SportCtx, injuries: Map<string, string>): IdentityHints {
  let base = baseHints.get(c);
  if (!base) { base = identityHints(c); baseHints.set(c, base); }
  return { ...base, outOf: (name) => injuries.get(nameKey(name)) ?? null };
}

function identityHints(c: SportCtx): Omit<IdentityHints, 'outOf'> {
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
  };
}

// ---------------------------------------------------------------- one game

export interface GameResult {
  eventId: string;
  key: string;
  startMs: number;
  props: Prop[];
  /** "DAL at PHI" when the game's contract document could not be read. */
  unreadable: string | null;
  /** Nothing publishes availability for this game (no own injuries and no research documents in the sport). */
  gap: boolean;
}

const gameMemo = new Map<string, Memo<GameResult>>();
/** Results already read, for a synchronous first render (Back is instant). */
const gameDone = new Map<string, GameResult & { at: number }>();

async function readDetail(repo: SportRepo, g: V3Game, retain: boolean): Promise<EventDetailDoc> {
  const board = await repo.board();
  const row = board.items.find((r) => r.event_id === g.eventId);
  if (!row) throw new Error(`event_detail for ${g.eventId}`);
  const doc = await repo.doc<EventDetailDoc>(row.detail_path);
  // A game beyond the initial horizon is read for its props only: the parsed document (0.1 to 1.3 MB of JSON) is not kept for the session.
  if (!retain) forgetJson(repo.url(row.detail_path));
  return doc;
}

/** One game's props. Memoised per game, so a longer horizon reads only the games it adds and Back re-draws without a request. */
export function loadGame(g: V3Game, now = Date.now()): Promise<GameResult> {
  return memoize(gameMemo, g.key, async () => {
    const label = `${g.away.abbr} at ${g.home.abbr}`;
    const bad = (): GameResult => { const r: GameResult = { eventId: g.eventId, key: g.key, startMs: g.startMs, props: [], unreadable: label, gap: false }; gameDone.set(g.key, { ...r, at: Date.now() }); return r; };
    const repo = await sportRepo(g.slug);
    if (!repo) return bad();
    const retain = g.startMs - now <= PROP_HORIZON_MS;
    const [detail, c, authority] = await Promise.all([settle(readDetail(repo, g, retain)), sportContext(g.slug), authorityFor(g.slug)]);
    if (!detail) return bad();
    // Parsing a 1 MB document is a long task on a phone: let input and paint in first.
    await yieldToMain();
    // Availability: the game's own document when it carries injuries (hockey); otherwise it is read later, for the rows on screen.
    const own = (detail.context as { injuries?: unknown } | null)?.injuries;
    const ownRows = Array.isArray(own) ? (own as { detail?: string | null; player_name?: string | null; status: string }[]) : null;
    const ctx: GameCtx = {
      slug: g.slug, sportLabel: CAPABILITIES[g.slug]?.label ?? g.sport, eventId: g.eventId, key: g.key, startMs: g.startMs, away: g.away, home: g.home,
      awayId: detail.event.away_participant, homeId: detail.event.home_participant, availKnown: !!ownRows, availPending: !ownRows && repo.hasExplorer,
    };
    const props = parseGameProps(ctx, detail.markets, hintsFor(c, sidelinedByName(ownRows))).map((p) => ({ ...p, model: modelLaneFor(p, authority) }));
    const res: GameResult = { eventId: g.eventId, key: g.key, startMs: g.startMs, props, unreadable: null, gap: !ownRows && !repo.hasExplorer };
    gameDone.set(g.key, { ...res, at: Date.now() });
    return res;
  });
}

/**
 * What these games already have in memory, as a publishable state: a synchronous answer for a first render (Back, or a longer horizon whose
 * first games were read for a shorter one). Null when not even the soonest game is held.
 */
export function peekProgress(games: V3Game[]): Progress | null {
  const held = games.map((g) => { const d = gameDone.get(g.key); return d && Date.now() - d.at <= RESEARCH_REVALIDATE_MS ? d : null; });
  const n = publishablePrefix(games.map((g) => g.startMs), held.map((d) => !!d));
  if (n === 0 && games.length > 0) return null;
  return { universe: buildUniverse(held.slice(0, n) as GameResult[], games.length, n === games.length), loaded: n, total: games.length, complete: n === games.length };
}

/** True when any of these games' results is older than the research clock allows (the screen then re-reads them in the background). */
export const anyStale = (games: V3Game[]): boolean => games.some((g) => { const d = gameDone.get(g.key); return !!d && Date.now() - d.at > RESEARCH_REVALIDATE_MS; });

// ---------------------------------------------------------------- the universe, in prefixes

export interface Progress { universe: Universe; loaded: number; total: number; complete: boolean }

/**
 * How many leading games may be published: the longest prefix of read games that does not split a group of games starting at the same
 * instant (their rows interleave in the Soonest order, so a half-read group would reorder later).
 */
export function publishablePrefix(starts: number[], read: boolean[]): number {
  let n = 0;
  while (n < read.length && read[n]) n++;
  if (n === read.length) return n;
  while (n > 0 && starts[n] === starts[n - 1]) n--;
  return n;
}

export function buildUniverse(results: GameResult[], total: number, complete: boolean): Universe {
  const props = results.flatMap((r) => r.props).sort((a, b) => a.startMs - b.startMs || a.name.localeCompare(b.name) || a.fam.localeCompare(b.fam));
  return summarize(props, new Map(), results.filter((r) => r.unreadable).map((r) => r.unreadable!), results.filter((r) => r.gap).length, false, { loaded: results.length, total, complete });
}

export interface LoadOptions {
  signal?: AbortSignal;
  /** Called with each published prefix (and the complete universe). */
  onUpdate?: (p: Progress) => void;
  /** Games read at once (default 3). */
  concurrency?: number;
  /** Publish prefixes as they arrive (default). False: publish only the complete universe (a background refresh must not replace a full list with a partial one). */
  partial?: boolean;
  /** Minimum spacing between published prefixes (default 600 ms); the first and the last are never delayed. */
  throttleMs?: number;
  /** Publish nothing smaller than this many games (a screen already drawing a longer prefix must not shrink while the same games are re-read). */
  minLoaded?: number;
  /** How one game is read (tests inject a fake; the default is `loadGame`). */
  read?: (g: V3Game) => Promise<GameResult>;
}

/** Read the games soonest first and publish prefixes. Resolves with the last published state (or the aborted state). */
export async function loadProgressive(games: V3Game[], o: LoadOptions = {}): Promise<Progress> {
  const total = games.length;
  const read = games.map(() => false);
  const results: (GameResult | null)[] = games.map(() => null);
  const starts = games.map((g) => g.startMs);
  const conc = Math.max(1, o.concurrency ?? 3);
  const partial = o.partial !== false;
  const throttle = o.throttleMs ?? 600;
  let next = 0, published = -1, lastAt = 0, timer: ReturnType<typeof setTimeout> | null = null;
  let last: Progress = { universe: buildUniverse([], total, total === 0), loaded: 0, total, complete: total === 0 };

  const publish = (force = false) => {
    if (o.signal?.aborted) return;
    const n = publishablePrefix(starts, read);
    const complete = n === total;
    if (n === published || (n === 0 && !complete) || (n < (o.minLoaded ?? 0) && !complete)) return;
    if (!partial && !complete) return;
    const wait = lastAt + throttle - Date.now();
    if (!force && !complete && published >= 0 && wait > 0) {
      if (!timer) timer = setTimeout(() => { timer = null; publish(); }, wait);
      return;
    }
    if (timer) { clearTimeout(timer); timer = null; }
    published = n; lastAt = Date.now();
    last = { universe: buildUniverse(results.slice(0, n) as GameResult[], total, complete), loaded: n, total, complete };
    o.onUpdate?.(last);
  };

  const worker = async () => {
    for (;;) {
      if (o.signal?.aborted) return;
      const i = next++;
      if (i >= total) return;
      const r = await settle((o.read ?? loadGame)(games[i]));
      results[i] = r ?? { eventId: games[i].eventId, key: games[i].key, startMs: games[i].startMs, props: [], unreadable: `${games[i].away.abbr} at ${games[i].home.abbr}`, gap: false };
      read[i] = true;
      publish();
    }
  };
  if (total === 0) { o.onUpdate?.(last); return last; }
  await Promise.all(Array.from({ length: Math.min(conc, total) }, worker));
  if (timer) { clearTimeout(timer); timer = null; }
  if (!o.signal?.aborted) publish(true);
  return last;
}

export function summarize(
  props: Prop[], ranks: Universe['ranks'], unreadable: string[], availabilityGaps: number, demo: boolean,
  progress: { loaded: number; total: number; complete: boolean } | null = null,
): Universe {
  const bySport: Record<string, number> = {};
  const byFam: Record<string, number> = {};
  for (const p of props) { bySport[p.slug] = (bySport[p.slug] ?? 0) + 1; byFam[p.fam] = (byFam[p.fam] ?? 0) + 1; }
  const order = Object.keys(CAPABILITIES);
  const sports = Object.keys(bySport).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((slug) => ({ slug, label: CAPABILITIES[slug]?.label ?? slug.toUpperCase(), count: bySport[slug] }));
  const games = new Set(props.map((p) => p.eventId)).size;
  return {
    props, byId: new Map(props.map((p) => [p.id, p])), ranks,
    stats: { games, props: props.length, contracts: props.reduce((n, p) => n + p.rungs.length, 0), bySport, byFam },
    sports, unreadable, availabilityGaps, demo, loadedAt: Date.now(),
    availPendingGames: new Set(props.filter((p) => p.availPending).map((p) => p.eventId)).size,
    gamesLoaded: progress?.loaded ?? games, gamesTotal: progress?.total ?? games, complete: progress?.complete ?? true,
  };
}
