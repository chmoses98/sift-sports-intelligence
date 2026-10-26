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
  /**
   * 'received' = the provider gave no observation time and `observedAt` is only when this device got the
   * response (a CDN-cached answer would look new). Such a quote is never usable (src/live/quoteUsable.ts).
   * Absent = the provider stamped its own observation time.
   */
  observedVia?: 'provider' | 'received';
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
  /** Inventory only: event tickers this provider has no data for at all (unknown, not "no contracts"). */
  uncovered?: string[];
  /** Set by a provider chain: which provider answered this call. */
  answeredBy?: string;
  /** Set by a provider chain: why an earlier provider was skipped for this call (null = the first answered). */
  fallback?: FallbackNote | null;
  /** Set by a provider chain: false when an inventory listing came from a provider other than the quote primary. */
  refreshesQuotes?: boolean;
  /**
   * The provider's own clock minus this device's clock, from its `Date` response header (only when the
   * header was readable and the difference exceeds measurement noise; otherwise absent). Lets the usability
   * rule survive a wrong device clock.
   */
  clockSkewMs?: number;
}

/** Per-call policy the store hands a quote provider chain (all optional; absent = legacy behaviour). */
export interface FetchOptions {
  /**
   * Give every provider except the last this long, then abandon it and ask the next, so a hung relay
   * still leaves time for the feed inside a bounded refresh.
   */
  primaryTimeoutMs?: number;
  /**
   * The loosest maximum observation age any caller of these tickers accepts. A provider whose newest
   * observation is older is a failed refresh (even on HTTP 200) and the next provider is asked.
   */
  maxAgeMs?: number;
  /** Device clock correction for the age check (see ProviderResult.clockSkewMs). */
  clockSkewMs?: number;
}

/** Why a provider chain skipped its first provider for one call: provider, error, HTTP status, when. */
export interface FallbackNote {
  provider: string;
  error: string;
  status: number | null;
  at: number;
}

export type ProviderErrorKind = 'rate_limited' | 'http' | 'network' | 'timeout' | 'schema' | 'blocked' | 'aborted' | 'stale';

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
  fetchQuotes(tickers: string[], signal?: AbortSignal, opts?: FetchOptions): Promise<ProviderResult>;
  /** Every contract currently listed under these provider event tickers (inventory discovery). */
  fetchEventMarkets(eventTickers: string[], signal?: AbortSignal): Promise<ProviderResult>;
}
