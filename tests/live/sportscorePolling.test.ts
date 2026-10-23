// SportScore's free tier: ~10,000 requests/24 h/IP, 60 s edge cache. The adapter must stay far inside that.
import { describe, expect, it } from 'vitest';
import { deviceBudget, sportscoreDays, sportscoreProvider, SPORTSCORE_DAILY_ALLOWANCE, SPORTSCORE_MAX_DAYS, SPORTSCORE_MIN_INTERVAL_MS } from '../../src/live/scores/providers/sportscore';
import { ScoreProviderError, type ObservedEvent } from '../../src/live/scores/types';

const T = Date.parse('2026-10-22T23:30:00Z');
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const ev = (startUtc: string): ObservedEvent => ({ ref: { eventId: startUtc, sport: 'NBA', startUtc, providerIds: {} }, home: { name: 'A', abbr: null }, away: { name: 'B', abbr: null } } as unknown as ObservedEvent);

describe('SportScore request limits', () => {
  it('never polls faster than its 60-second cache', () => {
    expect(SPORTSCORE_MIN_INTERVAL_MS).toBe(60_000);
    expect(sportscoreProvider({ events: () => [] }).minIntervalMs).toBe(60_000);
  });

  it('asks about at most two UTC days, nearest to now first, even when games on screen span more', () => {
    const starts = ['2026-10-21T23:00:00Z', '2026-10-22T23:00:00Z', '2026-10-23T02:00:00Z', '2026-10-24T23:00:00Z', '2026-10-25T23:00:00Z'].map(Date.parse);
    const days = sportscoreDays(starts, T);
    expect(days.length).toBeLessThanOrEqual(SPORTSCORE_MAX_DAYS);
    expect(days[0]).toBe('2026-10-22');
    expect(sportscoreDays([], T)).toEqual(['2026-10-22']);
  });

  it('one refresh makes one request per day asked about, to the documented fixtures endpoint, with no key and no cookies', async () => {
    const urls: string[] = [];
    const init: RequestInit[] = [];
    const p = sportscoreProvider({
      events: () => [ev('2026-10-22T23:00:00Z'), ev('2026-10-23T01:00:00Z'), ev('2026-10-25T01:00:00Z')],
      now: () => T, budget: deviceBudget(100, mem()),
      fetchImpl: (async (u: string, i: RequestInit) => { urls.push(u); init.push(i); return new Response(JSON.stringify({ matches: [] })); }) as unknown as typeof fetch,
    });
    await p.fetchScoreboard('NBA');
    expect(urls).toHaveLength(2);
    expect(urls.every((u) => u.startsWith('https://sportscore.com/api/v1/fixtures/?'))).toBe(true);
    expect(new Set(urls.map((u) => new URL(u).searchParams.get('date'))).size).toBe(2);
    expect(init.every((i) => !i.headers && i.credentials === undefined)).toBe(true);
  });

  it('a device has a daily allowance well under the tier, per UTC day; spending it reads as rate-limited until the next UTC day', async () => {
    expect(SPORTSCORE_DAILY_ALLOWANCE).toBeLessThanOrEqual(2_000);
    const store = mem();
    const b = deviceBudget(3, store);
    expect([b.take(2, T), b.take(1, T), b.take(1, T)]).toEqual([true, true, false]);
    expect(b.take(1, T + 3_600_000)).toBe(true); // 00:30 UTC next day: a new allowance
    let calls = 0;
    const p = sportscoreProvider({ events: () => [], now: () => T, budget: deviceBudget(1, mem()), fetchImpl: (async () => { calls++; return new Response(JSON.stringify({ matches: [] })); }) as unknown as typeof fetch });
    await p.fetchScoreboard('NBA');
    const err = await p.fetchScoreboard('NBA').catch((e) => e);
    expect(err).toBeInstanceOf(ScoreProviderError);
    expect(err).toMatchObject({ kind: 'rate_limited', retryAfterMs: Date.parse('2026-10-23T00:00:00Z') - T });
    expect(calls).toBe(1);
  });

  it('a corrupt stored allowance cannot block or unbound the feed', () => {
    const store = { getItem: () => '{bad', setItem: () => { throw new Error('quota'); } };
    const b = deviceBudget(2, store);
    expect([b.take(1, T), b.take(1, T), b.take(1, T)]).toEqual([true, true, false]);
  });
});
