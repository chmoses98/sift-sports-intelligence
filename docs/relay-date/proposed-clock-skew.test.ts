// PROPOSAL for the quote-track branch (origin/claude/quote-track). It is NOT run by this branch: it imports
// quote-track code that does not exist here. To use it, copy it to tests/live/relayDateClockSkew.test.ts there.
// It was run in a scratch checkout of origin/claude/quote-track (see docs/relay-date/README.md).
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
async function read(expose: string, offsetMs: number, quoteAgeMs: number, relayNow = RELAY_NOW) {
  const deviceNow = relayNow + offsetMs;
  const provider = new KalshiApiProvider({
    baseUrl: 'https://relay.example/kalshi',
    now: () => deviceNow,
    fetchImpl: async () => browserSees(expose, {
      'X-Sift-Observed-At': new Date(relayNow - quoteAgeMs).toISOString(),
      Date: new Date(relayNow).toUTCString(),
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
  const offsets: [string, number][] = [['30 s fast', 30_000], ['30 s slow', -30_000], ['10 min fast', 600_000], ['10 min slow', -600_000]];

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
    for (const offset of [30_000, -30_000, 600_000, -600_000]) {
      const fresh = await read(NEW_EXPOSE, offset, FRESH, fractional);
      expect(fresh.judge(tight, true).usable).toBe(true);
      expect(Math.abs((fresh.judge(tight, true).ageMs ?? 0) - FRESH)).toBeLessThan(1_000);
      expect((await read(NEW_EXPOSE, offset, OLD_TIGHT, fractional)).judge(tight, true).usable).toBe(false);
    }
  });

  it('a device clock that is right (within the 2 s noise floor) is simply trusted', async () => {
    const { r, judge } = await read(NEW_EXPOSE, 1_000, FRESH);
    expect(r.clockSkewMs).toBeUndefined();
    expect(judge(tight, false).usable).toBe(true);
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
