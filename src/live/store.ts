// The live-quote store: one per app, shared by every screen. It owns the MARKET clock.
//
// * Screens register scopes ("these tickers at game cadence", "these events for inventory") and
//   read quotes; they never call a provider themselves.
// * One scheduler serves every scope: a ticker visible in five components is requested once, at the
//   fastest cadence any of them asked for; tickers are batched (100 per Kalshi request).
// * Requests pause while the page is hidden or offline and while the provider is backing off; becoming
//   visible or online refreshes the current scope immediately.
// * Failures never erase a quote. The last-known-good observation stays, with its real timestamp, so
//   its freshness keeps aging honestly (src/live/freshness.ts).
// * It never touches the research fetch cache (src/data/fetcher.ts): research documents may be
//   memoised for navigation speed; quotes may not.
import { ProviderError, type LiveQuote, type ProviderResult, type QuoteProvider } from './types';

export type Cadence = 'detail' | 'game' | 'slate' | 'background';

/** Desired refresh periods while a scope is on screen (owner targets; the provider may be slower). */
export const CADENCE_MS: Record<Cadence, number> = {
  detail: 20_000, // a market detail screen: 15-30 s
  game: 45_000, // game / player markets: 30-60 s
  slate: 90_000, // slate-level summaries: 60-120 s
  background: 180_000, // inventory (new / closed contracts): 2-5 min
};

export const REQUEST_TIMEOUT_MS = 8_000;
export const BACKOFF_BASE_MS = 4_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
/** A refresh within this window counts as current when the app returns to the foreground. */
const RESUME_DEDUPE_MS = 2_000;
const MAX_PERSISTED = 2_000;

export interface Env {
  isVisible(): boolean;
  isOnline(): boolean;
  /** Subscribe to visibility/online changes; returns an unsubscribe. */
  onChange(cb: () => void): () => void;
}

export interface Persistence {
  load(): LiveQuote[];
  save(quotes: LiveQuote[]): void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface StoreOptions {
  provider: QuoteProvider | null;
  now?: () => number;
  env?: Env;
  timers?: Timers;
  persistence?: Persistence | null;
  random?: () => number;
}

export interface ScopeSpec {
  tickers?: Iterable<string>;
  /** Provider event tickers whose full current listing should be tracked (inventory). */
  events?: Iterable<string>;
  cadence: Cadence;
  /** Inventory cadence for `events` (default: background). */
  eventCadence?: Cadence;
}

interface Scope {
  tickers: Set<string>;
  events: Set<string>;
  cadence: Cadence;
  eventCadence: Cadence;
}

export interface TickerState {
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  /** The provider answered and does not list this ticker. */
  missing: boolean;
}

export interface EventState {
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  tickers: Set<string>;
}

export interface Diagnostics {
  provider: string;
  providerLabel: string;
  answeredBy: string | null;
  requests: number;
  batches: number;
  tickersRequested: number;
  tickersRefreshed: number;
  tickersFailed: number;
  tickersMissing: number;
  lastRequestAt: number | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  lastLatencyMs: number | null;
  backoffUntil: number | null;
  backoffReason: string | null;
  consecutiveFailures: number;
  online: boolean;
  visible: boolean;
  activeScopes: number;
  trackedTickers: number;
  trackedEvents: number;
}

export interface RefreshResult {
  /** Every ticker asked for. */
  requested: string[];
  /** Tickers the provider answered for during this refresh. */
  refreshed: string[];
  /** Tickers the provider answered without (delisted / unknown). */
  missing: string[];
  /** Tickers whose request failed or timed out (they keep their last-known-good quote). */
  failed: string[];
  error: string | null;
  timedOut: boolean;
  startedAt: number;
  finishedAt: number;
}

const defaultTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export function browserEnv(): Env {
  const doc = typeof document !== 'undefined' ? document : null;
  return {
    isVisible: () => !doc || doc.visibilityState !== 'hidden',
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    onChange(cb) {
      if (typeof window === 'undefined') return () => {};
      doc?.addEventListener('visibilitychange', cb);
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      window.addEventListener('pageshow', cb);
      window.addEventListener('focus', cb);
      return () => {
        doc?.removeEventListener('visibilitychange', cb);
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
        window.removeEventListener('pageshow', cb);
        window.removeEventListener('focus', cb);
      };
    },
  };
}

export const PERSIST_KEY = 'sift.liveQuotes.v1';

/** Previously seen quotes survive a reload/offline start, still carrying their true observation time. */
export function localPersistence(storage: Storage | undefined = globalThis.localStorage): Persistence {
  return {
    load() {
      try {
        const raw = storage?.getItem(PERSIST_KEY);
        const arr = raw ? (JSON.parse(raw) as LiveQuote[]) : [];
        return Array.isArray(arr) ? arr.filter((q) => q && typeof q.ticker === 'string' && typeof q.observedAt === 'string') : [];
      } catch {
        return [];
      }
    },
    save(quotes) {
      try {
        const keep = [...quotes].sort((a, b) => b.observedAt.localeCompare(a.observedAt)).slice(0, MAX_PERSISTED);
        storage?.setItem(PERSIST_KEY, JSON.stringify(keep));
      } catch {
        /* storage full or blocked: quotes still work for this session */
      }
    },
  };
}

export class QuoteStore {
  readonly provider: QuoteProvider | null;
  private quotes = new Map<string, LiveQuote>();
  private tickerState = new Map<string, TickerState>();
  private eventState = new Map<string, EventState>();
  private scopes = new Map<number, Scope>();
  private nextScopeId = 1;
  private inflightTickers = new Set<string>();
  private inflightEvents = new Set<string>();
  private listeners = new Set<() => void>();
  private version = 0;
  private timer: unknown = null;
  private timerAt = 0;
  private envOff: (() => void) | null = null;
  private wasActive = true;
  private persistTimer: unknown = null;
  private now: () => number;
  private env: Env;
  private timers: Timers;
  private persistence: Persistence | null;
  private random: () => number;
  private backoff = { failures: 0, until: 0, reason: null as string | null, rateLimited: false };
  private diag: Omit<Diagnostics, 'online' | 'visible' | 'activeScopes' | 'trackedTickers' | 'trackedEvents' | 'backoffUntil' | 'backoffReason' | 'consecutiveFailures' | 'provider' | 'providerLabel' | 'answeredBy'> = {
    requests: 0, batches: 0, tickersRequested: 0, tickersRefreshed: 0, tickersFailed: 0, tickersMissing: 0,
    lastRequestAt: null, lastSuccessAt: null, lastErrorAt: null, lastError: null, lastLatencyMs: null,
  };

  constructor(o: StoreOptions) {
    this.provider = o.provider;
    this.now = o.now ?? Date.now;
    this.env = o.env ?? browserEnv();
    this.timers = o.timers ?? defaultTimers;
    this.persistence = o.persistence === undefined ? null : o.persistence;
    this.random = o.random ?? Math.random;
    for (const q of this.persistence?.load() ?? []) this.accept(q);
    this.wasActive = this.active();
  }

  // ---------------------------------------------------------------- reading

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  quote(ticker: string): LiveQuote | undefined {
    return this.quotes.get(ticker);
  }

  /** Every quote held (diagnostics). */
  allQuotes(): LiveQuote[] {
    return [...this.quotes.values()];
  }

  ticker(ticker: string): TickerState | undefined {
    return this.tickerState.get(ticker);
  }

  event(eventTicker: string): EventState | undefined {
    return this.eventState.get(eventTicker);
  }

  /** Every quote the provider currently lists under these event tickers. */
  eventQuotes(eventTickers: Iterable<string>): LiveQuote[] {
    const out: LiveQuote[] = [];
    for (const e of eventTickers) {
      for (const t of this.eventState.get(e)?.tickers ?? []) {
        const q = this.quotes.get(t);
        if (q) out.push(q);
      }
    }
    return out;
  }

  get enabled(): boolean {
    return this.provider != null;
  }

  diagnostics(): Diagnostics {
    const tickers = new Set<string>();
    const events = new Set<string>();
    for (const s of this.scopes.values()) {
      s.tickers.forEach((t) => tickers.add(t));
      s.events.forEach((e) => events.add(e));
    }
    const answered = (this.provider as { lastAnswered?: string | null } | null)?.lastAnswered ?? null;
    return {
      ...this.diag,
      provider: this.provider?.id ?? 'none',
      providerLabel: this.provider?.label ?? 'No live provider configured',
      answeredBy: answered ?? (this.diag.lastSuccessAt ? this.provider?.id ?? null : null),
      backoffUntil: this.backoff.until > this.now() ? this.backoff.until : null,
      backoffReason: this.backoff.until > this.now() ? this.backoff.reason : null,
      consecutiveFailures: this.backoff.failures,
      online: this.env.isOnline(),
      visible: this.env.isVisible(),
      activeScopes: this.scopes.size,
      trackedTickers: tickers.size,
      trackedEvents: events.size,
    };
  }

  // ---------------------------------------------------------------- scopes

  /** Track a set of tickers/events while a screen shows them. Returns the release function. */
  addScope(spec: ScopeSpec): () => void {
    const id = this.nextScopeId++;
    this.scopes.set(id, {
      tickers: new Set(spec.tickers ?? []),
      events: new Set(spec.events ?? []),
      cadence: spec.cadence,
      eventCadence: spec.eventCadence ?? 'background',
    });
    this.ensureEnvListener();
    this.schedule(0);
    return () => {
      this.scopes.delete(id);
      if (!this.scopes.size) {
        this.clearTimer();
        this.envOff?.();
        this.envOff = null;
      }
    };
  }

  private ensureEnvListener() {
    if (this.envOff) return;
    this.envOff = this.env.onChange(() => this.onEnvChange());
  }

  private active(): boolean {
    return this.env.isVisible() && this.env.isOnline();
  }

  private onEnvChange() {
    const active = this.active();
    const resumed = active && !this.wasActive;
    this.wasActive = active;
    this.bump();
    if (!active) {
      this.clearTimer();
      return;
    }
    if (resumed) {
      // Back from the background / offline: the scope on screen is refreshed now, not at its next slot.
      const tickers = new Set<string>();
      const events = new Set<string>();
      for (const s of this.scopes.values()) {
        s.tickers.forEach((t) => tickers.add(t));
        s.events.forEach((e) => events.add(e));
      }
      const t = this.now();
      const fresh = (st: { lastAttemptAt: number | null } | undefined) => st?.lastAttemptAt != null && t - st.lastAttemptAt < RESUME_DEDUPE_MS;
      void this.run([...tickers].filter((x) => !fresh(this.tickerState.get(x))), [...events].filter((x) => !fresh(this.eventState.get(x))), { force: true });
    }
    this.schedule(0);
  }

  private intervalFor(cadences: Cadence[]): number {
    const want = Math.min(...cadences.map((c) => CADENCE_MS[c]));
    return Math.max(want, this.provider?.minIntervalMs ?? 0);
  }

  /** What is due now, and when the next thing becomes due. */
  private plan(): { tickers: string[]; events: string[]; nextAt: number } {
    const t = this.now();
    const tickerCad = new Map<string, Cadence[]>();
    const eventCad = new Map<string, Cadence[]>();
    for (const s of this.scopes.values()) {
      for (const x of s.tickers) tickerCad.set(x, [...(tickerCad.get(x) ?? []), s.cadence]);
      for (const e of s.events) eventCad.set(e, [...(eventCad.get(e) ?? []), s.eventCadence]);
    }
    let nextAt = Infinity;
    const due = <S extends { lastAttemptAt: number | null }>(id: string, cads: Cadence[], st: S | undefined, inflight: Set<string>) => {
      if (inflight.has(id)) return false;
      const every = this.intervalFor(cads);
      const at = st?.lastAttemptAt == null ? t : st.lastAttemptAt + every;
      if (at <= t) return true;
      nextAt = Math.min(nextAt, at);
      return false;
    };
    const tickers = [...tickerCad].filter(([x, c]) => due(x, c, this.tickerState.get(x), this.inflightTickers)).map(([x]) => x);
    const events = [...eventCad].filter(([x, c]) => due(x, c, this.eventState.get(x), this.inflightEvents)).map(([x]) => x);
    return { tickers, events, nextAt };
  }

  private clearTimer() {
    if (this.timer != null) this.timers.clear(this.timer);
    this.timer = null;
    this.timerAt = 0;
  }

  private schedule(delayMs: number) {
    if (!this.provider || !this.scopes.size) return;
    const at = this.now() + Math.max(0, delayMs);
    if (this.timer != null && this.timerAt <= at) return;
    this.clearTimer();
    this.timerAt = at;
    this.timer = this.timers.set(() => {
      this.timer = null;
      this.timerAt = 0;
      this.tick();
    }, Math.max(0, delayMs));
  }

  private tick() {
    if (!this.provider || !this.scopes.size || !this.active()) return;
    const t = this.now();
    if (this.backoff.until > t) {
      this.schedule(this.backoff.until - t);
      return;
    }
    const p = this.plan();
    if (p.tickers.length || p.events.length) {
      void this.run(p.tickers, p.events, { force: false }).finally(() => this.schedule(0));
      return;
    }
    if (Number.isFinite(p.nextAt)) this.schedule(Math.max(250, p.nextAt - t));
  }

  // ---------------------------------------------------------------- fetching

  /**
   * Refresh tickers now (packet preflight, manual refresh). Bounded: resolves by `timeoutMs` at the
   * latest, with whatever arrived; tickers still pending are reported as failed and keep their
   * last-known-good quote.
   */
  async refreshNow(tickers: Iterable<string>, opts: { timeoutMs?: number; events?: Iterable<string> } = {}): Promise<RefreshResult> {
    const want = [...new Set(tickers)];
    const events = [...new Set(opts.events ?? [])];
    const startedAt = this.now();
    const base: RefreshResult = { requested: want, refreshed: [], missing: [], failed: [], error: null, timedOut: false, startedAt, finishedAt: startedAt };
    if (!this.provider) return { ...base, failed: want, error: 'no live quote provider configured', finishedAt: this.now() };
    if (!this.env.isOnline()) return { ...base, failed: want, error: 'offline', finishedAt: this.now() };
    if (this.backoff.rateLimited && this.backoff.until > startedAt) {
      return { ...base, failed: want, error: 'provider is rate limiting; waiting before asking again', finishedAt: this.now() };
    }
    const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
    let timedOut = false;
    const ctrl = new AbortController();
    const work = this.run(want, events, { force: true, signal: ctrl.signal });
    let handle: unknown = null;
    const timeout = new Promise<null>((resolve) => {
      handle = this.timers.set(() => {
        timedOut = true;
        ctrl.abort();
        resolve(null);
      }, timeoutMs);
    });
    const r = await Promise.race([work, timeout]);
    this.timers.clear(handle);
    const finishedAt = this.now();
    if (!r) {
      // Whatever landed before the deadline still counts.
      const refreshed = want.filter((x) => (this.tickerState.get(x)?.lastSuccessAt ?? -1) >= startedAt);
      return { ...base, refreshed, failed: want.filter((x) => !refreshed.includes(x)), error: `timed out after ${Math.round(timeoutMs / 1000)}s`, timedOut, finishedAt };
    }
    return { ...r, timedOut, finishedAt };
  }

  private async run(tickers: string[], events: string[], o: { force: boolean; signal?: AbortSignal }): Promise<RefreshResult> {
    const startedAt = this.now();
    const provider = this.provider!;
    const res: RefreshResult = { requested: [...tickers], refreshed: [], missing: [], failed: [], error: null, timedOut: false, startedAt, finishedAt: startedAt };
    if (!provider) return res;
    const todoTickers = o.force ? tickers : tickers.filter((x) => !this.inflightTickers.has(x));
    const todoEvents = o.force ? events : events.filter((x) => !this.inflightEvents.has(x));
    todoTickers.forEach((x) => this.inflightTickers.add(x));
    todoEvents.forEach((x) => this.inflightEvents.add(x));
    for (const x of todoTickers) this.touchTicker(x, startedAt);
    for (const e of todoEvents) this.touchEvent(e, startedAt);
    this.bump();

    const batches: { kind: 'tickers' | 'events'; ids: string[] }[] = [];
    // Inventory first (an event listing also refreshes every ticker in it), as ONE provider call: the
    // provider groups events its own cheapest way (Kalshi: one listing per series; feed: one file per
    // game), so splitting here would list the same series twice.
    if (todoEvents.length) batches.push({ kind: 'events', ids: todoEvents });
    for (let i = 0; i < todoTickers.length; i += provider.maxBatch) batches.push({ kind: 'tickers', ids: todoTickers.slice(i, i + provider.maxBatch) });

    try {
      for (const b of batches) {
        if (o.signal?.aborted) break;
        let ids = b.ids;
        if (b.kind === 'tickers') {
          // Covered by an event listing that just answered in this run.
          ids = ids.filter((x) => (this.tickerState.get(x)?.lastSuccessAt ?? -1) < startedAt);
          if (!ids.length) {
            res.refreshed.push(...b.ids.filter((x) => tickers.includes(x)));
            continue;
          }
        }
        const ctrl = new AbortController();
        const onAbort = () => ctrl.abort();
        o.signal?.addEventListener('abort', onAbort);
        const kill = this.timers.set(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
        const t0 = this.now();
        this.diag.batches++;
        this.diag.lastRequestAt = t0;
        if (b.kind === 'tickers') this.diag.tickersRequested += ids.length;
        try {
          const r: ProviderResult = b.kind === 'tickers' ? await provider.fetchQuotes(ids, ctrl.signal) : await provider.fetchEventMarkets(ids, ctrl.signal);
          this.onSuccess(b.kind, ids, r, t0, res);
        } catch (e) {
          const err = e instanceof ProviderError ? e : new ProviderError('network', String((e as Error)?.message ?? e));
          const timedOut = err.kind === 'aborted' && !o.signal?.aborted;
          this.onFailure(b.kind, ids, timedOut ? new ProviderError('timeout', `no answer within ${REQUEST_TIMEOUT_MS / 1000}s`) : err, res);
          if (err.kind === 'rate_limited' || err.kind === 'blocked' || err.kind === 'network' || timedOut) break; // don't hammer a failing provider
        } finally {
          this.timers.clear(kill);
          o.signal?.removeEventListener('abort', onAbort);
        }
      }
    } finally {
      todoTickers.forEach((x) => this.inflightTickers.delete(x));
      todoEvents.forEach((x) => this.inflightEvents.delete(x));
    }
    const answered = new Set([...res.refreshed, ...res.missing]);
    res.failed = [...new Set([...res.failed, ...tickers.filter((x) => !answered.has(x))])].filter((x) => !answered.has(x));
    res.refreshed = [...new Set(res.refreshed)].filter((x) => tickers.includes(x));
    res.missing = [...new Set(res.missing)].filter((x) => tickers.includes(x));
    res.finishedAt = this.now();
    this.bump();
    return res;
  }

  private touchTicker(x: string, at: number) {
    const st = this.tickerState.get(x) ?? { lastAttemptAt: null, lastSuccessAt: null, lastError: null, missing: false };
    st.lastAttemptAt = at;
    this.tickerState.set(x, st);
  }

  private touchEvent(e: string, at: number) {
    const st = this.eventState.get(e) ?? { lastAttemptAt: null, lastSuccessAt: null, lastError: null, tickers: new Set<string>() };
    st.lastAttemptAt = at;
    this.eventState.set(e, st);
  }

  private onSuccess(kind: 'tickers' | 'events', ids: string[], r: ProviderResult, t0: number, res: RefreshResult) {
    const t = this.now();
    this.diag.requests += r.requests;
    this.diag.lastLatencyMs = r.latencyMs ?? t - t0;
    this.diag.lastSuccessAt = t;
    this.backoff = { failures: 0, until: 0, reason: null, rateLimited: false };
    for (const q of r.quotes) {
      this.accept(q);
      const st = this.tickerState.get(q.ticker) ?? { lastAttemptAt: t0, lastSuccessAt: null, lastError: null, missing: false };
      st.lastSuccessAt = t;
      st.lastError = null;
      st.missing = false;
      if (st.lastAttemptAt == null) st.lastAttemptAt = t0;
      this.tickerState.set(q.ticker, st);
      res.refreshed.push(q.ticker);
    }
    if (kind === 'tickers') this.diag.tickersRefreshed += r.quotes.length;
    for (const x of r.missing) {
      const st = this.tickerState.get(x) ?? { lastAttemptAt: t0, lastSuccessAt: null, lastError: null, missing: true };
      st.missing = true;
      st.lastError = null;
      st.lastSuccessAt = t;
      this.tickerState.set(x, st);
      res.missing.push(x);
    }
    this.diag.tickersMissing += r.missing.length;
    if (kind === 'events') {
      for (const e of ids) {
        const st = this.eventState.get(e)!;
        st.lastSuccessAt = t;
        st.lastError = null;
        st.tickers = new Set(r.quotes.filter((q) => q.eventTicker === e).map((q) => q.ticker));
      }
    }
    this.persistSoon();
  }

  private onFailure(kind: 'tickers' | 'events', ids: string[], err: ProviderError, res: RefreshResult) {
    const t = this.now();
    this.diag.lastErrorAt = t;
    this.diag.lastError = `${err.kind}: ${err.message}`;
    res.error = this.diag.lastError;
    if (kind === 'tickers') {
      this.diag.tickersFailed += ids.length;
      for (const x of ids) {
        const st = this.tickerState.get(x)!;
        st.lastError = err.message;
        res.failed.push(x);
      }
    } else {
      for (const e of ids) this.eventState.get(e)!.lastError = err.message;
    }
    const failures = this.backoff.failures + 1;
    let wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
    wait = Math.round(wait * (0.8 + 0.4 * this.random()));
    if (err.kind === 'rate_limited') wait = Math.max(wait, err.retryAfterMs ?? 30_000);
    this.backoff = { failures, until: t + wait, reason: err.kind, rateLimited: err.kind === 'rate_limited' };
  }

  /** Keep the newer observation: a slow or cached answer never overwrites a fresher quote. */
  private accept(q: LiveQuote) {
    const cur = this.quotes.get(q.ticker);
    if (cur && Date.parse(cur.observedAt) > Date.parse(q.observedAt)) return;
    this.quotes.set(q.ticker, q);
  }

  private persistSoon() {
    if (!this.persistence || this.persistTimer != null) return;
    this.persistTimer = this.timers.set(() => {
      this.persistTimer = null;
      this.persistence?.save([...this.quotes.values()]);
    }, 1500);
  }

  private bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Tests: forget everything. */
  dispose() {
    this.clearTimer();
    this.envOff?.();
    this.envOff = null;
    this.scopes.clear();
    this.listeners.clear();
  }
}
