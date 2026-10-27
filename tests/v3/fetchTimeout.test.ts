// A research document that never answers must become a failure, not a skeleton that never goes away. The bound is OFF by default (SIFT 2.0 and
// classic keep their behaviour) and ON while SIFT 3.0 is mounted (src/v3/V3Root.tsx).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchTimeoutError, NotFoundError, RESEARCH_FETCH_TIMEOUT_MS, getJson, getText, setFetchJson, setFetchText, setFetchTimeout } from '../../src/data/fetcher';

const hang = (_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
  init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
});

beforeEach(() => { vi.useFakeTimers(); setFetchJson(null); setFetchText(null); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); setFetchTimeout(null); });

describe('research fetch bound', () => {
  it('the default bound is 25 seconds', () => { expect(RESEARCH_FETCH_TIMEOUT_MS).toBe(25_000); });

  it('with the bound on, a request that never answers fails with a timeout after exactly the bound', async () => {
    vi.stubGlobal('fetch', vi.fn(hang));
    setFetchTimeout(25_000);
    const p = getJson('https://x.test/a.json');
    const seen = p.then(() => 'ok', (e) => e);
    await vi.advanceTimersByTimeAsync(24_999);
    let settled = false;
    void seen.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const err = await seen;
    expect(err).toBeInstanceOf(FetchTimeoutError);
    expect((err as FetchTimeoutError).message).toMatch(/timed out after 25 s/);
  });

  it('a body that stalls after the headers is also bounded', async () => {
    const stalled = { status: 200, ok: true, json: () => new Promise(() => undefined), text: () => new Promise(() => undefined) } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => stalled));
    setFetchTimeout(5_000);
    // the body read ignores the abort signal (as a stalled stream can): the caller is still released at the bound
    const p = getJson('https://x.test/b.json');
    const seen = p.then(() => 'ok', (e) => e);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(await seen).toBeInstanceOf(FetchTimeoutError);
  });

  it('text documents are bounded the same way', async () => {
    vi.stubGlobal('fetch', vi.fn(hang));
    setFetchTimeout(3_000);
    const seen = getText('https://x.test/t.txt').then(() => 'ok', (e) => e);
    await vi.advanceTimersByTimeAsync(3_100);
    expect(await seen).toBeInstanceOf(FetchTimeoutError);
  });

  it('with the bound off (the default), nothing is aborted and a slow answer still arrives', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((res) => {
      expect(init?.signal).toBeUndefined();
      setTimeout(() => res({ status: 200, ok: true, json: async () => ({ ok: 1 }) } as unknown as Response), 60_000);
    })));
    const seen = getJson('https://x.test/slow.json');
    await vi.advanceTimersByTimeAsync(60_001);
    expect(await seen).toEqual({ ok: 1 });
  });

  it('404 stays a NotFoundError (a missing document is not a timeout), and an HTTP error is an ordinary error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => ({ status: u.includes('missing') ? 404 : 503, ok: false, json: async () => ({}) } as unknown as Response)));
    setFetchTimeout(25_000);
    await expect(getJson('https://x.test/missing.json')).rejects.toBeInstanceOf(NotFoundError);
    await expect(getJson('https://x.test/down.json')).rejects.toThrow(/HTTP 503/);
  });

  it('a timeout is not memoised: the next read tries again', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => {
      calls++;
      if (calls === 1) return hang(_u, init);
      return Promise.resolve({ status: 200, ok: true, json: async () => ({ n: calls }) } as unknown as Response);
    }));
    setFetchTimeout(1_000);
    const first = getJson('https://x.test/c.json').then(() => 'ok', (e) => e);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(await first).toBeInstanceOf(FetchTimeoutError);
    expect(await getJson('https://x.test/c.json')).toEqual({ n: 2 });
  });
});
