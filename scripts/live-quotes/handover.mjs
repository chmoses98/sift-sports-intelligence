// The live-quote loop's hand-over rules, as pure functions (no I/O), so they can be tested without a runner.
//
// Why this exists (docs/ci/QUEUE_ANALYSIS.md, docs/ci/LIVE_QUOTES_RESILIENCE.md): a loop job used to publish for ~55
// minutes and only then dispatch its successor, which then waited for a hosted runner. Measured 2026-10-04 to 10-28:
// 50 of 599 hand-overs waited more than 10 minutes, the longest 69, and the feed stood still for exactly that long.
//
// The rules now:
//   * a job dispatches its successor EARLY (dispatchAtMin) into the other concurrency slot (a/b), so the two can overlap;
//   * it keeps publishing until a younger loop run is demonstrably alive (it started AND its publication is on the branch),
//     never merely until a timer expires, so a long queue wait costs nothing but the predecessor's runner time;
//   * a hard cap (capMin) bounds how long one job may wait for its successor; the job timeout sits above it;
//   * two publishers can briefly overlap, so no publisher ever overwrites a newer `generated_at` with an older one
//     (newestWins) and a second publisher waits until the feed is at least minAgeMs old (cadenceWaitMs), which keeps the
//     Kalshi request rate at one sweep per cycle.

export const LOOP_TITLE = 'Live quotes loop';

export const HANDOVER = Object.freeze({
  cycleMs: 180_000, // one sweep every 3 minutes, as before
  minAgeMs: 150_000, // do not publish when the branch is fresher than this (another publisher just did)
  dispatchAtMin: 45, // dispatch the successor this long after this job started
  capMin: 150, // never wait longer than this for a successor (the workflow's timeout-minutes is capMin + 10)
  staleRestartMin: 10, // the watchdog restarts the loop only when the feed is older than this (the quote monitor's limit)
});

const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);

/** The two concurrency slots alternate; a watchdog restart ('w') or anything unknown hands over to 'a'. */
export const nextSlot = (slot) => (slot === 'a' ? 'b' : 'a');

/**
 * The loop runs of this workflow that are not finished and are not this run. Only workflow_dispatch runs titled by
 * LOOP_TITLE count: a scheduled watchdog run (which usually exits at once) must never be mistaken for a successor.
 * `runs` is the `workflow_runs` array of GET /repos/{r}/actions/workflows/live-quotes.yml/runs.
 */
export function activeLoops(runs, myRunId) {
  return (runs ?? []).filter((r) => r && r.id !== myRunId && r.event === 'workflow_dispatch' && ACTIVE.has(r.status) && typeof r.display_title === 'string' && r.display_title.startsWith(LOOP_TITLE));
}

/** What this job can see of its successor: any active loop run younger (larger id) than itself. */
export function successorOf(runs, myRunId) {
  const younger = activeLoops(runs, myRunId).filter((r) => r.id > myRunId);
  return { exists: younger.length > 0, started: younger.some((r) => r.status === 'in_progress'), ids: younger.map((r) => r.id).sort((a, b) => a - b) };
}

const ms = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? null : t;
};

/** Freshest wins: publish only when this feed is strictly newer than the branch's. An unreadable remote time never blocks. */
export function newestWins(localGeneratedAt, remoteGeneratedAt) {
  const local = ms(localGeneratedAt);
  const remote = ms(remoteGeneratedAt);
  if (local === null) return false; // never publish a feed that does not say when it was generated
  if (remote === null) return true;
  return local > remote;
}

/** How long to wait before generating, so that two overlapping publishers share one cadence (0 = go now). */
export function cadenceWaitMs(remoteGeneratedAt, nowMs, minAgeMs = HANDOVER.minAgeMs) {
  const remote = ms(remoteGeneratedAt);
  if (remote === null) return 0;
  const age = nowMs - remote;
  if (age >= minAgeMs) return 0;
  return Math.min(minAgeMs, minAgeMs - Math.max(age, 0)); // a remote clock ahead of ours waits at most minAgeMs
}

/**
 * The next action at the top of a cycle.
 *   elapsedMin   minutes since this job started
 *   successor    successorOf(...) or null when the run list could not be read
 *   dispatched   true once this job has dispatched its successor
 *   handedOver   true when the branch holds a publication newer than this job's last one (somebody else is publishing)
 * Returns { action: 'publish' | 'dispatch' | 'finish', reason }. 'dispatch' is followed by a normal publish.
 */
export function decide({ elapsedMin, successor, dispatched, handedOver }, cfg = HANDOVER) {
  if (elapsedMin >= cfg.capMin) return { action: 'finish', reason: `reached the ${cfg.capMin} minute cap` };
  if (elapsedMin < cfg.dispatchAtMin) return { action: 'publish', reason: 'loop body' };
  if (successor === null) return dispatched ? { action: 'publish', reason: 'run list unreadable; successor already dispatched' } : { action: 'dispatch', reason: 'run list unreadable; dispatching to be safe' };
  if (successor.started && handedOver) return { action: 'finish', reason: `successor ${successor.ids.join(',')} is running and publishing` };
  if (successor.exists) return { action: 'publish', reason: successor.started ? 'successor started but has not published yet' : 'successor queued; keep publishing until it runs' };
  if (!dispatched) return { action: 'dispatch', reason: 'no successor yet' };
  return { action: 'publish', reason: 'successor dispatched but not visible yet' };
}
