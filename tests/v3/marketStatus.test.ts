// Non-tradable markets never show an actionable ask. One vocabulary (model/marketStatus.ts), carried on the Price, enforced at the one
// display seam (data/quoteGate.ts). Real documents: tests/v3/fixtures/props/nfl-detail.json (a trimmed real event_detail, captured
// 2026-10-26) and tests/v3/fixtures/live-feed-markets-by-status.json (markets copied unchanged from the captured live-quote feed:
// real `active`, `inactive` and `determined` markets). No real closed/settled market exists in the captured event_detail documents
// that still carries an ask, so those cases CONTROLLED-MODIFY one real market's `market_status` (said in each test name).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { EventDetailDoc, Market } from '../../src/contract/types';
import { normalizeKalshiMarket } from '../../src/live/normalize';
import { isTerminalStatus, isTradableStatus, marketStatusOf as sharedStatusOf } from '../../src/live/tradable';
import type { LiveQuote } from '../../src/live/types';
import { deriveLines, deriveProps, priceOf } from '../../src/v3/data/adapt';
import { overlayLive } from '../../src/v3/data/liveMarket';
import { gate, isExecutableAsk, observationCurrent, usablePrice, type QuoteContext } from '../../src/v3/data/quoteGate';
import { parseGameProps, type GameCtx } from '../../src/v3/data/props/parse';
import { rawPrice } from '../../src/v3/data/props/hooks';
import type { Prop, PropRung } from '../../src/v3/data/props/types';
import { contractFacts, newerPrice, priceOfQuote } from '../../src/v3/model/contract';
import { isTerminalState, isTradableWord, liveMarketState, liveStatusWord, marketStateOf, REFINED_WORDS, nonTradableNote, nonTradableTitle, sheetNamesStatus, statusFacts, type MarketState } from '../../src/v3/model/marketStatus';
import type { Price, V3Team } from '../../src/v3/model/types';

const NOW = Date.parse('2026-10-26T20:00:00Z');
const list: QuoteContext = { kind: 'list', startMs: NOW + 5 * 3600_000, live: false };
const sheet: QuoteContext = { kind: 'contract', startMs: NOW + 5 * 3600_000, live: false };
const iso = (ageS: number) => new Date(NOW - ageS * 1000).toISOString();

const detail = JSON.parse(readFileSync('tests/v3/fixtures/props/nfl-detail.json', 'utf8')) as EventDetailDoc;
const gameDetail = JSON.parse(readFileSync('tests/v3/fixtures/nfl-event-dal-phi-detail.json', 'utf8')) as EventDetailDoc;
const feed = JSON.parse(readFileSync('tests/v3/fixtures/live-feed-markets-by-status.json', 'utf8')) as { markets: Record<string, unknown>[] };
const T = (id: string): V3Team => ({ id, slug: 'nfl', sport: 'NFL', name: id, nick: id, abbr: id, logo: null, colors: ['#000', '#fff'] });

const STATES: [string, MarketState][] = [
  // Kalshi's own words (live-quote feed `status`, market objects and the status filter)
  ['active', 'open'], ['open', 'open'],
  ['initialized', 'unopened'], ['unopened', 'unopened'],
  ['inactive', 'suspended'], ['paused', 'suspended'], ['suspended', 'suspended'],
  ['closed', 'closed'], ['determined', 'closed'], ['disputed', 'closed'], ['amended', 'closed'],
  ['settled', 'settled'], ['finalized', 'settled'],
  // the app's normalised words (event_detail `market_status`, live `availability`)
  ['OPEN', 'open'], ['UNOPENED', 'unopened'], ['SUSPENDED', 'suspended'], ['CLOSED', 'closed'], ['SETTLED', 'settled'],
  // the app's own UNKNOWN is a non-empty word that is not open: withheld like any word SIFT does not recognise (a live quote that sent NO status is `liveStatusWord` null, below)
  ['UNKNOWN', 'unrecognised'],
  // further spellings a publication might use (the delivery chain's table, quote-track src/live/tradable.ts, is checked word for word below)
  ['expired', 'expired'], ['expiry', 'expired'], ['ended', 'closed'], ['halted', 'suspended'], ['frozen', 'suspended'], ['trading_halted', 'suspended'], ['Trading Halted', 'suspended'], ['on-hold', 'suspended'],
  ['finalised', 'settled'], ['resolved', 'settled'], ['voided', 'settled'], ['void', 'settled'], ['cancelled', 'settled'], ['canceled', 'settled'],
  ['delisted', 'delisted'], ['removed', 'delisted'], ['withdrawn', 'delisted'], ['archived', 'delisted'],
  ['  Active ', 'open'], ['Not Yet Open', 'unopened'],
  // anything else that is a word: withheld
  ['something_new', 'unrecognised'], ['N/A', 'unrecognised'], ['pending', 'unrecognised'], ['live', 'unrecognised'], ['ACTIVE_SOON', 'unrecognised'], ['0', 'unrecognised'],
];

describe('the status vocabulary', () => {
  it.each(STATES)('%j is %s', (word, state) => {
    expect(marketStateOf(word)).toBe(state);
    expect(statusFacts(word)).toEqual({ tradable: state === 'open', marketStatus: state });
  });
  it('actionable only when the word is positively open, or when NO status was sent; every other non-empty word is withheld', () => {
    for (const w of [null, undefined, '', '   ', '\t\n']) {
      expect(marketStateOf(w)).toBe('unreported');
      expect(isTradableWord(w)).toBe(true);
      expect(statusFacts(w)).toEqual({ tradable: true, marketStatus: 'unreported' });
    }
    for (const w of ['open', 'OPEN', 'active', 'Active']) expect(isTradableWord(w)).toBe(true);
    for (const w of ['closed', 'determined', 'settled', 'finalized', 'inactive', 'paused', 'suspended', 'initialized', 'delisted', 'expired', 'UNKNOWN', 'something_new', 'N/A', 'voided', 'cancelled', 'trading']) expect(isTradableWord(w)).toBe(false);
  });
  it('a non-empty `result` means the market is determined, whatever its status word says (terminal)', () => {
    expect(marketStateOf('active', 'yes')).toBe('settled');
    expect(marketStateOf(null, 'no')).toBe('settled');
    expect(statusFacts('open', 'yes')).toEqual({ tradable: false, marketStatus: 'settled' });
    expect(marketStateOf('active', '')).toBe('open');
    expect(marketStateOf('active', '  ')).toBe('open');
    expect(marketStateOf('active', null)).toBe('open');
  });
  // The delivery chain's table is the REAL module (src/live/tradable.ts, PR #148), not a copy: v3 asks it. Every word of either vocabulary goes through both.
  const probe = (word: string | null, over: Partial<LiveQuote> = {}): LiveQuote => ({ ticker: 'T', eventTicker: null, seriesTicker: null, yesBid: 0.4, yesAsk: 0.5, noBid: null, noAsk: null, lastPrice: null, volume: null, openInterest: null, availability: 'UNKNOWN', rawStatus: word, closeTime: null, observedAt: iso(1), source: 'x', title: null, yesSubTitle: null, strike: null, ...over });
  const SHARED_WORDS = ['active', 'open', 'closed', 'determined', 'disputed', 'amended', 'settled', 'finalized', 'finalised', 'resolved', 'voided', 'void', 'cancelled', 'canceled', 'expired', 'expiry', 'inactive', 'paused', 'suspended', 'halted', 'frozen', 'initialized', 'initialised', 'unopened'];
  const V3_ONLY = Object.values(REFINED_WORDS).flat();
  const EXTRA = ['whatever', 'trading', 'UNKNOWN', 'live', 'pending', 'N/A', '0', 'quarantined', 'something_new'];
  const SPELLINGS = (w: string) => [w, w.toUpperCase(), ` ${w} `, w.replace(/_/g, ' '), w.replace(/_/g, '-'), w[0].toUpperCase() + w.slice(1)];
  it.each([
    ['closed', 'closed'], ['determined', 'closed'], ['disputed', 'closed'], ['amended', 'closed'],
    ['settled', 'settled'], ['finalized', 'settled'], ['finalised', 'settled'], ['resolved', 'settled'], ['voided', 'settled'], ['cancelled', 'settled'],
    ['expired', 'expired'], ['inactive', 'suspended'], ['paused', 'suspended'], ['suspended', 'suspended'], ['halted', 'suspended'], ['frozen', 'suspended'],
    ['initialized', 'unopened'], ['unopened', 'unopened'], ['active', 'open'], ['open', 'open'], ['whatever', 'unrecognised'],
  ])('agrees with the delivery chain (the real src/live/tradable.ts): %s -> %s', (word, state) => {
    expect(marketStateOf(word)).toBe(state);
    expect(sharedStatusOf(probe(word))).toBe(state);
  });
  it('every word of the shared table, in every spelling, is the same state in v3 as in the shared module', () => {
    for (const base of SHARED_WORDS) for (const w of SPELLINGS(base)) {
      const shared = sharedStatusOf(probe(w)), v3 = marketStateOf(w);
      expect(v3, w).toBe(shared);
    }
  });
  it('the words only v3 knows (its refinement) are all withheld, and the shared module withholds them too (as unrecognised)', () => {
    for (const base of V3_ONLY) for (const w of SPELLINGS(base)) {
      expect(isTradableWord(w), w).toBe(false);
      expect(isTradableStatus(sharedStatusOf(probe(w))), w).toBe(false);
    }
    // and each is the state v3 documents
    expect(Object.fromEntries(Object.entries(REFINED_WORDS).map(([s, ws]) => [s, ws.map((w) => marketStateOf(w))]))).toEqual({ unopened: ['unopened', 'unopened'], suspended: ['suspended', 'suspended'], closed: ['closed'], delisted: ['delisted', 'delisted', 'delisted', 'delisted'] });
  });
  it('for every word in either table (and some in neither): tradable in v3 iff tradable in the shared module; where the shared module is specific, v3 names the same state', () => {
    for (const w of [...SHARED_WORDS, ...V3_ONLY, ...EXTRA, '', null]) {
      const shared = sharedStatusOf(probe(w)), v3 = marketStateOf(w);
      expect(isTradableWord(w), String(w)).toBe(isTradableStatus(shared));
      if (shared !== 'unrecognised') expect(v3, String(w)).toBe(shared);
      else expect(['unrecognised', 'closed', 'suspended', 'unopened', 'delisted']).toContain(v3);
      // terminal in the shared module => terminal in v3 (a refinement may only make an unrecognised word terminal, never relax one)
      if (isTerminalStatus(shared)) expect(isTerminalState(v3), String(w)).toBe(true);
    }
  });
  it('"trading" is not a Kalshi status word: the shared module withholds it, so v3 does (it used to accept it as open)', () => {
    expect(sharedStatusOf(probe('trading'))).toBe('unrecognised');
    expect(marketStateOf('trading')).toBe('unrecognised');
    expect(isTradableWord('trading')).toBe(false);
  });
  it('a non-empty `result` is settled in both, whatever the word; an empty one is nothing', () => {
    for (const w of ['active', 'open', null, 'closed']) {
      expect(sharedStatusOf(probe(w, { result: 'yes' }))).toBe('settled');
      expect(marketStateOf(w, 'yes')).toBe('settled');
      expect(sharedStatusOf(probe(w, { result: '' }))).toBe(sharedStatusOf(probe(w)));
    }
  });
  it('a live quote is judged by the shared rule on the WHOLE quote: result, close time with no status, and the more restrictive of word and availability', () => {
    const SEEN = '2026-10-26T20:00:00Z';
    const q = (o: Partial<LiveQuote>) => probe(null, { observedAt: SEEN, ...o });
    // `result` on a quote that says active
    expect(liveMarketState(q({ rawStatus: 'active', availability: 'OPEN', result: 'no' }))).toBe('settled');
    // no status at all and a close time at or before the provider's observation: expired; an explicit `active` is never overridden by a close time
    expect(liveMarketState(q({ closeTime: '2026-10-26T19:59:00Z' }))).toBe('expired');
    expect(liveMarketState(q({ closeTime: SEEN }))).toBe('expired');
    expect(liveMarketState(q({ closeTime: '2026-10-26T20:00:01Z' }))).toBe('unreported');
    expect(liveMarketState(q({ rawStatus: 'active', availability: 'OPEN', closeTime: '2026-10-26T19:00:00Z' }))).toBe('open');
    // word and availability disagree: the restrictive one wins
    expect(liveMarketState(q({ rawStatus: 'active', availability: 'CLOSED' }))).toBe('closed');
    // the same verdict as the shared module for every combination (v3 only refines an unrecognised word)
    for (const rawStatus of [null, 'active', 'closed', 'ended', 'On Hold', 'quarantined']) for (const availability of ['OPEN', 'UNKNOWN', 'CLOSED', 'SUSPENDED'] as const) {
      const quote = q({ rawStatus, availability });
      const shared = sharedStatusOf(quote), v3 = liveMarketState(quote);
      expect(v3 === 'open' || v3 === 'unreported', `${rawStatus}/${availability}`).toBe(isTradableStatus(shared));
      if (shared !== 'unrecognised') expect(v3).toBe(shared);
    }
    expect(liveMarketState(q({ rawStatus: 'ended', availability: 'UNKNOWN' }))).toBe('closed');
    // a Price made from such a quote carries the state, and no ask
    expect(priceOfQuote(q({ rawStatus: 'active', availability: 'OPEN', result: 'yes' }))).toMatchObject({ tradable: false, marketStatus: 'settled', ask: null });
    expect(priceOfQuote(q({ closeTime: '2026-10-26T19:00:00Z' }))).toMatchObject({ tradable: false, marketStatus: 'expired', ask: null });
  });
  it('terminal states are closed, settled, expired and delisted; suspended, not yet open and unrecognised can reverse', () => {
    for (const s of ['closed', 'settled', 'expired', 'delisted'] as MarketState[]) expect(isTerminalState(s)).toBe(true);
    for (const s of ['open', 'unreported', 'suspended', 'unopened', 'unrecognised'] as MarketState[]) expect(isTerminalState(s)).toBe(false);
  });
  it('liveStatusWord: the provider\'s raw word, else the availability, except UNKNOWN (the provider sent no status)', () => {
    expect(liveStatusWord({ rawStatus: 'halted', availability: 'UNKNOWN' })).toBe('halted');
    expect(liveStatusWord({ rawStatus: ' Active ', availability: 'OPEN' })).toBe('Active');
    expect(liveStatusWord({ rawStatus: null, availability: 'CLOSED' })).toBe('CLOSED');
    expect(liveStatusWord({ rawStatus: null, availability: 'UNKNOWN' })).toBeNull();
    expect(liveStatusWord({ rawStatus: '', availability: 'unknown' })).toBeNull();
    expect(liveStatusWord(undefined)).toBeNull();
    // a quote with no status at all is actionable (the gate still needs a current ask); one with a word SIFT does not know is not
    const base = { ticker: 'T', yes_ask_dollars: '0.5000', yes_bid_dollars: '0.4900' };
    const none = normalizeKalshiMarket(base, '2026-10-26T20:00:00Z', 'x')!;
    expect(none.rawStatus).toBeNull();
    expect(priceOfQuote(none)).toMatchObject({ tradable: true, marketStatus: 'unreported', ask: 50 });
    const odd = normalizeKalshiMarket({ ...base, status: 'quarantined' }, '2026-10-26T20:00:00Z', 'x')!;
    expect(priceOfQuote(odd)).toMatchObject({ tradable: false, marketStatus: 'unrecognised', ask: null, bid: null, implied: null });
  });
  it('agrees with the live layer on every word it knows (src/live/normalize.ts availabilityOf)', () => {
    const fold = (s: MarketState) => (s === 'unrecognised' || s === 'unreported' || s === 'delisted' || s === 'expired' ? 'UNKNOWN' : s.toUpperCase());
    for (const w of ['active', 'open', 'initialized', 'unopened', 'inactive', 'paused', 'closed', 'determined', 'disputed', 'amended', 'settled', 'finalized']) {
      const q = normalizeKalshiMarket({ ticker: 'T', status: w }, '2026-10-26T20:00:00Z', 'x')!;
      expect(fold(marketStateOf(w))).toBe(q.availability);
    }
  });
  it('words the sheet shows', () => {
    expect(nonTradableTitle('closed')).toBe('Market closed');
    expect(nonTradableTitle('settled')).toBe('Market settled');
    expect(nonTradableTitle('suspended')).toBe('Trading suspended');
    expect(nonTradableTitle('expired')).toBe('Market closed');
    expect(nonTradableTitle('open')).toBeNull();
    expect(nonTradableTitle('unreported')).toBeNull();
    // an unrecognised word has no headline of its own: the sheet says "Price unavailable right now" with Retry
    expect(nonTradableTitle('unrecognised')).toBeNull();
    for (const s of ['closed', 'settled', 'suspended', 'unopened', 'delisted', 'expired'] as MarketState[]) expect(nonTradableNote(s)).toMatch(/no price to buy at/);
  });
  it('the sheet names a status (no Retry) for terminal states at any age and for suspended / not yet open while the observation is current; never for an unrecognised word', () => {
    for (const s of ['closed', 'settled', 'expired', 'delisted'] as MarketState[]) { expect(sheetNamesStatus(s, true)).toBe(true); expect(sheetNamesStatus(s, false)).toBe(true); }
    for (const s of ['suspended', 'unopened'] as MarketState[]) { expect(sheetNamesStatus(s, true)).toBe(true); expect(sheetNamesStatus(s, false)).toBe(false); }
    for (const s of ['unrecognised', 'open', 'unreported'] as MarketState[]) { expect(sheetNamesStatus(s, true)).toBe(false); expect(sheetNamesStatus(s, false)).toBe(false); }
  });
});

const price = (o: Partial<Price> = {}): Price => ({ ask: 54, bid: 52, implied: 53, ticker: 'KX-1', side: 'YES', description: 'x', observedAt: iso(1), source: 'Kalshi', tradable: true, marketStatus: 'open', ...o });

describe('the quote gate withholds a non-tradable market however fresh its quote', () => {
  it('a current ask on a tradable market passes in both contexts', () => {
    expect(gate(price(), list, NOW).price).not.toBeNull();
    expect(gate(price(), sheet, NOW).price).not.toBeNull();
    expect(usablePrice(price({ marketStatus: 'unreported' }), list, NOW)).not.toBeNull();
  });
  it.each(['closed', 'settled', 'suspended', 'unopened', 'delisted', 'expired', 'unrecognised'] as MarketState[])('%s: withheld with reason not-tradable and its status, fresh or not, ask or not', (s) => {
    for (const ctx of [list, sheet]) {
      for (const p of [price({ tradable: false, marketStatus: s }), price({ tradable: false, marketStatus: s, ask: null, bid: null }), price({ tradable: false, marketStatus: s, observedAt: iso(9999) }), price({ tradable: false, marketStatus: s, source: 'Sample' })]) {
        expect(gate(p, ctx, NOW)).toEqual({ price: null, reason: 'not-tradable', marketStatus: s });
        expect(usablePrice(p, ctx, NOW)).toBeNull();
      }
    }
  });
  it('an executable YES ask is 1 to 99 cents; 0 and 100 are "no ask"', () => {
    expect([0, 1, 50, 99, 100, null, NaN].map((a) => isExecutableAsk(a as number | null))).toEqual([false, true, true, true, false, false, false]);
    expect(gate(price({ ask: 0 }), list, NOW).reason).toBe('no-price');
    expect(gate(price({ ask: 100 }), list, NOW).reason).toBe('no-price');
  });
});

describe('real event_detail markets', () => {
  const live = detail.markets.filter((m) => m.market_status === 'OPEN' && m.yes_ask != null);
  it('the captured real markets are open, and carry their tradable status on the Price', () => {
    expect(live.length).toBeGreaterThan(50);
    expect(priceOf(live[0])).toMatchObject({ tradable: true, marketStatus: 'open' });
    expect(priceOf(live[0]).ask).not.toBeNull();
  });
  it('CONTROLLED MODIFICATION: the same real market with market_status changed to each non-tradable word has no ask, bid or implied price', () => {
    for (const [word, state] of [['CLOSED', 'closed'], ['SETTLED', 'settled'], ['SUSPENDED', 'suspended'], ['determined', 'closed'], ['inactive', 'suspended'], ['expired', 'expired'], ['voided', 'settled'], ['quarantined', 'unrecognised'], ['UNKNOWN', 'unrecognised']] as const) {
      const p = priceOf({ ...live[0], market_status: word });
      expect(p).toMatchObject({ ask: null, bid: null, implied: null, tradable: false, marketStatus: state, ticker: live[0].kalshi_ticker });
      expect(gate(p, list, NOW).reason).toBe('not-tradable');
    }
  });
  it('CONTROLLED MODIFICATION: a market with no status at all stays tradable (and is still subject to the age rule)', () => {
    const m: Market = { ...live[0], market_status: undefined, captured_at: iso(10) };
    expect(priceOf(m)).toMatchObject({ tradable: true, marketStatus: 'unreported' });
    expect(gate(priceOf(m), list, NOW).price).not.toBeNull();
    expect(gate(priceOf({ ...m, captured_at: iso(500) }), list, NOW).reason).toBe('too-old');
  });
  it('CONTROLLED MODIFICATION: lines and props are built only from markets that are not positively non-tradable', () => {
    const away = T('DAL'), home = T('PHI');
    const ids = { away: gameDetail.event.away_participant ?? null, home: gameDetail.event.home_participant ?? null };
    const base = deriveLines(gameDetail.markets, away, home, ids);
    expect(base.length).toBeGreaterThan(0);
    expect(deriveProps(gameDetail.markets).length).toBeGreaterThan(0);
    const closedAll = gameDetail.markets.map((m) => ({ ...m, market_status: 'CLOSED' }));
    expect(deriveLines(closedAll, away, home, ids)).toEqual([]);
    expect(deriveProps(closedAll)).toEqual([]);
    // only the picked moneyline suspended: the chip moves to the other side and never prints the suspended market's ask
    const ml = base.find((l) => l.kind === 'moneyline')!;
    expect(ml).toBeTruthy();
    const out = deriveLines(gameDetail.markets.map((m) => (m.kalshi_ticker === ml.price.ticker ? { ...m, market_status: 'SUSPENDED' } : m)), away, home, ids).find((l) => l.kind === 'moneyline');
    expect(out?.price.ticker).not.toBe(ml.price.ticker);
    expect(out?.alternates?.map((a) => a.ticker)).not.toContain(ml.price.ticker);
  });
  it('overlayLive keeps the provider\'s OWN status word, so words the live layer folds into UNKNOWN still withhold', () => {
    const m = live[0];
    const q = normalizeKalshiMarket({ ticker: m.kalshi_ticker, status: 'halted', yes_ask_dollars: '0.5000', yes_bid_dollars: '0.4900' }, new Date(Date.parse(m.captured_at!) + 60_000).toISOString(), 'x')!;
    expect(q.availability).toBe('UNKNOWN');
    const o = overlayLive(m, q);
    expect(o.market_status).toBe('halted');
    expect(priceOf(o)).toMatchObject({ tradable: false, marketStatus: 'suspended', ask: null });
    // an OLDER quote does not overlay: the publication's status stands
    const older = overlayLive(m, { ...q, observedAt: new Date(Date.parse(m.captured_at!) - 60_000).toISOString() });
    expect(older.market_status).toBe('OPEN');
  });
});

describe('real live-quote feed markets (kalshi-public via the live-quotes branch)', () => {
  const byStatus = (s: string) => feed.markets.filter((m) => m.status === s);
  const q = (m: Record<string, unknown>) => normalizeKalshiMarket(m, String(m.observed_at), 'quote-feed')!;
  it('the fixture holds real markets of each status', () => {
    expect(byStatus('active').length).toBeGreaterThan(0);
    expect(byStatus('inactive').length).toBeGreaterThan(0);
    expect(byStatus('determined').length).toBeGreaterThan(0);
  });
  it('active: a Price with an ask', () => {
    const p = priceOfQuote(q(byStatus('active')[0]))!;
    expect(p).toMatchObject({ tradable: true, marketStatus: 'open' });
    expect(p.ask).not.toBeNull();
  });
  it('inactive (published WITH a yes ask): a non-tradable Price with no ask, bid or implied price; the gate withholds it even at the instant of observation', () => {
    for (const m of byStatus('inactive')) {
      expect(m.yes_ask_dollars).toBeDefined(); // the real feed does carry an ask for this market, and the old code would have shown it
      const quote = q(m);
      expect(quote.yesAsk).not.toBeNull();
      const p = priceOfQuote(quote)!;
      expect(p).toMatchObject({ ask: null, bid: null, implied: null, tradable: false, marketStatus: 'suspended' });
      expect(gate(p, sheet, Date.parse(String(m.observed_at))).reason).toBe('not-tradable');
    }
  });
  it('determined (no ask on the book): still a Price, so the sheet can say "Market closed" rather than offering Retry', () => {
    for (const m of byStatus('determined')) {
      const p = priceOfQuote(q(m));
      expect(p).toMatchObject({ ask: null, tradable: false, marketStatus: 'closed' });
      expect(gate(p, sheet, Date.parse(String(m.observed_at))).marketStatus).toBe('closed');
    }
  });
  it('an OPEN quote with no ask is still no Price (the sheet shows "Price unavailable right now" and Retry)', () => {
    expect(priceOfQuote({ ...q(byStatus('active')[0]), yesAsk: null })).toBeNull();
  });
  it('a non-tradable observation that is newer replaces a tradable one in the sheet, and a tradable newer one replaces a non-tradable', () => {
    const open = price({ observedAt: iso(30) });
    const closed = priceOfQuote(q({ ...byStatus('determined')[0], observed_at: iso(5) }))!;
    expect(newerPrice(open, closed)).toBe(closed);
    expect(gate(newerPrice(open, closed), sheet, NOW).reason).toBe('not-tradable');
    expect(newerPrice(closed, price({ observedAt: iso(1) }))?.tradable).toBe(true);
  });
  it('facts (ask, bid, implied, fee, break-even) are never derived from a non-tradable price', () => {
    expect(contractFacts(priceOfQuote(q(byStatus('inactive')[0])))).toBeNull();
    expect(contractFacts(priceOfQuote(q(byStatus('determined')[0])))).toBeNull();
  });
});

describe('Prop Discovery rungs', () => {
  const game: GameCtx = { slug: 'nfl', sportLabel: 'NFL', eventId: 'evt', key: 'nfl:evt', startMs: Date.parse('2026-10-27T00:15:00Z'), away: T('DAL'), home: T('PHI'), awayId: detail.event.away_participant, homeId: detail.event.home_participant };
  const rung = (o: Partial<PropRung> = {}): PropRung => ({ k: 7, ticker: 'KXNFLREC-26OCT26DALPHI-DALCLAMB88-7', ask: 56, bid: 54, volume: 10, capturedAt: iso(300), source: 'Kalshi', status: 'OPEN', ...o });
  const prop = { name: 'CeeDee Lamb', label: 'Receptions' } as Prop;
  const liveQuote = (word: string, ageS = 5, ask = '0.5800') => normalizeKalshiMarket({ ticker: rung().ticker, status: word, yes_ask_dollars: ask, yes_bid_dollars: '0.5600' }, iso(ageS), 'relay')!;

  it('the publication\'s status travels onto the rung and the parse keeps only markets that are not positively non-tradable', () => {
    const rows = parseGameProps(game, detail.markets);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].rungs[0].status).toBe('OPEN');
    expect(parseGameProps(game, detail.markets.map((m) => ({ ...m, market_status: 'SETTLED' })))).toEqual([]);
    expect(parseGameProps(game, detail.markets.map((m) => ({ ...m, market_status: 'inactive' })))).toEqual([]);
  });
  it('a missing status is tradable in the parse (CONTROLLED MODIFICATION of the real markets), and an ask of 0 is never a rung', () => {
    expect(parseGameProps(game, detail.markets.map((m) => ({ ...m, market_status: undefined }))).length).toBe(parseGameProps(game, detail.markets).length);
    expect(parseGameProps(game, detail.markets.map((m) => ({ ...m, market_status: undefined, yes_ask: 0 })))).toEqual([]);
    // a word SIFT does not recognise withholds the market from the parse, just as closed does
    expect(parseGameProps(game, detail.markets.map((m) => ({ ...m, market_status: 'UNKNOWN' })))).toEqual([]);
    expect(parseGameProps(game, detail.markets.map((m) => ({ ...m, market_status: 'quarantined' })))).toEqual([]);
  });
  it('no live quote: the publication status decides (open passes the gate only while current)', () => {
    expect(rawPrice(prop, rung(), undefined)).toMatchObject({ ask: 56, tradable: true, marketStatus: 'open' });
    expect(rawPrice(prop, rung({ status: 'closed' }), undefined)).toMatchObject({ ask: null, bid: null, tradable: false, marketStatus: 'closed' });
  });
  it.each(['closed', 'determined', 'inactive', 'paused', 'settled', 'finalized', 'initialized'])('a newer live quote saying %s makes the rung non-tradable even though the publication said open', (word) => {
    const p = rawPrice(prop, rung(), liveQuote(word));
    expect(p).toMatchObject({ ask: null, bid: null, implied: null, tradable: false });
    expect(gate(p, list, NOW).reason).toBe('not-tradable');
  });
  it('a newer live quote saying active makes a rung the publication called closed tradable again; the live price shows once current', () => {
    const p = rawPrice(prop, rung({ status: 'closed' }), liveQuote('active'));
    expect(p).toMatchObject({ ask: 58, tradable: true });
    expect(gate(p, list, NOW).price?.ask).toBe(58);
  });
  it('an OLDER live quote does not override the publication\'s status', () => {
    const p = rawPrice(prop, rung({ capturedAt: iso(5) }), liveQuote('closed', 600));
    expect(p).toMatchObject({ tradable: true, ask: 56 });
  });
});

describe('terminal states stay terminal; an observation that sent no status changes nothing about the status', () => {
  const live = detail.markets.filter((m) => m.market_status === 'OPEN' && m.yes_ask != null);
  it('a newer observation with NO status does not reopen a market the older one reported closed, settled, expired or delisted; an explicit open word does', () => {
    for (const s of ['closed', 'settled', 'expired', 'delisted'] as MarketState[]) {
      const old = price({ tradable: false, marketStatus: s, ask: null, bid: null, implied: null, observedAt: iso(60) });
      const silent = price({ marketStatus: 'unreported', observedAt: iso(2) });
      expect(newerPrice(old, silent)).toBe(old);
      expect(gate(newerPrice(old, silent), sheet, NOW).reason).toBe('not-tradable');
      const said = price({ marketStatus: 'open', observedAt: iso(2) });
      expect(newerPrice(old, said)).toBe(said);
    }
    // a suspended report (can reverse) IS replaced by a newer silent observation
    const susp = price({ tradable: false, marketStatus: 'suspended', ask: null, bid: null, observedAt: iso(60) });
    const silent = price({ marketStatus: 'unreported', observedAt: iso(2) });
    expect(newerPrice(susp, silent)).toBe(silent);
  });
  it('overlayLive: a newer live quote that sent no status leaves the publication\'s status word standing; one that sent a word replaces it', () => {
    const m = { ...live[0], market_status: 'SETTLED' };
    const silent = normalizeKalshiMarket({ ticker: m.kalshi_ticker, yes_ask_dollars: '0.5000', yes_bid_dollars: '0.4900' }, new Date(Date.parse(m.captured_at!) + 60_000).toISOString(), 'x')!;
    expect(silent.rawStatus).toBeNull();
    expect(overlayLive(m, silent).market_status).toBe('SETTLED');
    expect(priceOf(overlayLive(m, silent))).toMatchObject({ tradable: false, marketStatus: 'settled', ask: null });
    // and with an open publication, no status from the quote keeps it open (and the live ask shows)
    const o = overlayLive(live[0], silent);
    expect(o.market_status).toBe('OPEN');
    expect(priceOf(o)).toMatchObject({ tradable: true, ask: 50 });
    const said = normalizeKalshiMarket({ ticker: m.kalshi_ticker, status: 'active', yes_ask_dollars: '0.5000' }, new Date(Date.parse(m.captured_at!) + 60_000).toISOString(), 'x')!;
    expect(overlayLive(m, said).market_status).toBe('active');
  });
  it('rawPrice: a live quote that sent no status keeps the rung\'s published status; a live word replaces it', () => {
    const rung: PropRung = { k: 7, ticker: 'KXNFLREC-26OCT26DALPHI-DALCLAMB88-7', ask: 56, bid: 54, volume: 10, capturedAt: iso(300), source: 'Kalshi', status: 'SETTLED' };
    const prop = { name: 'CeeDee Lamb', label: 'Receptions' } as Prop;
    const silent = normalizeKalshiMarket({ ticker: rung.ticker, yes_ask_dollars: '0.5800', yes_bid_dollars: '0.5600' }, iso(5), 'relay')!;
    expect(rawPrice(prop, rung, silent)).toMatchObject({ tradable: false, marketStatus: 'settled', ask: null });
    expect(rawPrice(prop, { ...rung, status: null }, silent)).toMatchObject({ tradable: true, marketStatus: 'unreported', ask: 58 });
    const odd = normalizeKalshiMarket({ ticker: rung.ticker, status: 'quarantined', yes_ask_dollars: '0.5800' }, iso(5), 'relay')!;
    expect(rawPrice(prop, { ...rung, status: 'OPEN' }, odd)).toMatchObject({ tradable: false, marketStatus: 'unrecognised', ask: null });
  });
  it('observationCurrent: a real, not-future observation inside the context\'s maximum age', () => {
    expect(observationCurrent(price({ observedAt: iso(5) }), sheet, NOW)).toBe(true);
    expect(observationCurrent(price({ observedAt: iso(600) }), sheet, NOW)).toBe(false);
    expect(observationCurrent(price({ observedAt: null }), sheet, NOW)).toBe(false);
    expect(observationCurrent(price({ observedAt: iso(-60) }), sheet, NOW)).toBe(false);
  });
});
