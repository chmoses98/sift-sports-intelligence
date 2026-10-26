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
// * Screens that show prices (list rows, an exact contract) register scopes WITH a QuoteContext
//   (addRowsScope / addContractScope) and read prices through renderQuote(): the single usability rule in
//   src/live/quoteUsable.ts decides display, every render is counted by the availability meter, and every
//   refresh outcome is kept in a bounded in-memory history. All of that is internal diagnostics; none of it
//   is ever shown as freshness text.
import { AvailabilityMeter, NO_PROVIDER } from './availability';
import { assessBatch, maxAgeMs, quoteUsable, type QuoteContext, type Usability } from './quoteUsable';
import { ProviderError, type FallbackNote, type FetchOptions, type LiveQuote, type ProviderResult, type QuoteProvider } from './types';

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
/** Refresh outcomes kept in memory (diagnostics). */
export const HISTORY_LIMIT = 200;
/**
 * With a QuoteContext, the relay gets this long before the feed is asked, so a hung relay still leaves
 * time for the feed inside the 8 s bound of a forced refresh.
 */
export const PRIMARY_TIMEOUT_MS = 4_000;
/** Visible-row scopes are capped: two relay batches. The 900-contract universe is never polled. */
export const MAX_ROW_TICKERS = 200;

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
  /**
   * What these tickers are shown as (list row / exact contract, with the game's scheduled start). Gives
   * the refresh a maximum observation age: a relay answer older than that is a failed refresh and the
   * feed is asked. Absent = legacy scope, refreshed exactly as before.
   */
  context?: QuoteContext;
  /** Provider event tickers whose full current listing should be tracked (inventory). */
  events?: Iterable<string>;
  cadence: Cadence;
  /** Inventory cadence for `events` (default: background). */
  eventCadence?: Cadence;
}

interface Scope {
  context: QuoteContext | null;
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

export type RefreshOutcomeKind = 'ok' | 'over_limit' | 'rate_limited' | 'timeout' | 'error';

/** One provider call, for diagnostics (never rendered). */
export interface RefreshOutcome {
  at: number;
  kind: 'tickers' | 'events';
  tickers: number;
  /** The provider that answered; null when none did. */
  provider: string | null;
  /** Why an earlier provider was skipped ("rate_limited: ... (HTTP 429)"), or the failure when none answered. */
  fallbackReason: string | null;
  latencyMs: number | null;
  /** Age of the newest believable observation in the answer, at receipt. */
  observationAgeMs: number | null;
  outcome: RefreshOutcomeKind;
}

export interface Diagnostics {
  provider: string;
  providerLabel: string;
  /** Which provider answered the last quote batch (drives LIVE vs FEED). */
  answeredBy: string | null;
  /** The quote primary's failure when a fallback answered the last quote batch (e.g. relay HTTP 429). */
  fallback: FallbackNote | null;
  /** The inventory chain (which provider is asked first for listed contracts). */
  inventoryProviderLabel: string;
  /** Which provider answered the last inventory sweep. */
  inventoryAnsweredBy: string | null;
  /** The inventory primary's failure when a fallback answered the last sweep. */
  inventoryFallback: FallbackNote | null;
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
  /** The most recent provider call's outcome (see refreshHistory()). */
  lastOutcome: RefreshOutcome | null;
  /** Relay clock minus device clock, when the relay's Date header is readable; 0 = trust the device clock. */
  clockSkewMs: number;
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
  private history: RefreshOutcome[] = [];
  private clockSkew = 0;
  readonly meter = new AvailabilityMeter();
  private backoff = { failures: 0, until: 0, reason: null as string | null, rateLimited: false };
  private diag: Omit<Diagnostics, 'online' | 'visible' | 'activeScopes' | 'trackedTickers' | 'trackedEvents' | 'backoffUntil' | 'backoffReason' | 'consecutiveFailures' | 'provider' | 'providerLabel' | 'inventoryProviderLabel' | 'lastOutcome' | 'clockSkewMs'> = {
    answeredBy: null, fallback: null, inventoryAnsweredBy: null, inventoryFallback: null,
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
    return {
      ...this.diag,
      provider: this.provider?.id ?? 'none',
      providerLabel: this.provider?.label ?? 'No live provider configured',
      inventoryProviderLabel: (this.provider as { inventoryLabel?: string } | null)?.inventoryLabel ?? this.provider?.label ?? 'No live provider configured',
      backoffUntil: this.backoff.until > this.now() ? this.backoff.until : null,
      backoffReason: this.backoff.until > this.now() ? this.backoff.reason : null,
      consecutiveFailures: this.backoff.failures,
      lastOutcome: this.history[this.history.length - 1] ?? null,
      clockSkewMs: this.clockSkew,
      online: this.env.isOnline(),
      visible: this.env.isVisible(),
      activeScopes: this.scopes.size,
      trackedTickers: tickers.size,
      trackedEvents: events.size,
    };
  }

  // ---------------------------------------------------------------- usability and diagnostics

  /** Bounded in-memory history of provider calls, oldest first (diagnostics only). */
  refreshHistory(limit = HISTORY_LIMIT): RefreshOutcome[] {
    return this.history.slice(-limit);
  }

  /** Relay clock minus device clock used to correct observation ages (0 = trust the device clock). */
  get clockSkewMs(): number {
    return this.clockSkew;
  }

  /** May this ticker's current quote be displayed in `ctx`? Pure read: records nothing. */
  usable(ticker: string, ctx: QuoteContext): Usability {
    return quoteUsable(this.quotes.get(ticker), ctx, this.now(), { clockSkewMs: this.clockSkew });
  }

  /**
   * The quote a price slot may show, or null (the screen shows the missing-price state). Call once per
   * price-slot render: it is what the availability meter counts.
   */
  renderQuote(ticker: string, ctx: QuoteContext): LiveQuote | null {
    const q = this.quotes.get(ticker);
    const u = quoteUsable(q, ctx, this.now(), { clockSkewMs: this.clockSkew });
    this.meter.record({ context: u.context, usable: u.usable, provider: q?.source ?? NO_PROVIDER, ageMs: u.ageMs });
    return u.usable ? q! : null;
  }

  /** Availability per context and provider, median and p95 observation age at render (diagnostics only). */
  availability() {
    return this.meter.report();
  }

  // ---------------------------------------------------------------- scopes

  /** Visible price rows of a list: game cadence (45 s) through the relay in batches of at most 100. Capped at MAX_ROW_TICKERS. */
  addRowsScope(tickers: Iterable<string>, ctx: Omit<QuoteContext, 'surface'>): () => void {
    return this.addScope({ tickers: [...new Set(tickers)].slice(0, MAX_ROW_TICKERS), cadence: 'game', context: { ...ctx, surface: 'list' } });
  }

  /** The selected exact contract: detail cadence (20 s). Opening it should also call refreshContract(). */
  addContractScope(ticker: string, ctx: Omit<QuoteContext, 'surface'>): () => void {
    return this.addScope({ tickers: [ticker], cadence: 'detail', context: { ...ctx, surface: 'contract' } });
  }

  /** List-wide background data (inventory of these events) at slate cadence, feed first. No prices are shown from it. */
  addSlateScope(events: Iterable<string>): () => void {
    return this.addScope({ events, cadence: 'slate', eventCadence: 'slate' });
  }

  /** Track a set of tickers/events while a screen shows them. Returns the release function. */
  addScope(spec: ScopeSpec): () => void {
    const id = this.nextScopeId++;
    this.scopes.set(id, {
      context: spec.context ?? null,
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
  async refreshNow(tickers: Iterable<string>, opts: { timeoutMs?: number; events?: Iterable<string>; context?: QuoteContext; primaryTimeoutMs?: number } = {}): Promise<RefreshResult> {
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
    const work = this.run(want, events, { force: true, signal: ctrl.signal, context: opts.context, primaryTimeoutMs: opts.primaryTimeoutMs });
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

  /**
   * The exact contract opened: ask for its freshest price now, relay first and then the feed, inside the
   * same 8 s bound as any forced refresh (the relay gets PRIMARY_TIMEOUT_MS of it). The quote is returned
   * only if it passes the usability rule for `ctx`; otherwise null and the screen shows "Price unavailable
   * right now" with Retry (which calls this again).
   */
  async refreshContract(ticker: string, ctx: Omit<QuoteContext, 'surface'>, opts: { timeoutMs?: number } = {}): Promise<{ result: RefreshResult; usability: Usability; quote: LiveQuote | null }> {
    const context: QuoteContext = { ...ctx, surface: 'contract' };
    const result = await this.refreshNow([ticker], { timeoutMs: opts.timeoutMs, context, primaryTimeoutMs: PRIMARY_TIMEOUT_MS });
    const usability = this.usable(ticker, context);
    return { result, usability, quote: usability.usable ? this.quotes.get(ticker) ?? null : null };
  }

  /**
   * Policy for one quote batch: the loosest maximum age any scope showing these tickers accepts (a relay
   * answer whose newest observation is older than that is a failed refresh), and the relay's share of the
   * time. Undefined when any ticker is in a legacy (context-less) scope and nothing was asked for
   * explicitly: those batches behave exactly as before.
   */
  private policyFor(ids: string[], explicit?: QuoteContext, primaryTimeoutMs?: number): FetchOptions | undefined {
    const t = this.now();
    let loosest = 0;
    for (const id of ids) {
      const ctxs = explicit ? [explicit] : [...this.scopes.values()].filter((s) => s.context && s.tickers.has(id)).map((s) => s.context!);
      if (!ctxs.length) return primaryTimeoutMs != null ? { primaryTimeoutMs } : undefined;
      for (const c of ctxs) loosest = Math.max(loosest, maxAgeMs(c, t, this.clockSkew));
    }
    return { maxAgeMs: loosest, primaryTimeoutMs: primaryTimeoutMs ?? PRIMARY_TIMEOUT_MS, clockSkewMs: this.clockSkew };
  }

  private async run(tickers: string[], events: string[], o: { force: boolean; signal?: AbortSignal; context?: QuoteContext; primaryTimeoutMs?: number }): Promise<RefreshResult> {
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
        let policy: FetchOptions | undefined;
        try {
          policy = b.kind === 'tickers' ? this.policyFor(ids, o.context, o.primaryTimeoutMs) : undefined;
          const r: ProviderResult = b.kind === 'tickers' ? await provider.fetchQuotes(ids, ctrl.signal, policy) : await provider.fetchEventMarkets(ids, ctrl.signal);
          this.onSuccess(b.kind, ids, r, t0, res, policy);
        } catch (e) {
          const err = e instanceof ProviderError ? e : new ProviderError('network', String((e as Error)?.message ?? e));
          const timedOut = err.kind === 'aborted' && !o.signal?.aborted;
          this.onFailure(b.kind, ids, timedOut ? new ProviderError('timeout', `no answer within ${REQUEST_TIMEOUT_MS / 1000}s`) : err, res, t0);
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

  private record(o: RefreshOutcome) {
    this.history.push(o);
    if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
  }

  private onSuccess(kind: 'tickers' | 'events', ids: string[], r: ProviderResult, t0: number, res: RefreshResult, policy?: FetchOptions) {
    const t = this.now();
    if (r.clockSkewMs != null && Number.isFinite(r.clockSkewMs)) this.clockSkew = r.clockSkewMs;
    // A 200 whose newest observation is over the limit is a failed refresh: kept (honest age) but recorded as such.
    const a = r.quotes.length ? assessBatch(r.quotes, policy?.maxAgeMs ?? Infinity, t, this.clockSkew) : null;
    this.record({
      at: t, kind, tickers: ids.length, provider: r.answeredBy ?? this.provider?.id ?? null,
      fallbackReason: r.fallback ? r.fallback.error : null, latencyMs: r.latencyMs ?? t - t0,
      observationAgeMs: a?.newestAgeMs ?? null, outcome: a && !a.ok && policy?.maxAgeMs != null ? 'over_limit' : 'ok',
    });
    this.diag.requests += r.requests;
    this.diag.lastLatencyMs = r.latencyMs ?? t - t0;
    this.diag.lastSuccessAt = t;
    this.backoff = { failures: 0, until: 0, reason: null, rateLimited: false };
    // A listing from a provider other than the quote primary updates inventory and (newer-wins) quotes,
    // but does not count as the quote refresh: the quote primary is still asked for those tickers.
    const quoteGrade = kind === 'tickers' || r.refreshesQuotes !== false;
    // Provenance per kind: quotes and inventory may come from different providers.
    if (kind === 'events') {
      this.diag.inventoryAnsweredBy = r.answeredBy ?? this.provider?.id ?? null;
      this.diag.inventoryFallback = r.fallback ?? null;
    }
    if (quoteGrade) {
      this.diag.answeredBy = r.answeredBy ?? this.provider?.id ?? null;
      this.diag.fallback = kind === 'tickers' ? r.fallback ?? null : null;
    }
    for (const q of r.quotes) {
      this.accept(q);
      if (!quoteGrade) continue;
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

  private onFailure(kind: 'tickers' | 'events', ids: string[], err: ProviderError, res: RefreshResult, t0: number) {
    const t = this.now();
    this.record({
      at: t, kind, tickers: ids.length, provider: null, fallbackReason: `${err.kind}: ${err.message}`, latencyMs: t - t0, observationAgeMs: null,
      outcome: err.kind === 'rate_limited' ? 'rate_limited' : err.kind === 'timeout' || err.kind === 'aborted' ? 'timeout' : err.kind === 'stale' ? 'over_limit' : 'error',
    });
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
