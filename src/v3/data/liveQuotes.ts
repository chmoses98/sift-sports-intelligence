// How SIFT 3.0 screens ask the shared live-quote store for the prices they PRINT (and nothing else). Every price slot on a v3 screen is either
//   * a ROW of a list (a card's lines, a prop row, a ladder rung): `useRowQuotes` -> `QuoteStore.addRowsScope`, game cadence (45 s), the delivery chain
//     (relay first, the feed for any ticker the relay could not supply, each requested ticker judged on its own observation); or
//   * THE exact contract (the contract sheet): `useContractRefresh` -> `addContractScope` (detail cadence, 20 s) plus `refreshContract` on open and on Retry.
// Both carry the game's schedule start and whether it is in play, which is what gives the refresh its per-ticker maximum observation age (the same
// table `quoteGate` applies at display: src/live/quoteUsable.ts). A screen registers only the tickers it shows: the caller passes exactly those.
//
// The delivery chain is built by src/live/deliveryConfig.ts from the same two URLs as the rest of the app (VITE_SIFT_QUOTE_RELAY_URL, VITE_SIFT_QUOTE_FEED_URL):
// with the relay configured it is relay then feed; without it, the feed alone; with the feed switched off and no relay, no chain at all, and the store then
// serves these entry points from its production provider (or nothing). This module reads no configuration of its own and invents no flag.
//
// Nothing here prints anything. Whether a price may be shown is data/quoteGate.ts (which is src/live/quoteUsable.ts); the diagnostics the store keeps
// (history, availability meter, per-ticker counters) are never read by a screen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { liveStore, useLiveVersion } from '../../live/hooks';
import { MAX_ROW_TICKERS, type ContractState, type RefreshResult } from '../../live/store';
import type { LiveQuote } from '../../live/types';
import type { MarketState } from '../model/marketStatus';

/** A game's schedule start (the schedule authority's, never Kalshi's) and whether it is in play: what tiers the maximum observation age. */
export interface RowsContext { startMs: number | null; live: boolean }

/** Rows that share one context. */
export interface RowGroup extends RowsContext { tickers: Iterable<string> | undefined }

const finite = (ms: number | null | undefined): number | null => (ms != null && Number.isFinite(ms) ? ms : null);
const chunks = <T,>(xs: readonly T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };

/**
 * Keep these list rows' contracts current while the calling screen is mounted: one rows scope per context (and per 200 tickers, the store's cap),
 * released on unmount or when the rows change. Returns a lookup that always reads the newest stored quote, like `useLiveQuotes`.
 */
export function useRowGroups(groups: readonly RowGroup[]): { quote: (ticker: string) => LiveQuote | undefined; version: number } {
  const s = liveStore();
  // The groups as a stable key: [start|live|sorted tickers], so a re-render with the same rows registers nothing new.
  const key = groups.map((g) => `${finite(g.startMs) ?? ''}|${g.live ? 1 : 0}|${[...new Set(g.tickers ?? [])].sort().join(',')}`).filter((k) => !k.endsWith('|')).join(';');
  useEffect(() => {
    if (!key) return;
    const offs: (() => void)[] = [];
    for (const part of key.split(';')) {
      const [start, live, list] = part.split('|');
      for (const c of chunks(list.split(','), MAX_ROW_TICKERS)) offs.push(s.addRowsScope(c, { startsAt: start === '' ? null : Number(start), live: live === '1' }));
    }
    return () => offs.forEach((off) => off());
  }, [s, key]);
  const version = useLiveVersion();
  return useMemo(() => ({ quote: (t: string) => s.quote(t), version }), [s, version]);
}

/** A lookup that always reads the newest stored quote and re-renders on a change, WITHOUT registering anything (the caller's scope is registered elsewhere). */
export function useQuoteReader(): { quote: (ticker: string) => LiveQuote | undefined; version: number } {
  const s = liveStore();
  const version = useLiveVersion();
  return useMemo(() => ({ quote: (t: string) => s.quote(t), version }), [s, version]);
}

/** The rows of ONE game (one context). `tickers` undefined or empty registers nothing. */
export function useRowQuotes(tickers: Iterable<string> | undefined, ctx: RowsContext): { quote: (ticker: string) => LiveQuote | undefined; version: number } {
  return useRowGroups([{ tickers, startMs: ctx.startMs, live: ctx.live }]);
}

/**
 * Ask for these list rows' freshest quotes once, now (a ladder opened, for instance), as ONE batch through the delivery chain judged by the list limits.
 * Resolves to the per-ticker accounting (requested, refreshed, missing, failed, unusable, non-tradable); never throws.
 */
export async function refreshRowsNow(tickers: Iterable<string>, ctx: RowsContext, timeoutMs = 6_000): Promise<RefreshResult | null> {
  try {
    return await liveStore().refreshNow(tickers, { timeoutMs, context: { surface: 'list', startsAt: finite(ctx.startMs), live: ctx.live } });
  } catch { return null; }
}

export interface ContractRefresh {
  busy: boolean;
  /** Ask again: the exact contract's freshest price now, relay first and then the feed (the sheet's Retry). */
  retry: () => Promise<void>;
  /** How the last refresh ended for THIS ticker (null before the first answer). 'market_closed' = the provider positively reports it closed, settled or expired: no Retry. */
  state: ContractState | null;
  /** What the provider reported about the market on that refresh. */
  marketStatus: MarketState | null;
  /** The last refresh's per-ticker accounting (internal; the sheet prints none of it). */
  result: RefreshResult | null;
}

const REFRESH_MS = 6_000;

/**
 * The exact contract on screen: a contract scope keeps it current (detail cadence), opening it forces one refresh (`refreshContract`: relay first, then the
 * feed, inside a bounded wait), and `retry` does the same again. `tk` null registers and asks nothing.
 */
export function useContractRefresh(tk: string | null, ctx: RowsContext): ContractRefresh {
  const start = finite(ctx.startMs), live = ctx.live;
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ tk: string; state: ContractState; marketStatus: MarketState | null; result: RefreshResult } | null>(null);
  const current = useRef(tk);
  current.current = tk;
  useEffect(() => {
    if (!tk) return;
    return liveStore().addContractScope(tk, { startsAt: start, live });
  }, [tk, start, live]);
  const run = useCallback(async () => {
    if (!tk) return;
    setBusy(true);
    try {
      const r = await liveStore().refreshContract(tk, { startsAt: start, live }, { timeoutMs: REFRESH_MS });
      // A sheet that has moved on to another contract does not take this answer.
      if (current.current === tk) setLast({ tk, state: r.state, marketStatus: r.marketStatus, result: r.result });
    } catch { /* the gate decides what is shown */ } finally { setBusy(false); }
  }, [tk, start, live]);
  // Opening the contract asks once. (Re-registering the scope because the schedule start arrived does not ask again: only the ticker does.)
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!tk || asked.current === tk) return;
    asked.current = tk;
    void run();
  }, [tk, run]);
  const mine = last && last.tk === tk ? last : null;
  return { busy, retry: run, state: mine?.state ?? null, marketStatus: mine?.marketStatus ?? null, result: mine?.result ?? null };
}
