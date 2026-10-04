// Packet preflight: before COPY FOR CHATGPT, every market in the packet's scope gets a bounded live
// refresh, so no packet leaves Sift with a price that is old only because it was memoised earlier in
// the session. Then freshness is classified at packet-build time with the market-quote policy.
//
//   1. the exact market set the packet will carry (packetScopeMarkets, same rules as buildPacket)
//   2. one forced, de-duplicated refresh of those tickers, bounded by a timeout (never hangs)
//   3. newest trustworthy quote per ticker: live if it is newer than the publication capture
//   4. counts by freshness and availability, oldest quote, failures
//   5. LivePacketInputs for buildPacket: overlay, classifier, data-quality notes, source
import type { Market } from '../contract/types';
import type { LivePacketInputs } from '../packet/build';
import { formatQuoteAge, quoteAgeMs, quoteFreshness, type QuoteFreshness } from './freshness';
import { liveWins, overlayMarket, quoteView } from './overlay';
import type { QuoteStore, RefreshResult } from './store';
import type { Availability } from './types';

export const PREFLIGHT_TIMEOUT_MS = 8_000;

export type PreflightStatus = 'PASS' | 'PARTIAL' | 'FAIL' | 'UNAVAILABLE';

export interface PreflightSummary {
  status: PreflightStatus;
  provider: string;
  /** When the refresh finished (ms since epoch); freshness below is evaluated at `evaluatedAt`. */
  refreshedAt: number;
  evaluatedAt: number;
  markets: number;
  refreshed: number;
  failed: number;
  missing: number;
  /** Markets whose shown quote is a live observation (not the publication capture). */
  live: number;
  counts: Record<QuoteFreshness, number>;
  availability: Record<Availability, number>;
  oldestAgeMs: number | null;
  oldestTicker: string | null;
  error: string | null;
  timedOut: boolean;
  failedTickers: string[];
}

const zeroFresh = (): Record<QuoteFreshness, number> => ({ FRESH: 0, AGING: 0, STALE: 0, UNKNOWN: 0 });
const zeroAvail = (): Record<Availability, number> => ({ OPEN: 0, UNOPENED: 0, SUSPENDED: 0, CLOSED: 0, SETTLED: 0, UNKNOWN: 0 });

/** Summarise the quote state of a market set at `now` (also used after a refresh). */
export function summarize(markets: Market[], store: QuoteStore, refresh: RefreshResult | null, now: number): PreflightSummary {
  const counts = zeroFresh();
  const availability = zeroAvail();
  let oldestAgeMs: number | null = null;
  let oldestTicker: string | null = null;
  let live = 0;
  for (const m of markets) {
    const v = quoteView(m, store.quote(m.kalshi_ticker));
    if (v.live) live++;
    counts[quoteFreshness(v.observedAt, now)]++;
    availability[v.availability]++;
    const age = quoteAgeMs(v.observedAt, now);
    if (age != null && (oldestAgeMs == null || age > oldestAgeMs)) {
      oldestAgeMs = age;
      oldestTicker = m.kalshi_ticker;
    }
  }
  const failed = refresh?.failed.length ?? 0;
  let status: PreflightStatus;
  if (!store.enabled || refresh == null) status = 'UNAVAILABLE';
  else if (!markets.length) status = 'PASS';
  else if (failed === 0) status = 'PASS';
  else if (failed < markets.length) status = 'PARTIAL';
  else status = 'FAIL';
  return {
    status,
    provider: store.provider?.label ?? 'none',
    refreshedAt: refresh?.finishedAt ?? now,
    evaluatedAt: now,
    markets: markets.length,
    refreshed: refresh?.refreshed.length ?? 0,
    failed,
    missing: refresh?.missing.length ?? 0,
    live,
    counts,
    availability,
    oldestAgeMs,
    oldestTicker,
    error: refresh?.error ?? (store.enabled ? null : 'no live quote provider configured'),
    timedOut: refresh?.timedOut ?? false,
    failedTickers: refresh?.failed ?? [],
  };
}

/** Run the bounded refresh for a packet's markets. Never throws, never waits past the timeout. */
export async function preflightQuotes(
  markets: Market[],
  store: QuoteStore,
  opts: { timeoutMs?: number; now?: () => number } = {},
): Promise<PreflightSummary> {
  const now = opts.now ?? Date.now;
  const tickers = [...new Set(markets.map((m) => m.kalshi_ticker))];
  let refresh: RefreshResult | null = null;
  if (store.enabled && tickers.length) {
    try {
      refresh = await store.refreshNow(tickers, { timeoutMs: opts.timeoutMs ?? PREFLIGHT_TIMEOUT_MS });
    } catch (e) {
      const t = now();
      refresh = { requested: tickers, refreshed: [], missing: [], failed: tickers, error: String((e as Error)?.message ?? e), timedOut: false, startedAt: t, finishedAt: t };
    }
  } else if (store.enabled) {
    const t = now();
    refresh = { requested: [], refreshed: [], missing: [], failed: [], error: null, timedOut: false, startedAt: t, finishedAt: t };
  }
  return summarize(markets, store, refresh, now());
}

/** The live inputs buildPacket applies: values only, never the packet format. */
export function packetLiveInputs(markets: Market[], store: QuoteStore, summary: PreflightSummary): LivePacketInputs {
  const notes: string[] = [];
  const t = summary.evaluatedAt;
  const fmtTime = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (summary.status === 'UNAVAILABLE') {
    notes.push(`live market refresh unavailable (${summary.error ?? 'no provider'}): market prices are the publication's own capture times`);
  } else if (summary.failed > 0) {
    notes.push(
      `live market refresh: ${summary.failed} of ${summary.markets} markets could not be refreshed at ${fmtTime(summary.refreshedAt)}` +
        ` (${summary.error ?? 'no answer'}); they show their last known quote with its real capture time`,
    );
  }
  if (summary.counts.STALE || summary.counts.UNKNOWN) {
    notes.push(
      `market quotes older than 30 minutes or without a capture time: ${summary.counts.STALE} STALE, ${summary.counts.UNKNOWN} UNKNOWN` +
        (summary.oldestAgeMs != null ? ` (oldest ${formatQuoteAge(summary.oldestAgeMs)}, ${summary.oldestTicker})` : '') +
        '; treat those prices as references, not executable',
    );
  }
  // Availability is not printed in the packet's market lines (the contract text has no status column),
  // so a contract that is not open right now is named here rather than silently priced.
  const notOpen = markets
    .map((m) => ({ m, v: quoteView(m, store.quote(m.kalshi_ticker)) }))
    .filter(({ v }) => v.live && v.availability !== 'OPEN');
  if (notOpen.length) {
    const shown = notOpen.slice(0, 15).map(({ m, v }) => `${m.kalshi_ticker} ${v.availability}`);
    notes.push(`markets not open on Kalshi at ${fmtTime(t)}: ${shown.join(', ')}${notOpen.length > 15 ? ` and ${notOpen.length - 15} more` : ''}`);
  }
  const anyLive = markets.some((m) => liveWins(m, store.quote(m.kalshi_ticker)));
  return {
    overlay: (m) => overlayMarket(m, store.quote(m.kalshi_ticker)),
    marketFreshness: (capturedAt, now) => quoteFreshness(capturedAt, Date.parse(now)),
    notes,
    sources: anyLive ? [`kalshi live quotes (${store.provider?.id ?? 'live'})`] : [],
  };
}
