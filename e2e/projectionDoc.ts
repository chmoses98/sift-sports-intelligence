// A promoted-stat projection feed for the bundled ATL–NO game (Chris Olave's receptions), shaped like the NFL publisher's output
// (nfl-edge-finder PR #178): mean, median, p10/p90, seven quantiles and every integer line from ONE negative-binomial pmf
// (mean 7.3, var = mu + 0.15·mu², lines with 0.001 <= P <= 0.999), plus the document-level `distribution` declaration.
// The established simulation projects 6.3 for him in the same publication, which is what no page may show.
import { NOW } from './fixtures';

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

export const doc = (over: Record<string, unknown> = {}, opts: { declare?: boolean; gate?: 'PASS' | 'BLOCK' } = {}) => ({
  schema: 'sift.projections.v1', sport: 'NFL', generated_utc: fresh(), data_asof_utc: fresh(),
  model: { id: 'pf-nfl', version: 'pf-1.2.1', authority: 'research_only' },
  ...(opts.declare === false ? {} : { distribution: { schema: 'sift.projection_distribution.v1', quantile_rule: 'smallest integer x with P(X <= x) >= level, from the same integer pmf as the mean and the threshold probabilities', levels: [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95] } }),
  families: { receptions: { readiness: 'READY', model: 'F_av', reason: 'test' }, passing_tds: { readiness: 'NEEDS IMPROVEMENT', model: 'D', reason: 'test' } },
  games: [],
  players: [{
    player_id: '00-0037239', name: 'Chris Olave', team: 'NO', opponent: 'ATL', game_id: GAME, family: 'receptions', ...DIST,
    opportunity: { family: 'targets', mean: 9.4, p10: 6, p90: 13 }, opponent_adjustment: { factor: 1.03, sample_games: 5 }, adjustments: ['Role from last 8 games'],
    readiness: 'READY',
    gate: opts.gate === 'BLOCK' ? { status: 'BLOCK', findings: [{ check: 'injury', severity: 'BLOCK', what: 'Player listed OUT', category: 'data_quality', action: '' }] } : { status: 'PASS', findings: [] },
    participation: { status: 'CONFIRMED_ACTIVE', certainty: 'CONFIRMED', source: 'nfl_roster_inactives', captured_utc: fresh(), reasons: [] },
    segments: { new_team_first4: false, tier: 'starter', backup: false, rookie: false }, role: 'shadow', data_asof_utc: fresh(), ...over,
  }],
});

/** Development vocabulary that must never reach a screen (tests/support/terminology.ts is the source scan's list). */
export const BANNED = /\bshadow\b|incumbent|challenger|research arm|simulation mean|P\(over\)|legacy (model|projection)/i;
