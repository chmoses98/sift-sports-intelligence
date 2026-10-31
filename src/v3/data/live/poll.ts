// A visibility-aware poller. It asks only while the page is visible: a hidden tab stops the timer (and aborts a request in flight), and coming back
// asks at once when the last answer is older than the interval. Errors back off (interval x 2^failures, capped) so a feed that is down is not
// hammered; one success resets it. It never invents an answer: it only reports what the fetch returned or why it did not.
export interface PollOptions<T> {
  fetch: (signal: AbortSignal) => Promise<T>;
  intervalMs: number;
  onData: (v: T) => void;
  onError: (e: unknown) => void;
  maxBackoffMs?: number;
  /** For tests. */
  now?: () => number;
  isHidden?: () => boolean;
}

export function startPoller<T>(o: PollOptions<T>): () => void {
  const now = o.now ?? Date.now;
  const hidden = o.isHidden ?? (() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const max = o.maxBackoffMs ?? 120_000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ctl: AbortController | null = null;
  let stopped = false;
  let fails = 0;
  let lastOk = -Infinity;
  let running = false;

  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const schedule = (ms: number) => { clear(); if (!stopped && !hidden()) timer = setTimeout(run, ms); };
  async function run() {
    clear();
    if (stopped || running || hidden()) return;
    running = true;
    ctl = new AbortController();
    const mine = ctl;
    try {
      const v = await o.fetch(mine.signal);
      if (stopped || mine.signal.aborted) return;
      fails = 0; lastOk = now();
      o.onData(v);
    } catch (e) {
      if (stopped || mine.signal.aborted) return; // a tab that went hidden or a screen that closed is not a failure
      fails += 1;
      o.onError(e);
    } finally {
      running = false;
    }
    schedule(fails ? Math.min(max, o.intervalMs * 2 ** Math.min(fails, 8)) : o.intervalMs);
  }
  const onVis = () => {
    if (stopped) return;
    if (hidden()) { clear(); ctl?.abort(); return; }
    // Back on screen: ask now if the answer on hand is older than one interval, else wait out the rest of it.
    const wait = Math.max(0, lastOk + o.intervalMs - now());
    if (!running) { if (wait === 0 || fails) void run(); else schedule(wait); }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
  if (!hidden()) void run();
  return () => {
    stopped = true;
    clear();
    ctl?.abort();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
  };
}
