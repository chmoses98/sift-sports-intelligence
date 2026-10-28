// What a Prop Discovery fixture family holds, read from the family's own documents, so a spec states its expectation as a property of the capture
// ("a sport whose games have live-quote files", "a player listed OUT who has contracts", "the soonest hockey game") and not as a name or a count
// that only the capture it was written against contains. Everything here reads through the same source as the page (the committed bundle; a
// scratch cache with V3_FEED_CACHE; the network with V3_REAL_FEEDS=live), so a refreshed capture is understood without editing a spec.
import { openBundle, PROP_SPORTS } from '../../scripts/v3-fixtures/lib.mjs';
import { feedClock, feedSource, type FeedFamily } from './feedSource';

export interface FxTeam { id: string; code: string; name: string }
export interface FxGame {
  eventId: string;
  /** Route slug of the sport: nfl, nhl, nba, mlb, cfb, cbb. */
  slug: string;
  /** The publication directory (ends with `/app/latest/`): `${base}event_detail/<id>.json`, `${base}explorer/events/<id>.json`. */
  base: string;
  startMs: number;
  away: FxTeam;
  home: FxTeam;
  /** Markets the board row lists. */
  markets: number;
  /** The live-quote file the feed published for this game in the capture, or null (the app asks for it, gets a 404 and prints "—"). */
  quoteFile: string | null;
  /** Markets in that file that carry a yes ask (a price the list may print while the observation is current). */
  quotedAsks: number;
}

const QUOTE_FILE = /^https:\/\/raw\.githubusercontent\.com\/chmoses98\/sift-sports-intelligence\/live-quotes\/games\/[^/]+\.json$/;
export const HOUR = 3600_000;
export const HORIZON_HOURS = { '48h': 48, '7d': 168, all: Infinity } as const;

/** The same key the app joins names with (src/insights/context.ts `nameKey`). */
export const nameKey = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');

interface BoardDoc { items: { event_id: string; start_time_utc: string; markets_available?: number; detail_path: string; away_participant: string; home_participant: string; participants: { participant_id: string; short_name: string; display_name: string }[] }[] }
interface QuoteDoc { event_ids?: string[]; markets: { status?: string; yes_ask_dollars?: string | number }[] }

const cache = new Map<string, Promise<FxGame[]>>();

/**
 * Every game of the family that had not started at the family's clock and lists at least one market (the games Prop Discovery may read), soonest
 * first, with what the capture holds for its live quotes. Memoised per family and clock for the process.
 */
export function fixtureGames(family: FeedFamily, o: { live?: boolean } = {}): Promise<FxGame[]> {
  const clock = feedClock(family, o.live);
  const key = `${family}|${clock}|${process.env.V3_FEED_CACHE ?? ''}|${o.live ? 'live' : ''}`;
  if (!cache.has(key)) cache.set(key, read(family, clock, o));
  return cache.get(key)!;
}

async function read(family: FeedFamily, clock: string, o: { live?: boolean }): Promise<FxGame[]> {
  const src = feedSource(family, o);
  const t0 = Date.parse(clock);
  // The publication directories are the ones the committed family holds (they do not change with a capture); the documents are the source's.
  const bases = openBundle().family(family).urls
    .map((u) => /^(https:\/\/raw\.githubusercontent\.com\/chmoses98\/([^/]+)\/.+\/)board\.json$/.exec(u))
    .filter((m): m is RegExpExecArray => !!m && !!PROP_SPORTS[m[2]])
    .map((m) => ({ base: m[1], slug: PROP_SPORTS[m[2]] }));
  const quotes = new Map<string, { file: string; asks: number }>();
  for (const url of src.urls().filter((u) => QUOTE_FILE.test(u))) {
    const d = await src.get(url);
    if (!d) continue;
    const doc = JSON.parse(d.body.toString('utf8')) as QuoteDoc;
    const asks = doc.markets.filter((m) => { const a = Number(m.yes_ask_dollars); return a > 0 && a < 1 && /^(active|open)$/i.test(m.status ?? 'active'); }).length;
    for (const e of doc.event_ids ?? []) quotes.set(e, { file: url, asks });
  }
  const out: FxGame[] = [];
  for (const { base, slug } of bases) {
    const b = await src.get(`${base}board.json`);
    if (!b) continue;
    for (const it of (JSON.parse(b.body.toString('utf8')) as BoardDoc).items) {
      const startMs = Date.parse(it.start_time_utc);
      if (!(startMs > t0) || !((it.markets_available ?? 1) > 0)) continue;
      const team = (id: string): FxTeam => { const p = it.participants.find((x) => x.participant_id === id); return { id, code: p?.short_name ?? '', name: p?.display_name ?? '' }; };
      const q = quotes.get(it.event_id);
      out.push({ eventId: it.event_id, slug, base, startMs, away: team(it.away_participant), home: team(it.home_participant), markets: it.markets_available ?? 0, quoteFile: q?.file ?? null, quotedAsks: q?.asks ?? 0 });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** The games that start within a horizon of the family's clock (the same rule as the app's horizon control). */
export const within = (games: FxGame[], family: FeedFamily, h: keyof typeof HORIZON_HOURS): FxGame[] => {
  const t0 = Date.parse(feedClock(family));
  return games.filter((g) => g.startMs - t0 <= HORIZON_HOURS[h] * HOUR);
};

/** True when the capture holds a live-quote file with asks for the game: its contracts can print a price. */
export const isPriced = (g: FxGame) => g.quoteFile != null && g.quotedAsks > 0;

/** The sports (route slugs) with at least one priced game inside the horizon, soonest first. */
export const pricedSports = (games: FxGame[], family: FeedFamily, h: keyof typeof HORIZON_HOURS = '48h'): string[] => [...new Set(within(games, family, h).filter(isPriced).map((g) => g.slug))];
/** The sports with at least one game inside the horizon that has no priced contract. */
export const unpricedSports = (games: FxGame[], family: FeedFamily, h: keyof typeof HORIZON_HOURS = '48h'): string[] => [...new Set(within(games, family, h).filter((g) => !isPriced(g)).map((g) => g.slug))];

/**
 * A player the sport's availability document (the game's event research document) lists OUT and for whom the game's contract document has a
 * player ladder, in a game that starts inside the horizon: the case Prop Discovery's "Checking availability" and "Hide out" are about.
 */
export async function outPlayerWithContracts(family: FeedFamily, slug: string, h: keyof typeof HORIZON_HOURS = '48h'): Promise<{ name: string; game: FxGame } | null> {
  const src = feedSource(family);
  for (const g of within(await fixtureGames(family), family, h).filter((x) => x.slug === slug)) {
    const research = await src.get(`${g.base}explorer/events/${g.eventId}.json`);
    const detail = await src.get(`${g.base}event_detail/${g.eventId}.json`);
    if (!research || !detail) continue;
    const injuries = (JSON.parse(research.body.toString('utf8')) as { context?: { injuries?: { detail?: string; player_name?: string; status: string }[] } }).context?.injuries ?? [];
    const names = new Map((JSON.parse(detail.body.toString('utf8')) as { markets: { extensions?: { player_display_name?: string; entity_name?: string } }[] }).markets
      .map((m) => m.extensions?.player_display_name ?? m.extensions?.entity_name).filter((n): n is string => !!n).map((n) => [nameKey(n), n]));
    for (const r of injuries) {
      if ((r.status ?? '').toUpperCase() !== 'OUT') continue;
      const key = nameKey(r.player_name ?? /^(.+?) \(/.exec(r.detail ?? '')?.[1]);
      if (key && names.has(key)) return { name: names.get(key)!, game: g };
    }
  }
  return null;
}

/** The start the sport's league schedule (the explorer index) lists for the game, as an epoch, or null when the index does not list it. */
export async function scheduleStartMs(family: FeedFamily, g: FxGame): Promise<number | null> {
  const d = await feedSource(family).get(`${g.base}explorer/index.json`);
  if (!d) return null;
  const e = (JSON.parse(d.body.toString('utf8')) as { events?: { event_id: string; start_time_utc: string }[] }).events?.find((x) => x.event_id === g.eventId);
  return e ? Date.parse(e.start_time_utc) : null;
}

/** The last word of a club's name ("Calgary Flames" -> "Flames"): what a Games card prints to find it by. */
export const nickname = (t: FxTeam) => t.name.split(/\s+/).pop() ?? t.name;
