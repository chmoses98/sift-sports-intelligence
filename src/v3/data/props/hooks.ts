// React access to the prop universe: the universe itself (one memoised async load, instant on Back), the opponent chips, the lazily
// loaded History lane for the rows on screen, and the gated prices for them. Prices are read only through data/quoteGate.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { liveStore, useLiveQuotes, useNow } from '../../../live/hooks';
import { quoteView } from '../../../live/overlay';
import { nameKey } from '../../../insights/context';
import { demoOn } from '../../state/prefs';
import type { Price } from '../../model/types';
import { gate, type GateResult } from '../quoteGate';
import { useSlate } from '../useSlate';
import { availabilityBank, pendingKeys, withAvailability } from './availability';
import { historyBank, logRefOf, useHistoryBank, type BankEntry } from './bank';
import { capGames, horizonCounts, startsWithin, type Horizon, type HorizonCount } from './horizon';
import { recentValues } from './history';
import { useBankVersion } from './lazyBank';
import { anyStale, eligibleGames, loadProgressive, peekProgress, type Progress } from './load';
import { chipStateOf, rankBank, rankKeysFor, rankLookup, type ChipState } from './ranks';
import { matchupOf } from './rank';
import { demoUniverse } from '../../demo/props';
import type { Matchup, Prop, PropRung, Universe } from './types';
import { rungFor, type QueryCtx } from './query';

export interface UniverseState {
  /** The universe drawn so far: the soonest `gamesLoaded` games of the horizon, with availability applied where it has been read. */
  universe: Universe | null;
  loading: boolean;
  error: boolean;
  demo: boolean;
  horizon: Horizon;
  /** Games and estimated wire bytes each horizon holds (from the board rows: no game document is read for this). */
  counts: Record<Horizon, HorizonCount>;
  /** True while the games of the requested horizon are still being read (the universe is then a prefix). */
  reading: boolean;
  /** Games the horizon would hold beyond the cap (the soonest MAX_GAMES are read). */
  omitted: number;
}

/**
 * The prop universe for a horizon. Games are read soonest first and the universe is published in prefixes (load.ts), so the list draws the
 * soonest games while the rest are still on their way; a longer horizon reads only the games it adds (every game's result is memoised for
 * the session), and Back draws from memory without a request.
 */
export function usePropUniverse(horizon: Horizon = '48h'): UniverseState {
  const slate = useSlate();
  const demo = demoOn() || slate.demo;
  const eligible = useMemo(() => (demo ? [] : eligibleGames(slate.games)), [slate.games, demo]);
  const counts = useMemo(() => horizonCounts(demo ? slate.games.filter((g) => g.phase !== 'final') : eligible, slate.now), [demo, slate.games, eligible, slate.now]);
  const capped = useMemo(() => capGames(eligible.filter((g) => startsWithin(g, slate.now, horizon))), [eligible, slate.now, horizon]);
  const games = useMemo(() => (demo ? slate.games.filter((g) => g.phase !== 'final') : capped.games), [demo, slate.games, capped]);
  const key = slate.loading ? null : `v3props:${demo ? 'demo' : 'real'}:${games.map((g) => g.key).join(',')}`;

  // What is already in memory draws on the first render (Back; a longer horizon starts from the games it shares with the shorter one).
  const held = useMemo(() => (key && !demo ? peekProgress(games) : null), [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` names `games`
  const sample = useMemo(() => (key && demo ? demoUniverse(games) : null), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [prog, setProg] = useState<{ key: string; p: Progress } | null>(null);
  useEffect(() => {
    if (!key || demo) return;
    if (held?.complete && !anyStale(games)) { setProg({ key, p: held }); return; }
    const ctl = new AbortController();
    void loadProgressive(games, { signal: ctl.signal, minLoaded: held?.loaded ?? 0, onUpdate: (p) => setProg({ key, p }) });
    return () => ctl.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // A universe on screen for longer than the research clock allows is re-read in the background and replaced whole (never by a prefix).
  useEffect(() => {
    if (!key || demo) return;
    const ctl = new AbortController();
    const check = () => { if (document.visibilityState !== 'hidden' && anyStale(games)) void loadProgressive(games, { signal: ctl.signal, partial: false, onUpdate: (p) => setProg({ key, p }) }); };
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => { ctl.abort(); clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown: Progress | null = demo ? (sample ? { universe: sample, loaded: games.length, total: games.length, complete: true } : null) : prog?.key === key ? prog.p : held ?? prog?.p ?? null;
  const av = useBankVersion(availabilityBank);
  const universe = useMemo(() => (shown ? withAvailability(shown.universe, availabilityBank.get, nameKey) : null), [shown, av]); // eslint-disable-line react-hooks/exhaustive-deps
  const reading = !demo && !!key && !(shown && shown.complete && (prog?.key === key || held));
  return { universe, loading: slate.loading || !shown, error: false, demo, horizon, counts, reading, omitted: capped.omitted };
}

/**
 * Availability for the rows that need it: read the research documents of these rows' games (the ones on screen, a little ahead, the
 * expanded row). Requests for games that left the screen and have not started are dropped.
 */
export function useEnsureAvailability(rows: Prop[], enabled = true) {
  const keys = useMemo(() => pendingKeys(rows), [rows]);
  const sig = keys.join('|');
  useEffect(() => {
    if (!enabled) return;
    availabilityBank.ensure(keys, { latest: true });
  }, [sig, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Read the ranking tables these rows' opponent chips need. */
export function useEnsureRanks(rows: Prop[], enabled = true) {
  const keys = useMemo(() => rankKeysFor(rows), [rows]);
  const sig = keys.join('|');
  useEffect(() => { if (enabled && keys.length) rankBank.ensure(keys); }, [sig, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** True while any of these tables is still on its way (a filter or an order that needs every opponent rank must not run on a part of them). */
export function ranksPending(keys: string[]): boolean {
  return keys.some((k) => { const e = rankBank.get(k); return !e || e.state === 'loading'; });
}

/** Matchup and held-log lookups for the query functions. `version` changes when a log or a ranking arrives, so memos keyed on it recompute. */
export function useQueryCtx(universe: Universe | null): { ctx: QueryCtx; version: number; chipOf: (p: Prop) => ChipState } {
  const bank = useHistoryBank();
  const version = bank.getVersion();
  const rv = useBankVersion(rankBank);
  const own = universe?.ranks;
  const matchups = useMemo(() => new Map<string, Matchup | null>(), [universe, rv]); // eslint-disable-line react-hooks/exhaustive-deps -- a new universe or a new ranking starts a new cache
  const ctx = useMemo<QueryCtx>(() => ({
    matchup: (p) => {
      if (!universe || !own) return null;
      if (!matchups.has(p.id)) matchups.set(p.id, matchupOf(p, rankLookup(own, rankBank.get)));
      return matchups.get(p.id) ?? null;
    },
    values: (p) => valuesOf(p, bank.get),
    histKind: (p) => { const ref = logRefOf(p); if (!ref || !p.history) return 'none'; const e = bank.get(ref.key); return !e || e.state === 'loading' || e.state === 'error' ? 'pending' : 'none'; },
  }), [universe, own, matchups, bank, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const chipOf = useCallback((p: Prop): ChipState => chipStateOf(p, own ?? new Map(), rankBank.get), [own, rv]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ctx, version, chipOf };
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
  if (r.source === 'Sample') return { ask: r.ask, bid: r.bid, implied: r.ask, ticker: r.ticker, side: 'YES', description: `${p.name}: ${r.k}+ ${p.label.toLowerCase()}`, observedAt: r.capturedAt, source: 'Sample', volume: r.volume };
  const v = quoteView({ kalshi_ticker: r.ticker, yes_bid: r.bid == null ? null : r.bid / 100, yes_ask: r.ask == null ? null : r.ask / 100, captured_at: r.capturedAt, volume: r.volume }, quote);
  const ask = v.yesAsk == null || v.yesAsk <= 0 || v.yesAsk >= 1 ? null : Math.round(v.yesAsk * 100);
  const bid = v.yesBid == null ? null : Math.round(v.yesBid * 100);
  return { ask, bid, implied: ask, ticker: r.ticker, side: 'YES', description: `${p.name}: ${r.k}+ ${p.label.toLowerCase()}`, observedAt: v.observedAt, source: 'Kalshi', volume: v.volume };
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
