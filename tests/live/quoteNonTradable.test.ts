// Non-tradable markets in the quote-DELIVERY path. A market the provider positively reports as closed, settled /
// finalised, suspended, paused, expired (or in a state Sift does not recognise) has no actionable ask: renderQuote()
// returns null (never a degraded value), refreshContract() says so distinctly from "no quote", and the withheld market
// is an ANSWERED market, never a failed refresh (no retry, no backoff, no alarm). A market with no status and a current
// quote stays tradable. The production chain (packet preflight) is not touched; its characterisation test runs unchanged.
//
// The rule and the evidence for it: src/live/tradable.ts and docs/quote-track/README.md ("Non-tradable markets").
import { afterEach, describe, expect, it } from 'vitest';
import { MARKET_CLOSED, MISSING_PRICE } from '../../src/live/missingPrice';
import { availabilityOf, normalizeKalshiMarket } from '../../src/live/normalize';
import { CONTEXT_KEYS, MAX_AGE_MS, quoteUsable, type QuoteContext } from '../../src/live/quoteUsable';
import { QuoteStore } from '../../src/live/store';
import { isTerminalStatus, isTradableStatus, marketStatusOf, type MarketStatus } from '../../src/live/tradable';
import { ProviderError, type LiveQuote } from '../../src/live/types';
import { quote } from './fakes';
import { FAR, T, U, V, rig, type Rig } from './support/delivery';

let current: QuoteStore | null = null;
afterEach(() => current?.dispose());
const setup = (tickers = [T, U, V]): Rig => {
  const r = rig(tickers);
  current = r.store;
  return r;
};
const rows = { surface: 'list' as const, ...FAR }; // list_far: 180 s
const contract = { surface: 'contract' as const, ...FAR }; // contract_far: 60 s
const SEC = 1_000;

/** What a provider sends for a market in `word`: the raw status word and the availability normalize() derives from it. */
const reports = (word: string | null): Partial<LiveQuote> => ({ rawStatus: word, availability: availabilityOf(word) });

/** Every status word Sift knows, with the state it must be read as. */
const WORDS: [word: string, status: MarketStatus][] = [
  ['active', 'open'], ['open', 'open'], ['ACTIVE', 'open'], ['Open', 'open'],
  ['initialized', 'unopened'], ['unopened', 'unopened'],
  ['inactive', 'suspended'], ['paused', 'suspended'], ['suspended', 'suspended'], ['halted', 'suspended'], ['frozen', 'suspended'],
  ['closed', 'closed'], ['determined', 'closed'], ['disputed', 'closed'], ['amended', 'closed'],
  ['settled', 'settled'], ['finalized', 'settled'], ['finalised', 'settled'], ['FINALIZED', 'settled'], ['resolved', 'settled'], ['voided', 'settled'], ['cancelled', 'settled'],
  ['expired', 'expired'],
  ['frobnicated', 'unrecognised'],
];
const TERMINAL = WORDS.filter(([, s]) => isTerminalStatus(s));
const REVERSIBLE = WORDS.filter(([, s]) => !isTradableStatus(s) && !isTerminalStatus(s));
const OPEN_WORDS = WORDS.filter(([, s]) => s === 'open');
const NOW = Date.parse('2026-10-04T16:00:00Z');
const at = (ageMs: number, extra: Partial<LiveQuote> = {}) => quote(T, 0.41, NOW - ageMs, extra);

describe('the rule: what the provider positively reported', () => {
  it.each(WORDS)('status word %j reads as %s', (word, status) => {
    expect(marketStatusOf(at(0, reports(word)))).toBe(status);
  });

  it('no status at all is "unreported" and tradable (the common case: 8,842 priced markets of the real NFL snapshot have none)', () => {
    const q = at(0, { rawStatus: null, availability: 'UNKNOWN' });
    expect(marketStatusOf(q)).toBe('unreported');
    expect(isTradableStatus('unreported')).toBe(true);
    expect(marketStatusOf(at(0, { rawStatus: '', availability: 'UNKNOWN' }))).toBe('unreported');
    expect(marketStatusOf(at(0, { rawStatus: '   ', availability: 'UNKNOWN' }))).toBe('unreported');
  });

  it('only "open" and "unreported" are tradable; closed, settled and expired are terminal', () => {
    for (const s of ['open', 'unreported'] as const) expect([isTradableStatus(s), isTerminalStatus(s)]).toEqual([true, false]);
    for (const s of ['closed', 'settled', 'expired'] as const) expect([isTradableStatus(s), isTerminalStatus(s)]).toEqual([false, true]);
    for (const s of ['suspended', 'unopened', 'unrecognised'] as const) expect([isTradableStatus(s), isTerminalStatus(s)]).toEqual([false, false]);
  });

  it('a non-empty settlement result means the market is determined, whatever the status word says', () => {
    expect(marketStatusOf(at(0, { ...reports('active'), result: 'yes' }))).toBe('settled');
    expect(marketStatusOf(at(0, { ...reports('active'), result: 'no' }))).toBe('settled');
    expect(marketStatusOf(at(0, { ...reports(null), result: 'yes' }))).toBe('settled');
    // an empty result (Kalshi's "" before settlement) says nothing
    expect(marketStatusOf(at(0, { ...reports('active'), result: '' }))).toBe('open');
    expect(marketStatusOf(at(0, { ...reports('active'), result: null }))).toBe('open');
  });

  it('a close time the PROVIDER had already passed when it observed a market with no status means expired (the device clock is not involved); an explicit open status stays authoritative', () => {
    const closeAt = NOW - 10 * 60_000;
    expect(marketStatusOf(at(0, { ...reports('active'), closeTime: new Date(closeAt).toISOString() }))).toBe('open');
    expect(marketStatusOf(at(0, { ...reports(null), closeTime: new Date(closeAt).toISOString() }))).toBe('expired');
    // observed BEFORE the close time: still trading
    expect(marketStatusOf(at(0, { ...reports(null), closeTime: new Date(NOW + 60_000).toISOString() }))).toBe('unreported');
    // exactly at the observation instant counts as closed
    expect(marketStatusOf(at(0, { ...reports(null), closeTime: new Date(NOW).toISOString() }))).toBe('expired');
    // unparseable or absent close time says nothing
    expect(marketStatusOf(at(0, { ...reports(null), closeTime: 'soon' }))).toBe('unreported');
    expect(marketStatusOf(at(0, { ...reports(null), closeTime: null }))).toBe('unreported');
    // a more specific status is kept
    expect(marketStatusOf(at(0, { ...reports('settled'), closeTime: new Date(closeAt).toISOString() }))).toBe('settled');
    expect(marketStatusOf(at(0, { ...reports('paused'), closeTime: new Date(closeAt).toISOString() }))).toBe('suspended');
  });

  it('when availability and the raw word disagree the more restrictive report wins; a hand-built quote with availability alone is read as it says', () => {
    expect(marketStatusOf(at(0, { rawStatus: 'active', availability: 'CLOSED' }))).toBe('closed');
    expect(marketStatusOf(at(0, { rawStatus: 'active', availability: 'SETTLED' }))).toBe('settled');
    expect(marketStatusOf(at(0, { rawStatus: 'active', availability: 'SUSPENDED' }))).toBe('suspended');
    expect(marketStatusOf(at(0, { rawStatus: 'active', availability: 'UNKNOWN' }))).toBe('open');
    expect(marketStatusOf(at(0, { rawStatus: null, availability: 'CLOSED' }))).toBe('closed');
    expect(marketStatusOf(at(0, { rawStatus: null, availability: 'OPEN' }))).toBe('open');
  });

  it('normalizeKalshiMarket keeps `result` only when the provider sent a non-empty one (quotes without one are unchanged)', () => {
    const base = { ticker: T, event_ticker: 'KXNHLGOAL-26OCT26TORCGY', status: 'active', yes_bid_dollars: '0.4100', yes_ask_dollars: '0.4300' };
    const plain = normalizeKalshiMarket(base, '2026-10-26T18:00:00Z', 's')!;
    expect('result' in plain).toBe(false);
    expect('result' in normalizeKalshiMarket({ ...base, result: '' }, '2026-10-26T18:00:00Z', 's')!).toBe(false);
    expect(normalizeKalshiMarket({ ...base, status: 'finalized', result: 'yes' }, '2026-10-26T18:00:00Z', 's')).toMatchObject({ result: 'yes', availability: 'SETTLED', rawStatus: 'finalized' });
  });
});

describe('quoteUsable: a non-tradable market never yields a price, interplay with the age table', () => {
  const ctxs: [string, QuoteContext][] = [
    ['list_far', { surface: 'list', startsAt: NOW + 5 * 3_600_000 }],
    ['list_near', { surface: 'list', startsAt: NOW + 3_600_000 }],
    ['list_live', { surface: 'list', startsAt: NOW - 1, live: true }],
    ['contract_far', { surface: 'contract', startsAt: NOW + 5 * 3_600_000 }],
    ['contract_near', { surface: 'contract', startsAt: NOW + 3_600_000 }],
  ];

  it('covers every row of the age table', () => {
    expect(ctxs.map(([k]) => k).sort()).toEqual([...CONTEXT_KEYS].sort());
  });

  describe.each(ctxs)('%s', (key, ctx) => {
    const limit = MAX_AGE_MS[key as keyof typeof MAX_AGE_MS];
    it.each(OPEN_WORDS)('open word %j: usable inside the limit, "too_old" past it', (word) => {
      expect(quoteUsable(at(0, reports(word)), ctx, NOW)).toMatchObject({ usable: true, reason: null, marketStatus: 'open' });
      expect(quoteUsable(at(limit, reports(word)), ctx, NOW)).toMatchObject({ usable: true });
      expect(quoteUsable(at(limit + SEC, reports(word)), ctx, NOW)).toMatchObject({ usable: false, reason: 'too_old', marketStatus: 'open' });
    });

    it.each(TERMINAL)('terminal word %j: not tradable at any age', (word, status) => {
      for (const age of [0, 1, limit, limit + SEC, 3_600_000]) {
        expect(quoteUsable(at(age, reports(word)), ctx, NOW), `${word} @${age}`).toMatchObject({ usable: false, reason: 'not_tradable', marketStatus: status });
      }
    });

    it.each(REVERSIBLE)('reversible word %j: not tradable while current, plain "too_old" when old (an old report proves nothing about now)', (word, status) => {
      expect(quoteUsable(at(0, reports(word)), ctx, NOW)).toMatchObject({ usable: false, reason: 'not_tradable', marketStatus: status });
      expect(quoteUsable(at(limit, reports(word)), ctx, NOW)).toMatchObject({ usable: false, reason: 'not_tradable', marketStatus: status });
      expect(quoteUsable(at(limit + SEC, reports(word)), ctx, NOW)).toMatchObject({ usable: false, reason: 'too_old', marketStatus: status });
    });

    it('no status + a current quote stays usable; no status + an old quote is simply too old', () => {
      const noStatus = reports(null);
      expect(quoteUsable(at(0, noStatus), ctx, NOW)).toMatchObject({ usable: true, marketStatus: 'unreported' });
      expect(quoteUsable(at(limit + SEC, noStatus), ctx, NOW)).toMatchObject({ usable: false, reason: 'too_old' });
    });
  });

  it('a terminal report is decisive even without a believable timestamp (untimed, unparseable, future-dated, missing)', () => {
    const closed = reports('closed');
    expect(quoteUsable(at(0, { ...closed, observedVia: 'received' }), rows, NOW)).toMatchObject({ usable: false, reason: 'not_tradable' });
    expect(quoteUsable(at(0, { ...closed, observedAt: 'whenever' }), rows, NOW)).toMatchObject({ usable: false, reason: 'not_tradable' });
    expect(quoteUsable(at(-60_000, closed), rows, NOW)).toMatchObject({ usable: false, reason: 'not_tradable' });
    // while a reversible one without a believable timestamp is just "no believable time"
    expect(quoteUsable(at(0, { ...reports('paused'), observedVia: 'received' }), rows, NOW)).toMatchObject({ usable: false, reason: 'untimed_observation' });
  });

  it('no quote at all stays "no_quote" with no market status', () => {
    expect(quoteUsable(undefined, rows, NOW)).toMatchObject({ usable: false, reason: 'no_quote', marketStatus: null });
  });
});

describe('the delivery chain and the store: a closed market is an answer, not a failure', () => {
  it.each(TERMINAL)('relay reports %j: renderQuote null, nothing asked of the feed, no failure, no backoff, history "closed"', async (word, status) => {
    const { clock, relay, feed, store } = setup([T]);
    relay.extra.set(T, reports(word));
    store.addRowsScope([T], FAR);
    await clock.advance(0);
    expect(store.renderQuote(T, rows)).toBeNull();
    expect(feed.calls).toHaveLength(0); // a terminal state cannot be improved by asking the next source
    expect(store.marketStatus(T)).toBe(status);
    expect(store.refreshHistory().at(-1)).toMatchObject({ outcome: 'closed', unusableTickers: 0 });
    const d = store.diagnostics();
    expect([d.consecutiveFailures, d.backoffUntil, d.lastError, d.tickersFailed]).toEqual([0, null, null, 0]);
  });

  it('closed information stays available to callers as non-actionable data (last price, volume, status, wording)', async () => {
    const { relay, store } = setup([T]);
    relay.extra.set(T, { ...reports('finalized'), result: 'yes', title: 'Boston wins' });
    await store.refreshContract(T, FAR);
    expect(store.renderQuote(T, contract)).toBeNull();
    expect(store.quote(T)).toMatchObject({ ticker: T, availability: 'SETTLED', rawStatus: 'finalized', result: 'yes', lastPrice: 0.41, volume: 100, title: 'Boston wins' });
    expect(store.nonActionable(T)).toBe(store.quote(T));
    expect(store.nonActionable(U)).toBeNull(); // nothing held
  });

  it('nonActionable() is null for a tradable market and for one with no status', async () => {
    const { relay, store } = setup([T, U]);
    relay.extra.set(U, reports(null));
    await store.refreshNow([T, U], { context: { surface: 'list', ...FAR } });
    expect(store.nonActionable(T)).toBeNull();
    expect(store.nonActionable(U)).toBeNull();
    expect(store.renderQuote(T, rows)).not.toBeNull();
    expect(store.renderQuote(U, rows)).not.toBeNull(); // no status + a current quote stays tradable
    expect(store.marketStatus(U)).toBe('unreported');
  });

  it('a market with no status word and a current quote is rendered through the whole chain', async () => {
    const { clock, relay, store } = setup([T]);
    relay.extra.set(T, reports(null));
    store.addRowsScope([T], FAR);
    await clock.advance(0);
    expect(store.renderQuote(T, rows)).toMatchObject({ ticker: T, rawStatus: null, yesAsk: 0.43 });
  });

  it('reversible states (suspended, paused, not yet open, unrecognised) are withheld while current and still do not fail the refresh', async () => {
    for (const [word, status] of REVERSIBLE) {
      const { clock, relay, feed, store } = setup([T]);
      relay.extra.set(T, reports(word));
      store.addRowsScope([T], FAR);
      await clock.advance(0);
      expect(store.renderQuote(T, rows), word).toBeNull();
      expect(store.marketStatus(T)).toBe(status);
      expect(feed.calls).toHaveLength(0);
      expect(store.refreshHistory().at(-1)).toMatchObject({ outcome: 'closed' });
      expect(store.diagnostics().consecutiveFailures).toBe(0);
      current?.dispose();
    }
  });

  it('a market that resumes trading is shown again at the next refresh (suspended is not terminal)', async () => {
    const { clock, relay, store } = setup([T]);
    relay.extra.set(T, reports('paused'));
    const first = await store.refreshContract(T, FAR);
    expect(first).toMatchObject({ state: 'not_trading', marketStatus: 'suspended', quote: null });
    await clock.advance(5 * SEC);
    relay.extra.set(T, reports('active'));
    const second = await store.refreshContract(T, FAR);
    expect(second).toMatchObject({ state: 'price', marketStatus: 'open' });
    expect(second.quote?.yesAsk).toBe(0.43);
  });

  it('a closed report older than the age limit is still a closed market (terminal), but an old SUSPENDED report falls through to the next source', async () => {
    const { relay, feed, store } = setup([T]);
    relay.omit = new Set([T]);
    feed.staleBy = 10 * 60_000;
    feed.extra.set(T, reports('settled'));
    const r = await store.refreshContract(T, FAR);
    expect(r).toMatchObject({ state: 'market_closed', marketStatus: 'settled', quote: null });
    expect(r.result).toMatchObject({ failed: [], missing: [], unusable: [], nonTradable: [T] });

    const b = setup([T]);
    b.relay.omit = new Set([T]);
    b.feed.staleBy = 10 * 60_000;
    b.feed.extra.set(T, reports('paused'));
    const s = await b.store.refreshContract(T, FAR);
    expect(s).toMatchObject({ state: 'unavailable', marketStatus: 'suspended', quote: null }); // an old "paused" proves nothing about now
    expect(s.usability.reason).toBe('too_old');
    expect(s.result).toMatchObject({ unusable: [T], nonTradable: [] });
  });

  it('a closed market in a partial batch: the open neighbours display, only the absent ticker goes to the feed', async () => {
    const { clock, relay, feed, store } = setup([T, U, V]);
    relay.extra.set(T, reports('closed'));
    relay.omit = new Set([V]);
    feed.staleBy = 20 * SEC;
    store.addRowsScope([T, U, V], FAR);
    await clock.advance(0);
    expect(relay.tickerCalls().map((c) => c.ids)).toEqual([[T, U, V]]);
    expect(feed.tickerCalls().map((c) => c.ids)).toEqual([[V]]); // not T: it was answered
    expect(store.renderQuote(T, rows)).toBeNull();
    expect(store.renderQuote(U, rows)?.source).toBe('kalshi-relay');
    expect(store.renderQuote(V, rows)?.source).toBe('quote-feed');
    expect(store.refreshHistory().at(-1)).toMatchObject({ outcome: 'ok', unusableTickers: 0 });
    expect(store.diagnostics().consecutiveFailures).toBe(0);
  });

  it('closed among open ones in one batch: the result names it distinctly (nonTradable, marketStatus), failed and unusable stay empty', async () => {
    const { relay, store } = setup([T, U, V]);
    relay.extra.set(U, reports('finalised'));
    const res = await store.refreshNow([T, U, V], { context: { surface: 'list', ...FAR } });
    expect(res).toMatchObject({ refreshed: [T, U, V], missing: [], failed: [], error: null, unusable: [], nonTradable: [U] });
    expect(res.marketStatus).toEqual({ [T]: 'open', [U]: 'settled', [V]: 'open' });
  });

  it('closed next to a genuinely missing ticker: partial, the missing one is asked of the feed, the closed one is not', async () => {
    const { clock, relay, feed, store } = setup([T, U]);
    relay.extra.set(T, reports('closed'));
    relay.omit = new Set([U]);
    feed.omit = new Set([U]);
    store.addRowsScope([T, U], FAR);
    await clock.advance(0);
    expect(feed.tickerCalls().map((c) => c.ids)).toEqual([[U]]);
    expect(store.refreshHistory().at(-1)).toMatchObject({ outcome: 'partial', unusableTickers: 1 });
    expect(store.ticker(U)?.missing).toBe(true);
    expect(store.ticker(T)?.missing).toBe(false);
  });

  it('refreshContract on a closed market says "market_closed", distinct from a missing quote ("unavailable")', async () => {
    const { relay, feed, store } = setup([T, U]);
    relay.extra.set(T, reports('closed'));
    const closed = await store.refreshContract(T, FAR);
    expect(closed).toMatchObject({ state: 'market_closed', marketStatus: 'closed', quote: null });
    expect(closed.usability).toMatchObject({ usable: false, reason: 'not_tradable' });
    expect(closed.result).toMatchObject({ failed: [], missing: [], error: null, timedOut: false, nonTradable: [T], marketStatus: { [T]: 'closed' } });

    relay.omit = new Set([U]);
    feed.omit = new Set([U]);
    const none = await store.refreshContract(U, FAR);
    expect(none).toMatchObject({ state: 'unavailable', marketStatus: null, quote: null });
    expect(none.usability.reason).toBe('no_quote');
    expect(none.result.nonTradable).toEqual([]);
  });

  it('refreshContract states: an open market is "price"; both sources failing is "unavailable", not "market_closed"', async () => {
    const ok = setup([T]);
    expect(await ok.store.refreshContract(T, FAR)).toMatchObject({ state: 'price', marketStatus: 'open' });
    current?.dispose();
    const down = setup([T]);
    down.relay.failWith = new ProviderError('http', 'HTTP 503', 503);
    down.feed.failWith = new ProviderError('http', 'HTTP 503', 503);
    const r = await down.store.refreshContract(T, FAR);
    expect(r).toMatchObject({ state: 'unavailable', marketStatus: null });
    expect(r.result.error).toMatch(/http/);
  });

  it('the very same closed market reported by the feed only (relay omits it) is closed as well, the relay is not hammered', async () => {
    const { relay, feed, store } = setup([T]);
    relay.omit = new Set([T]);
    feed.staleBy = 30 * SEC;
    feed.extra.set(T, reports('closed'));
    const r = await store.refreshContract(T, FAR);
    expect(r.state).toBe('market_closed');
    expect(relay.tickerCalls()).toHaveLength(1);
    expect(feed.tickerCalls()).toHaveLength(1);
  });

  it('newer observation wins: a closed report newer than a held open one closes it; an older open report never reopens it', async () => {
    const { clock, relay, feed, store } = setup([T]);
    await store.refreshContract(T, FAR); // open, from the relay
    expect(store.renderQuote(T, contract)).not.toBeNull();
    await clock.advance(10 * SEC);
    relay.extra.set(T, reports('closed'));
    await store.refreshContract(T, FAR);
    expect(store.marketStatus(T)).toBe('closed');
    expect(store.renderQuote(T, contract)).toBeNull();
    // the feed (older observation, still saying open) arrives afterwards: it cannot reopen the market
    relay.omit = new Set([T]);
    feed.staleBy = 3 * 60_000;
    await store.refreshNow([T], { context: { surface: 'list', ...FAR } });
    expect(store.marketStatus(T)).toBe('closed');
    expect(store.renderQuote(T, rows)).toBeNull();
  });

  it('a settled market whose result is reported next to a stale "active" status is settled', async () => {
    const { relay, store } = setup([T]);
    relay.extra.set(T, { ...reports('active'), result: 'no' });
    const r = await store.refreshContract(T, FAR);
    expect(r).toMatchObject({ state: 'market_closed', marketStatus: 'settled' });
  });

  it('a market with no status that the provider observed past its close time is withheld as expired', async () => {
    const { clock, relay, store } = setup([T]);
    relay.extra.set(T, { ...reports(null), closeTime: new Date(clock.now() - 60_000).toISOString() });
    const r = await store.refreshContract(T, FAR);
    expect(r).toMatchObject({ state: 'market_closed', marketStatus: 'expired' });
  });

  it('a closed market in the scope never causes retries or a backoff storm: the request count follows the cadence only', async () => {
    const { clock, relay, feed, store } = setup([T, U]);
    relay.extra.set(T, reports('settled'));
    store.addRowsScope([T, U], FAR);
    await clock.advance(0);
    const first = relay.tickerCalls().length;
    expect(first).toBe(1);
    await clock.advance(10 * 60_000);
    // game cadence is 45 s (rows): 10 minutes is at most 14 further batches, one request each, never a faster retry
    const calls = relay.tickerCalls();
    expect(calls.length).toBeLessThanOrEqual(15);
    for (let i = 1; i < calls.length; i++) expect(calls[i].at - calls[i - 1].at).toBeGreaterThanOrEqual(10_000);
    expect(feed.calls).toHaveLength(0); // T is closed everywhere it matters, U is fresh at the relay
    const d = store.diagnostics();
    expect([d.consecutiveFailures, d.backoffUntil, d.lastError, d.tickersFailed]).toEqual([0, null, null, 0]);
    expect(store.refreshHistory().every((h) => h.outcome === 'ok')).toBe(true);
    expect(store.renderQuote(U, rows)).not.toBeNull();
    expect(store.renderQuote(T, rows)).toBeNull();
  });

  it('a market that is closed for every requested ticker (a game that is over) is no failure either', async () => {
    const { clock, relay, store } = setup([T, U, V]);
    for (const t of [T, U, V]) relay.extra.set(t, reports('finalized'));
    store.addRowsScope([T, U, V], FAR);
    await clock.advance(5 * 60_000);
    expect(store.refreshHistory().every((h) => h.outcome === 'closed')).toBe(true);
    const d = store.diagnostics();
    expect([d.consecutiveFailures, d.backoffUntil, d.lastError, d.tickersFailed]).toEqual([0, null, null, 0]);
    for (const t of [T, U, V]) expect(store.renderQuote(t, rows)).toBeNull();
  });

  it('the availability meter does not count a withheld closed market against delivery availability', async () => {
    const { relay, store } = setup([T, U]);
    relay.extra.set(T, reports('closed'));
    await store.refreshNow([T, U], { context: { surface: 'list', ...FAR } });
    store.renderQuote(T, rows);
    store.renderQuote(U, rows);
    store.renderQuote(U, rows);
    const a = store.availability();
    expect(a.overall).toMatchObject({ renders: 2, usable: 2, nonTradable: 1, availabilityPct: 100 });
  });

  it('the exact-contract wording: closed markets say so, everything else keeps the approved missing-price sentence', () => {
    expect(MARKET_CLOSED).toEqual({ list: '—', contract: 'Market closed' });
    expect(MISSING_PRICE.contract).toBe('Price unavailable right now');
  });
});

describe('production chain: nothing changes', () => {
  it('a closed market on a legacy scope or a context-less refresh is handled by the production chain exactly as before (no delivery fields)', async () => {
    const { prod, relay, feed, store } = setup([T, U]);
    prod.relay.extra.set(T, reports('closed'));
    const res = await store.refreshNow([T, U]); // no context: the production chain
    expect(res).toMatchObject({ refreshed: [T, U], failed: [], missing: [] });
    expect('nonTradable' in res).toBe(false);
    expect('marketStatus' in res).toBe(false);
    expect('unusable' in res).toBe(false);
    expect(relay.calls).toHaveLength(0);
    expect(feed.calls).toHaveLength(0);
    expect(prod.relay.tickerCalls()).toHaveLength(1);
    expect(store.quote(T)?.availability).toBe('CLOSED'); // the packet path reads availability itself, as on main
  });
});
