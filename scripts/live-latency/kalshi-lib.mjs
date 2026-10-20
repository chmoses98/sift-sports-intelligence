// Pure helpers for the Kalshi live-data test (no I/O): schema discovery over an UNKNOWN payload, event→milestone mapping,
// and update-cadence statistics. Written without having seen a real response (the session that wrote it could not reach
// Kalshi), so every function takes "whatever shape arrives" and reports what it found instead of assuming fields.
//
// Documented (docs.kalshi.com, via search summaries): GET /live_data/milestone/{id} → { live_data: { type, details, milestone_id } }
// where `type` names the schema of the flexible `details`; GET /live_data/batch (≤ 100 milestone ids);
// GET /live_data/milestone/{id}/game_stats → { pbp } by period, null for unsupported types or milestones without a Sportradar id;
// `include_player_stats` for pro football, pro basketball and college men's basketball; milestones are found through
// related_event_ticker or `with_milestones` on events. Field-level contents are NOT known.

/** Flatten any JSON into [{path, value}] leaves; array elements collapse to `[]` and keep the first few samples. */
export function flatten(v, path = '', out = [], depth = 0) {
  if (depth > 8) return out;
  if (Array.isArray(v)) {
    out.push({ path: `${path}[]`, value: `(array of ${v.length})`, array: v.length });
    v.slice(0, 3).forEach((x) => flatten(x, `${path}[]`, out, depth + 1));
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) flatten(x, path ? `${path}.${k}` : k, out, depth + 1);
  } else out.push({ path, value: v });
  return out;
}

/** A timestamp from an ISO string or epoch seconds/milliseconds in a plausible range; else null. */
export function parseTime(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v > 1e9 ? v * 1000 : null;
    return ms && ms > Date.UTC(2020, 0, 1) && ms < Date.UTC(2100, 0, 1) ? ms : null;
  }
  return null;
}

const TAGS = [
  ['score', /score|points|runs|goals|^pts$|home_total|away_total/i],
  ['clock', /clock|time_remaining|timeremaining|seconds_left|minute|elapsed|game_time/i],
  ['period', /period|quarter|inning|half|\bset\b|\bqtr\b|\bot\b/i],
  ['status', /status|state|phase|live|complete|final/i],
  ['player', /player|athlete|boxscore|box_score/i],
  ['play', /play|pbp|event|drive|possession|down/i],
  ['team', /team|home|away|competitor/i],
];

export function tagsOf(path, value) {
  const t = TAGS.filter(([, re]) => re.test(path)).map(([n]) => n);
  if (parseTime(value) != null || /(^|[._])(ts|timestamp|updated|updated_at|last_update|created_at|time)$/i.test(path)) t.push('timestamp');
  return t;
}

/** Union the leaf paths seen across payloads of one `type`: how often present, an example, and tags. */
export function summarizeSchema(payloads) {
  const m = new Map();
  for (const p of payloads) {
    for (const leaf of flatten(p)) {
      const e = m.get(leaf.path) ?? { path: leaf.path, seen: 0, example: leaf.value, tags: tagsOf(leaf.path, leaf.value) };
      e.seen++;
      m.set(leaf.path, e);
    }
  }
  return [...m.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** What a feed lets us answer, from its schema: the checklist the owner asked for. */
export function capabilities(schema) {
  const has = (tag) => schema.filter((s) => s.tags.includes(tag)).map((s) => s.path);
  return { score: has('score'), clock: has('clock'), period: has('period'), status: has('status'), timestamp: has('timestamp'), player: has('player'), play: has('play') };
}

const arr = (v) => (Array.isArray(v) ? v : []);
const idOf = (m) => m?.id ?? m?.milestone_id ?? null;

/**
 * Map Kalshi event tickers to milestone ids from either documented route: a /events?with_milestones=true response
 * (events carrying `milestones`, and/or a top-level `milestones` list) or a /milestones response. A milestone names the
 * events it belongs to in primary_event_tickers / related_event_tickers.
 */
export function mapEventsToMilestones(...responses) {
  const map = new Map(); // eventTicker -> Set(milestoneId)
  const add = (ev, mid) => { if (ev && mid) { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(mid); } };
  const meta = new Map(); // milestoneId -> { type, category }
  for (const r of responses) {
    if (!r) continue;
    for (const m of [...arr(r.milestones), ...arr(r.events).flatMap((e) => arr(e.milestones).map((x) => ({ ...x, __event: e.event_ticker })))]) {
      const id = idOf(m);
      if (!id) continue;
      meta.set(id, { type: m.type ?? null, category: m.category ?? null });
      for (const t of [...arr(m.primary_event_tickers), ...arr(m.related_event_tickers)]) add(t, id);
      if (m.__event) add(m.__event, id);
    }
    for (const e of arr(r.events)) for (const mid of arr(e.milestone_ids)) add(e.event_ticker, mid);
  }
  return { map, meta };
}

/** SIFT's Kalshi game key ("26OCT12BUFLAR") and the event ticker the publication's market tickers imply. */
export const eventTickerOf = (marketTicker) => (typeof marketTicker === 'string' && marketTicker.split('-').length >= 3 ? marketTicker.split('-').slice(0, 2).join('-') : null);

/** Gap statistics between observed changes of a milestone's details, per observation list [{t, hash, scoreHash, clockHash}]; `key` picks which hash defines a change. */
export function cadence(obsByMilestone, key = 'hash') {
  const gaps = [];
  const perMilestone = {};
  for (const [id, obs] of Object.entries(obsByMilestone)) {
    const changes = [];
    for (let i = 1; i < obs.length; i++) if (obs[i][key] !== obs[i - 1][key]) changes.push({ t: obs[i].t, prev: obs[i - 1].t });
    const g = changes.slice(1).map((c, i) => c.t - changes[i].t);
    gaps.push(...g);
    perMilestone[id] = { polls: obs.length, changes: changes.length, medianGapMs: g.length ? Math.round(median(g)) : null, maxWindowMs: changes.length ? Math.max(...changes.map((c) => c.t - c.prev)) : null };
  }
  return { perMilestone, changes: Object.values(perMilestone).reduce((n, m) => n + m.changes, 0), medianGapMs: gaps.length ? Math.round(median(gaps)) : null, minGapMs: gaps.length ? Math.min(...gaps) : null };
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) / 2; return (s[Math.floor(i)] + s[Math.ceil(i)]) / 2; };

/** Lag of any provider-supplied timestamp field against our receive time (an upper bound on staleness, never exact). */
export function timestampLags(payload, receivedAt) {
  return flatten(payload).map((l) => ({ path: l.path, t: parseTime(l.value) })).filter((x) => x.t != null).map((x) => ({ path: x.path, lagMs: receivedAt - x.t }));
}

/** Three change fingerprints of a details payload: score-like leaves, clock/period-like leaves, and everything except timestamps. */
export function fingerprints(details, hashFn) {
  const leaves = flatten(details);
  const pick = (f) => hashFn(leaves.filter(f).map((l) => `${l.path}=${l.value}`).join('|'));
  const tg = (l) => tagsOf(l.path, l.value);
  return {
    scoreHash: pick((l) => tg(l).includes('score')),
    clockHash: pick((l) => tg(l).some((t) => t === 'clock' || t === 'period')),
    // A field that is only a timestamp changes on every call and would make a static game look busy.
    hash: pick((l) => !(tg(l).includes('timestamp') && tg(l).every((t) => t === 'timestamp' || t === 'status' || t === 'play'))),
  };
}

/**
 * SIFT's feed game key ("26OCT20ANANYI": date + away + home, taken from the Kalshi tickers themselves) plus the sport's
 * game-winner series is the Kalshi event ticker. Verified against the live quote feed on 2026-10-20: NHL key 26OCT20ANANYI
 * has the event KXNHLGAME-26OCT20ANANYI among its 20 Kalshi events. A milestone belongs to the GAME, so look it up from this
 * event, not from a period or prop market's event (KXNHL1P-…).
 */
export const GAME_SERIES = { NFL: 'KXNFLGAME', NHL: 'KXNHLGAME', MLB: 'KXMLBGAME', NBA: 'KXNBAGAME', CFB: 'KXNCAAFGAME' };
export const gameEventTicker = (sport, key) => (GAME_SERIES[sport] && /^\d{2}[A-Z]{3}\d{2}[A-Z]+$/.test(key ?? '') ? `${GAME_SERIES[sport]}-${key}` : null);

/**
 * Kalshi's own terms, read from the PDFs on 2026-10-20 (Developer Agreement v1.1; Data Terms of Use). The test collects and
 * measures Kalshi API data, which those terms restrict, so it will not run without explicit acknowledgement, and the cadence
 * stage (a performance measurement) has its own.
 */
export const KALSHI_CLAUSES = [
  'Developer Agreement §3: "Use of Kalshi APIs is expressly limited to facilitating a members own trading on the Exchange; all other usages are disallowed and may result in account suspension."',
  'Developer Agreement §3.1 prohibits "Collecting, caching, aggregating, or storing data or content accessed via the API except for purposes of facilitating your own trading on Kalshi. You may not share such data or content with third parties in any manner without prior written authorization from Kalshi."',
  'Developer Agreement §3.5 prohibits "Accessing the API for purposes of monitoring the availability, performance, or functionality of any of Kalshi\'s services or for any other benchmarking or competitive purposes."',
  'Data Terms of Use: content is for "personal use for non-commercial purposes"; publicly displaying, collecting, scraping or transferring Kalshi Data to others without Kalshi\'s (or an applicable third-party provider\'s) prior written authorization is prohibited.',
];

export function kalshiGate({ ackTerms = false, ackBenchmark = false } = {}) {
  if (!ackTerms) return { ok: false, discovery: false, cadence: false, errors: ['Refusing to run: Kalshi\'s published terms restrict this.', ...KALSHI_CLAUSES, 'Ask Kalshi first (docs/outreach/kalshi.md). If you decide to run a short, read-only schema/coverage sample on your own responsibility, pass --ack-kalshi-terms. The latency/cadence stage additionally needs --ack-benchmark.'] };
  return { ok: true, discovery: true, cadence: ackBenchmark, errors: [] };
}
