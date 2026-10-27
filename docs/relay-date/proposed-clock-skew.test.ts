// PROPOSAL for the quote-track branch (origin/claude/quote-track). It is NOT run by this branch: it imports
// quote-track code that does not exist here. To use it, copy it to tests/live/relayDateClockSkew.test.ts there.
// It was run in a scratch checkout of origin/claude/quote-track (see docs/relay-date/README.md): at 2c5310d2 the
// provider reads the relay's Date only with `strictObservation: true` (what deliveryConfig.ts passes for the relay),
// so the provider below is built that way.
//
// What it proves: the quote-usability rule corrects the device clock with the relay's own `Date` header, but a
// cross-origin browser only sees a header the relay lists in Access-Control-Expose-Headers. The relay used to
// list `X-Sift-Observed-At, Retry-After`; with `Date` added the correction works, without it nothing happens.
// The "browser" below hands the provider only the headers a cross-origin page could read.
import { describe, expect, it } from 'vitest';
import { KalshiApiProvider } from '../../src/live/providers/kalshi';
import { quoteUsable, type QuoteContext } from '../../src/live/quoteUsable';

const T = 'KXNHLGOAL-26OCT26TORCGY-TOR19';
const BODY = JSON.stringify({ markets: [{ ticker: T, event_ticker: 'KXNHLGOAL-26OCT26TORCGY', status: 'active', yes_bid_dollars: '0.4100', yes_ask_dollars: '0.4300' }], cursor: '' });
/** The relay's true clock when the answer is produced (a whole second so the Date header is exact). */
const RELAY_NOW = Date.parse('2026-10-26T18:00:30Z');
const HOUR = 3_600_000;

/** Header names a cross-origin page can read: CORS-safelisted ones plus the relay's Access-Control-Expose-Headers. */
const SAFELISTED = ['cache-control', 'content-language', 'content-length', 'content-type', 'expires', 'last-modified', 'pragma'];
const OLD_EXPOSE = 'X-Sift-Observed-At, Retry-After'; // relay/core.ts on main before the change
const NEW_EXPOSE = 'X-Sift-Observed-At, Retry-After, Date'; // relay/core.ts with Date exposed

/** What the page sees of a relay answer: everything else is hidden, as in a real cross-origin fetch. */
function browserSees(expose: string, headers: Record<string, string>): Response {
  const readable = new Set([...SAFELISTED, ...expose.split(',').map((s) => s.trim().toLowerCase())]);
  const h = new Headers();
  for (const [k, v] of Object.entries(headers)) if (readable.has(k.toLowerCase())) h.set(k, v);
  return new Response(BODY, { headers: h });
}

/** A relay answer whose quote was observed `quoteAgeMs` before the relay's clock, read by a device `offsetMs` ahead of it. */
interface Shape {
  /** Add to the relay's reported Date: the relay's own clock being wrong by this much (observed-at stays Kalshi's, true). */
  relayClockError?: number;
  /** Use this Date header as it is (a replayed or malformed one) instead of the relay's clock. */
  dateHeader?: string;
}

async function read(expose: string, offsetMs: number, quoteAgeMs: number, relayNow = RELAY_NOW, shape: Shape = {}) {
  const deviceNow = relayNow + offsetMs;
  const provider = new KalshiApiProvider({
    baseUrl: 'https://relay.example/kalshi',
    strictObservation: true,
    now: () => deviceNow,
    fetchImpl: async () => browserSees(expose, {
      'X-Sift-Observed-At': new Date(relayNow - quoteAgeMs).toISOString(),
      Date: shape.dateHeader ?? new Date(relayNow + (shape.relayClockError ?? 0)).toUTCString(),
      'Retry-After': '5',
      Vary: 'Origin',
    }),
  });
  const r = await provider.fetchQuotes([T]);
  const quote = r.quotes[0];
  const judge = (ctx: QuoteContext, useSkew: boolean) => quoteUsable(quote, ctx, deviceNow, useSkew ? { clockSkewMs: r.clockSkewMs } : {});
  return { r, judge };
}

// "Exact contract, start within 2 hours": the tightest row, 30 s. "List, start more than 2 hours away": the loosest, 180 s.
const tight: QuoteContext = { surface: 'contract', startsAt: RELAY_NOW + HOUR };
const loose: QuoteContext = { surface: 'list', startsAt: RELAY_NOW + 5 * HOUR };

const FRESH = 3_000; // seconds old: usable in every context
const OLD_TIGHT = 45_000; // genuinely older than the 30 s limit
const OLD_LOOSE = 200_000; // genuinely older than the 180 s limit

describe('with Date exposed, a wrong device clock no longer changes the verdict', () => {
  const offsets: [string, number][] = [
    ['5 s fast', 5_000], ['5 s slow', -5_000], ['30 s fast', 30_000], ['30 s slow', -30_000], ['10 min fast', 600_000], ['10 min slow', -600_000],
    ['2 h fast', 2 * HOUR], ['2 h slow', -2 * HOUR], ['3 days fast', 72 * HOUR], ['3 days slow', -72 * HOUR], ['400 days off', 400 * 24 * HOUR],
  ];

  it.each(offsets)('device clock %s: the skew is measured exactly from the Date header', async (_n, offset) => {
    const { r } = await read(NEW_EXPOSE, offset, FRESH);
    expect(r.clockSkewMs).toBe(-offset); // relay minus device
  });

  it.each(offsets)('device clock %s: a fresh relay quote is usable, a genuinely old one is not (tight and loose contexts)', async (_n, offset) => {
    const fresh = await read(NEW_EXPOSE, offset, FRESH);
    expect(fresh.judge(tight, true)).toMatchObject({ usable: true, ageMs: FRESH });
    expect(fresh.judge(loose, true)).toMatchObject({ usable: true, ageMs: FRESH });
    const oldT = await read(NEW_EXPOSE, offset, OLD_TIGHT);
    expect(oldT.judge(tight, true)).toMatchObject({ usable: false, reason: 'too_old', ageMs: OLD_TIGHT });
    const oldL = await read(NEW_EXPOSE, offset, OLD_LOOSE);
    expect(oldL.judge(loose, true)).toMatchObject({ usable: false, reason: 'too_old', ageMs: OLD_LOOSE });
  });

  it('the 1 s resolution of the Date header costs less than a second of accuracy and changes no verdict', async () => {
    const fractional = RELAY_NOW + 600; // the relay really answered 0.6 s into the second; the header says :30
    for (const offset of [5_000, -5_000, 30_000, -30_000, 600_000, -600_000, 2 * HOUR, -2 * HOUR, 72 * HOUR, -72 * HOUR]) {
      const fresh = await read(NEW_EXPOSE, offset, FRESH, fractional);
      expect(fresh.judge(tight, true).usable).toBe(true);
      expect(Math.abs((fresh.judge(tight, true).ageMs ?? 0) - FRESH)).toBeLessThan(1_000);
      expect((await read(NEW_EXPOSE, offset, OLD_TIGHT, fractional)).judge(tight, true).usable).toBe(false);
    }
  });

  it('a device clock that is right (within the 2 s noise floor) is simply trusted', async () => {
    for (const offset of [0, 1_000, -1_000, 1_999, -1_999]) {
      const { r, judge } = await read(NEW_EXPOSE, offset, FRESH);
      expect(r.clockSkewMs).toBeUndefined();
      expect(judge(tight, false).usable).toBe(true);
    }
    expect((await read(NEW_EXPOSE, 2_000, FRESH)).r.clockSkewMs).toBe(-2_000); // from 2 s on, it is measured
  });
});

describe('without Date exposed (the relay as it was), the correction silently does nothing', () => {
  it.each([['30 s fast', 30_000], ['30 s slow', -30_000], ['10 min fast', 600_000], ['10 min slow', -600_000]] as [string, number][])('device clock %s: the provider reports no skew', async (_n, offset) => {
    const { r } = await read(OLD_EXPOSE, offset, FRESH);
    expect(r.clockSkewMs).toBeUndefined();
  });

  it('FAST clock (+30 s) wrongly withholds a fresh quote', async () => {
    const { judge } = await read(OLD_EXPOSE, 30_000, FRESH);
    expect(judge(tight, true)).toMatchObject({ usable: false, reason: 'too_old', ageMs: FRESH + 30_000 }); // looks 33 s old, is 3 s old
  });

  it('SLOW clock (-30 s) wrongly accepts a genuinely old quote', async () => {
    const t = await read(OLD_EXPOSE, -30_000, OLD_TIGHT); // really 45 s old, over the 30 s limit
    expect(t.judge(tight, true)).toMatchObject({ usable: true, ageMs: OLD_TIGHT - 30_000 }); // looks 15 s old
    const l = await read(OLD_EXPOSE, -30_000, OLD_LOOSE); // really 200 s old, over the 180 s limit
    expect(l.judge(loose, true)).toMatchObject({ usable: true, ageMs: OLD_LOOSE - 30_000 });
  });

  it('a SLOW clock also wrongly withholds a fresh quote (it looks to be from the future), by 30 s and by 10 min', async () => {
    for (const offset of [-30_000, -600_000]) {
      expect((await read(OLD_EXPOSE, offset, FRESH)).judge(tight, true)).toMatchObject({ usable: false, reason: 'future_observed_at' });
    }
  });

  it('a FAST clock by 10 min wrongly withholds a fresh quote', async () => {
    expect((await read(OLD_EXPOSE, 600_000, FRESH)).judge(loose, true)).toMatchObject({ usable: false, reason: 'too_old' });
  });
});

describe('the exposure itself', () => {
  it('Date is invisible to the page unless the relay lists it; the other exposed headers keep working', async () => {
    const hidden = browserSees(OLD_EXPOSE, { Date: 'x', 'X-Sift-Observed-At': 'y', 'Retry-After': '5', Vary: 'Origin' });
    expect([hidden.headers.get('date'), hidden.headers.get('x-sift-observed-at'), hidden.headers.get('retry-after'), hidden.headers.get('vary')]).toEqual([null, 'y', '5', null]);
    const shown = browserSees(NEW_EXPOSE, { Date: 'x', 'X-Sift-Observed-At': 'y', 'Retry-After': '5', Vary: 'Origin' });
    expect([shown.headers.get('date'), shown.headers.get('x-sift-observed-at'), shown.headers.get('retry-after'), shown.headers.get('vary')]).toEqual(['x', 'y', '5', null]);
  });
});

describe('the relay\'s own clock is wrong: the client believes it, and the error passes straight to the age (the documented limit)', () => {
  // X-Sift-Observed-At comes from Kalshi\'s own Date, so it stays true. Only the device-versus-relay offset is wrong.
  it('relay clock 30 s FAST, device exactly right: the client "corrects" a right clock by 30 s; a 3 s old quote looks 33 s old and is withheld in the 30 s context', async () => {
    const { r, judge } = await read(NEW_EXPOSE, 0, FRESH, RELAY_NOW, { relayClockError: 30_000 });
    expect(r.clockSkewMs).toBe(30_000); // concludes: "this device is 30 s slow"
    expect(judge(tight, true)).toMatchObject({ usable: false, reason: 'too_old', ageMs: FRESH + 30_000 });
    expect(judge(loose, true)).toMatchObject({ usable: true, ageMs: FRESH + 30_000 }); // 33 s is inside the 180 s limit
  });

  it('relay clock 30 s SLOW, device exactly right: a quote 45 s old (over the 30 s limit) looks 15 s old and is accepted', async () => {
    const { r, judge } = await read(NEW_EXPOSE, 0, OLD_TIGHT, RELAY_NOW, { relayClockError: -30_000 });
    expect(r.clockSkewMs).toBe(-30_000);
    expect(judge(tight, true)).toMatchObject({ usable: true, ageMs: OLD_TIGHT - 30_000 });
  });

  it('the error is exactly the relay\'s clock error, whatever the device clock is; below 2 s it is ignored', async () => {
    for (const err of [-30_000, 30_000, 5_000]) {
      for (const dev of [0, 600_000, -2 * HOUR]) {
        const { r, judge } = await read(NEW_EXPOSE, dev, FRESH, RELAY_NOW, { relayClockError: err });
        expect(r.clockSkewMs).toBe(err - dev);
        expect(judge(loose, true).ageMs).toBe(FRESH + err); // true age plus the relay\'s clock error; the device offset cancels
      }
    }
    expect((await read(NEW_EXPOSE, 0, FRESH, RELAY_NOW, { relayClockError: 1_000 })).r.clockSkewMs).toBeUndefined();
  });
});

describe('answers served from the relay\'s cache or shared in flight (what relay/core.ts does: Date = serve time, observed-at = the original observation)', () => {
  // Shape produced by relay/core.ts (tests/relayDateServe.test.ts proves it): quote observed `a0` before the relay
  // first answered; a hit `delta` later carries Date = R0 + delta and the ORIGINAL X-Sift-Observed-At.
  const hit = (offset: number, a0: number, delta: number, expose = NEW_EXPOSE) => read(expose, offset, a0 + delta, RELAY_NOW + delta, {});

  it.each([[0], [-30_000], [600_000], [-2 * HOUR]])('device offset %i ms: the client sees the true age (original age plus the time spent in the cache), so a served hit never looks fresher than it is', async (offset) => {
    for (const delta of [1_000, 4_000, 20_000, 40_000]) {
      const { judge } = await hit(offset, FRESH, delta);
      expect(judge(tight, true).ageMs).toBe(FRESH + delta);
    }
    // 3 s old when first answered; still inside the 30 s limit 20 s later (23 s) and over it 40 s later (43 s)
    expect((await hit(offset, FRESH, 20_000)).judge(tight, true).usable).toBe(true);
    expect((await hit(offset, FRESH, 40_000)).judge(tight, true)).toMatchObject({ usable: false, reason: 'too_old' });
  });
});

describe('a Date REPLAYED by an intermediary cache (a shared cache ignoring Cache-Control: no-store): the documented limit', () => {
  // The relay sends no-store on every data answer. A cache that stored one anyway and replayed it `delta` later
  // would replay the Date with it. Date and X-Sift-Observed-At are replayed together, so Date minus observed-at
  // (the age when the relay answered) is unchanged: the client corrects by the replay delay and the old answer
  // looks exactly as fresh as it was when produced.
  const replay = (offset: number, a0: number, delta: number, expose: string) => read(expose, offset + delta, a0, RELAY_NOW, {});
  // read(): relay answered at RELAY_NOW with the quote a0 old; the device reads it `delta` later (device = RELAY_NOW + delta + offset)

  it.each([[0], [-30_000], [600_000]])('device offset %i ms: a 60 s old replay of a 3 s old quote is judged 3 s old WITH the Date correction (unsafe direction), and correctly 63 s old without it', async (offset) => {
    const delta = 60_000;
    const withDate = await replay(offset, FRESH, delta, NEW_EXPOSE);
    expect(withDate.r.clockSkewMs).toBe(-delta - offset);
    expect(withDate.judge(tight, true)).toMatchObject({ usable: true, ageMs: FRESH }); // really 63 s old: shown as fresh
    if (offset === 0) {
      const without = await replay(0, FRESH, delta, OLD_EXPOSE); // right device clock, no correction: the true age
      expect(without.judge(tight, true)).toMatchObject({ usable: false, reason: 'too_old', ageMs: FRESH + delta });
    }
  });

  it('what bounds it: the replay must come from a cache that ignores no-store AND be younger than the quote limit it can hide; nothing in the client detects it (only skews under 2 s are discarded, there is no upper bound)', async () => {
    for (const delta of [1_000, 1_999]) {
      expect((await replay(0, FRESH, delta, NEW_EXPOSE)).r.clockSkewMs).toBeUndefined(); // under the 2 s noise floor: ignored, device clock trusted
    }
    // a skew of days is applied as measured (a phone really can be days off), so a replay of any age is "corrected" the same way
    expect((await replay(0, FRESH, 3 * 24 * HOUR, NEW_EXPOSE)).r.clockSkewMs).toBe(-3 * 24 * HOUR);
  });
});

describe('a malformed or absurd Date header', () => {
  it('unparseable Date: ignored, the device clock is trusted (same as no header)', async () => {
    for (const dateHeader of ['', 'yesterday', 'Mon, 99 Foo 2026 25:61:61 GMT']) {
      expect((await read(NEW_EXPOSE, 30_000, FRESH, RELAY_NOW, { dateHeader })).r.clockSkewMs).toBeUndefined();
    }
  });
  it('a Date in 1970 or the year 2099 is applied as measured and the verdict fails SAFE (future-dated, withheld), not open', async () => {
    for (const dateHeader of ['Thu, 01 Jan 1970 00:00:00 GMT', 'Fri, 01 Jan 2100 00:00:00 GMT']) {
      const { r, judge } = await read(NEW_EXPOSE, 0, FRESH, RELAY_NOW, { dateHeader });
      expect(Number.isFinite(r.clockSkewMs)).toBe(true);
      expect(judge(tight, true).usable).toBe(false);
      expect(judge(loose, true).usable).toBe(false);
    }
  });
});
