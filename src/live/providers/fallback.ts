// Ask providers in order; the first that answers wins. The store keeps whichever observation is newer
// per ticker, so a slower fallback can never overwrite a fresher quote.
//
// Quotes and inventory have their own order. Production: quote batches go to the relay first (15-60 s
// quotes) with the quote feed as fallback; inventory sweeps (every listed contract of a game, ~57 Kalshi
// series) go to the quote feed first (published every 3 min, the inventory cadence) with the relay as
// fallback, because a sweep is larger than Kalshi's per-IP burst (~14 requests). Each answer says which
// provider gave it and why any earlier one was skipped, so provenance stays visible for both.
//
// Quote-usability policy (src/live/quoteUsable.ts), opt-in per call through FetchOptions:
//  * maxAgeMs: an earlier provider's 200 whose NEWEST observation is over the limit is a failed refresh
//    and the next provider is asked (the last provider's answer is returned as it is: its quotes keep their
//    true age, and the usability rule decides at render time).
//  * primaryTimeoutMs: a hung earlier provider is abandoned after this long so the next one still gets time.
// And, when `honourRetryAfter` is set, a provider that answered 429 is not asked again until its
// Retry-After has elapsed (default 30 s when absent), unless it is the last one left.
import { assessBatch } from '../quoteUsable';
import { ProviderError, type FallbackNote, type FetchOptions, type ProviderResult, type QuoteProvider } from '../types';
import type { Timers } from '../store';

const DEFAULT_RETRY_AFTER_MS = 30_000;

function describe(provider: string, e: unknown, at: number): FallbackNote {
  const pe = e instanceof ProviderError ? e : null;
  return { provider, error: pe ? `${pe.kind}: ${pe.message}` : String(e), status: pe?.status ?? null, at };
}

type Chained = QuoteProvider & { minIntervalMs?: number };

export interface FallbackOptions {
  inventoryOrder?: Chained[];
  /** Clock for Retry-After bookkeeping and fallback notes (tests inject a fake). */
  now?: () => number;
  /** Timers for primaryTimeoutMs (tests inject a fake). */
  timers?: Timers;
  /** Skip a provider that answered 429 until its Retry-After elapses. */
  honourRetryAfter?: boolean;
}

export class FallbackProvider implements QuoteProvider {
  readonly id: string;
  /** The quote chain, e.g. "relay (…), then Sift quote feed (…)". */
  readonly label: string;
  /** The inventory chain, e.g. "Sift quote feed (…), then relay (…)". */
  readonly inventoryLabel: string;
  readonly maxBatch: number;
  readonly minIntervalMs: number;
  /** Which provider answered the last quote call (diagnostics). */
  lastAnswered: string | null = null;
  /** Why the last quote call skipped the quote primary (e.g. its HTTP 429), or null when it answered. */
  lastFallback: FallbackNote | null = null;
  /** Which provider answered the last inventory call. */
  lastInventoryAnswered: string | null = null;
  /** Why the last inventory call skipped the inventory primary, or null when it answered. */
  lastInventoryFallback: FallbackNote | null = null;
  private inventory: Chained[];
  private now: () => number;
  private timers: Timers;
  private honourRetryAfter: boolean;
  /** provider id -> epoch ms before which it is not asked again (HTTP 429 Retry-After). */
  private skipUntil = new Map<string, number>();

  constructor(private providers: Chained[], opts: FallbackOptions = {}) {
    if (!providers.length) throw new Error('FallbackProvider needs at least one provider');
    this.now = opts.now ?? Date.now;
    this.timers = opts.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
    this.honourRetryAfter = opts.honourRetryAfter ?? false;
    this.inventory = opts.inventoryOrder?.length ? opts.inventoryOrder : providers;
    this.id = providers.map((p) => p.id).join('>');
    this.label = providers.map((p) => p.label).join(', then ');
    this.inventoryLabel = this.inventory.map((p) => p.label).join(', then ');
    this.maxBatch = providers[0].maxBatch;
    this.minIntervalMs = providers[0].minIntervalMs ?? 0;
  }

  private async run(order: Chained[], kind: 'quotes' | 'inventory', call: (p: QuoteProvider, signal?: AbortSignal) => Promise<ProviderResult>, signal?: AbortSignal, opts: FetchOptions = {}): Promise<ProviderResult> {
    let first: unknown = null;
    for (const [i, p] of order.entries()) {
      if (signal?.aborted) throw new ProviderError('aborted', 'request aborted');
      const last = i === order.length - 1;
      const wait = (this.skipUntil.get(p.id) ?? 0) - this.now();
      if (this.honourRetryAfter && wait > 0 && !last) {
        first ??= new ProviderError('rate_limited', `rate limited (HTTP 429); not asking ${p.id} again for ${Math.ceil(wait / 1000)}s (Retry-After)`, 429, wait);
        continue;
      }
      // A hung earlier provider is abandoned after primaryTimeoutMs so the next one still has time.
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
        const r = await call(p, own?.signal ?? signal);
        if (kind === 'quotes' && opts.maxAgeMs != null && !last) {
          const a = assessBatch(r.quotes, opts.maxAgeMs, this.now(), opts.clockSkewMs ?? r.clockSkewMs ?? 0);
          if (!a.ok && r.quotes.length) {
            throw new ProviderError('stale', a.newestAgeMs == null ? 'HTTP 200 but no observation time on any quote' : `HTTP 200 but newest observation is ${Math.round(a.newestAgeMs / 1000)}s old (limit ${Math.round(opts.maxAgeMs / 1000)}s)`);
          }
        }
        // Inventory the provider cannot cover (e.g. a game the feed has no file for) is not "no contracts":
        // the next provider is asked instead.
        if (kind === 'inventory' && r.uncovered?.length && i < order.length - 1) {
          throw new ProviderError('http', `no inventory for ${r.uncovered.join(', ')}`, 404);
        }
        const fallback = first === null ? null : describe(order[0].id, first, this.now());
        if (kind === 'quotes') {
          this.lastAnswered = p.id;
          this.lastFallback = fallback;
        } else {
          this.lastInventoryAnswered = p.id;
          this.lastInventoryFallback = fallback;
        }
        // An inventory listing counts as a quote refresh only when it came from the quote primary; a feed
        // listing still updates inventory and (newer-wins) quotes, but never stands in for the relay's batch.
        return { ...r, answeredBy: p.id, fallback, refreshesQuotes: kind === 'quotes' || p === this.providers[0] };
      } catch (e) {
        if (timedOut && e instanceof ProviderError && e.kind === 'aborted' && !signal?.aborted) {
          first ??= new ProviderError('timeout', `no answer from ${p.id} within ${Math.round(opts.primaryTimeoutMs! / 1000)}s`);
          continue;
        }
        if (e instanceof ProviderError && e.kind === 'aborted') throw e;
        if (this.honourRetryAfter && e instanceof ProviderError && e.kind === 'rate_limited') {
          this.skipUntil.set(p.id, this.now() + (e.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS));
        }
        first ??= e;
      } finally {
        if (timer != null) this.timers.clear(timer);
        if (onAbort) signal?.removeEventListener('abort', onAbort);
      }
    }
    // Report the primary provider's failure: it is the one the scheduler's retry/backoff policy is
    // about (a 503 for one batch must not read as "the network is down" because the fallback was).
    throw first instanceof Error ? first : new ProviderError('network', String(first));
  }

  fetchQuotes(tickers: string[], signal?: AbortSignal, opts: FetchOptions = {}) {
    return this.run(this.providers, 'quotes', (p, s) => p.fetchQuotes(tickers, s, opts), signal, opts);
  }

  fetchEventMarkets(eventTickers: string[], signal?: AbortSignal) {
    return this.run(this.inventory, 'inventory', (p, s) => p.fetchEventMarkets(eventTickers, s), signal);
  }
}
