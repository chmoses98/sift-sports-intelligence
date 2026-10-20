// What the NFL distribution production check should do, decided from the publication's own data (no hard-coded players or games).
//
//   distributionPlan({ items, feed, art, now }) -> { mode, reason, game, targets, problems, notes }
//
//   mode 'NOT_APPLICABLE'  there is nothing to check today: no current NFL game on the schedule, or the feed publishes no promoted-family
//                          (receptions / completions) projection for it. Reported as N/A with the reason, never counted as a pass.
//   mode 'CHECK'           a current game has promoted-family projections: `targets` are the players to open in the live Explorer (the two
//                          highest expected values per family that the distribution artifact carries); `problems` are publication-level
//                          failures found without a browser (artifact missing, malformed, or describing another feed; a feed row that is
//                          neither in the artifact nor listed in its `excluded`).
//
// A game counts as current from LOOKBACK before kick-off-passed (a started game's Explorer still works) to HORIZON ahead, the soonest first.
// Pure and offline: the script fetches, this decides (tests/live/nfl-distribution-plan.test.ts).

export const FAMILIES = ['receptions', 'completions'];
export const LABEL = { receptions: 'Receptions', completions: 'Completions' };
export const LOOKBACK_MS = 6 * 3600e3;
export const HORIZON_MS = 10 * 86400e3;
/** The board names teams one way, the projection feed another for a few clubs. */
const ALIAS = { LA: 'LAR', LAR: 'LA', JAC: 'JAX', JAX: 'JAC', WSH: 'WAS', WAS: 'WSH' };
const sameTeam = (a, b) => !!a && !!b && (a === b || ALIAS[a] === b);
const DONE = /FINAL|CANCEL|POSTPON/i;

export function currentGame(items, now) {
  return (items ?? [])
    .filter((i) => {
      const t = Date.parse(i?.start_time_utc ?? '');
      return Number.isFinite(t) && t > now - LOOKBACK_MS && t < now + HORIZON_MS && !DONE.test(i.status ?? '');
    })
    .sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc))[0] ?? null;
}

const teamsOf = (game) => (game.participants ?? []).map((p) => p.short_name).filter(Boolean);
export const keyOf = (r) => `${r.game_id}|${r.player_id}|${r.family}`;

export function distributionPlan({ items, feed, art, now, perFamily = 2 }) {
  const problems = [];
  const notes = [];
  const game = currentGame(items, now);
  if (!game) return { mode: 'NOT_APPLICABLE', reason: 'no current NFL game on the schedule (every game has finished or none is listed)', game: null, targets: [], problems, notes };
  if (!feed || !Array.isArray(feed.players)) return { mode: 'CHECK', reason: null, game, targets: [], problems: ['the projection feed is unreadable'], notes };
  const teams = teamsOf(game);
  const rows = feed.players.filter((p) => FAMILIES.includes(p.family) && teams.some((t) => sameTeam(t, p.team)));
  if (!rows.length) {
    return { mode: 'NOT_APPLICABLE', reason: `the feed (${feed.generated_utc}) publishes no receptions / completions projection for ${teams.join(' @ ')}`, game, targets: [], problems, notes };
  }
  if (!art) {
    problems.push('the distribution artifact is unreadable or missing');
    return { mode: 'CHECK', reason: null, game, targets: [], problems, notes };
  }
  if (art.schema !== 'sift.projection_distributions.v1') problems.push(`the artifact schema is ${art.schema}`);
  if (art.projection?.generated_utc !== feed.generated_utc) problems.push(`the artifact describes the feed of ${art.projection?.generated_utc}, not the current ${feed.generated_utc}`);
  const have = new Map((art.rows ?? []).map((r) => [keyOf(r), r]));
  const excluded = new Set((art.excluded ?? []).map((e) => keyOf(e)));
  const unaccounted = rows.filter((r) => !have.has(keyOf(r)) && !excluded.has(keyOf(r)));
  if (unaccounted.length) problems.push(`${unaccounted.length} feed row(s) are neither in the artifact nor listed as excluded (${unaccounted.slice(0, 3).map((r) => `${r.name} ${r.family}`).join(', ')})`);
  const skipped = rows.filter((r) => excluded.has(keyOf(r)));
  if (skipped.length) notes.push(`${skipped.length} row(s) honestly excluded by the publisher: ${skipped.slice(0, 3).map((r) => `${r.name} ${r.family}`).join(', ')}`);
  const targets = [];
  for (const family of FAMILIES) {
    rows.filter((r) => r.family === family && have.has(keyOf(r))).sort((a, b) => b.mean - a.mean).slice(0, perFamily)
      .forEach((r) => targets.push({ name: r.name, family, label: LABEL[family], playerId: r.player_id, gameId: r.game_id, mean: r.mean, dist: have.get(keyOf(r)), row: r }));
  }
  if (!targets.length && !problems.length) return { mode: 'NOT_APPLICABLE', reason: 'every promoted-family row for this game is honestly excluded from the artifact', game, targets, problems, notes };
  return { mode: 'CHECK', reason: null, game, targets, problems, notes };
}
