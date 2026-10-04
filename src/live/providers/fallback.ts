// Ask providers in order; the first that answers wins. The store keeps whichever observation is newer
// per ticker, so a slower fallback can never overwrite a fresher quote.
import { ProviderError, type ProviderResult, type QuoteProvider } from '../types';

export class FallbackProvider implements QuoteProvider {
  readonly id: string;
  readonly label: string;
  readonly maxBatch: number;
  readonly minIntervalMs: number;
  /** Which provider answered the last call (diagnostics). */
  lastAnswered: string | null = null;

  constructor(private providers: (QuoteProvider & { minIntervalMs?: number })[]) {
    if (!providers.length) throw new Error('FallbackProvider needs at least one provider');
    this.id = providers.map((p) => p.id).join('>');
    this.label = providers.map((p) => p.label).join(', then ');
    this.maxBatch = providers[0].maxBatch;
    this.minIntervalMs = providers[0].minIntervalMs ?? 0;
  }

  private async run(call: (p: QuoteProvider) => Promise<ProviderResult>, signal?: AbortSignal): Promise<ProviderResult> {
    let first: unknown = null;
    for (const p of this.providers) {
      if (signal?.aborted) throw new ProviderError('aborted', 'request aborted');
      try {
        const r = await call(p);
        this.lastAnswered = p.id;
        return r;
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
    return this.run((p) => p.fetchQuotes(tickers, signal), signal);
  }

  fetchEventMarkets(eventTickers: string[], signal?: AbortSignal) {
    return this.run((p) => p.fetchEventMarkets(eventTickers, signal), signal);
  }
}
