// Schedule-aware expectations for the production monitors.
//
// The NFL home's "Where to look first" rail and the /props hub's top-props board describe the PREGAME slate. When the canonical
// publication lists no pregame NFL game (the Monday-night game has kicked off, the week is over) both screens correctly show an
// honest empty state, and a monitor that demands the populated board reports a failure that is not one. When a pregame game DOES
// exist, an empty state means data is missing and the monitor must fail exactly as before.
//
// So the monitors ask the publication's own schedule what to expect, then judge what the screen shows against THAT:
//
//   expectation(items, now)   -> { rail, hub, pregame, actionable }   each of 'POPULATED' | 'EMPTY_SLATE' | 'EITHER'
//   judgeRail(expect, facts)  -> { ok, mode, msg }
//   judgePropsHub(expect, facts) -> { ok, mode, msg }
//
// 'EITHER' only inside a short window around a kick-off (the screen and the monitor read the clock a few seconds apart); it
// never applies when a game is clearly pregame or clearly over. The predicates mirror the app's own (src/views/props/slate.ts
// upcomingGames, src/lib/priorities.ts isActionable) so the expectation and the screen cannot drift apart silently: the unit test
// pins the mirror against the app's functions.

/** Horizon of the /props hub's game strip (days), as PropsHub passes to upcomingGames. */
export const HUB_HORIZON_DAYS = 8;
/** A kick-off this close to the check makes either state acceptable. */
export const KICKOFF_TOLERANCE_MS = 10 * 60 * 1000;

const t = (it) => Date.parse(it?.start_time_utc ?? '');

/** src/views/props/slate.ts upcomingGames */
export function upcomingGames(items, now, days) {
  return (items ?? []).filter((b) => t(b) > now && t(b) < now + days * 86_400_000 && !/FINAL|CANCEL|POSTPON/i.test(b.status ?? ''))
    .sort((a, b) => (a.start_time_utc ?? '').localeCompare(b.start_time_utc ?? ''));
}

/** src/lib/priorities.ts isActionable */
export function isActionable(item, now) {
  return item?.status === 'SCHEDULED' && Number.isFinite(t(item)) && t(item) > now;
}

const nearKickoff = (items, now, tol) => (items ?? []).some((b) => Number.isFinite(t(b)) && Math.abs(t(b) - now) <= tol && !/FINAL|CANCEL|POSTPON/i.test(b.status ?? ''));

/**
 * What the two screens must show at `now` given the publication's board items.
 * Both are POPULATED when there is a pregame game the screen counts, EMPTY_SLATE when there is none.
 */
export function expectation(items, now, { tolerance = KICKOFF_TOLERANCE_MS } = {}) {
  const hubGames = upcomingGames(items, now, HUB_HORIZON_DAYS).length;
  const actionable = (items ?? []).filter((i) => isActionable(i, now)).length;
  const edge = nearKickoff(items, now, tolerance);
  const mode = (n) => (edge ? 'EITHER' : n > 0 ? 'POPULATED' : 'EMPTY_SLATE');
  return { pregame: hubGames, actionable, rail: mode(actionable), hub: mode(hubGames) };
}

/**
 * The NFL home rail. facts: { list: bool (the ranked list is shown), items: n (linked items), emptyState: bool ("No upcoming games"),
 * waiting: bool ("Reading this week's research…" still showing) }.
 */
export function judgeRail(expect, facts) {
  const want = expect.rail;
  if (facts.waiting && !facts.list && !facts.emptyState) return { ok: false, mode: want, msg: 'the rail never finished loading (still reading the research)' };
  if (!facts.list && !facts.emptyState) return { ok: false, mode: want, msg: 'the rail rendered neither its list nor its empty state (broken rendering)' };
  if (want === 'EMPTY_SLATE') {
    if (facts.list) return { ok: false, mode: want, msg: 'the publication lists no pregame game but the rail shows a ranked list' };
    return { ok: true, mode: 'EMPTY_SLATE', msg: 'no pregame NFL game on the schedule: the rail says so ("No upcoming games")' };
  }
  if (want === 'POPULATED') {
    if (!facts.list) return { ok: false, mode: want, msg: `the publication lists ${expect.actionable} pregame game(s) but the rail shows its empty state (data missing)` };
    return { ok: true, mode: 'POPULATED', msg: `${expect.actionable} pregame game(s): the rail lists its priorities` };
  }
  return { ok: true, mode: facts.list ? 'POPULATED' : 'EMPTY_SLATE', msg: 'a kick-off is within minutes: either state is correct' };
}

/**
 * The /props hub. facts: { heading: bool (h1), tiles: n (sport entries), tprops: bool (top-props section), rows: n, boardEmpty: n (the
 * section's own honest empty state), strip: n (game links in the NFL strip), note: bool ("No upcoming NFL games are listed…"),
 * unavailable: bool ("NFL props are unavailable right now": the publication could not be read) }.
 */
export function judgePropsHub(expect, facts) {
  const want = expect.hub;
  if (!facts.heading) return { ok: false, mode: want, msg: 'the hub heading never rendered (broken rendering)' };
  if (facts.unavailable) return { ok: false, mode: want, msg: 'the hub says the NFL publication could not be read (missing data, not an empty slate)' };
  if (facts.tiles < 1) return { ok: false, mode: want, msg: 'the hub shows no sport entry (broken rendering)' };
  const populated = facts.tprops;
  if (want === 'EMPTY_SLATE') {
    if (populated) return { ok: false, mode: want, msg: 'the publication lists no pregame game but the hub shows a top-props board' };
    if (!facts.note) return { ok: false, mode: want, msg: 'no pregame game, but the hub does not say so ("No upcoming NFL games are listed in the publication.")' };
    return { ok: true, mode: 'EMPTY_SLATE', msg: 'no pregame NFL game on the schedule: the hub says so and shows no top-props board' };
  }
  if (want === 'POPULATED') {
    if (!populated) return { ok: false, mode: want, msg: `the publication lists ${expect.pregame} pregame game(s) but the hub has no top-props board (data missing)` };
    if (!(facts.rows > 0 || facts.boardEmpty > 0)) return { ok: false, mode: want, msg: 'the top-props board shows neither rows nor its honest empty state' };
    if (!(facts.strip > 0)) return { ok: false, mode: want, msg: 'the hub lists no game to open' };
    return { ok: true, mode: 'POPULATED', msg: `${expect.pregame} pregame game(s): the top-props board renders (${facts.rows} rows${facts.boardEmpty ? ', honest empty state' : ''})` };
  }
  return { ok: true, mode: populated ? 'POPULATED' : 'EMPTY_SLATE', msg: 'a kick-off is within minutes: either state is correct' };
}
