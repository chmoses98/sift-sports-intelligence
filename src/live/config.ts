// Where live quotes come from. Both URLs are public (no credential exists anywhere in this path):
//
//   VITE_SIFT_QUOTE_RELAY_URL  the read-only Kalshi relay (relay/kalshi-quote-relay.js). Set by the
//                              owner after deploying it; unset means "no sub-minute quotes".
//   VITE_SIFT_QUOTE_FEED_URL   the GitHub Actions quote feed (default: this repo's live-quotes branch).
import { FallbackProvider } from './providers/fallback';
import { FeedQuoteProvider } from './providers/feed';
import { KalshiApiProvider } from './providers/kalshi';
import type { QuoteProvider } from './types';

export const DEFAULT_FEED_URL = 'https://raw.githubusercontent.com/chmoses98/sift-sports-intelligence/live-quotes';

const env = (k: string): string => ((import.meta.env as Record<string, string | undefined>)[k] ?? '').trim();

export function relayUrl(): string | null {
  const u = env('VITE_SIFT_QUOTE_RELAY_URL');
  return /^https:\/\//.test(u) ? u : null;
}

export function feedUrl(): string | null {
  const u = env('VITE_SIFT_QUOTE_FEED_URL');
  if (u === 'off') return null;
  return /^https:\/\//.test(u) ? u : DEFAULT_FEED_URL;
}

export function defaultProvider(): QuoteProvider | null {
  const chain: QuoteProvider[] = [];
  const relay = relayUrl();
  const feed = feedUrl();
  if (relay) chain.push(new KalshiApiProvider({ baseUrl: relay }));
  if (feed) chain.push(new FeedQuoteProvider({ baseUrl: feed }));
  if (!chain.length) return null;
  return chain.length === 1 ? chain[0] : new FallbackProvider(chain);
}
