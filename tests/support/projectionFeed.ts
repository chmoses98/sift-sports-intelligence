// Fixture builders for the `sift.projections.v1` feed, shared by the projection tests.
import { decodeProjections, type ProjectionDoc } from '../../src/lib/projections';

export const NOW = Date.parse('2026-10-18T12:00:00Z');
export const FRESH = '2026-10-18T09:00:00Z';

type Obj = object;
export const part = (status = 'CONFIRMED_ACTIVE', over: Obj = {}) => ({ status, certainty: status === 'CONFIRMED_ACTIVE' ? 'CONFIRMED' : 'PROJECTED', source: 'nfl_roster_inactives', captured_utc: FRESH, reasons: [], ...over });

export const nflPlayer = (over: Obj = {}): Record<string, unknown> => ({
  player_id: '00-0036900', name: "Ja'Marr Chase", team: 'CIN', opponent: 'PIT', game_id: '2026_07_PIT_CIN',
  family: 'receptions', mean: 6.4, median: 6, p10: 3, p90: 10,
  quantiles: { p05: 2, p25: 4, p50: 6, p75: 8, p95: 11 },
  thresholds: { '4': 0.8, '6': 0.55, '8': 0.27 },
  opportunity: { family: 'targets', mean: 9.1, p10: 5, p90: 13 }, opponent_adjustment: { factor: 1.04, sample_games: 6 },
  adjustments: ['Target share 27% (last 8 games, shrunk)'], readiness: 'READY', gate: { status: 'PASS', findings: [] },
  participation: part(), segments: { new_team_first4: false, tier: 'starter', backup: false, rookie: false }, role: 'shadow', data_asof_utc: FRESH, ...over,
});

export const feed = (sport: string, players: Obj[], families: Record<string, Obj> = {}, games: Obj[] = [], authority = 'research_only'): Record<string, unknown> => ({
  schema: 'sift.projections.v1', sport, generated_utc: '2026-10-18T09:05:00Z', data_asof_utc: FRESH,
  model: { id: `pf-${sport.toLowerCase()}`, version: 'pf-1.2.1', authority },
  families: Object.fromEntries(Object.entries(families).map(([k, v]) => [k, { readiness: 'READY', model: 'F', reason: '', ...v }])),
  games, players,
});

export const decoded = (sport: string, players: Obj[], families: Record<string, Obj> = {}, games: Obj[] = []): ProjectionDoc => decodeProjections(feed(sport, players, families, games))!;

export const mlbPitcher = (over: Obj = {}): Record<string, unknown> => ({
  player_id: '607192', name: 'Tyler Glasnow', team: 'LAD', opponent: 'ATL', game_id: '777', family: 'pitcher_strikeouts',
  mean: 7.4, median: 7, p10: 4, p90: 11, quantiles: { p05: 3, p25: 6, p50: 7, p75: 9, p95: 12 }, thresholds: { '5': 0.86, '7': 0.58, '9': 0.27 },
  opportunity: { family: 'batters_faced', mean: 24.1, p10: 19, p90: 28 }, adjustments: [], readiness: 'READY', gate: { status: 'PASS', findings: [] },
  participation: part('CONFIRMED_ACTIVE', { source: 'mlb_lineup_card' }), role: 'shadow', data_asof_utc: FRESH, ...over,
});

export const cfbGame = {
  game_id: 'g1', start_utc: '2026-10-18T23:30:00Z', home: 'OSU', away: 'PSU',
  teams: [{ team: 'PSU', family: 'team_points', mean: 21.4, p10: 10, p90: 33 }, { team: 'OSU', family: 'team_points', mean: 28.3, p10: 17, p90: 40 },
          { team: 'PSU', family: 'plays', mean: 66, p10: 58, p90: 74 }, { team: 'OSU', family: 'plays', mean: 70, p10: 62, p90: 78 }],
};
