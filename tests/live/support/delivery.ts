// Test rig for the quote-delivery chain: a production chain (FallbackProvider, exactly as config.ts builds it) and
// a separate delivery chain, both over fake providers whose observation ages the test controls per ticker.
import { DeliveryProvider } from '../../../src/live/providers/deliveryChain';
import { FallbackProvider } from '../../../src/live/providers/fallback';
import { QuoteStore } from '../../../src/live/store';
import type { FetchOptions, LiveQuote, ProviderResult } from '../../../src/live/types';
import { FakeClock, FakeEnv, FakeProvider, quote } from '../fakes';

/** A fake whose observations are `staleBy` ms behind the clock (or `ageBy[ticker]`), like a relay/feed answer with old data. */
export class Aged extends FakeProvider {
  staleBy = 0;
  /** Per-ticker observation age, overriding staleBy. */
  ageBy = new Map<string, number>();
  /** Requested tickers this provider leaves out of an HTTP 200 (a partial batch). */
  omit = new Set<string>();
  /** Every request answers HTTP 200 with no markets at all. */
  empty = false;
  /** Fresh quotes for tickers nobody asked for, added to every answer. */
  unrelated: string[] = [];
  /** Answers without an observation time (arrival time only), like a relay missing X-Sift-Observed-At. */
  untimed = false;
  /** Per-ticker fields merged into the quote (rawStatus, result, closeTime, ...) like a provider reporting a market state. */
  extra = new Map<string, Partial<LiveQuote>>();
  seen: (FetchOptions | undefined)[] = [];
  constructor(private c: FakeClock, id: string) {
    super(c);
    Object.defineProperty(this, 'id', { value: id });
  }
  override async fetchQuotes(tickers: string[], signal?: AbortSignal, opts?: FetchOptions): Promise<ProviderResult> {
    this.seen.push(opts);
    const r = await super.fetchQuotes(tickers, signal);
    if (this.empty) return { ...r, quotes: [], missing: [...tickers] };
    const stamp = (q: LiveQuote): LiveQuote => ({
      ...q, ...this.extra.get(q.ticker), source: this.id, observedAt: new Date(this.c.now() - (this.ageBy.get(q.ticker) ?? this.staleBy)).toISOString(),
      ...(this.untimed ? { observedVia: 'received' as const } : {}),
    });
    const kept = r.quotes.filter((q) => !this.omit.has(q.ticker)).map(stamp);
    const extra = this.unrelated.map((t) => stamp(quote(t, 0.5, this.c.now())));
    const gone = tickers.filter((t) => this.omit.has(t));
    return { ...r, quotes: [...kept, ...extra], missing: [...r.missing, ...gone] };
  }
}

export const T = 'KXNHLGOAL-26OCT26TORCGY-TOR19';
export const U = 'KXNHLGOAL-26OCT26TORCGY-CGY7';
export const V = 'KXNHLGOAL-26OCT26TORCGY-TOR91';
export const OTHER = 'KXNHLGOAL-26OCT26TORCGY-ZZZ1';
export const EVENT = 'KXNHLGOAL-26OCT26TORCGY';
export const HOUR = 3_600_000;
export const START = Date.parse('2026-10-04T16:00:00Z');
export const FAR = { startsAt: START + 5 * HOUR };
export const NEAR = { startsAt: START + HOUR };

export interface Rig {
  clock: FakeClock;
  env: FakeEnv;
  /** The delivery chain's providers. */
  relay: Aged;
  feed: Aged;
  /** The production chain's providers (packet preflight, legacy scopes, inventory). */
  prod: { relay: Aged; feed: Aged };
  chain: DeliveryProvider;
  store: QuoteStore;
}

export function rig(tickers: string[] = [T, U]): Rig {
  const clock = new FakeClock();
  const env = new FakeEnv();
  const mk = () => {
    const relay = new Aged(clock, 'kalshi-relay');
    const feed = new Aged(clock, 'quote-feed');
    feed.staleBy = 3 * 60_000; // the feed is published every ~3.5 min: its observations are minutes old
    feed.minIntervalMs = 60_000;
    relay.minIntervalMs = 10_000;
    for (const p of [relay, feed]) {
      tickers.forEach((t, i) => p.prices.set(t, i === 1 ? 0.57 : 0.41));
      p.events.set(EVENT, tickers);
    }
    return { relay, feed };
  };
  const d = mk();
  const prod = mk();
  const chain = new DeliveryProvider([d.relay, d.feed], { now: clock.now, timers: clock });
  const production = new FallbackProvider([prod.relay, prod.feed], { inventoryOrder: [prod.feed, prod.relay] });
  const store = new QuoteStore({ provider: production, deliveryProvider: chain, now: clock.now, timers: clock, env, persistence: null, random: () => 0.5 });
  return { clock, env, relay: d.relay, feed: d.feed, prod, chain, store };
}
