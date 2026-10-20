// Kalshi live-data test helpers: schema discovery, event→milestone mapping and cadence statistics, on SYNTHETIC payloads.
// The real response shapes are unknown (not reachable when this was written); these tests pin the logic, not Kalshi's data.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KALSHI_CLAUSES, cadence, capabilities, eventTickerOf, kalshiGate, fingerprints, gameEventTicker, flatten, mapEventsToMilestones, parseTime, summarizeSchema, tagsOf, timestampLags } from '../../scripts/live-latency/kalshi-lib.mjs';

const h = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 8);

describe('identity: SIFT / Kalshi tickers → milestone', () => {
  it('derives the Kalshi event ticker from a real market ticker (the committed fixture)', () => {
    const real = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'kalshi-market.json'), 'utf-8'));
    expect(eventTickerOf(real.ticker)).toBe(real.event_ticker); // KXNFLGAME-26OCT12BUFLAR-LAR → KXNFLGAME-26OCT12BUFLAR
    expect(eventTickerOf('nonsense')).toBeNull();
    expect(eventTickerOf(null)).toBeNull();
  });
  it('turns a SIFT feed game key into the Kalshi game event ticker (checked on the live feed: 26OCT20ANANYI ↔ KXNHLGAME-26OCT20ANANYI)', () => {
    expect(gameEventTicker('NHL', '26OCT20ANANYI')).toBe('KXNHLGAME-26OCT20ANANYI');
    expect(gameEventTicker('NFL', '26OCT25CINBAL')).toBe('KXNFLGAME-26OCT25CINBAL');
    expect(gameEventTicker('TENNIS', '26OCT20X')).toBeNull();
    expect(gameEventTicker('NHL', 'garbage')).toBeNull();
  });
  it('maps events to milestones from either documented route, tolerating missing fields', () => {
    const viaEvents = { events: [{ event_ticker: 'KXNBAGAME-26OCT25NYKBOS' }], milestones: [{ id: 'm1', type: 'basketball_game', primary_event_tickers: ['KXNBAGAME-26OCT25NYKBOS'] }] };
    const viaMilestones = { milestones: [{ milestone_id: 'm2', related_event_tickers: ['KXNHLGAME-26OCT25TBBOS'] }, { type: 'no id' }] };
    const { map, meta } = mapEventsToMilestones(viaEvents, viaMilestones, null);
    expect([...map.get('KXNBAGAME-26OCT25NYKBOS')!]).toEqual(['m1']);
    expect([...map.get('KXNHLGAME-26OCT25TBBOS')!]).toEqual(['m2']);
    expect(meta.get('m1')).toMatchObject({ type: 'basketball_game' });
    expect(map.size).toBe(2);
  });
});

describe('schema discovery over an unknown payload', () => {
  const details = { status: 'live', home: { name: 'BOS', score: 41 }, away: { name: 'NYK', score: 38 }, period: 2, clock: '04:12', last_updated: '2026-10-25T00:01:02Z', players: [{ id: 1, pts: 12 }] };
  it('flattens, tags and reports what a feed carries, never inventing a field', () => {
    const schema = summarizeSchema([details, { status: 'pre' }]);
    const c = capabilities(schema);
    expect(c.score).toEqual(['away.score', 'home.score']);
    expect(c.clock).toContain('clock');
    expect(c.period).toContain('period');
    expect(c.timestamp).toContain('last_updated');
    expect(c.player.length).toBeGreaterThan(0);
    expect(summarizeSchema([{ status: 'pre' }]).length).toBe(1);
    expect(capabilities(summarizeSchema([{ x: 1 }])).score).toEqual([]);
    expect(flatten({ a: [1, 2, 3, 4] }).some((l) => l.path === 'a[]')).toBe(true);
  });
  it('parses ISO and epoch timestamps only inside a plausible range', () => {
    expect(parseTime('2026-10-25T00:01:02Z')).toBe(Date.parse('2026-10-25T00:01:02Z'));
    expect(parseTime(1_790_000_000)).toBe(1_790_000_000_000);
    expect(parseTime(41)).toBeNull();
    expect(parseTime('hello')).toBeNull();
    expect(tagsOf('last_updated', '2026-10-25T00:01:02Z')).toContain('timestamp');
  });
  it('reports the provider-timestamp lag against our receive time', () => {
    const rx = Date.parse('2026-10-25T00:01:06Z');
    expect(timestampLags(details, rx)).toEqual([{ path: 'last_updated', lagMs: 4000 }]);
  });
});

describe('cadence', () => {
  const obs = (rows: Array<[number, Record<string, unknown>]>) => rows.map(([t, d]) => ({ t, ...fingerprints(d, h) }));
  it('ignores a timestamp that changes every call, and separates score changes from clock ticks', () => {
    const o = {
      m: obs([
        [0, { home_score: 0, clock: '10:00', last_updated: 'a' }],
        [3000, { home_score: 0, clock: '09:57', last_updated: '2026-10-25T00:00:03Z' }],
        [6000, { home_score: 0, clock: '09:54', last_updated: '2026-10-25T00:00:06Z' }],
        [9000, { home_score: 2, clock: '09:54', last_updated: '2026-10-25T00:00:09Z' }],
        [12000, { home_score: 2, clock: '09:54', last_updated: '2026-10-25T00:00:12Z' }],
      ]),
    };
    expect(cadence(o, 'scoreHash')).toMatchObject({ changes: 1, medianGapMs: null });
    expect(cadence(o, 'clockHash').changes).toBe(2);
    expect(cadence(o, 'hash').changes).toBe(3); // clock ×2 + score ×1; the timestamp alone never counts
    expect(cadence(o, 'clockHash').medianGapMs).toBe(3000);
  });
});

describe("Kalshi's published terms gate the test", () => {
  it('refuses without acknowledgement, quoting the clauses; discovery and benchmark are separate acknowledgements', () => {
    const none = kalshiGate({});
    expect(none.ok).toBe(false);
    expect(none.errors.join(' ')).toContain('§3.1');
    expect(KALSHI_CLAUSES.some((c) => c.includes('§3.5') && c.includes('benchmarking'))).toBe(true);
    expect(kalshiGate({ ackTerms: true })).toMatchObject({ ok: true, discovery: true, cadence: false });
    expect(kalshiGate({ ackTerms: true, ackBenchmark: true }).cadence).toBe(true);
    expect(kalshiGate({ ackBenchmark: true }).ok).toBe(false);
  });
});
