// The quote-delivery chain for the NEW UI-facing entry points (list-row scopes, the selected contract,
// QuoteStore.refreshContract). It is built from the same two public URLs as the production chain in config.ts,
// but as SEPARATE provider instances and a separate chain class, so the production chain (packet preflight,
// legacy scopes, inventory) is not touched by anything configured here.
import { relayUrl, feedUrl } from './config';
import { DeliveryProvider } from './providers/deliveryChain';
import { FeedQuoteProvider } from './providers/feed';
import { KalshiApiProvider } from './providers/kalshi';
import type { QuoteProvider } from './types';

export function deliveryProvider(): QuoteProvider | null {
  const relay = relayUrl() ? new KalshiApiProvider({ baseUrl: relayUrl()!, strictObservation: true }) : null;
  const feed = feedUrl() ? new FeedQuoteProvider({ baseUrl: feedUrl()! }) : null;
  const chain = [relay, feed].filter((p): p is KalshiApiProvider | FeedQuoteProvider => p != null);
  return chain.length ? new DeliveryProvider(chain) : null;
}
