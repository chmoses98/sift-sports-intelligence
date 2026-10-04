// The original Cloudflare Worker host for the relay (relay/core.ts holds the behaviour). Kept so the
// worker can stay deployed until the Vercel relay is verified; Kalshi rate-limits this host's shared
// egress (HTTP 429 on 16 of 17 production requests, 2026-10-04), so it is no longer the recommended host.
//
// Deploy (legacy): `npx wrangler deploy` from this directory; see relay/README.md.
import { handleRelay, parseOrigins, type RelayCache } from './core';

export { ALLOWED_ORIGINS, EDGE_CACHE_SECONDS, observedAtFrom, UPSTREAM, upstreamUrl } from './core';

interface Env {
  ALLOWED_ORIGINS?: string;
}

/** Cloudflare's per-colo edge cache behind the host-neutral cache interface. */
function edgeCache(cache: Cache): RelayCache {
  return {
    get: async (key) => (await cache.match(new Request(key))) ?? undefined,
    put: (key, res) => cache.put(new Request(key), res),
  };
}

export default {
  async fetch(request: Request, env: Env = {}, ctx?: { waitUntil(p: Promise<unknown>): void }, deps: { fetchImpl?: typeof fetch; cache?: Cache | null; now?: () => number } = {}): Promise<Response> {
    const cache = deps.cache !== undefined ? deps.cache : ((globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null);
    return handleRelay(request, {
      allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),
      fetchImpl: deps.fetchImpl,
      cache: cache ? edgeCache(cache) : null,
      now: deps.now,
      waitUntil: ctx ? (p) => ctx.waitUntil(p) : undefined,
    });
  },
};
