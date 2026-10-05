// Ask providers in order; the first that answers wins. The store keeps whichever observation is newer
// per ticker, so a slower fallback can never overwrite a fresher quote.
//
// Quotes and inventory have their own order. Production: quote batches go to the relay first (15-60 s
// quotes) with the quote feed as fallback; inventory sweeps (every listed contract of a game, ~57 Kalshi
// series) go to the quote feed first (published every 3 min, the inventory cadence) with the relay as
// fallback, because a sweep is larger than Kalshi's per-IP burst (~14 requests). Each answer says which
// provider gave it and why any earlier one was skipped, so provenance stays visible for both.
import { ProviderError, type FallbackNote, type ProviderResult, type QuoteProvider } from '../types';

function describe(provider: string, e: unknown): FallbackNote {
  const pe = e instanceof ProviderError ? e : null;
  return { provider, error: pe ? `${pe.kind}: ${pe.message}` : String(e), status: pe?.status ?? null, at: Date.now() };
}

type Chained = QuoteProvider & { minIntervalMs?: number };

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

  constructor(private providers: Chained[], opts: { inventoryOrder?: Chained[] } = {}) {
    if (!providers.length) throw new Error('FallbackProvider needs at least one provider');
    this.inventory = opts.inventoryOrder?.length ? opts.inventoryOrder : providers;
    this.id = providers.map((p) => p.id).join('>');
    this.label = providers.map((p) => p.label).join(', then ');
    this.inventoryLabel = this.inventory.map((p) => p.label).join(', then ');
    this.maxBatch = providers[0].maxBatch;
    this.minIntervalMs = providers[0].minIntervalMs ?? 0;
  }

  private async run(order: Chained[], kind: 'quotes' | 'inventory', call: (p: QuoteProvider) => Promise<ProviderResult>, signal?: AbortSignal): Promise<ProviderResult> {
    let first: unknown = null;
    for (const [i, p] of order.entries()) {
      if (signal?.aborted) throw new ProviderError('aborted', 'request aborted');
      try {
        const r = await call(p);
        // Inventory the provider cannot cover (e.g. a game the feed has no file for) is not "no contracts":
        // the next provider is asked instead.
        if (kind === 'inventory' && r.uncovered?.length && i < order.length - 1) {
          throw new ProviderError('http', `no inventory for ${r.uncovered.join(', ')}`, 404);
        }
        const fallback = first === null ? null : describe(order[0].id, first);
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
        if (e instanceof ProviderError && e.kind === 'aborted') throw e;
        first ??= e;
      }
    }
    // Report the primary provider's failure: it is the one the scheduler's retry/backoff policy is
    // about (a 503 for one batch must not read as "the network is down" because the fallback was).
    throw first instanceof Error ? first : new ProviderError('network', String(first));
  }

  fetchQuotes(tickers: string[], signal?: AbortSignal) {
    return this.run(this.providers, 'quotes', (p) => p.fetchQuotes(tickers, signal), signal);
  }

  fetchEventMarkets(eventTickers: string[], signal?: AbortSignal) {
    return this.run(this.inventory, 'inventory', (p) => p.fetchEventMarkets(eventTickers, signal), signal);
  }
}
