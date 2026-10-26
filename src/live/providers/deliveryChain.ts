// The quote-DELIVERY chain: relay first, feed second, judged per REQUESTED ticker. Used only by the new
// UI-facing entry points of the store (list-row scopes, the selected-contract scope, refreshContract). The
// production chain (FallbackProvider built by src/live/config.ts, used by the packet preflight and every legacy
// scope) is a different object and behaves exactly as it did on main; nothing here is shared with it except the
// provider classes, and those are separate instances.
//
// Rules, per call (the caller says how old each requested ticker may be, FetchOptions.maxAgeByTicker):
//  * Each requested ticker is judged on its OWN observation. A provider's answer satisfies the tickers it holds
//    a usable observation for; every other requested ticker (absent from the answer, stale, untimed) is asked of
//    the next provider. The freshest observation elsewhere in the batch, or for an unrelated ticker, proves
//    nothing about a ticker.
//  * Results are merged per ticker, the newest observation wins; an untimed observation (arrival time only)
//    never beats a timed one. A ticker no provider can supply a usable observation for is returned as it is (an
//    old observation keeps its true age, the usability rule withholds it at render) or not at all: this chain
//    never invents a quote and never re-stamps one.
//  * A provider that answered 429 is not asked again until its Retry-After has elapsed (30 s when absent),
//    unless it is the last one left.
//  * An earlier provider is abandoned after `primaryTimeoutMs` so the next one still has time inside the
//    caller's overall bound.
//  * If at least one provider answered, the merged result is returned (partial, stale or empty included): the
//    caller sees exactly which requested tickers it holds and with what observation time. Only when NO provider
//    answered is the first error thrown.
import { assessTickers } from '../quoteUsable';
import type { Timers } from '../store';
import { ProviderError, type FallbackNote, type FetchOptions, type LiveQuote, type ProviderResult, type QuoteProvider } from '../types';

const DEFAULT_RETRY_AFTER_MS = 30_000;

export interface DeliveryChainOptions {
  /** Clock for Retry-After bookkeeping, usability and notes (tests inject a fake). */
  now?: () => number;
  /** Timers for primaryTimeoutMs (tests inject a fake). */
  timers?: Timers;
}

const noteOf = (provider: string, e: unknown, at: number): FallbackNote => {
  const pe = e instanceof ProviderError ? e : null;
  return { provider, error: pe ? `${pe.kind}: ${pe.message}` : String(e), status: pe?.status ?? null, at };
};

const obsMs = (q: LiveQuote): number => (q.observedVia === 'received' ? -Infinity : Date.parse(q.observedAt) || -Infinity);

export class DeliveryProvider implements QuoteProvider {
  readonly id: string;
  readonly label: string;
  readonly maxBatch: number;
  readonly minIntervalMs: number;
  /** Which provider supplied the newest usable quote on the last call (diagnostics). */
  lastAnswered: string | null = null;
  /** Why the last call needed more than the first provider, or null (diagnostics). */
  lastFallback: FallbackNote | null = null;
  private now: () => number;
  private timers: Timers;
  /** provider id -> epoch ms before which it is not asked again (HTTP 429 Retry-After). */
  private skipUntil = new Map<string, number>();

  constructor(private providers: (QuoteProvider & { minIntervalMs?: number })[], opts: DeliveryChainOptions = {}) {
    if (!providers.length) throw new Error('DeliveryProvider needs at least one provider');
    this.now = opts.now ?? Date.now;
    this.timers = opts.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
    this.id = providers.map((p) => p.id).join('>');
    this.label = providers.map((p) => p.label).join(', then ');
    this.maxBatch = providers[0].maxBatch;
    this.minIntervalMs = providers[0].minIntervalMs ?? 0;
  }

  async fetchQuotes(tickers: string[], signal?: AbortSignal, opts: FetchOptions = {}): Promise<ProviderResult> {
    const t0 = this.now();
    const requested = [...new Set(tickers)];
    const asked = new Set(requested);
    const limitFor = (t: string) => opts.maxAgeByTicker?.[t] ?? opts.maxAgeMs ?? Infinity;
    if (!requested.length) return { quotes: [], missing: [], requests: 0, latencyMs: 0, answeredBy: this.providers[0].id, fallback: null, refreshesQuotes: true };
    const held = new Map<string, LiveQuote>();
    const later: string[] = []; // failures after the first one, for the provenance note
    let first: unknown = null;
    let answered = 0;
    let requests = 0;
    let skew: number | undefined;
    let supplier: string | null = null;
    let pending = requested;

    for (const [i, p] of this.providers.entries()) {
      if (!pending.length) break;
      if (signal?.aborted) throw new ProviderError('aborted', 'request aborted');
      const last = i === this.providers.length - 1;
      const wait = (this.skipUntil.get(p.id) ?? 0) - this.now();
      if (wait > 0 && !last) {
        first ??= new ProviderError('rate_limited', `rate limited (HTTP 429); not asking ${p.id} again for ${Math.ceil(wait / 1000)}s (Retry-After)`, 429, wait);
        continue;
      }
      let own: AbortController | null = null;
      let timedOut = false;
      let timer: unknown = null;
      let onAbort: (() => void) | null = null;
      if (opts.primaryTimeoutMs != null && !last) {
        const ctrl = (own = new AbortController());
        onAbort = () => ctrl.abort();
        signal?.addEventListener('abort', onAbort);
        timer = this.timers.set(() => {
          timedOut = true;
          ctrl.abort();
        }, opts.primaryTimeoutMs);
      }
      try {
        const r = await p.fetchQuotes(pending, own?.signal ?? signal, opts);
        answered++;
        requests += r.requests;
        if (r.clockSkewMs != null && skew == null) skew = r.clockSkewMs;
        for (const q of r.quotes) {
          if (!asked.has(q.ticker)) continue; // never keep a quote nobody asked for
          const cur = held.get(q.ticker);
          if (!cur || obsMs(q) > obsMs(cur)) held.set(q.ticker, q);
        }
        const a = assessTickers(requested, [...held.values()], limitFor, this.now(), opts.clockSkewMs ?? skew ?? 0);
        const stillPending = requested.filter((t) => !a.usable.includes(t));
        // What this provider supplied: the newest usable observation among the tickers it answered.
        if (r.quotes.some((q) => asked.has(q.ticker) && a.usable.includes(q.ticker))) supplier = p.id;
        if (stillPending.length && !last) {
          first ??= new ProviderError('stale', this.describeShortfall(requested, r, a.newestAgeMs, stillPending, limitFor));
        }
        pending = stillPending;
      } catch (e) {
        if (timedOut && e instanceof ProviderError && e.kind === 'aborted' && !signal?.aborted) {
          first ??= new ProviderError('timeout', `no answer from ${p.id} within ${Math.round(opts.primaryTimeoutMs! / 1000)}s`);
          continue;
        }
        if (e instanceof ProviderError && e.kind === 'aborted') throw e;
        if (e instanceof ProviderError && e.kind === 'rate_limited') this.skipUntil.set(p.id, this.now() + (e.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS));
        if (first == null) first = e;
        else later.push(`${p.id}: ${e instanceof ProviderError ? `${e.kind}: ${e.message}` : String(e)}`);
      } finally {
        if (timer != null) this.timers.clear(timer);
        if (onAbort) signal?.removeEventListener('abort', onAbort);
      }
    }

    const merged = [...held.values()];
    // Nobody answered: report the failure (the first provider's, the one the scheduler's backoff policy is about).
    // If anybody answered, the merged result is returned even when no requested ticker is usable: its quotes keep
    // their true age and the usability rule withholds them at render.
    if (!answered) throw first instanceof Error ? first : new ProviderError('network', String(first));
    const newest = merged.reduce<LiveQuote | null>((b, q) => (!b || obsMs(q) > obsMs(b) ? q : b), null);
    const answeredBy = supplier ?? this.providers.find((p) => p.id === newest?.source)?.id ?? this.providers[this.providers.length - 1].id;
    const note = first == null ? null : noteOf(this.providers[0].id, first, this.now());
    const fallback = note && later.length ? { ...note, error: `${note.error}; then ${later.join('; ')}` } : note;
    this.lastAnswered = answeredBy;
    this.lastFallback = fallback;
    return {
      quotes: merged,
      // Requested tickers no provider returned at all (delisted, closed and unlisted, or simply absent from a
      // partial answer): no source can supply them, and the screen shows the missing-price state.
      missing: requested.filter((t) => !held.has(t)),
      requests,
      latencyMs: this.now() - t0,
      answeredBy,
      fallback,
      refreshesQuotes: true,
      ...(skew != null ? { clockSkewMs: skew } : {}),
    };
  }

  private describeShortfall(requested: string[], r: ProviderResult, newestAgeMs: number | null, pending: string[], limitFor: (t: string) => number): string {
    const have = r.quotes.filter((q) => requested.includes(q.ticker)).length;
    if (!have) return `HTTP 200 but none of the ${requested.length} requested tickers were returned`;
    const limit = Math.max(...pending.map(limitFor));
    const lim = Number.isFinite(limit) ? `limit ${Math.round(limit / 1000)}s` : 'no limit';
    return `HTTP 200 but ${pending.length} of ${requested.length} requested tickers have no usable observation (newest returned is ${newestAgeMs == null ? 'untimed' : `${Math.round(newestAgeMs / 1000)}s old`}; ${lim})`;
  }

  async fetchEventMarkets(): Promise<ProviderResult> {
    // Inventory sweeps belong to the production chain; the store never routes them here.
    throw new ProviderError('schema', 'the delivery chain serves quotes only');
  }
}
