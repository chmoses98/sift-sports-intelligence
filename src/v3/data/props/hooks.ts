// React access to the prop universe: the universe itself (one memoised async load, instant on Back), the opponent chips, the lazily
// loaded History lane for the rows on screen, and the gated prices for them. Prices are read only through data/quoteGate.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAsync } from '../../../data/hooks';
import { liveStore, useLiveQuotes, useNow } from '../../../live/hooks';
import { quoteView } from '../../../live/overlay';
import { demoOn } from '../../state/prefs';
import { statusFacts } from '../../model/marketStatus';
import type { Price } from '../../model/types';
import { gate, type GateResult } from '../quoteGate';
import { useSlate } from '../useSlate';
import { historyBank, logRefOf, useHistoryBank, type BankEntry } from './bank';
import { recentValues } from './history';
import { loadUniverse, propGames } from './load';
import { matchupOf } from './rank';
import { demoUniverse } from '../../demo/props';
import type { Matchup, Prop, PropRung, Universe } from './types';
import { rungFor, type QueryCtx } from './query';

export function usePropUniverse(): { universe: Universe | null; loading: boolean; error: boolean; demo: boolean; retry: () => void } {
  const slate = useSlate();
  const demo = demoOn() || slate.demo;
  const games = useMemo(() => (demo ? slate.games.filter((g) => g.phase !== 'final') : propGames(slate.games)), [slate.games, demo]);
  const key = slate.loading ? null : `v3props:${demo ? 'demo' : 'real'}:${games.map((g) => g.key).join(',')}`;
  const r = useAsync<Universe>(key, () => (demo ? Promise.resolve(demoUniverse(games)) : loadUniverse(games)), { revalidate: true });
  return { universe: r.data ?? null, loading: slate.loading || r.loading, error: !!r.error && !r.data, demo, retry: () => r.retry?.() };
}

/** Matchup and held-log lookups for the query functions. `version` changes when a log arrives, so memos keyed on it recompute. */
export function useQueryCtx(universe: Universe | null): { ctx: QueryCtx; version: number } {
  const bank = useHistoryBank();
  const version = bank.getVersion();
  const matchups = useMemo(() => new Map<string, Matchup | null>(), [universe]); // eslint-disable-line react-hooks/exhaustive-deps -- a new universe starts a new cache
  const ctx = useMemo<QueryCtx>(() => ({
    matchup: (p) => {
      if (!universe) return null;
      if (!matchups.has(p.id)) matchups.set(p.id, matchupOf(p, universe.ranks));
      return matchups.get(p.id) ?? null;
    },
    values: (p) => valuesOf(p, bank.get),
  }), [universe, matchups, bank, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ctx, version };
}

/** The last games' values for a prop from a held log (oldest first), or undefined when the log is not held (or the statistic has none). */
export function valuesOf(p: Prop, get: (key: string) => BankEntry | undefined): number[] | undefined {
  const ref = logRefOf(p);
  if (!ref || !p.history) return undefined;
  const e = get(ref.key);
  if (e?.state !== 'ready') return undefined;
  return recentValues(e.log, p.history, new Date(p.startMs).toISOString());
}

export type HistoryState = { state: 'na' } | { state: 'idle' } | { state: 'loading' } | { state: 'none' } | { state: 'ready'; values: number[] };

/** What a row's History lane can say right now. */
export function historyStateOf(p: Prop, get: (key: string) => BankEntry | undefined): HistoryState {
  const ref = logRefOf(p);
  if (!ref) return { state: 'na' };
  const e = get(ref.key);
  if (!e) return { state: 'idle' };
  if (e.state === 'loading') return { state: 'loading' };
  if (e.state !== 'ready') return { state: 'none' };
  const values = recentValues(e.log, p.history!, new Date(p.startMs).toISOString());
  return values.length ? { state: 'ready', values } : { state: 'none' };
}

/**
 * Ask for the logs of the rows that are on screen (plus a little overscan) once the viewer has paused: a quick flick through 300 rows
 * fetches nothing. This is the ONLY place a log is requested for browsing; ranking by History asks explicitly (see `loadAll`).
 */
export function useVisibleHistory(rows: Prop[], enabled = true, delay = 220) {
  const refs = useMemo(() => rows.map(logRefOf).filter((r): r is NonNullable<typeof r> => !!r), [rows]);
  const sig = refs.map((r) => r.key).join('|');
  useEffect(() => {
    if (!enabled || !refs.length) return;
    const t = setTimeout(() => historyBank.ensure(refs), delay);
    return () => clearTimeout(t);
  }, [sig, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------------------------------------------------------------- prices

/** A published rung and its live quote as a Price (not yet gated). */
export function rawPrice(p: Prop, r: PropRung, quote: Parameters<typeof quoteView>[1]): Price {
  if (r.source === 'Sample') return { ask: r.ask, bid: r.bid, implied: r.ask, ticker: r.ticker, side: 'YES', description: `${p.name}: ${r.k}+ ${p.label.toLowerCase()}`, observedAt: r.capturedAt, source: 'Sample', volume: r.volume, tradable: true, marketStatus: 'open' };
  const v = quoteView({ kalshi_ticker: r.ticker, yes_bid: r.bid == null ? null : r.bid / 100, yes_ask: r.ask == null ? null : r.ask / 100, captured_at: r.capturedAt, volume: r.volume }, quote);
  // The status travels with the observation it came from: a live quote's own word when the live observation is the newer, else the publication's.
  const sf = statusFacts(v.live && quote ? quote.rawStatus ?? quote.availability : r.status);
  const ask = !sf.tradable || v.yesAsk == null || v.yesAsk <= 0 || v.yesAsk >= 1 ? null : Math.round(v.yesAsk * 100);
  const bid = !sf.tradable || v.yesBid == null ? null : Math.round(v.yesBid * 100);
  return { ask, bid, ...sf, implied: ask, ticker: r.ticker, side: 'YES', description: `${p.name}: ${r.k}+ ${p.label.toLowerCase()}`, observedAt: v.observedAt, source: 'Kalshi', volume: v.volume };
}

export interface PriceReader {
  /** The gated price of a rung: the price to print, or null (print "—"). */
  priceOf: (p: Prop, r: PropRung) => Price | null;
  gateOf: (p: Prop, r: PropRung) => GateResult;
  now: number;
}

/**
 * Prices for the rows on screen. SEAM (claude/quote-track, not merged): the visible rows' tickers are registered with the live store
 * through its current scope API at the `game` cadence (45 s), and nothing else is polled: not the other rows, not other rungs of rows
 * that are collapsed. When the reviewed branch lands, this call becomes `addRowsScope(tickers)` and the contract sheet's open becomes
 * `refreshContract(ticker)`; the gate below is already the single decision point (`gate` delegates to `quoteUsable` there).
 */
export function usePropPrices(visible: Prop[], expanded: Prop | null): PriceReader {
  const now = useNow(15_000);
  const tickers = useMemo(() => {
    const t = new Set<string>();
    for (const p of visible) { const r = rungFor(p, null); if (r.source !== 'Sample') t.add(r.ticker); }
    if (expanded && expanded.rungs[0]?.source !== 'Sample') for (const r of expanded.rungs) t.add(r.ticker);
    return [...t];
  }, [visible, expanded]);
  // Rows scroll past faster than quotes are worth fetching: the scope follows the rows only once they have stayed put (a flick through
  // the list registers and fetches nothing). The first set registers at once so the screen's own prices arrive with it.
  const settled = useSettled(tickers, 450);
  const live = useLiveQuotes(settled, 'game');
  // Opening a row asks for its whole ladder once, now (the rows' own scope names only the featured rung, and the store does not poll a
  // game it has just read). SEAM: with the reviewed quote branch this becomes `refreshContract(ticker)` per rung, relay first.
  const openId = expanded?.id ?? null;
  const openTickers = useMemo(() => (expanded && expanded.rungs[0]?.source !== 'Sample' ? expanded.rungs.map((r) => r.ticker) : []), [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!openTickers.length) return;
    liveStore().refreshNow(openTickers, { timeoutMs: 6_000 }).catch(() => undefined);
  }, [openTickers]);
  const store = liveStore();
  // `live.version` changes whenever any quote does: the lookup is stable, so the readers must be re-created for rows to repaint.
  const gateOf = useCallback((p: Prop, r: PropRung): GateResult => gate(rawPrice(p, r, store.quote(r.ticker)), { kind: 'list', startMs: p.startMs, live: false }, now), [store, now, live.version]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => ({ gateOf, priceOf: (p, r) => gateOf(p, r).price, now }), [gateOf, now]);
}

/** A value that follows `v` only after it has stopped changing for `ms` (the first value is taken at once). */
export function useSettled<T>(v: T, ms: number): T {
  const [s, setS] = useState(v);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => setS(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return s;
}

/** A stable callback ref for the latest value (the virtual list reads it inside scroll handlers). */
export function useLatest<T>(v: T) { const r = useRef(v); r.current = v; return r; }
