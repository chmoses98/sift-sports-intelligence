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

// The CFB feed's real shape: teams by NAME plus ESPN ids (home_id / away_id / team_id), not SIFT's contract codes (PSU, OSU).
export const cfbGame = {
  game_id: 'g1', start_utc: '2026-10-18T23:30:00Z', home: 'Ohio State', away: 'Penn State', home_id: '194', away_id: '213',
  teams: [
    { team: 'Penn State', team_id: '213', family: 'team_points', mean: 21.4, p10: 10, p90: 33 }, { team: 'Ohio State', team_id: '194', family: 'team_points', mean: 28.3, p10: 17, p90: 40 },
    { team: 'Penn State', team_id: '213', family: 'plays', mean: 66, p10: 58, p90: 74 }, { team: 'Ohio State', team_id: '194', family: 'plays', mean: 70, p10: 62, p90: 78 }],
};

/**
 * A coherent published distribution for a count outcome: a negative-binomial pmf (mean `mu`, var = mu + alpha·mu²) read the way the
 * NFL publisher reads its own — mean, median, p10/p90, the seven quantiles (smallest x with F(x) ≥ level) and P(X ≥ k) for every
 * integer line, all from the one pmf, rounded as published. Use `declare` on the document (`feedWithDistribution`).
 */
export function pmfDistribution(mu: number, alpha = 0.15, K = 40): { mean: number; median: number; p10: number; p90: number; quantiles: Record<string, number>; thresholds: Record<string, number> } {
  const r = 1 / alpha, p = r / (r + mu);
  const lg = (n: number): number => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
  const pmf = Array.from({ length: K }, (_, x) => Math.exp(gammaLn(x + r) - gammaLn(r) - lg(x) + r * Math.log(p) + x * Math.log(1 - p)));
  const z = pmf.reduce((a, b) => a + b, 0);
  const P = pmf.map((v) => v / z);
  const cdf: number[] = [];
  P.reduce((a, v, i) => (cdf[i] = a + v), 0);
  const q = (lvl: number) => cdf.findIndex((c) => c >= lvl - 1e-12);
  const mean = P.reduce((a, v, i) => a + v * i, 0);
  const thresholds: Record<string, number> = {};
  for (let k = 1; k < K; k++) { const s = 1 - cdf[k - 1]; if (s >= 1e-3 && s <= 1 - 1e-3) thresholds[String(k)] = Math.round(s * 1e4) / 1e4; }
  const quantiles = { p05: q(0.05), p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), p95: q(0.95) };
  return { mean: Math.round(mean * 1000) / 1000, median: quantiles.p50, p10: quantiles.p10, p90: quantiles.p90, quantiles, thresholds };
}
function gammaLn(x: number): number {
  const c = [76.1800917294715, -86.5053203294168, 24.0140982408309, -1.23173957245015, 0.120865097386618e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  let s = 1.00000000019002;
  for (const cj of c) s += cj / ++y;
  return -t + Math.log((2.506628274631 * s) / x);
}

/** A `sift.projections.v1` document that declares the pmf basis of its quantiles (what the NFL publisher now writes). */
export const feedWithDistribution = (sport: string, players: Obj[], families: Record<string, Obj> = {}, games: Obj[] = []): Record<string, unknown> => ({
  ...feed(sport, players, families, games),
  distribution: { schema: 'sift.projection_distribution.v1', quantile_rule: 'smallest integer x with P(X <= x) >= level, from the same integer pmf as the mean and the threshold probabilities', levels: [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95] },
});
