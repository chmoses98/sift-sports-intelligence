// Every published document SIFT 3.0 CONSUMES is validated before anything uses it. The source decision no longer reads the explorer index (a HEAD
// existence probe, src/data/source.ts), so "the document exists" proves nothing about its content: each document is checked HERE, at the one point every
// reader passes through (`getJson`, which calls `validateDocument` while SIFT 3.0 is mounted: src/v3/data/early.ts `applyV3FetchBounds`).
//
// A guard checks, for ONE kind of document, exactly what its readers dereference: the publication's `schema_version` (and `kind`), the required fields and
// their types, the shape of every array a reader walks, and numeric sanity (a price is a probability, a rank is a positive whole number, a percentile is
// 0 to 100, a timestamp parses). It is dependency-free, typed (the narrowed document comes back), cheap (one pass over scalars; no deep walk into
// objects no reader opens), and FAIL-CLOSED: a document that does not pass is never memoised, never rendered in part and never repaired. The reader gets
//   * SchemaVersionError       a `schema_version` other than the supported one, or none: "it is in a format this version of SIFT cannot read" (no Retry);
//   * DocumentInvalidError     anything else wrong with it: "what was published could not be read" (Retry, a file can be caught mid-update).
// (src/v3/data/failure.ts words both; the screens' DataState shows them with Retry where asking again can help.)
//
// Documents that are not `edge_finder.app.v1` publications carry their own contract and are validated by their own strict decoders, which return null for
// anything unrecognised (a "not published" state): the projection feed and its distributions (src/lib/projections.ts decodeProjections / decodeDistributions /
// decodeSummary / decodeScorecard), the live-quote feed (src/live/providers/feed.ts: schema + markets array, each market through normalizeKalshiMarket, then
// `guardLiveQuote` below at the point a v3 price is made) and the score feed (data/scoreVerify.ts). The same-origin history layer (player game logs, team
// history, the league schedule) is guarded below.
import { DocumentInvalidError, SchemaVersionError } from '../../data/fetcher';
import type {
  BoardDoc, EntityProfileDoc, EventDetailDoc, EventResearchDoc, ExplorerIndexDoc, HealthDoc, ItemsDoc, MetricRegistryDoc, RankingDoc, Recommendation, SearchIndexDoc, SeriesDoc, Thesis,
} from '../../contract/types';
import { SCHEMA_VERSION } from '../../contract/types';
import type { LeagueScheduleDoc } from '../../history/league';
import type { HistoryIndexDoc, PlayerHistoryDoc, TeamHistoryDoc } from '../../history/types';
import type { LiveQuote } from '../../live/types';

// ---------------------------------------------------------------------------------------------------------------- results

export type Verdict<T> = { ok: true; doc: T } | { ok: false; reason: string; /** The publication is a version/format this SIFT does not read (no Retry). */ unsupported?: true; found?: unknown };

// ---------------------------------------------------------------------------------------------------------------- the small spec language

/** A spec returns null when the value is fine, else [path inside the value, what is wrong]. */
type Spec = (v: unknown) => readonly [string, string] | null;

const show = (v: unknown): string => {
  if (v === undefined) return 'nothing (missing)';
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  if (typeof v === 'string') return `the text ${JSON.stringify(v.length > 24 ? `${v.slice(0, 24)}…` : v)}`;
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : String(v);
  return typeof v === 'object' ? 'an object' : `a ${typeof v}`;
};
const bad = (want: string, v: unknown): readonly [string, string] => ['', `expected ${want}, got ${show(v)}`];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is string => typeof v === 'string' && v.length >= 8 && Number.isFinite(Date.parse(v));

const str: Spec = (v) => (typeof v === 'string' && v.length > 0 ? null : bad('a non-empty text', v));
/** Text that may be empty (a label the publication leaves blank). */
const text: Spec = (v) => (typeof v === 'string' ? null : bad('text', v));
const num: Spec = (v) => (typeof v === 'number' && Number.isFinite(v) ? null : bad('a number', v));
const bool: Spec = (v) => (typeof v === 'boolean' ? null : bad('true or false', v));
const time: Spec = (v) => (isTime(v) ? null : bad('a timestamp', v));
const any: Spec = () => null;

/** A number inside [min, max] (and a whole number when `whole`). */
const numIn = (min: number, max: number, whole = false): Spec => (v) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!whole || Number.isInteger(v)) ? null : bad(`${whole ? 'a whole number' : 'a number'} from ${min} to ${max === Infinity ? 'any size' : max}`, v);

/** null or missing is allowed (a reader treats the two alike). */
const opt = (s: Spec): Spec => (v) => (v === undefined || v === null ? null : s(v));
/** Missing is allowed; null is not. */
const maybe = (s: Spec): Spec => (v) => (v === undefined ? null : s(v));

/** Every element passes `item`. `min` rejects an empty list. */
const arr = (item: Spec, min = 0): Spec => (v) => {
  if (!Array.isArray(v)) return bad('a list', v);
  if (v.length < min) return ['', `expected at least ${min} ${min === 1 ? 'entry' : 'entries'}, got an empty list`];
  for (let i = 0; i < v.length; i++) {
    const e = item(v[i]);
    if (e) return [`[${i}]${e[0]}`, e[1]];
  }
  return null;
};
/** A list we only need to BE a list (its entries are not read by a screen). */
const list: Spec = (v) => (Array.isArray(v) ? null : bad('a list', v));

const obj = (shape: Record<string, Spec>): Spec => (v) => {
  if (!isObj(v)) return bad('an object', v);
  for (const k in shape) {
    const e = shape[k](v[k]);
    if (e) return [`.${k}${e[0]}`, e[1]];
  }
  return null;
};
/** An object (or null/missing) with this shape when present. */
const nobj = (shape: Record<string, Spec>): Spec => opt(obj(shape));
/** An object whose every value passes `value`. */
const rec = (value: Spec, nonEmpty = false): Spec => (v) => {
  if (!isObj(v)) return bad('an object', v);
  if (nonEmpty && Object.keys(v).length === 0) return ['', 'expected at least 1 entry, got an empty object'];
  for (const k in v) {
    const e = value(v[k]);
    if (e) return [`[${JSON.stringify(k)}]${e[0]}`, e[1]];
  }
  return null;
};

// ---------------------------------------------------------------------------------------------------------------- documents

/** One document guard: the publication's own version and kind first, then the shape. */
function document<T>(kind: string, shape: Record<string, Spec>, o: { versioned?: boolean } = {}): (doc: unknown) => Verdict<T> {
  const body = obj(shape);
  return (doc) => {
    if (!isObj(doc)) return { ok: false, reason: `a ${kind} document must be an object, got ${show(doc)}` };
    if (o.versioned !== false && doc.schema_version !== SCHEMA_VERSION) {
      return { ok: false, unsupported: true, found: doc.schema_version, reason: `${kind}: schema_version is ${show(doc.schema_version)}, this version of SIFT reads ${JSON.stringify(SCHEMA_VERSION)}` };
    }
    if (doc.kind !== kind) return { ok: false, reason: `kind: expected ${JSON.stringify(kind)}, got ${show(doc.kind)}` };
    const e = body(doc);
    return e ? { ok: false, reason: `${kind}${e[0]}: ${e[1]}` } : { ok: true, doc: doc as T };
  };
}

const prob = numIn(0, 1);
const pct = numIn(0, 100);
const count = numIn(0, Infinity);
const rank1 = numIn(1, Infinity, true);

// Shared pieces ------------------------------------------------------------------------------------------------------

const participantRef = obj({ participant_id: str, display_name: str });
const windowSpec = obj({ label: str });
const qualitySpec = nobj({ limitations: maybe(arr(text)) });

const observation = obj({
  metric_id: str,
  value: opt(num), adjusted_value: opt(num), sample_size: opt(count), unit: opt(text), display_value: opt(text),
  as_of: time,
  window: windowSpec,
  split: opt(obj({ dimension: text, value: text })),
  context: nobj({
    rank: opt(rank1), universe_size: opt(numIn(1, Infinity, true)), percentile: opt(pct), ranking_id: opt(text), universe_label: opt(text), higher_is_better: opt(bool),
  }),
});

const market = obj({
  kalshi_ticker: str,
  market_family: str,
  yes_description: text,
  yes_bid: opt(prob), yes_ask: opt(prob), market_probability: opt(prob),
  volume: opt(count),
  market_status: maybe(text),
  captured_at: opt(time),
  participant_id: opt(text), player_id: opt(text), period: opt(text),
  line: opt(num), threshold: opt(num),
  extensions: opt(any),
});

const eventBlock = obj({
  event_id: str, start_time_utc: time, status: str,
  home_participant: opt(text), away_participant: opt(text),
  participants: arr(participantRef),
});

const availabilityRow = obj({ status: str, detail: opt(text), as_of: opt(text), event_id: opt(text), source: opt(text) });
const profileRef = obj({ participant_id: str, display_name: str, role: opt(text) });

// ---------------------------------------------------------------------------------------------------------------- the guards

export const guardHealth = document<HealthDoc>('health', {
  sport: str, generated_at: time, overall_status: str, freshness_status: str,
  components: rec(obj({ status: str })),
  errors: arr(text),
  last_market_capture: opt(text),
});

export const guardBoard = document<BoardDoc>('board', {
  sport: str, generated_at: time, overall_status: str,
  items: arr(obj({
    event_id: str, status: str, start_time_utc: time, detail_path: str,
    league: opt(text), competition: opt(text),
    home_participant: opt(text), away_participant: opt(text),
    participants: arr(participantRef),
    data_freshness: opt(text),
    market_captured_at: opt(text),
    markets_available: opt(count), markets_priced: opt(count), recommendations_count: opt(count), wagers_count: opt(count),
  })),
});

const recommendation = obj({ recommendation_id: str, market_id: str, event_id: opt(text), selection: text, status: str, research_only: maybe(bool), fair_probability: opt(prob), bet_up_to_price: opt(prob) });
export const guardRecommendations = document<ItemsDoc<Recommendation>>('recommendations', { sport: str, generated_at: time, items: arr(recommendation) });

const thesis = obj({ thesis_id: str, event_id: str, summary: opt(text), supporting_factors: arr(text), opposing_factors: arr(text) });
export const guardTheses = document<ItemsDoc<Thesis>>('theses', { sport: str, generated_at: time, items: arr(thesis) });

export const guardEventDetail = document<EventDetailDoc>('event_detail', {
  sport: str, generated_at: time,
  event: eventBlock,
  data_freshness: opt(text),
  markets: arr(market),
  model_prices: list,
  recommendations: list,
  theses: list,
  context: opt(any),
});

export const guardExplorerIndex = document<ExplorerIndexDoc>('explorer_index', {
  sport: str, generated_at: time, as_of: time,
  metrics_path: str, search_index_path: str, capabilities_path: opt(text),
  // the file table is how every entity document is found (SportRepo.pathFor): an index with no files names nothing. A sport may publish no teams (tennis).
  files: rec(obj({ kind: str, entity_id: opt(text) }), true),
  teams: arr(obj({ participant_id: str, display_name: str, short_name: opt(text), path: str })),
  players_by_team: rec(arr(str)),
  events: arr(obj({ event_id: str, path: text, start_time_utc: time, status: str, home_participant: opt(text), away_participant: opt(text), participants: arr(text) })),
  windows: list,
  quality: qualitySpec,
});

export const guardMetricRegistry = document<MetricRegistryDoc>('metric_registry', {
  sport: str, generated_at: time,
  items: arr(obj({
    metric_id: str, name: str, entity_type: str, category: text,
    short_name: opt(text), description: opt(text), unit: opt(text), higher_is_better: opt(bool),
    known_limitations: maybe(arr(text)), related_metrics: maybe(arr(text)),
  })),
});

export const guardSearchIndex = document<SearchIndexDoc>('search_index', {
  sport: str, generated_at: time,
  items: arr(obj({
    id: str, kind: str, label: str, secondary: opt(text), path: text, sport: opt(text),
    aliases: arr(text), tokens: arr(text),
    context: nobj({ league: opt(text), position: opt(text), season: opt(text), team: opt(text) }),
  })),
});

/** The `game_log` a player profile may carry in `extensions` (box-score columns and rows; src/history/boxLog.ts reads it). */
const gameLog = nobj({ columns: arr(text, 1), rows: arr(list) });

export const guardEntityProfile = document<EntityProfileDoc>('entity_profile', {
  sport: str, generated_at: time,
  entity_type: str,
  entity: obj({ participant_id: str, display_name: str, short_name: opt(text) }),
  season: opt(text),
  team: opt(obj({ participant_id: str, display_name: text, short_name: opt(text) })),
  metrics: arr(observation),
  games: arr(obj({
    event_id: str, start_time_utc: time, status: str,
    competition: opt(text), home_away: opt(text), opponent_id: opt(text), opponent_name: opt(text),
    result: nobj({ for: opt(num), against: opt(num), outcome: opt(text) }),
  })),
  availability: arr(availabilityRow),
  players: arr(profileRef),
  opponents: maybe(list),
  series: arr(obj({ series_id: str, metric_id: str })),
  rankings: arr(obj({ ranking_id: str, metric_id: str, window_label: str })),
  quality: qualitySpec,
  extensions: nobj({ game_log: opt(gameLog) }),
});
export const guardRanking = document<RankingDoc>('ranking', {
  sport: str, generated_at: time,
  ranking_id: str, metric_id: str, as_of: time, higher_is_better: opt(bool),
  entries: arr(obj({
    rank: rank1, entity_id: str, display_name: str, short_name: opt(text),
    value: opt(num), adjusted_value: opt(num), sample_size: opt(count), percentile: opt(pct),
  }), 1),
  summary: obj({ mean: opt(num), median: opt(num), min: opt(num), max: opt(num), stdev: opt(num) }),
  universe: obj({ label: text, size: numIn(1, Infinity, true), season: opt(text) }),
  window: windowSpec,
  quality: qualitySpec,
});

export const guardSeries = document<SeriesDoc>('time_series', {
  sport: str, generated_at: time,
  series_id: str, metric_id: str, entity_id: str, x_axis: str, as_of: time, unit: opt(text),
  points: arr(obj({ x: str, t: text, value: opt(num), adjusted_value: opt(num), rolling_value: opt(num), sample_size: opt(count), event_id: opt(text), opponent_id: opt(text) }), 1),
  quality: qualitySpec,
});

export const guardEventResearch = document<EventResearchDoc>('event_research', {
  sport: str, generated_at: time,
  event: eventBlock,
  participants: arr(profileRef),
  players: arr(profileRef),
  matchup: opt(arr(obj({ metric_id: str, name: text, home: opt(observation), away: opt(observation) }))),
  distributions: list, projections: list, markets: list,
  context: opt(obj({ injuries: maybe(arr(availabilityRow)), lineups: maybe(list), notes: maybe(arr(text)) })),
  quality: qualitySpec,
});

/** The bundled saved copy's provenance (public/data/nfl/SNAPSHOT.json), shown on the "saved copy" notice. Not an edge_finder publication: no schema_version. */
export const guardSnapshotInfo = document<{ reason: string; run_id: string; explorer_built_at: string }>('sift_data_snapshot', {
  run_id: str, explorer_built_at: time, reason: text,
}, { versioned: false });

// Same-origin history layer (scripts/history/*, public/data): each file names its own `kind` -----------------------------

const gameRow = obj({ week: num, game_id: str, season_type: text, date: opt(text), team: str, opp: str, rushing: obj({}), receiving: obj({}) });
export const guardPlayerHistory = document<PlayerHistoryDoc>('sift_player_history', { gsis: str, season: num, name: text, position: text, team: text, games: arr(gameRow) }, { versioned: false });
export const guardHistoryIndex = document<HistoryIndexDoc>('sift_history_index', { sport: str, season: num, built_at: time, players: rec(obj({ name: text, team: text, position: text })) }, { versioned: false });
export const guardTeamHistory = document<TeamHistoryDoc>('sift_team_history', { sport: str, season: num, teams: rec(obj({ team: str, weeks: arr(obj({ week: num, game_id: str, opp: str })) })) }, { versioned: false });
export const guardLeagueSchedule = document<LeagueScheduleDoc>('sift_league_schedule', {
  sport: str, season: num, built_at: time,
  games: arr(obj({ id: str, away: str, home: str, week: opt(num), date: opt(text), away_score: opt(numIn(0, 300, true)), home_score: opt(numIn(0, 300, true)), spread_line: opt(num), total_line: opt(num) })),
}, { versioned: false });

// ---------------------------------------------------------------------------------------------------------------- the live quote, at the point a v3 price is made

/**
 * A normalised live quote (src/live/normalize.ts) is usable for a v3 price only if its numbers are what a price is: dollars between 0 and 1, a volume that
 * is not negative, an observation time that parses. Anything else is not a price (the surface prints "—"), never a repaired one.
 */
export function guardLiveQuote(q: LiveQuote | null | undefined): Verdict<LiveQuote> {
  if (!q) return { ok: false, reason: 'no quote' };
  const e = obj({
    ticker: str, observedAt: time,
    yesAsk: opt(prob), yesBid: opt(prob), noAsk: opt(prob), noBid: opt(prob), lastPrice: opt(prob),
    volume: opt(count), openInterest: opt(count),
    rawStatus: opt(text), availability: opt(text),
  })(q);
  return e ? { ok: false, reason: `quote${e[0]}: ${e[1]}` } : { ok: true, doc: q };
}

// ---------------------------------------------------------------------------------------------------------------- inventory and the seam

export type DocKind =
  | 'health' | 'board' | 'recommendations' | 'theses' | 'event_detail'
  | 'explorer_index' | 'metric_registry' | 'search_index' | 'entity_profile' | 'ranking' | 'time_series' | 'event_research'
  | 'snapshot' | 'player_history' | 'history_index' | 'team_history' | 'league_schedule';

/** The guard of each kind of document SIFT 3.0 consumes through `getJson`. */
export const GUARDS: Record<DocKind, (doc: unknown) => Verdict<unknown>> = {
  health: guardHealth, board: guardBoard, recommendations: guardRecommendations, theses: guardTheses, event_detail: guardEventDetail,
  explorer_index: guardExplorerIndex, metric_registry: guardMetricRegistry, search_index: guardSearchIndex, entity_profile: guardEntityProfile,
  ranking: guardRanking, time_series: guardSeries, event_research: guardEventResearch,
  snapshot: guardSnapshotInfo, player_history: guardPlayerHistory, history_index: guardHistoryIndex, team_history: guardTeamHistory, league_schedule: guardLeagueSchedule,
};

const TAILS: [RegExp, DocKind][] = [
  [/\/event_detail\/[^/]+\.json$/, 'event_detail'],
  [/\/explorer\/index\.json$/, 'explorer_index'],
  [/\/explorer\/metrics\.json$/, 'metric_registry'],
  [/\/explorer\/search_index\.json$/, 'search_index'],
  [/\/explorer\/(teams|players)\/[^/]+\.json$/, 'entity_profile'],
  [/\/explorer\/rankings\/[^/]+\.json$/, 'ranking'],
  [/\/explorer\/series\/[^/]+\.json$/, 'time_series'],
  [/\/explorer\/events\/[^/]+\.json$/, 'event_research'],
  [/\/history\/players\/[^/]+\.json$/, 'player_history'],
  [/\/history\/index\.json$/, 'history_index'],
  [/\/history\/teams\.json$/, 'team_history'],
  [/\/league\/[a-z]+\/schedule\.json$/, 'league_schedule'],
  [/\/SNAPSHOT\.json$/, 'snapshot'],
  [/\/health\.json$/, 'health'],
  [/\/board\.json$/, 'board'],
  [/\/recommendations\.json$/, 'recommendations'],
  [/\/theses\.json$/, 'theses'],
];

/** Which kind of document a URL names, or null for a URL SIFT 3.0 does not validate here (decoders own it: projections, signals, the quote and score feeds). */
export function kindOfUrl(url: string): DocKind | null {
  const path = url.split(/[?#]/, 1)[0];
  for (const [re, k] of TAILS) if (re.test(path)) return k;
  return null;
}

/** Validate a document by its address. Returns null for a URL that has no guard here. */
export function validateByUrl(url: string, doc: unknown): { kind: DocKind; verdict: Verdict<unknown> } | null {
  const kind = kindOfUrl(url);
  return kind ? { kind, verdict: GUARDS[kind](doc) } : null;
}

/**
 * The seam `getJson` calls (src/data/fetcher.ts `setDocumentValidator`) while SIFT 3.0 is mounted: throws the error the reader's failure wording
 * understands, so the document is never memoised and the screen shows its unavailable state.
 */
export function validateDocument(url: string, doc: unknown): void {
  const r = validateByUrl(url, doc);
  if (!r || r.verdict.ok) return;
  if (r.verdict.unsupported) throw new SchemaVersionError(url, r.verdict.found);
  throw new DocumentInvalidError(url, r.kind, r.verdict.reason);
}
