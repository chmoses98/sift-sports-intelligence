// How Sift shows the MARKET clock. A quote chip always says three things: whether the contract can
// be traded (availability), how old the quote is (freshness by the market-quote policy), and where it
// came from (a live provider or the research publication's capture). A publication capture is never
// labelled live.
import { tickerTitle } from '../lib/marketLabel';
import { useState } from 'react';
import { exactTime } from '../lib/format';
import { formatQuoteAge, formatQuoteAgo, quoteAgeMs, quoteFreshness, worstQuote, type QuoteFreshness, QUOTE_FRESH_BEFORE_MS, QUOTE_STALE_AFTER_MS } from '../live/freshness';
import { liveStore, useLiveVersion } from '../live/hooks';
import { quoteView, type QuoteView } from '../live/overlay';
import type { Availability } from '../live/types';
import type { Market } from '../contract/types';
import { Icon } from './Icon';
import { Popover } from './ui';


export function sourceLabel(source: string): string {
  if (source === 'publication') return 'research publication capture (not a live quote)';
  if (source.startsWith('kalshi-relay')) return 'Kalshi public market data via Sift relay (live)';
  if (source.startsWith('quote-feed')) return 'Sift quote feed (Kalshi public data, published every 3 min)';
  return source;
}

function stateText(availability: Availability, fresh: QuoteFreshness, age: number | null): string {
  if (availability === 'CLOSED' || availability === 'SETTLED') return `${availability} · final quote ${formatQuoteAgo(age)}`;
  if (availability === 'SUSPENDED') return `SUSPENDED · quote ${formatQuoteAge(age)} old`;
  if (fresh === 'UNKNOWN') return availability === 'UNKNOWN' ? 'UNKNOWN' : `${availability} · UNKNOWN`;
  return `${availability === 'UNKNOWN' ? '' : availability + ' · '}${fresh} · ${formatQuoteAge(age)}`;
}

/**
 * What the chip SAYS: the true age, quietly ("Updated 4m ago"). The explicit backend state (FRESH /
 * AGING / STALE / UNKNOWN, unchanged thresholds) stays in data-quote-state, the dot's tint, the
 * accessible name and the popover — never hidden, just not shouted.
 */
export function quietText(availability: Availability, fresh: QuoteFreshness, age: number | null): string {
  if (availability === 'CLOSED' || availability === 'SETTLED') return `${availability === 'SETTLED' ? 'Settled' : 'Closed'} · final ${formatQuoteAgo(age)}`;
  if (availability === 'SUSPENDED') return `Suspended · ${formatQuoteAgo(age)}`;
  if (fresh === 'UNKNOWN' || age == null) return 'Update time unknown';
  return `Updated ${formatQuoteAgo(age)}`;
}

/** One market's quote state. */
export function QuoteChip({ view, now, label }: { view: QuoteView; now: number; label?: string }) {
  const fresh = quoteFreshness(view.observedAt, now);
  const age = quoteAgeMs(view.observedAt, now);
  const notOpen = view.availability !== 'OPEN' && view.availability !== 'UNKNOWN';
  const cls = notOpen ? 'chip--unknown' : `chip--${fresh.toLowerCase()}`;
  return (
    <Popover
      label={`${label ?? 'quote'}: ${stateText(view.availability, fresh, age)}${view.live ? '' : ', publication capture'}`}
      trigger={
        <span className={`chip chip--fresh qchip ${cls}`} data-quote-state={`${view.availability}:${fresh}`} data-quote-source={view.live ? 'live' : 'publication'}>
          <span className="qchip__dot" aria-hidden="true" />
          {label && <span className="chip__k">{label}</span>}
          <span>{quietText(view.availability, fresh, age)}</span>
          <span className="chip__dim">{view.live ? 'live' : 'published'}</span>
        </span>
      }
    >
      <span className="pv">
        <span className="pv__row"><span>Market</span><b>{view.availability}</b></span>
        <span className="pv__row"><span>Quote</span><b>{fresh}{age != null ? ` · ${formatQuoteAge(age)} old` : ''}</b></span>
        <span className="pv__row"><span>Observed</span><b>{exactTime(view.observedAt)}</b></span>
        <span className="pv__row"><span>Source</span><b>{sourceLabel(view.source)}</b></span>
        <span className="pv__row"><span>Rule</span><b>fresh &lt; {QUOTE_FRESH_BEFORE_MS / 60000}m · stale &gt; {QUOTE_STALE_AFTER_MS / 60000}m</b></span>
        <span className="pv__note">Age is measured from when the quote was observed, not from Sift's last refresh attempt.</span>
      </span>
    </Popover>
  );
}

export interface QuoteSummary {
  total: number;
  live: number;
  counts: Record<QuoteFreshness, number>;
  notOpen: number;
  worst: QuoteFreshness;
  oldestAgeMs: number | null;
  newestAt: string | null;
}

/** The quote state of a set of markets: freshness over the contracts that can trade. */
export function summarizeQuotes(views: QuoteView[], now: number): QuoteSummary {
  const counts: Record<QuoteFreshness, number> = { FRESH: 0, AGING: 0, STALE: 0, UNKNOWN: 0 };
  let live = 0;
  let notOpen = 0;
  let oldest: number | null = null;
  let newest: string | null = null;
  const tradable: QuoteFreshness[] = [];
  for (const v of views) {
    if (v.live) live++;
    const f = quoteFreshness(v.observedAt, now);
    counts[f]++;
    if (v.availability !== 'OPEN' && v.availability !== 'UNKNOWN') {
      notOpen++;
      continue;
    }
    tradable.push(f);
    const a = quoteAgeMs(v.observedAt, now);
    if (a != null && (oldest == null || a > oldest)) oldest = a;
    if (v.observedAt && (!newest || Date.parse(v.observedAt) > Date.parse(newest))) newest = v.observedAt;
  }
  return { total: views.length, live, counts, notOpen, worst: tradable.length ? worstQuote(tradable) : 'UNKNOWN', oldestAgeMs: oldest, newestAt: newest };
}

/** A set of markets (a game, a player, a slate card): worst freshness among open contracts. */
export function QuoteSummaryChip({ views, now, label = 'prices' }: { views: QuoteView[]; now: number; label?: string }) {
  const s = summarizeQuotes(views, now);
  const allLive = s.total > 0 && s.live === s.total;
  const src = s.live === 0 ? 'published' : allLive ? 'live' : `${s.live}/${s.total} live`;
  return (
    <Popover
      label={`${label}: ${s.worst}, ${src}`}
      trigger={
        <span className={`chip chip--fresh qchip chip--${s.worst.toLowerCase()}`} data-quote-state={s.worst} data-quote-source={s.live === 0 ? 'publication' : allLive ? 'live' : 'mixed'}>
          <span className="qchip__dot" aria-hidden="true" />
          <span>{s.oldestAgeMs != null && s.worst !== 'UNKNOWN' ? `${label === 'prices' ? 'Prices' : label} updated ${formatQuoteAgo(s.oldestAgeMs)}` : `${label === 'prices' ? 'Prices' : label}: update time unknown`}</span>
          {!allLive && <span className="chip__dim">{src}</span>}
        </span>
      }
    >
      <span className="pv">
        <span className="pv__row"><span>State</span><b>{s.worst}</b></span>
        <span className="pv__row"><span>Oldest quote</span><b>{s.oldestAgeMs != null ? `${formatQuoteAge(s.oldestAgeMs)} old` : 'no timestamp'}</b></span>
        <span className="pv__row"><span>Markets</span><b>{s.total}</b></span>
        <span className="pv__row"><span>Live quotes</span><b>{s.live} of {s.total}</b></span>
        <span className="pv__row"><span>Fresh / aging</span><b>{s.counts.FRESH} / {s.counts.AGING}</b></span>
        <span className="pv__row"><span>Stale / unknown</span><b>{s.counts.STALE} / {s.counts.UNKNOWN}</b></span>
        {s.notOpen > 0 && <span className="pv__row"><span>Not open</span><b>{s.notOpen}</b></span>}
        <span className="pv__row"><span>Newest quote</span><b>{exactTime(s.newestAt)}</b></span>
        <span className="pv__note">Worst freshness among contracts that can trade. Fresh &lt; 15 min, stale &gt; 30 min.</span>
      </span>
    </Popover>
  );
}

/** Quote views for markets, re-read from the live store on every quote change. */
export function useQuoteViews<M extends Pick<Market, 'kalshi_ticker' | 'yes_bid' | 'yes_ask' | 'captured_at'>>(markets: M[]): QuoteView[] {
  useLiveVersion();
  const s = liveStore();
  return markets.map((m) => {
    const v = quoteView(m, s.quote(m.kalshi_ticker));
    return s.ticker(m.kalshi_ticker)?.missing && !v.live ? { ...v, availability: 'UNKNOWN' as Availability } : v;
  });
}

/** A small "refresh now" affordance for a scope; it never clears what is shown. */
export function RefreshQuotes({ tickers, label = 'Refresh prices' }: { tickers: string[]; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const s = liveStore();
  if (!s.enabled) return null;
  return (
    <span className="qrefresh">
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setNote(null);
          const r = await s.refreshNow(tickers, { timeoutMs: 8_000 });
          setBusy(false);
          setNote(r.error ? `Refresh failed (${r.error}); showing the last known quote.` : null);
        }}
      >
        <Icon name="clock" size={14} /> {busy ? 'Refreshing…' : label}
      </button>
      {note && <span className="muted small" role="status">{note}</span>}
    </span>
  );
}

/**
 * Contracts Kalshi lists under this game's events that the research publication does not have. Sift
 * knows their wording and live quote, nothing else: no family, subject, model price or history is
 * invented, and they are not part of handicap packets (the packet's market rows need the publication's
 * own metadata).
 */
export function NewlyListed({ quotes, now }: { quotes: import('../live/types').LiveQuote[]; now: number }) {
  const [all, setAll] = useState(false);
  if (!quotes.length) return null;
  const shown = all ? quotes : quotes.slice(0, 12);
  return (
    <div className="newlisted">
      <h3 className="newlisted__h">Listed on Kalshi after this research run <span className="seg__n">{quotes.length}</span></h3>
      <p className="muted small">
        Live inventory shows these contracts on this game's Kalshi events; the publication has no research, model price or history for them,
        so Sift shows Kalshi's own wording and the live quote only. They are not included in handicap packets.
      </p>
      <ul className="mrows">
        {shown.map((q) => {
          const v: QuoteView = { yesBid: q.yesBid, yesAsk: q.yesAsk, noBid: q.noBid, noAsk: q.noAsk, lastPrice: q.lastPrice, volume: q.volume, openInterest: q.openInterest, availability: q.availability, observedAt: q.observedAt, source: q.source, live: true };
          return (
            <li key={q.ticker} className="mrow mrow--static">
              <span className="mrow__d">
                {q.title ?? tickerTitle(q.ticker)}
                {q.yesSubTitle && q.yesSubTitle !== q.title ? <span className="muted"> · {q.yesSubTitle}</span> : null}
                <code className="ticker ticker--sm">{q.ticker}</code>
              </span>
              <span className="mrow__p num">{q.yesBid != null ? `${Math.round(q.yesBid * 1000) / 10}¢` : '—'} / {q.yesAsk != null ? `${Math.round(q.yesAsk * 1000) / 10}¢` : '—'}</span>
              <span className="mrow__f"><QuoteChip view={v} now={now} /></span>
            </li>
          );
        })}
      </ul>
      {quotes.length > shown.length && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAll(true)}>Show all {quotes.length}</button>}
    </div>
  );
}

/** A publication-only capture time as a quote view (no live observation exists for it here). */
export function publicationView(capturedAt: string | null | undefined): QuoteView {
  return { yesBid: null, yesAsk: null, noBid: null, noAsk: null, lastPrice: null, volume: null, openInterest: null, availability: 'UNKNOWN', observedAt: capturedAt ?? null, source: 'publication', live: false };
}

export type LiveMode = 'LIVE' | 'FEED' | 'CONNECTING' | 'BACKOFF' | 'OFFLINE' | 'OFF';

/** What the live-quote layer is doing right now (for the source banner and diagnostics). */
export function liveMode(d: ReturnType<ReturnType<typeof liveStore>['diagnostics']>, now: number): LiveMode {
  if (d.provider === 'none') return 'OFF';
  if (!d.online) return 'OFFLINE';
  if (d.backoffUntil && d.backoffUntil > now) return 'BACKOFF';
  if (!d.lastSuccessAt || !d.answeredBy) return 'CONNECTING'; // an inventory answer alone says nothing about quotes
  return d.answeredBy === 'quote-feed' ? 'FEED' : 'LIVE';
}

const MODE_TEXT: Record<LiveMode, string> = {
  LIVE: 'live quotes', FEED: 'quote feed', CONNECTING: 'quotes connecting', BACKOFF: 'quotes retrying', OFFLINE: 'quotes offline', OFF: 'no live quotes',
};

export function LiveStatusChip({ now }: { now: number }) {
  useLiveVersion();
  const d = liveStore().diagnostics();
  const mode = liveMode(d, now);
  const tone = mode === 'LIVE' ? 'fresh' : mode === 'FEED' || mode === 'CONNECTING' ? 'aging' : 'stale';
  return (
    <Popover
      label={`Market quotes: ${MODE_TEXT[mode]}`}
      trigger={
        <span className={`chip chip--fresh qchip chip--${tone}`}>
          <span aria-hidden="true">{mode === 'LIVE' ? '●' : mode === 'FEED' || mode === 'CONNECTING' ? '◐' : '○'}</span>
          <span>{MODE_TEXT[mode]}</span>
        </span>
      }
    >
      <span className="pv">
        <span className="pv__row"><span>Quotes from</span><b>{d.answeredBy ?? '—'}</b></span>
        <span className="pv__row"><span>Inventory from</span><b>{d.inventoryAnsweredBy ?? '—'}</b></span>
        <span className="pv__row"><span>Last success</span><b>{d.lastSuccessAt ? formatQuoteAgo(now - d.lastSuccessAt) : 'never'}</b></span>
        {d.lastError && <span className="pv__row"><span>Last error</span><b>{d.lastError}</b></span>}
        {mode === 'FEED' && d.fallback && <span className="pv__row"><span>Relay skipped</span><b>{d.fallback.status ? `HTTP ${d.fallback.status}` : d.fallback.error}</b></span>}
        <span className="pv__note">Market quotes run on their own clock, separate from the research publication. Details: Data & provenance.</span>
      </span>
    </Popover>
  );
}
