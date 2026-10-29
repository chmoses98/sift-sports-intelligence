// Equivalence of the two implementations of the approved quote-usability table (docs/sift3/QUOTE_DELIVERY.md, owner-approved 2026-10-26):
//   * src/live/quoteUsable.ts   the shared rule (PR #148): the ONE place that decides whether a quote is usable;
//   * src/v3/data/quoteGate.ts  the v3 seam every price slot goes through (it delegates to the rule above).
// The table below is the CONTRACT. Both are checked against it row by row and against each other, so a future edit that makes one drift fails here.
//
//   List, start more than 2 h away          180 s       Exact contract, start more than 2 h away          60 s
//   List, start within 2 h                   90 s       Exact contract, start within 2 h or live          30 s
//   List, live                               60 s
//   Unknown start time -> the stricter tier. Exactly at the limit is usable, one second over is not. Observation up to 5 s in the future is
//   clock noise (age 0); further ahead, a missing, an unparseable or an untimed ('received') observation is never usable.
import { describe, expect, it } from 'vitest';
import { contextKey, MAX_AGE_MS, quoteUsable, type QuoteContext as LiveContext } from '../../src/live/quoteUsable';
import type { LiveQuote } from '../../src/live/types';
import { gate, maxAgeMs, observationCurrent, type QuoteContext } from '../../src/v3/data/quoteGate';
import type { Price } from '../../src/v3/model/types';

const NOW = Date.parse('2026-10-26T20:00:00Z');
const H = 3600_000;
const iso = (ageMs: number): string => new Date(NOW - ageMs).toISOString();

const price = (observedAt: string | null, extra: Partial<Price> = {}): Price => ({
  ask: 54, bid: 52, implied: 54, ticker: 'KX-EQ', side: 'YES', description: 'x', observedAt, source: 'Kalshi', tradable: true, marketStatus: 'open', ...extra,
});
const quote = (observedAt: string | null, extra: Partial<LiveQuote> = {}): LiveQuote => ({
  ticker: 'KX-EQ', eventTicker: null, seriesTicker: null, yesBid: 0.52, yesAsk: 0.54, noBid: null, noAsk: null, lastPrice: null, volume: null, openInterest: null,
  availability: 'OPEN', rawStatus: 'active', closeTime: null, observedAt: observedAt as string, source: 'relay:test', title: null, yesSubTitle: null, strike: null, ...extra,
});

/** The same situation in each module's vocabulary. */
const both = (surface: 'list' | 'contract', startMs: number | null, live: boolean): { v3: QuoteContext; live: LiveContext } => ({
  v3: { kind: surface, startMs, live },
  live: { surface, startsAt: startMs, live },
});

// ---- the contract: every row of the approved table, with the start times that select it
interface Row { name: string; surface: 'list' | 'contract'; startMs: number | null; live: boolean; limitS: number }
const ROWS: Row[] = [
  { name: 'list, start 5 h away', surface: 'list', startMs: NOW + 5 * H, live: false, limitS: 180 },
  { name: 'list, start 2 h and 1 s away', surface: 'list', startMs: NOW + 2 * H + 1000, live: false, limitS: 180 },
  { name: 'list, start exactly 2 h away', surface: 'list', startMs: NOW + 2 * H, live: false, limitS: 90 },
  { name: 'list, start 1 h away', surface: 'list', startMs: NOW + H, live: false, limitS: 90 },
  { name: 'list, start 1 s away', surface: 'list', startMs: NOW + 1000, live: false, limitS: 90 },
  { name: 'list, live flag, start 1 h away', surface: 'list', startMs: NOW + H, live: true, limitS: 60 },
  { name: 'list, live flag, start in the past', surface: 'list', startMs: NOW - 2 * H, live: true, limitS: 60 },
  { name: 'list, live flag, unknown start', surface: 'list', startMs: null, live: true, limitS: 60 },
  { name: 'list, unknown start (stricter tier)', surface: 'list', startMs: null, live: false, limitS: 90 },
  { name: 'contract, start 5 h away', surface: 'contract', startMs: NOW + 5 * H, live: false, limitS: 60 },
  { name: 'contract, start 2 h and 1 s away', surface: 'contract', startMs: NOW + 2 * H + 1000, live: false, limitS: 60 },
  { name: 'contract, start exactly 2 h away', surface: 'contract', startMs: NOW + 2 * H, live: false, limitS: 30 },
  { name: 'contract, start 1 h away', surface: 'contract', startMs: NOW + H, live: false, limitS: 30 },
  { name: 'contract, live flag', surface: 'contract', startMs: NOW + 5 * H, live: true, limitS: 30 },
  { name: 'contract, start in the past', surface: 'contract', startMs: NOW - H, live: false, limitS: 30 },
  { name: 'contract, unknown start (stricter tier)', surface: 'contract', startMs: null, live: false, limitS: 30 },
];

describe('the approved age table: the shared rule (src/live/quoteUsable) and the v3 seam (src/v3/data/quoteGate) agree, row by row', () => {
  it('the shared rule holds exactly the approved five limits', () => {
    expect(MAX_AGE_MS).toEqual({ list_far: 180_000, list_near: 90_000, list_live: 60_000, contract_far: 60_000, contract_near: 30_000 });
  });

  describe.each(ROWS)('$name', ({ surface, startMs, live, limitS }) => {
    const c = both(surface, startMs, live);
    it(`limit ${limitS} s in both`, () => {
      expect(maxAgeMs(c.v3, NOW)).toBe(limitS * 1000);
      expect(MAX_AGE_MS[contextKey(c.live, NOW)]).toBe(limitS * 1000);
    });
    // age relative to the limit, in seconds: well inside, one second inside, exactly at, one second over, a minute over; and fresh and impossible values
    it.each([0, 1, limitS - 1, limitS, limitS + 1, limitS + 60])('an observation %i s old', (ageS) => {
      const expectUsable = ageS <= limitS;
      const g = gate(price(iso(ageS * 1000)), c.v3, NOW);
      const u = quoteUsable(quote(iso(ageS * 1000)), c.live, NOW);
      expect(u.usable).toBe(expectUsable);
      expect(g.price != null).toBe(expectUsable);
      if (!expectUsable) { expect(u.reason).toBe('too_old'); expect(g.reason).toBe('too-old'); }
      expect(observationCurrent(price(iso(ageS * 1000)), c.v3, NOW)).toBe(expectUsable);
    });
    it('millisecond boundary: exactly the limit is usable, one millisecond over is not', () => {
      expect(gate(price(iso(limitS * 1000)), c.v3, NOW).price).not.toBeNull();
      expect(quoteUsable(quote(iso(limitS * 1000)), c.live, NOW).usable).toBe(true);
      expect(gate(price(iso(limitS * 1000 + 1)), c.v3, NOW).price).toBeNull();
      expect(quoteUsable(quote(iso(limitS * 1000 + 1)), c.live, NOW).usable).toBe(false);
    });
    it.each([[-1000, true], [-3000, true], [-5000, true], [-5001, false], [-6000, false], [-60_000, false]])('an observation stamped %i ms ago (future when negative) is usable: %s', (ageMs, ok) => {
      const g = gate(price(iso(ageMs)), c.v3, NOW);
      const u = quoteUsable(quote(iso(ageMs)), c.live, NOW);
      expect(u.usable).toBe(ok);
      expect(g.price != null).toBe(ok);
      if (!ok) { expect(u.reason).toBe('future_observed_at'); expect(g.reason).toBe('future'); }
    });
    it('a missing, blank, unparseable or untimed observation is never usable, in both', () => {
      for (const bad of [null, '', 'soon', 'not-a-date']) {
        const g = gate(price(bad), c.v3, NOW);
        const u = quoteUsable(quote(bad), c.live, NOW);
        expect(u.usable).toBe(false);
        expect(g.price).toBeNull();
        expect(g.reason).toBe('no-observation-time');
        expect(u.reason).toBe(bad == null || bad === '' ? 'missing_observed_at' : 'unparseable_observed_at');
      }
      // an answer the provider did not time ('received' = when this device got it) is not an observation
      const untimedQuote = quote(iso(1000), { observedVia: 'received' });
      expect(quoteUsable(untimedQuote, c.live, NOW)).toMatchObject({ usable: false, reason: 'untimed_observation' });
      expect(gate(price(iso(1000), { observedVia: 'received' }), c.v3, NOW)).toMatchObject({ price: null, reason: 'no-observation-time' });
      expect(observationCurrent(price(iso(1000), { observedVia: 'received' }), c.v3, NOW)).toBe(false);
    });
    // (a start within 30 s of a tier boundary is left to the dedicated skew-tier test below: a 20 s skew legitimately moves it across the boundary)
    const nearBoundary = startMs != null && (Math.abs(startMs - NOW - 2 * H) <= 30_000 || Math.abs(startMs - NOW) <= 30_000);
    it.skipIf(nearBoundary)('device-clock skew is applied the same way (the relay Date header)', () => {
      // skew = the relay's clock minus the device's. A device clock 20 s AHEAD of the relay's (skew -20 s) makes an observation that looks `limit + 20 s` old on
      // the device only `limit` old on the relay's clock, which is the one that stamped it.
      const obs = iso((limitS + 20) * 1000);
      expect(gate(price(obs), c.v3, NOW, -20_000).price).not.toBeNull();
      expect(quoteUsable(quote(obs), c.live, NOW, { clockSkewMs: -20_000 }).usable).toBe(true);
      expect(gate(price(obs), c.v3, NOW, -19_000).price).toBeNull();
      expect(quoteUsable(quote(obs), c.live, NOW, { clockSkewMs: -19_000 }).usable).toBe(false);
      // and a device clock BEHIND the relay's: a stamp 3 s ahead of the device clock is 4 s old on the relay's, not "the future"
      expect(gate(price(iso(-8000)), c.v3, NOW, 3_000).price).not.toBeNull();
      expect(quoteUsable(quote(iso(-8000)), c.live, NOW, { clockSkewMs: 3_000 }).usable).toBe(true);
    });
  });

  it('start-time tiers move together over time: the phase is decided by the schedule at `now`, never by anything else', () => {
    const start = NOW + 3 * H;
    for (const surface of ['list', 'contract'] as const) {
      for (let dt = 0; dt <= 4 * H; dt += 15 * 60_000) {
        const now = NOW + dt;
        const c = both(surface, start, false);
        expect(maxAgeMs(c.v3, now)).toBe(MAX_AGE_MS[contextKey(c.live, now)]);
      }
      // the transitions: more than 2 h out, exactly 2 h out, the start, after the start
      const c = both(surface, start, false);
      const at = (until: number) => maxAgeMs(c.v3, start - until);
      expect(at(2 * H + 1)).toBe(surface === 'list' ? 180_000 : 60_000);
      expect(at(2 * H)).toBe(surface === 'list' ? 90_000 : 30_000);
      expect(at(0)).toBe(surface === 'list' ? 60_000 : 30_000);
      expect(at(-1)).toBe(surface === 'list' ? 60_000 : 30_000);
    }
  });

  it('an exhaustive grid agrees: every context x every age x every start offset', () => {
    const offsets: (number | null)[] = [null, -3 * H, -1, 0, 1, 30 * 60_000, H, 2 * H - 1, 2 * H, 2 * H + 1, 3 * H, 24 * H];
    const ages = [-60_000, -6000, -5000, -1, 0, 1000, 29_000, 30_000, 30_001, 59_999, 60_000, 60_001, 89_999, 90_000, 90_001, 179_999, 180_000, 180_001, 600_000];
    let n = 0;
    for (const surface of ['list', 'contract'] as const) for (const live of [false, true]) for (const off of offsets) for (const age of ages) {
      const startMs = off == null ? null : NOW + off;
      const c = both(surface, startMs, live);
      const g = gate(price(iso(age)), c.v3, NOW);
      const u = quoteUsable(quote(iso(age)), c.live, NOW);
      expect(g.price != null, `${surface} live=${live} start=${off} age=${age}`).toBe(u.usable);
      expect(maxAgeMs(c.v3, NOW)).toBe(u.limitMs);
      n++;
    }
    expect(n).toBe(2 * 2 * offsets.length * ages.length);
  });
});

describe('the skew-corrected clock decides the tier in both', () => {
  it('a start 2 h and 10 s away on the device clock is "within 2 hours" once the relay clock is 20 s ahead of it', () => {
    const c = both('list', NOW + 2 * H + 10_000, false);
    expect(maxAgeMs(c.v3, NOW, 0)).toBe(180_000);
    expect(maxAgeMs(c.v3, NOW, 20_000)).toBe(90_000);
    expect(MAX_AGE_MS[contextKey(c.live, NOW, 0)]).toBe(180_000);
    expect(MAX_AGE_MS[contextKey(c.live, NOW, 20_000)]).toBe(90_000);
    // gate() applies it: 100 s old is inside the 180 s limit with no skew, over the 90 s limit (and 120 s old on the relay clock) with a 20 s skew
    expect(gate(price(iso(100_000)), c.v3, NOW, 0).price).not.toBeNull();
    expect(gate(price(iso(100_000)), c.v3, NOW, 20_000).price).toBeNull();
    expect(quoteUsable(quote(iso(100_000)), c.live, NOW, { clockSkewMs: 20_000 }).usable).toBe(false);
  });
});

describe('where the two used to differ, the shared rule is right (documented decision)', () => {
  // The v3 seam used to decide "live" only from the caller's `live` flag, so a LIST whose scheduled start had already passed (the game is in play, or about to be
  // marked so) got the "within 2 hours" limit (90 s). The approved table says a list of a LIVE game is 60 s, and PR #148's rule treats a start in the past as live
  // (the stricter reading, and the one that cannot show an older price). The shared rule is the single source of truth, so v3 now agrees: 60 s.
  it('a list with a start in the past and no live flag gets the live limit (60 s), not the within-2-hours limit (90 s)', () => {
    const c = both('list', NOW - 30 * 60_000, false);
    expect(maxAgeMs(c.v3, NOW)).toBe(60_000);
    expect(gate(price(iso(75_000)), c.v3, NOW)).toMatchObject({ price: null, reason: 'too-old' });
    expect(gate(price(iso(60_000)), c.v3, NOW).price).not.toBeNull();
  });
  it('the exact contract is unaffected (live and within 2 hours share 30 s)', () => {
    expect(maxAgeMs(both('contract', NOW - 30 * 60_000, false).v3, NOW)).toBe(30_000);
  });
});
