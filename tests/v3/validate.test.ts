// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- real published documents are walked and edited untyped */
// Every document SIFT 3.0 consumes is validated before anything uses it (src/v3/data/validate.ts). Evidence:
//   1. every REAL captured document (fixtures/real, all five families) passes its guard, and nothing the guards own is left unclassified;
//   2. every other committed document of a guarded kind (tests/, e2e/, public/data) passes, except the named hand-trimmed test inputs;
//   3. table-driven malformed variants of a real document of each kind: a missing field, a wrong type, an empty list, a bad number, a schema_version bump;
//   4. the seam (`getJson` with the validator on): a rejected document is never memoised, the error words are the screens' (data/failure.ts);
//   5. the documents with their own strict decoders (projections, distributions, the live-quote feed) and the live quote guard;
//   6. what the guards cost on the largest real documents.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openBundle } from '../../scripts/v3-fixtures/lib.mjs';
import { DocumentInvalidError, getJson, NotFoundError, SchemaVersionError, setDocumentValidator, setFetchJson } from '../../src/data/fetcher';
import { normalizeKalshiMarket } from '../../src/live/normalize';
import { decodeDistributions, decodeProjections } from '../../src/lib/projections';
import { canRetry, failureKind, whyUnavailable } from '../../src/v3/data/failure';
import { GUARDS, guardLiveQuote, kindOfUrl, validateByUrl, validateDocument, type DocKind } from '../../src/v3/data/validate';

// ------------------------------------------------------------------------------------------------------------ the committed documents

const bundle = openBundle();
const FAMILIES = ['stat', 'team', 'game', 'player', 'props'] as const;
interface Doc { family: string; url: string; json: any; bytes: number }

function realDocs(): Doc[] {
  const out: Doc[] = [];
  const seen = new Set<string>();
  for (const f of FAMILIES) {
    const fam = bundle.family(f);
    for (const url of fam.urls) {
      const d = fam.get(url);
      if (!d || d.status !== 200) continue;
      const key = `${url}|${d.body.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ family: f, url, json: JSON.parse(Buffer.from(d.body).toString('utf8')), bytes: d.body.length });
    }
  }
  return out;
}
const REAL = realDocs();
const ofKind = (k: DocKind) => REAL.filter((d) => kindOfUrl(d.url) === k);

const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (n.endsWith('.json')) out.push(p);
  }
  return out;
};
const BY_KIND: Record<string, DocKind> = {
  health: 'health', board: 'board', recommendations: 'recommendations', theses: 'theses', event_detail: 'event_detail', explorer_index: 'explorer_index', metric_registry: 'metric_registry',
  search_index: 'search_index', entity_profile: 'entity_profile', ranking: 'ranking', time_series: 'time_series', event_research: 'event_research', sift_data_snapshot: 'snapshot',
  sift_player_history: 'player_history', sift_history_index: 'history_index', sift_team_history: 'team_history', sift_league_schedule: 'league_schedule',
};

// ------------------------------------------------------------------------------------------------------------ 1. real captured documents

describe('every real captured document passes its guard (fixtures/real, all families)', () => {
  const KINDS: DocKind[] = ['health', 'board', 'recommendations', 'theses', 'event_detail', 'explorer_index', 'metric_registry', 'search_index', 'entity_profile', 'ranking', 'time_series', 'event_research'];
  it.each(KINDS)('%s', (kind) => {
    const docs = ofKind(kind);
    expect(docs.length, `the bundle holds no ${kind}`).toBeGreaterThan(0);
    const failures = docs.map((d) => ({ d, v: GUARDS[kind](d.json) })).filter((x) => !x.v.ok).map((x) => `${x.d.family} ${x.d.url}: ${(x.v as { reason: string }).reason}`);
    expect(failures).toEqual([]);
  });
  it('what the bundle holds, by kind (the inventory the guards were measured on)', () => {
    const counts = Object.fromEntries(KINDS.map((k) => [k, ofKind(k).length]));
    expect(counts).toMatchObject({ health: 10, board: 10, recommendations: 10, theses: 1, event_detail: 154, explorer_index: 8, metric_registry: 4, search_index: 5, entity_profile: 31, ranking: 15, time_series: 1, event_research: 11 });
    expect(REAL.length).toBe(Object.values(counts).reduce((a, b) => a + b, 0) + REAL.filter((d) => kindOfUrl(d.url) == null).length);
  });
  it('the documents no guard here owns are exactly the ones with their own decoders: projections, distributions, research signals and the live-quote feed', () => {
    const others = REAL.filter((d) => kindOfUrl(d.url) == null).map((d) => d.url.replace(/^.*\/(chmoses98\/[^/]+)\/.*?([^/]+\/[^/]+)$/, '$1 $2'));
    for (const o of others) expect(o).toMatch(/signals\/cfb_research_signals\.json|live-quotes|\/latest\.json$|distributions\/latest\.json|games\/[A-Z0-9]+\.json/);
    expect(others.length).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------------------------------------------------ 2. every other committed document

/**
 * Committed documents of a guarded kind that do NOT pass, and why. All are hand-trimmed TEST INPUTS (a slice cut out of a real document so a unit test
 * stays small), not publications; none is read by a screen under the validator. Listed so a new failure cannot hide among them.
 */
const TRIMMED_TEST_INPUTS: Record<string, string> = {
  'tests/v3/fixtures/nfl-index-slim.json': 'slimmed index: metrics_path and search_index_path removed',
  'tests/v3/fixtures/nhl-index-slim.json': 'slimmed index: metrics_path and search_index_path removed',
  'tests/v3/fixtures/nfl-index.json': 'index with its `files` table cut out',
  'tests/v3/fixtures/props/mlb-detail.json': 'trimmed event_detail: schema_version removed',
  'tests/v3/fixtures/props/nfl-detail.json': 'trimmed event_detail: schema_version removed',
  'tests/v3/fixtures/props/nhl-detail.json': 'trimmed event_detail: schema_version removed',
  'tests/v3/fixtures/props/nfl-history-index.json': 'trimmed history index: built_at removed',
  'tests/v3/fixtures/props/nfl-index.json': 'trimmed index: schema_version removed',
  'tests/v3/fixtures/props/nhl-index.json': 'trimmed index: schema_version removed',
  'tests/v3/fixtures/props/nhl-profile-marchenko.json': 'trimmed player profile: schema_version removed',
};

describe('every other committed document of a guarded kind (tests/, e2e/, public/data, scripts/)', () => {
  const found: { path: string; kind: DocKind; verdict: ReturnType<(typeof GUARDS)[DocKind]> }[] = [];
  for (const root of ['tests', 'e2e', 'public/data', 'scripts']) {
    for (const path of walk(root)) {
      let j: { kind?: unknown };
      try { j = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
      const kind = BY_KIND[String(j?.kind)];
      if (kind) found.push({ path, kind, verdict: GUARDS[kind](j) });
    }
  }
  it('there are many of them, across every kind', () => {
    expect(found.length).toBeGreaterThan(1500);
    expect(new Set(found.map((f) => f.kind)).size).toBe(17);
  });
  it('all pass, except the named hand-trimmed test inputs', () => {
    const failing = Object.fromEntries(found.filter((f) => !f.verdict.ok).map((f) => [f.path, (f.verdict as { reason: string }).reason]));
    expect(Object.keys(failing).sort()).toEqual(Object.keys(TRIMMED_TEST_INPUTS).sort());
  });
  it('the committed saved copy (public/data/nfl/app/latest) and the same-origin history layer pass', () => {
    const own = found.filter((f) => f.path.startsWith('public/data'));
    expect(own.length).toBeGreaterThan(1200);
    expect(own.filter((f) => !f.verdict.ok).map((f) => f.path)).toEqual([]);
  });
});

// ------------------------------------------------------------------------------------------------------------ 3. malformed variants

type Edit = (d: any) => void;
interface Variant { name: string; edit: Edit; reason: RegExp }
const del = (...path: (string | number)[]): Edit => (d) => { let o = d; for (const k of path.slice(0, -1)) o = o[k]; delete o[path[path.length - 1]]; };
const set = (value: unknown, ...path: (string | number)[]): Edit => (d) => { let o = d; for (const k of path.slice(0, -1)) o = o[k]; o[path[path.length - 1]] = value; };

/** Variants every versioned kind shares. */
const COMMON = (kind: DocKind): Variant[] => [
  { name: 'schema_version missing', edit: del('schema_version'), reason: /schema_version/ },
  { name: 'schema_version bumped to v2', edit: set('edge_finder.app.v2', 'schema_version'), reason: /schema_version/ },
  { name: 'schema_version of another family', edit: set('sift.projections.v1', 'schema_version'), reason: /schema_version/ },
  { name: 'kind of another document', edit: set(kind === 'board' ? 'health' : 'board', 'kind'), reason: /kind/ },
  { name: 'generated_at missing', edit: del('generated_at'), reason: /generated_at/ },
  { name: 'generated_at not a time', edit: set('yesterday-ish', 'generated_at'), reason: /generated_at/ },
  { name: 'sport missing', edit: del('sport'), reason: /sport/ },
];

const TABLE: Record<Exclude<DocKind, 'snapshot' | 'player_history' | 'history_index' | 'team_history' | 'league_schedule'>, { pick?: (d: Doc) => boolean; variants: Variant[] }> = {
  health: { variants: [
    { name: 'overall_status missing', edit: del('overall_status'), reason: /overall_status/ },
    { name: 'freshness_status a number', edit: set(3, 'freshness_status'), reason: /freshness_status/ },
    { name: 'components a list', edit: set([], 'components'), reason: /components/ },
    { name: 'a component without a status', edit: (d) => { d.components[Object.keys(d.components)[0]] = { as_of: null }; }, reason: /components.*status/ },
    { name: 'errors a text', edit: set('boom', 'errors'), reason: /errors/ },
  ] },
  board: { pick: (d) => d.json.items.length > 3, variants: [
    { name: 'items missing', edit: del('items'), reason: /items/ },
    { name: 'items an object', edit: set({}, 'items'), reason: /items/ },
    { name: 'an item without event_id', edit: del('items', 2, 'event_id'), reason: /items\[2\]\.event_id/ },
    { name: 'an item start time a number', edit: set(1790000000, 'items', 1, 'start_time_utc'), reason: /items\[1\]\.start_time_utc/ },
    { name: 'an item start time not a time', edit: set('TBD', 'items', 0, 'start_time_utc'), reason: /start_time_utc/ },
    { name: 'an item without detail_path', edit: del('items', 3, 'detail_path'), reason: /detail_path/ },
    { name: 'an item participants a text', edit: set('DAL, PHI', 'items', 0, 'participants'), reason: /participants/ },
    { name: 'markets_available negative', edit: set(-3, 'items', 0, 'markets_available'), reason: /markets_available/ },
  ] },
  recommendations: { pick: (d) => d.json.items.length > 1, variants: [
    { name: 'items missing', edit: del('items'), reason: /items/ },
    { name: 'a recommendation without market_id', edit: del('items', 1, 'market_id'), reason: /items\[1\]\.market_id/ },
    { name: 'fair_probability above 1', edit: set(1.4, 'items', 0, 'fair_probability'), reason: /fair_probability/ },
    { name: 'status a number', edit: set(7, 'items', 0, 'status'), reason: /status/ },
  ] },
  theses: { variants: [
    { name: 'items missing', edit: del('items'), reason: /items/ },
    { name: 'a thesis without event_id', edit: del('items', 0, 'event_id'), reason: /event_id/ },
    { name: 'supporting_factors a text', edit: set('x', 'items', 0, 'supporting_factors'), reason: /supporting_factors/ },
  ] },
  event_detail: { pick: (d) => d.json.markets.length > 40, variants: [
    { name: 'event missing', edit: del('event'), reason: /event/ },
    { name: 'event_id missing', edit: del('event', 'event_id'), reason: /event\.event_id/ },
    { name: 'event start not a time', edit: set('soon', 'event', 'start_time_utc'), reason: /start_time_utc/ },
    { name: 'participants a number', edit: set(2, 'event', 'participants'), reason: /participants/ },
    { name: 'markets missing', edit: del('markets'), reason: /markets/ },
    { name: 'markets an object', edit: set({ 0: {} }, 'markets'), reason: /markets/ },
    { name: 'a market without a ticker', edit: del('markets', 5, 'kalshi_ticker'), reason: /markets\[5\]\.kalshi_ticker/ },
    { name: 'a market ask as text', edit: set('0.54', 'markets', 7, 'yes_ask'), reason: /markets\[7\]\.yes_ask/ },
    { name: 'a market ask above 1 (cents, not dollars)', edit: set(54, 'markets', 7, 'yes_ask'), reason: /yes_ask.*0 to 1/ },
    { name: 'a market bid negative', edit: set(-0.1, 'markets', 2, 'yes_bid'), reason: /yes_bid/ },
    { name: 'a market probability NaN-like text', edit: set('NaN', 'markets', 2, 'market_probability'), reason: /market_probability/ },
    { name: 'a market status a number', edit: set(1, 'markets', 4, 'market_status'), reason: /market_status/ },
    { name: 'a market captured_at not a time', edit: set('0', 'markets', 3, 'captured_at'), reason: /captured_at/ },
    { name: 'a market line as text', edit: set('45.5', 'markets', 6, 'line'), reason: /line/ },
    { name: 'a market volume negative', edit: set(-5, 'markets', 1, 'volume'), reason: /volume/ },
    { name: 'the LAST market malformed (every row is walked)', edit: (d) => { d.markets[d.markets.length - 1].yes_ask = {}; }, reason: /yes_ask/ },
  ] },
  explorer_index: { pick: (d) => d.json.teams.length > 0, variants: [
    { name: 'as_of missing', edit: del('as_of'), reason: /as_of/ },
    { name: 'metrics_path missing', edit: del('metrics_path'), reason: /metrics_path/ },
    { name: 'search_index_path empty', edit: set('', 'search_index_path'), reason: /search_index_path/ },
    { name: 'files an empty object', edit: set({}, 'files'), reason: /files.*at least 1/ },
    { name: 'files a list', edit: set([], 'files'), reason: /files/ },
    { name: 'a file without a kind', edit: (d) => { d.files[Object.keys(d.files)[3]] = { bytes: 1 }; }, reason: /files.*kind/ },
    { name: 'teams missing', edit: del('teams'), reason: /teams/ },
    { name: 'a team without participant_id', edit: del('teams', 0, 'participant_id'), reason: /teams\[0\]\.participant_id/ },
    { name: 'a team short_name a number', edit: set(4, 'teams', 1, 'short_name'), reason: /short_name/ },
    { name: 'players_by_team a list', edit: set([], 'players_by_team'), reason: /players_by_team/ },
    { name: 'players_by_team with a non-id', edit: (d) => { d.players_by_team[Object.keys(d.players_by_team)[0] ?? 'x'] = [1, 2]; }, reason: /players_by_team/ },
    { name: 'events missing', edit: del('events'), reason: /events/ },
    { name: 'an event start not a time', edit: (d) => { if (d.events.length) d.events[0].start_time_utc = 'n/a'; else d.events = [{ event_id: 'e', path: 'p', start_time_utc: 'n/a', status: 's', participants: [] }]; }, reason: /start_time_utc/ },
  ] },
  metric_registry: { pick: (d) => d.json.items.length > 5, variants: [
    { name: 'items missing', edit: del('items'), reason: /items/ },
    { name: 'a metric without metric_id', edit: del('items', 1, 'metric_id'), reason: /items\[1\]\.metric_id/ },
    { name: 'a metric without a name', edit: del('items', 0, 'name'), reason: /name/ },
    { name: 'higher_is_better as text', edit: set('yes', 'items', 0, 'higher_is_better'), reason: /higher_is_better/ },
    { name: 'known_limitations a text', edit: set('none', 'items', 0, 'known_limitations'), reason: /known_limitations/ },
  ] },
  search_index: { variants: [
    { name: 'items missing', edit: del('items'), reason: /items/ },
    { name: 'an entry without an id', edit: del('items', 3, 'id'), reason: /items\[3\]\.id/ },
    { name: 'an entry without a label', edit: del('items', 0, 'label'), reason: /label/ },
    { name: 'tokens a text', edit: set('a b', 'items', 2, 'tokens'), reason: /tokens/ },
    { name: 'aliases a number', edit: set(1, 'items', 2, 'aliases'), reason: /aliases/ },
    { name: 'context a text', edit: set('DAL', 'items', 1, 'context'), reason: /context/ },
  ] },
  entity_profile: { pick: (d) => d.json.entity_type === 'TEAM' && d.json.metrics.length > 20 && d.json.games.length > 3, variants: [
    { name: 'entity missing', edit: del('entity'), reason: /entity/ },
    { name: 'participant_id missing', edit: del('entity', 'participant_id'), reason: /entity\.participant_id/ },
    { name: 'display_name a number', edit: set(5, 'entity', 'display_name'), reason: /display_name/ },
    { name: 'metrics missing', edit: del('metrics'), reason: /metrics/ },
    { name: 'metrics an object', edit: set({}, 'metrics'), reason: /metrics/ },
    { name: 'an observation without metric_id', edit: del('metrics', 4, 'metric_id'), reason: /metrics\[4\]\.metric_id/ },
    { name: 'an observation value as text', edit: set('12.5', 'metrics', 4, 'value'), reason: /metrics\[4\]\.value/ },
    { name: 'an observation without a window', edit: del('metrics', 6, 'window'), reason: /window/ },
    { name: 'an observation window without a label', edit: set({ kind: 'SEASON' }, 'metrics', 6, 'window'), reason: /window\.label/ },
    { name: 'a rank of zero', edit: set(0, 'metrics', 9, 'context', 'rank'), reason: /rank/ },
    { name: 'a fractional rank', edit: set(2.5, 'metrics', 9, 'context', 'rank'), reason: /rank/ },
    { name: 'a percentile of 140', edit: set(140, 'metrics', 9, 'context', 'percentile'), reason: /percentile/ },
    { name: 'a negative sample size', edit: set(-1, 'metrics', 9, 'sample_size'), reason: /sample_size/ },
    { name: 'as_of not a time', edit: set('Oct', 'metrics', 3, 'as_of'), reason: /as_of/ },
    { name: 'games missing', edit: del('games'), reason: /games/ },
    { name: 'a game start not a time', edit: set(0, 'games', 1, 'start_time_utc'), reason: /games\[1\]\.start_time_utc/ },
    { name: 'a game result score as text', edit: set({ for: '24', against: 20, outcome: 'W' }, 'games', 0, 'result'), reason: /result\.for/ },
    { name: 'availability missing', edit: del('availability'), reason: /availability/ },
    { name: 'an availability row without a status', edit: set([{ detail: 'x' }], 'availability'), reason: /availability\[0\]\.status/ },
    { name: 'players a text', edit: set('x', 'players'), reason: /players/ },
    { name: 'rankings entries without ranking_id', edit: set([{ metric_id: 'm', window_label: 'SEASON' }], 'rankings'), reason: /ranking_id/ },
    { name: 'series entries without series_id', edit: set([{ metric_id: 'm' }], 'series'), reason: /series_id/ },
    { name: 'a game_log without columns', edit: set({ game_log: { rows: [] } }, 'extensions'), reason: /game_log\.columns/ },
    { name: 'a game_log with an empty column list', edit: set({ game_log: { columns: [], rows: [] } }, 'extensions'), reason: /game_log\.columns/ },
    { name: 'a game_log row that is not a row', edit: set({ game_log: { columns: ['a'], rows: ['x'] } }, 'extensions'), reason: /game_log\.rows/ },
  ] },
  ranking: { pick: (d) => d.json.entries.length > 10, variants: [
    { name: 'ranking_id missing', edit: del('ranking_id'), reason: /ranking_id/ },
    { name: 'metric_id a number', edit: set(7, 'metric_id'), reason: /metric_id/ },
    { name: 'as_of missing', edit: del('as_of'), reason: /as_of/ },
    { name: 'entries empty', edit: set([], 'entries'), reason: /entries.*at least 1/ },
    { name: 'entries missing', edit: del('entries'), reason: /entries/ },
    { name: 'entries an object', edit: set({}, 'entries'), reason: /entries/ },
    { name: 'an entry without a rank', edit: del('entries', 3, 'rank'), reason: /entries\[3\]\.rank/ },
    { name: 'a rank of 0', edit: set(0, 'entries', 3, 'rank'), reason: /entries\[3\]\.rank/ },
    { name: 'a rank as text', edit: set('1', 'entries', 0, 'rank'), reason: /rank/ },
    { name: 'an entry without entity_id', edit: del('entries', 2, 'entity_id'), reason: /entity_id/ },
    { name: 'an entry value as text', edit: set('0.1', 'entries', 2, 'value'), reason: /value/ },
    { name: 'an entry percentile of -4', edit: set(-4, 'entries', 2, 'percentile'), reason: /percentile/ },
    { name: 'summary missing', edit: del('summary'), reason: /summary/ },
    { name: 'summary mean as text', edit: set('0', 'summary', 'mean'), reason: /summary\.mean/ },
    { name: 'universe size 0', edit: set(0, 'universe', 'size'), reason: /universe\.size/ },
    { name: 'universe missing', edit: del('universe'), reason: /universe/ },
    { name: 'window without a label', edit: set({}, 'window'), reason: /window\.label/ },
  ] },
  time_series: { variants: [
    { name: 'series_id missing', edit: del('series_id'), reason: /series_id/ },
    { name: 'points empty', edit: set([], 'points'), reason: /points.*at least 1/ },
    { name: 'points missing', edit: del('points'), reason: /points/ },
    { name: 'a point without x', edit: del('points', 0, 'x'), reason: /points\[0\]\.x/ },
    { name: 'a point value as text', edit: set('3', 'points', 1, 'value'), reason: /points\[1\]\.value/ },
    { name: 'a negative sample size', edit: set(-2, 'points', 1, 'sample_size'), reason: /sample_size/ },
    { name: 'x_axis missing', edit: del('x_axis'), reason: /x_axis/ },
  ] },
  event_research: { pick: (d) => d.json.matchup?.length > 3, variants: [
    { name: 'event missing', edit: del('event'), reason: /event/ },
    { name: 'event status missing', edit: del('event', 'status'), reason: /status/ },
    { name: 'participants missing', edit: del('participants'), reason: /participants/ },
    { name: 'players a text', edit: set('x', 'players'), reason: /players/ },
    { name: 'a matchup row without metric_id', edit: del('matchup', 1, 'metric_id'), reason: /matchup\[1\]\.metric_id/ },
    { name: 'a matchup side value as text', edit: (d) => { const i = d.matchup.findIndex((m: any) => m.home); d.matchup[i].home.value = 'x'; }, reason: /matchup.*home\.value/ },
    { name: 'matchup an object', edit: set({}, 'matchup'), reason: /matchup/ },
    { name: 'context a text', edit: set('none', 'context'), reason: /context/ },
    { name: 'injuries a text', edit: set({ injuries: 'none' }, 'context'), reason: /injuries/ },
    { name: 'an injury row without a status', edit: set({ injuries: [{ detail: 'knee' }] }, 'context'), reason: /injuries\[0\]\.status/ },
  ] },
};

describe('malformed variants of a real document of each kind are rejected with the reason', () => {
  for (const [kind, spec] of Object.entries(TABLE) as [keyof typeof TABLE, (typeof TABLE)[keyof typeof TABLE]][]) {
    const base = ofKind(kind).find(spec.pick ?? (() => true));
    describe(kind, () => {
      it('has a real base document that passes', () => {
        expect(base, `no real ${kind} matches the pick`).toBeTruthy();
        expect(GUARDS[kind](base!.json).ok).toBe(true);
      });
      it.each([...COMMON(kind), ...spec.variants].map((v) => [v.name, v] as const))('%s', (_n, v) => {
        const doc = structuredClone(base!.json);
        v.edit(doc);
        const r = GUARDS[kind](doc);
        expect(r.ok, `${kind}: "${v.name}" was accepted`).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(v.reason);
      });
    });
  }
});

describe('the same-origin history layer and the saved-copy notice (their own `kind`, no schema_version)', () => {
  const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
  const player = read('public/data/nfl/history/players/00-0023459.json');
  const T: [string, DocKind, unknown, [string, Edit, RegExp][]][] = [
    ['player history', 'player_history', player, [
      ['gsis missing', del('gsis'), /gsis/], ['games missing', del('games'), /games/], ['games an object', set({}, 'games'), /games/],
      ['a game without game_id', del('games', 0, 'game_id'), /game_id/], ['a game week as text', set('1', 'games', 0, 'week'), /week/], ['kind of another document', set('sift_history_index', 'kind'), /kind/],
    ]],
    ['history index', 'history_index', read('public/data/nfl/history/index.json'), [
      ['season missing', del('season'), /season/], ['players a list', set([], 'players'), /players/], ['a player without a team', (d) => { d.players[Object.keys(d.players)[0]] = { name: 'x', position: 'QB' }; }, /team/], ['built_at not a time', set('x', 'built_at'), /built_at/],
    ]],
    ['team history', 'team_history', read('public/data/nfl/history/teams.json'), [
      ['teams missing', del('teams'), /teams/], ['a team without weeks', (d) => { delete d.teams.ARI.weeks; }, /weeks/], ['a week without game_id', (d) => { delete d.teams.ARI.weeks[0].game_id; }, /game_id/],
    ]],
    ['league schedule', 'league_schedule', read('public/data/league/nfl/schedule.json'), [
      ['games missing', del('games'), /games/], ['a game without home', del('games', 3, 'home'), /home/], ['a score of 9999', set(9999, 'games', 0, 'home_score'), /home_score/], ['a score as text', set('24', 'games', 0, 'away_score'), /away_score/],
      ['a spread as text', set('-3', 'games', 1, 'spread_line'), /spread_line/], ['built_at missing', del('built_at'), /built_at/],
    ]],
    ['saved-copy notice', 'snapshot', read('public/data/nfl/SNAPSHOT.json'), [
      ['run_id missing', del('run_id'), /run_id/], ['explorer_built_at not a time', set('then', 'explorer_built_at'), /explorer_built_at/], ['kind of another document', set('x', 'kind'), /kind/],
    ]],
  ];
  it.each(T.map((t) => [t[0], t] as const))('%s: the committed document passes and each malformed variant is rejected', (_n, [, kind, base, variants]) => {
    expect(GUARDS[kind](base).ok).toBe(true);
    for (const [name, edit, reason] of variants) {
      const doc = structuredClone(base);
      edit(doc);
      const r = GUARDS[kind](doc);
      expect(r.ok, `${kind}: "${name}" was accepted`).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(reason);
    }
  });
  it('a player with no games (a rookie) is a valid history, not an unreadable one', () => {
    expect(GUARDS.player_history({ ...player, games: [] }).ok).toBe(true);
  });
});

describe('an unsupported schema_version is "unsupported", not "unreadable"', () => {
  const kinds = Object.keys(TABLE) as (keyof typeof TABLE)[];
  it.each(kinds)('%s: a version bump (or none) is flagged unsupported with the version found', (kind) => {
    const base = ofKind(kind).find(TABLE[kind].pick ?? (() => true))!;
    for (const [v, found] of [['edge_finder.app.v2', 'edge_finder.app.v2'], [undefined, undefined], [1, 1], ['', ''], [null, null]] as const) {
      const doc = { ...base.json, schema_version: v };
      const r = GUARDS[kind](doc);
      expect(r).toMatchObject({ ok: false, unsupported: true, found });
    }
    // every other failure is NOT unsupported (asking again can help)
    const r = GUARDS[kind]({ ...base.json, generated_at: 5 });
    expect(r).toMatchObject({ ok: false });
    expect((r as { unsupported?: boolean }).unsupported).toBeUndefined();
  });
  it('not an object at all', () => {
    for (const bad of [null, undefined, 'x', 3, [], true]) for (const k of Object.keys(TABLE) as (keyof typeof TABLE)[]) expect(GUARDS[k](bad).ok).toBe(false);
  });
});

describe('valid variants a guard must NOT reject (the publication legitimately varies)', () => {
  const idx = ofKind('explorer_index').find((d) => d.json.teams.length === 0)!; // tennis: players, no teams
  it('a sport with no teams (tennis) has a valid index', () => {
    expect(idx).toBeTruthy();
    expect(GUARDS.explorer_index(idx.json).ok).toBe(true);
  });
  it('a game with no markets, a board with no games, a ranking universe the size of its entries all pass', () => {
    const det = structuredClone(ofKind('event_detail')[0].json); det.markets = [];
    expect(GUARDS.event_detail(det).ok).toBe(true);
    const brd = structuredClone(ofKind('board')[0].json); brd.items = [];
    expect(GUARDS.board(brd).ok).toBe(true);
    const rec = structuredClone(ofKind('recommendations')[0].json); rec.items = [];
    expect(GUARDS.recommendations(rec).ok).toBe(true);
  });
  it('nullable and missing optionals: null where a reader treats null and missing alike', () => {
    const det = structuredClone(ofKind('event_detail').find((d) => d.json.markets.length > 5)!.json);
    Object.assign(det.markets[0], { yes_ask: null, yes_bid: null, market_probability: null, volume: null, captured_at: null, participant_id: null, period: null, line: null, threshold: null });
    delete det.markets[1].market_status; delete det.markets[1].volume;
    expect(GUARDS.event_detail(det).ok).toBe(true);
    const prof = structuredClone(ofKind('entity_profile')[0].json);
    prof.metrics[0].context = null; prof.metrics[0].value = null; prof.metrics[0].split = null; prof.extensions = null;
    expect(GUARDS.entity_profile(prof).ok).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------------------ 4. the seam

describe('the seam: getJson with the validator on', () => {
  afterEach(() => { setDocumentValidator(null); setFetchJson(null); });
  const root = 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest';
  const rank = ofKind('ranking')[0];
  const rankUrl = `${root}/explorer/rankings/rnk_x.json`;
  const reader = (doc: unknown, calls: { n: number }) => (url: string) => { calls.n++; return url === rankUrl ? Promise.resolve(structuredClone(doc)) : Promise.reject(new NotFoundError(url)); };

  it('a valid document is returned and memoised', async () => {
    const calls = { n: 0 };
    setFetchJson(reader(rank.json, calls));
    setDocumentValidator(validateDocument);
    await expect(getJson(rankUrl)).resolves.toMatchObject({ kind: 'ranking' });
    await getJson(rankUrl);
    expect(calls.n).toBe(1);
  });
  it('an invalid document rejects with DocumentInvalidError (reason, kind and url kept), is never memoised, and a later good copy is read', async () => {
    const calls = { n: 0 };
    const broken = structuredClone(rank.json); broken.entries = [];
    let serve: unknown = broken;
    setFetchJson((u) => { calls.n++; return Promise.resolve(structuredClone(serve)).then((d) => (u === rankUrl ? d : Promise.reject(new NotFoundError(u)))); });
    setDocumentValidator(validateDocument);
    const err = await getJson(rankUrl).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(DocumentInvalidError);
    expect(err).toMatchObject({ url: rankUrl, docKind: 'ranking' });
    expect((err as Error).message).toMatch(/entries.*at least 1/);
    await expect(getJson(rankUrl)).rejects.toBeInstanceOf(DocumentInvalidError);
    expect(calls.n).toBe(2); // asked again, not served from memory
    serve = rank.json;
    await expect(getJson(rankUrl)).resolves.toMatchObject({ kind: 'ranking' });
  });
  it('a schema_version bump rejects with SchemaVersionError; so does a missing one (validator) and a present wrong one (getJson itself)', async () => {
    setDocumentValidator(validateDocument);
    for (const v of ['edge_finder.app.v2', undefined]) {
      setFetchJson(reader({ ...rank.json, schema_version: v }, { n: 0 }));
      await expect(getJson(rankUrl)).rejects.toBeInstanceOf(SchemaVersionError);
    }
  });
  it('words: unreadable + Retry for an invalid document, unsupported + no Retry for a version, not published for a 404', async () => {
    setDocumentValidator(validateDocument);
    const broken = structuredClone(rank.json); broken.entries[0].rank = 0;
    setFetchJson(reader(broken, { n: 0 }));
    const invalid = await getJson(rankUrl).then(() => null, (e: unknown) => e);
    expect(failureKind(invalid)).toBe('unreadable');
    expect(canRetry(invalid)).toBe(true);
    expect(whyUnavailable(invalid)).toBe('what was published could not be read');
    setFetchJson(reader({ ...rank.json, schema_version: 'edge_finder.app.v2' }, { n: 0 }));
    const version = await getJson(rankUrl).then(() => null, (e: unknown) => e);
    expect(failureKind(version)).toBe('unsupported');
    expect(canRetry(version)).toBe(false);
    expect(whyUnavailable(version)).toBe('it is in a format this version of SIFT cannot read');
    setFetchJson(reader(rank.json, { n: 0 }));
    const gone = await getJson(`${root}/explorer/rankings/rnk_missing.json`).then(() => null, (e: unknown) => e);
    expect(failureKind(gone)).toBe('not-published');
    expect(canRetry(gone)).toBe(false);
  });
  it('the validator is OFF unless SIFT 3.0 turns it on: SIFT 2.0 and classic accept what they always accepted', async () => {
    const broken = structuredClone(rank.json); broken.entries = [];
    setFetchJson(reader(broken, { n: 0 }));
    await expect(getJson(rankUrl)).resolves.toMatchObject({ entries: [] });
  });
  it('a URL no guard owns is passed through untouched (projections, signals and the quote feed have their own decoders)', async () => {
    setDocumentValidator(validateDocument);
    const u = 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/projection-data/projections/nfl/latest.json';
    setFetchJson(() => Promise.resolve({ anything: true }));
    await expect(getJson(u)).resolves.toEqual({ anything: true });
    expect(validateByUrl(u, {})).toBeNull();
  });
  it('kindOfUrl names every kind of address SIFT 3.0 reads, ignoring the host, the sport and a query string', () => {
    const cases: [string, DocKind | null][] = [
      ['https://x/y/app/latest/health.json', 'health'], ['https://x/y/app/latest/board.json?v=1', 'board'], ['/data/nfl/app/latest/recommendations.json', 'recommendations'],
      ['https://x/app/latest/theses.json', 'theses'], ['https://x/app/latest/event_detail/evt_ab12.json', 'event_detail'],
      ['https://x/app/latest/explorer/index.json', 'explorer_index'], ['https://x/app/latest/explorer/metrics.json', 'metric_registry'], ['https://x/app/latest/explorer/search_index.json', 'search_index'],
      ['https://x/app/latest/explorer/teams/prt_1.json', 'entity_profile'], ['https://x/app/latest/explorer/players/prt_1.json', 'entity_profile'],
      ['https://x/app/latest/explorer/rankings/rnk_1.json', 'ranking'], ['https://x/app/latest/explorer/series/ser_1.json', 'time_series'], ['https://x/app/latest/explorer/events/evt_1.json', 'event_research'],
      ['/data/nfl/history/players/00-0033.json', 'player_history'], ['/data/nfl/history/index.json', 'history_index'], ['/data/nfl/history/teams.json', 'team_history'],
      ['/data/league/nfl/schedule.json', 'league_schedule'], ['/data/nfl/SNAPSHOT.json', 'snapshot'],
      ['https://x/projections/nfl/latest.json', null], ['https://x/live-quotes/games/26OCT26DALPHI.json', null], ['https://x/signals/cfb_research_signals.json', null], ['https://x/other.json', null],
    ];
    for (const [u, k] of cases) expect(kindOfUrl(u), u).toBe(k);
  });
});

// ------------------------------------------------------------------------------------------------------------ 5. own decoders and the live quote

describe('documents with their own strict decoders, and the live quote', () => {
  const projections = REAL.filter((d) => /projections\/[a-z]+\/latest\.json$/.test(d.url));
  const dists = REAL.filter((d) => /distributions\/latest\.json$/.test(d.url));
  const feeds = REAL.filter((d) => /live-quotes\/games\//.test(d.url));
  it('every real projection feed and distribution artifact decodes', () => {
    expect(projections.length).toBeGreaterThanOrEqual(4);
    for (const p of projections) expect(decodeProjections(p.json), p.url).not.toBeNull();
    expect(dists.length).toBe(1);
    expect(decodeDistributions(dists[0].json)).not.toBeNull();
  });
  it('a malformed projection feed is "no projection published" (null), never half a feed', () => {
    const p = projections.find((d) => d.json.players?.length > 5)!.json;
    expect(decodeProjections({ ...p, schema: 'sift.projections.v2' })).toBeNull();
    expect(decodeProjections({ ...p, model: { ...p.model, authority: 'production' } })).toBeNull();
    expect(decodeProjections({ ...p, sport: 'CURLING' })).toBeNull();
    expect(decodeProjections(null)).toBeNull();
    expect(decodeProjections('x')).toBeNull();
    const d = dists[0].json;
    expect(decodeDistributions({ ...d, schema: 'sift.projection_distributions.v2' })).toBeNull();
    expect(decodeDistributions({ ...d, projection: {} })).toBeNull();
    expect(decodeDistributions({ ...d, distribution: { quantile_rule: 'something else' } })).toBeNull();
  });
  it('every market of every real live-quote feed file becomes a quote that passes the quote guard', () => {
    expect(feeds.length).toBeGreaterThan(5);
    let n = 0;
    for (const f of feeds) {
      expect(f.json.schema).toBe('sift.live_quotes.v1');
      expect(Array.isArray(f.json.markets)).toBe(true);
      for (const m of f.json.markets) {
        const q = normalizeKalshiMarket(m, m.observed_at ?? f.json.generated_at, 'quote-feed');
        expect(q, `${f.url} ${String(m.ticker)}`).not.toBeNull();
        const v = guardLiveQuote(q);
        expect(v.ok, `${String(m.ticker)}: ${v.ok ? '' : v.reason}`).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(1000);
  });
  it('the quote guard rejects what is not a price: dollars outside 0 to 1, text, a negative volume, no observation time', () => {
    const f = feeds.find((x) => x.json.markets.length > 0)!;
    const q = normalizeKalshiMarket(f.json.markets[0], f.json.markets[0].observed_at, 'quote-feed')!;
    expect(guardLiveQuote(q).ok).toBe(true);
    const bad = (o: Record<string, unknown>) => guardLiveQuote({ ...q, ...o } as typeof q);
    expect(bad({ yesAsk: 54 })).toMatchObject({ ok: false });
    expect(bad({ yesAsk: '0.54' })).toMatchObject({ ok: false });
    expect(bad({ yesBid: -0.2 })).toMatchObject({ ok: false });
    expect(bad({ volume: -1 })).toMatchObject({ ok: false });
    expect(bad({ observedAt: 'later' })).toMatchObject({ ok: false });
    expect(bad({ observedAt: null })).toMatchObject({ ok: false });
    expect(bad({ ticker: '' })).toMatchObject({ ok: false });
    expect(guardLiveQuote(undefined)).toMatchObject({ ok: false });
    expect(bad({ yesAsk: null, yesBid: null })).toMatchObject({ ok: true });
  });
});

// ------------------------------------------------------------------------------------------------------------ 6. cost

describe('cost: a guard is one pass over scalars', () => {
  const biggest = (k: DocKind) => [...ofKind(k)].sort((a, b) => b.bytes - a.bytes)[0];
  it.each(['event_detail', 'explorer_index', 'search_index', 'entity_profile', 'event_research', 'metric_registry'] as DocKind[])('%s: the largest real document validates in well under a frame budget', (kind) => {
    const d = biggest(kind);
    GUARDS[kind](d.json); // warm
    const runs: number[] = [];
    for (let i = 0; i < 7; i++) { const t = performance.now(); GUARDS[kind](d.json); runs.push(performance.now() - t); }
    runs.sort((a, b) => a - b);
    const median = runs[3];
    // measured (quiet machine) 0.05 to 3 ms; the bound is generous because the CI box is shared
    expect(median, `${kind} ${(d.bytes / 1024).toFixed(0)} KB took ${median.toFixed(2)} ms`).toBeLessThan(60);
  });
});
