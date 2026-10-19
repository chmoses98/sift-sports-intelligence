// A promoted-stat projection feed for the bundled ATL–NO game (Chris Olave's receptions), shaped like the NFL publisher's output
// (nfl-edge-finder PR #178): the feed row carries mean, median, p10/p90 and the study's rungs; the separate distribution artifact carries
// seven quantiles and every integer line from ONE negative-binomial pmf (mean 7.3, var = mu + 0.15·mu², lines with 0.001 <= P <= 0.999).
// The established simulation projects 6.3 for him in the same publication, which is what no page may show.
import type { BrowserContext } from '@playwright/test';
import { NOW } from './fixtures';

export const DISTS = /raw\.githubusercontent\.com\/chmoses98\/nfl-edge-finder\/projection-data\/projections\/nfl\/distributions\/latest\.json/;
export const PROJ = /raw\.githubusercontent\.com\/chmoses98\/nfl-edge-finder\/projection-data\/projections\/nfl\/latest\.json/;
export const SUMMARY = /raw\.githubusercontent\.com\/chmoses98\/nfl-edge-finder\/projection-data\/summary\/nfl\/latest\.json/;
export const CORS = { 'access-control-allow-origin': '*' };
export const GAME = 'evt_639f74e87ff25310c542';
export const OLAVE = 'prt_9b2e8d8fa10766e401a1';
export const OLAVE_PROP = `${OLAVE}|receptions`;
export const LEGACY_MEAN = '6.3';
export const SELECTED_MEAN = '7.3';

export const DIST = {
  mean: 7.3, median: 7, p10: 3, p90: 13,
  quantiles: { p05: 2, p10: 3, p25: 4, p50: 7, p75: 10, p90: 13, p95: 14 },
  thresholds: {
    '1': 0.9928, '2': 0.9676, '3': 0.9172, '4': 0.841, '5': 0.7448, '6': 0.6376, '7': 0.5286, '8': 0.4255, '9': 0.3334, '10': 0.255, '11': 0.1908,
    '12': 0.14, '13': 0.1008, '14': 0.0715, '15': 0.0499, '16': 0.0344, '17': 0.0234, '18': 0.0157, '19': 0.0105, '20': 0.0069, '21': 0.0045,
    '22': 0.0029, '23': 0.0019, '24': 0.0012,
  } as Record<string, number>,
};

const fresh = () => new Date(NOW.getTime() - 3 * 3600_000).toISOString();
const RULE = 'smallest integer x with P(X <= x) >= level, from the same integer pmf as the mean and the threshold probabilities';
/** The study's three rungs of the pmf, as the feed publishes them. */
const RUNGS = Object.fromEntries(['3', '5', '7'].map((k) => [k, DIST.thresholds[k]]));

/** The feed as the NFL publisher writes it: mean, median, p10/p90 and the study's rungs; no quantiles. */
export const doc = (over: Record<string, unknown> = {}, opts: { gate?: 'PASS' | 'BLOCK'; generated?: string } = {}) => ({
  schema: 'sift.projections.v1', sport: 'NFL', generated_utc: opts.generated ?? fresh(), data_asof_utc: fresh(),
  model: { id: 'pf-nfl', version: 'pf-1.2.1', authority: 'research_only' },
  families: { receptions: { readiness: 'READY', model: 'F_av', reason: 'test' }, passing_tds: { readiness: 'NEEDS IMPROVEMENT', model: 'D', reason: 'test' } },
  games: [],
  players: [{
    player_id: '00-0037239', name: 'Chris Olave', team: 'NO', opponent: 'ATL', game_id: GAME, family: 'receptions',
    mean: DIST.mean, median: DIST.median, p10: DIST.p10, p90: DIST.p90, thresholds: RUNGS,
    opportunity: { family: 'targets', mean: 9.4, p10: 6, p90: 13 }, opponent_adjustment: { factor: 1.03, sample_games: 5 }, adjustments: ['Role from last 8 games'],
    readiness: 'READY',
    gate: opts.gate === 'BLOCK' ? { status: 'BLOCK', findings: [{ check: 'injury', severity: 'BLOCK', what: 'Player listed OUT', category: 'data_quality', action: '' }] } : { status: 'PASS', findings: [] },
    participation: { status: 'CONFIRMED_ACTIVE', certainty: 'CONFIRMED', source: 'nfl_roster_inactives', captured_utc: fresh(), reasons: [] },
    segments: { new_team_first4: false, tier: 'starter', backup: false, rookie: false }, role: 'shadow', data_asof_utc: fresh(), ...over,
  }],
});

/** The distribution artifact the publisher writes beside the feed (`sift.projection_distributions.v1`) for the same projection. */
export const artifact = (feed: { generated_utc: string }, rowOver: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
  schema: 'sift.projection_distributions.v1', sport: 'NFL',
  projection: { schema: 'sift.projections.v1', generated_utc: feed.generated_utc },
  distribution: { basis: 'integer pmf', quantile_rule: RULE, levels: [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95] },
  rows: [{ player_id: '00-0037239', family: 'receptions', game_id: GAME, mean: DIST.mean, median: DIST.median, p10: DIST.p10, p90: DIST.p90, quantiles: DIST.quantiles, survival: DIST.thresholds, ...rowOver }],
  excluded: [], ...over,
});

/** A feed that embeds the quantiles itself and declares the pmf basis (a publisher without a separate artifact). */
export const embedded = (over: Record<string, unknown> = {}) => ({
  ...doc({ quantiles: DIST.quantiles, thresholds: DIST.thresholds, ...over }),
  distribution: { schema: 'sift.projection_distribution.v1', quantile_rule: RULE },
});

/** Development vocabulary that must never reach a screen (tests/support/terminology.ts is the source scan's list). */
export const BANNED = /\bshadow\b|incumbent|challenger|research arm|simulation mean|P\(over\)|legacy (model|projection)/i;

/**
 * Serve the feed and its artifact. `feed: null` = the feed is unreachable; `artifact: null` = no artifact is published; by default the
 * artifact is the one matching the feed served.
 */
export async function serve(context: BrowserContext, o: { feed?: Record<string, any> | null; artifact?: Record<string, unknown> | null } = {}) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const f = o.feed === undefined ? doc() : o.feed;
  if (f) await context.route(PROJ, (r) => r.fulfill({ json: f, headers: CORS }));
  const a = o.artifact === undefined ? (f ? artifact(f as { generated_utc: string }) : null) : o.artifact;
  if (a) await context.route(DISTS, (r) => r.fulfill({ json: a, headers: CORS }));
}
