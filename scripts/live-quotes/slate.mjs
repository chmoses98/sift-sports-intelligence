// Which publication events are CURRENT (a live-quote target), and is the publication itself healthy?
//
// One rule, shared by the feed publisher (scripts/publish-live-quotes.mjs: which games get a feed file) and the
// Production check (scripts/production-check.mjs: which game it may test as live). The check used to click the
// NFL page's first card and call it "upcoming"; on 2026-10-07 that card was ATL@NO, kicked off 24 hours earlier
// on a board that had stopped refreshing, so the check demanded FRESH prices from a historical game the feed
// (correctly) did not cover.
//
// Publication status, from the board alone (deterministic, no clock other than `now`):
//   CURRENT_SLATE      at least one eligible event
//   NO_CURRENT_GAMES   none eligible, and nothing on the board claims to be upcoming/live in the past:
//                      a legitimately quiet board (e.g. the next slate is beyond the forward horizon)
//   STALE_PUBLICATION  none eligible AND the board still lists an event as SCHEDULED / IN_PROGRESS / LIVE whose
//                      kickoff is more than the lookback in the past (the board stopped describing the present),
//                      or the board has no trustworthy generated_at. An upstream defect, never "zero games".

/** Started games stay current this long (an NFL game plus margin); the same lookback the feed has always used. */
export const LOOKBACK_HOURS = 8;
/** Upcoming games this far ahead are current (Kalshi lists the next slate's markets about a week ahead). */
export const HORIZON_DAYS = 10;

const LIVE_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'LIVE'];

/** Is this board item a current live-quote target at `now`? FINAL is never; UNKNOWN only inside the lookback. */
export function isEligibleEvent(item, now, { horizonDays = HORIZON_DAYS, lookbackHours = LOOKBACK_HOURS } = {}) {
  const start = Date.parse(item?.start_time_utc ?? '');
  if (Number.isNaN(start)) return false;
  const from = now - lookbackHours * 3600e3;
  if (!(start > from && start < now + horizonDays * 86400e3)) return false;
  return LIVE_STATUSES.includes(item.status) || item.status === 'UNKNOWN';
}

/** Board items still claiming SCHEDULED / IN_PROGRESS / LIVE although they kicked off before the lookback. */
export function danglingEvents(items, now, { lookbackHours = LOOKBACK_HOURS } = {}) {
  return (items ?? []).filter((it) => {
    const start = Date.parse(it?.start_time_utc ?? '');
    return LIVE_STATUSES.includes(it?.status) && !Number.isNaN(start) && start <= now - lookbackHours * 3600e3;
  });
}

const brief = (it) => (it ? { event_id: it.event_id, status: it.status, start_time_utc: it.start_time_utc } : null);

/** The publication-health record the feed index carries and the Production check enforces. */
export function publicationStatus(board, now, { source = null, horizonDays = HORIZON_DAYS, lookbackHours = LOOKBACK_HOURS } = {}) {
  const items = Array.isArray(board?.items) ? board.items : [];
  const generated = Date.parse(board?.generated_at ?? '');
  const eligible = items.filter((it) => isEligibleEvent(it, now, { horizonDays, lookbackHours }));
  const dangling = danglingEvents(items, now, { lookbackHours });
  const latest = [...items].filter((it) => !Number.isNaN(Date.parse(it?.start_time_utc ?? ''))).sort((a, b) => Date.parse(b.start_time_utc) - Date.parse(a.start_time_utc))[0];
  const reasons = [];
  if (Number.isNaN(generated)) reasons.push('the board has no trustworthy generated_at');
  if (!eligible.length && dangling.length) {
    const d = [...dangling].sort((a, b) => Date.parse(b.start_time_utc) - Date.parse(a.start_time_utc))[0];
    const h = Math.floor((now - Date.parse(d.start_time_utc)) / 3600e3);
    reasons.push(`${dangling.length} event(s) still ${d.status} after kickoff (latest ${d.event_id}, kicked off ${d.start_time_utc}, ${h}h ago; lookback ${lookbackHours}h): the publication stopped refreshing`);
  }
  const status = reasons.length ? 'STALE_PUBLICATION' : eligible.length ? 'CURRENT_SLATE' : 'NO_CURRENT_GAMES';
  return {
    status,
    source,
    generated_at: board?.generated_at ?? null,
    age_seconds: Number.isNaN(generated) ? null : Math.round((now - generated) / 1000),
    eligible_games: eligible.length,
    eligible_event_ids: eligible.map((it) => it.event_id),
    latest_event: brief(latest),
    // Started-but-unrefreshed events on a board that still has current games: reported, not fatal.
    stale_events: dangling.map(brief),
    reasons,
    horizon_days: horizonDays,
    lookback_hours: lookbackHours,
  };
}

/** The feed publisher's verdict for one cycle. A stale source never becomes a "healthy" empty feed. */
export function publishVerdict(publication, games, markets) {
  if (publication.status === 'STALE_PUBLICATION') {
    return { publish: false, reason: `the sport publication is stale (${publication.reasons.join('; ')}); not replacing the last-known-good feed` };
  }
  if (games > 0 && markets === 0) return { publish: false, reason: 'no market could be read from Kalshi; not publishing an empty feed' };
  return { publish: true, reason: publication.status === 'NO_CURRENT_GAMES' ? 'no current games: a healthy empty feed' : `${games} game key(s), ${markets} market(s)` };
}

/**
 * The feed's per-sport index entry (index.sport_status, scripts/live-quotes/lib.mjs planFeed). An index written before
 * per-sport status existed is read the old way: the sport is listed when `sports` names it, `status` is the feed's.
 */
export function sportEntry(index, sport) {
  const e = (index?.sport_status ?? []).find((s) => s.sport === sport);
  if (e) return e;
  if (!index || index.sport_status) return null;
  return (index.sports ?? []).includes(sport) ? { sport, status: index.status ?? null, published: index.status !== 'STALE_PUBLICATION', reason: '(index has no sport_status)', legacy: true } : null;
}

/** The feed's game entries for a sport (entries without a `sport`, from an older index, match by game key). */
export function sportGames(index, sport, keys = new Set()) {
  return (index?.games ?? []).filter((g) => g.sport === sport || (g.sport == null && keys.has(g.key)));
}

/**
 * Production check, per sport: when the sport's publication lists current games, the feed must list the sport as
 * published and carry at least one game file whose quoted markets intersect the publication's own tickers.
 *   mode STALE      the publication is stale or unreadable: a failure for THIS sport only
 *   mode OFF_SLATE  no current game: NOT_APPLICABLE, ok
 *   mode CURRENT    `problems` lists what is missing (empty = ok); `file` is the covering game file
 * `files` maps a feed path (games/<key>.json) to its parsed document (the caller fetches the sport's game files).
 */
export function sportCoverage(sport, publication, index, publishedTickers, files = new Map()) {
  if (publication.status === 'STALE_PUBLICATION' || publication.status === 'UNREADABLE_PUBLICATION') {
    return { mode: 'STALE', ok: false, problems: [`the ${sport} publication is ${publication.status === 'STALE_PUBLICATION' ? 'stale' : 'unreadable'} (${publication.reasons.join('; ')})`], file: null };
  }
  if (!publication.eligible_games) return { mode: 'OFF_SLATE', ok: true, problems: [], file: null };
  const problems = [];
  const entry = sportEntry(index, sport);
  if (!entry || !entry.published) problems.push(`the live-quote index does not list ${sport} as published (${entry ? `${entry.status}: ${entry.reason}` : `no ${sport} entry`})`);
  const tickers = publishedTickers instanceof Set ? publishedTickers : new Set(publishedTickers);
  const keys = new Set([...tickers].map((t) => t.split('-')[1]).filter(Boolean));
  const games = sportGames(index, sport, keys);
  const hit = games.find((g) => (files.get(g.file)?.markets ?? []).some((m) => tickers.has(m.ticker)));
  if (!hit) problems.push(`no ${sport} game file in the feed quotes a ticker the ${sport} publication lists (${games.length} ${sport} game file(s) in the index, ${tickers.size} published ticker(s))`);
  return { mode: 'CURRENT', ok: problems.length === 0, problems, file: hit?.file ?? null };
}

const startOf = (it) => Date.parse(it.start_time_utc);

/**
 * The Production check's target. `mode`:
 *   CURRENT     an eligible event exists; `target` is the one to test (a started, still-current game first,
 *               else the soonest upcoming one) and `feed` says whether the feed covers it
 *   OFF_SLATE   no current event and a healthy publication: live-game assertions are NOT_APPLICABLE
 *   STALE       the publication is stale: a production failure
 * `historical` is the most recent non-eligible event, for the off-slate "prices are honest" page.
 */
export function selectTarget(board, now, feedIndex = null, opts = {}) {
  const publication = publicationStatus(board, now, opts);
  const items = Array.isArray(board?.items) ? board.items : [];
  const eligible = items.filter((it) => isEligibleEvent(it, now, opts));
  const started = eligible.filter((it) => startOf(it) <= now).sort((a, b) => startOf(b) - startOf(a));
  const upcoming = eligible.filter((it) => startOf(it) > now).sort((a, b) => startOf(a) - startOf(b));
  const target = started[0] ?? upcoming[0] ?? null;
  const historical = items.filter((it) => !isEligibleEvent(it, now, opts) && !Number.isNaN(startOf(it)) && startOf(it) <= now).sort((a, b) => startOf(b) - startOf(a))[0] ?? null;
  const mode = publication.status === 'STALE_PUBLICATION' ? 'STALE' : target ? 'CURRENT' : 'OFF_SLATE';
  const entry = target ? (feedIndex?.games ?? []).find((g) => (g.event_ids ?? []).includes(target.event_id)) ?? null : null;
  return {
    mode,
    publication,
    target: target ? { event_id: target.event_id, status: target.status, start_time_utc: target.start_time_utc } : null,
    feed: target ? { covered: !!entry && entry.markets > 0, key: entry?.key ?? null, markets: entry?.markets ?? 0 } : null,
    historical: historical ? { event_id: historical.event_id, status: historical.status, start_time_utc: historical.start_time_utc } : null,
  };
}

/**
 * Quote states an off-slate page may honestly show for a historical game whose price comes from the publication
 * capture (no live observation): never younger than the board that carried it.
 */
export function honestPublicationStates(boardGeneratedAt, now) {
  const g = Date.parse(boardGeneratedAt ?? '');
  if (Number.isNaN(g)) return ['UNKNOWN', 'STALE'];
  const age = now - g;
  if (age > 30 * 60e3) return ['STALE', 'UNKNOWN'];
  if (age >= 15 * 60e3) return ['AGING', 'STALE', 'UNKNOWN'];
  return ['FRESH', 'AGING', 'STALE', 'UNKNOWN'];
}
