// The live-market subsystem's vocabulary. Sport-agnostic: every Sift sport (NFL today; MLB, NBA, NHL,
// CFB, Tennis, Soccer later) reads quotes through these types, whatever the provider.

/** Whether a contract can be traded right now, independent of how old its quote is. */
export type Availability = 'OPEN' | 'UNOPENED' | 'SUSPENDED' | 'CLOSED' | 'SETTLED' | 'UNKNOWN';

/** One provider observation of one contract. Prices are YES/NO dollars (0..1), like the contract. */
export interface LiveQuote {
  ticker: string;
  eventTicker: string | null;
  seriesTicker: string | null;
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  lastPrice: number | null;
  volume: number | null;
  openInterest: number | null;
  availability: Availability;
  /** The provider's raw status word, kept for diagnostics. */
  rawStatus: string | null;
  closeTime: string | null;
  /** When this quote was observed (ISO 8601). The ONLY clock market freshness is measured on. */
  observedAt: string;
  /** Where the observation came from ("kalshi-public", "relay:<host>", "publication"). */
  source: string;
  /** Contract wording the provider returns (for markets the publication never listed). */
  title: string | null;
  yesSubTitle: string | null;
  strike: { floor: number | null; cap: number | null; type: string | null } | null;
}

export interface ProviderResult {
  quotes: LiveQuote[];
  /** Tickers that were asked for and that the provider does not know (delisted / never existed). */
  missing: string[];
  requests: number;
  latencyMs: number;
}

export type ProviderErrorKind = 'rate_limited' | 'http' | 'network' | 'timeout' | 'schema' | 'blocked' | 'aborted';

export class ProviderError extends Error {
  constructor(public kind: ProviderErrorKind, message: string, public status: number | null = null, public retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Anything that can answer "what are these contracts quoted at right now". */
export interface QuoteProvider {
  readonly id: string;
  readonly label: string;
  /** Largest number of tickers one request may carry (URL length / API limit). */
  readonly maxBatch: number;
  /** The fastest this provider's data can change; polling faster only costs requests. */
  readonly minIntervalMs?: number;
  fetchQuotes(tickers: string[], signal?: AbortSignal): Promise<ProviderResult>;
  /** Every contract currently listed under these provider event tickers (inventory discovery). */
  fetchEventMarkets(eventTickers: string[], signal?: AbortSignal): Promise<ProviderResult>;
}
