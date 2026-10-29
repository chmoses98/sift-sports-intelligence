// @vitest-environment node
// The captured-data preview's pure parts: the cache merge rule (the base is never overwritten), the pack format round trip, and the one
// transformation of document content (market observation times). Preview-only code: src/v3/preview/capture.ts, scripts/v3-preview/capture-lib.mjs.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPacks, mergeCaches, planPacks, readDoc, sha1, writePacks } from '../../scripts/v3-preview/capture-lib.mjs';
import { clockOf, CLOCK_LEAD_MS, fromBase64, gunzip, readEntry, restampMarketTimes, sha1 as sha1Web, utcLabel } from '../../src/v3/preview/capture';

const tmp = () => mkdtempSync(join(tmpdir(), 'sift-cap-'));
const put = (dir: string, url: string, body: object | string) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, sha1(url)), typeof body === 'string' ? body : JSON.stringify(body)); return sha1(url); };

describe('merging caches', () => {
  it('keeps every base document, adds only absent URLs from the other families, and records where each came from', () => {
    const base = tmp(); const other = tmp(); const gaps = tmp();
    const a = put(base, 'https://x/a.json', { kind: 'ranking', v: 'base' });
    const b = put(base, 'https://x/b.json', { kind: 'entity_profile' });
    put(other, 'https://x/a.json', { kind: 'ranking', v: 'other-differs' });   // same URL, different bytes: never overwrites
    const c = put(other, 'https://x/c.json', { kind: 'event_detail' });
    const d = put(gaps, 'https://x/d.json', { kind: 'ranking' });
    put(gaps, 'https://x/c.json', { kind: 'event_detail', v: 'gap' });          // a gap fill never replaces a family document either
    const m = mergeCaches({ name: 'props', dir: base }, [{ name: 'player', dir: other }], { name: 'gap-fill', dir: gaps });
    expect(m.docs.size).toBe(4);
    expect(JSON.parse(m.docs.get(a)!.bytes.toString()).v).toBe('base');
    expect(m.docs.get(a)!.family).toBe('props');
    expect(m.docs.get(b)!.family).toBe('props');
    expect(m.docs.get(c)!.family).toBe('player');
    expect(m.docs.get(d)!.family).toBe('gap-fill');
    expect(m.additions.map((x) => [x.hash, x.family])).toEqual([[c, 'player'], [d, 'gap-fill']]);
    expect(m.skipped.player.sameUrlDifferentBytes).toBe(1);
    expect(m.skipped['gap-fill'].sameUrlDifferentBytes).toBe(1);
    expect(m.counts).toEqual({ props: 2, player: 1, 'gap-fill': 1 });
  });
});

describe('packs', () => {
  const build = () => {
    const base = tmp();
    const hs = ['a', 'b', 'c', 'd', 'e'].map((n) => put(base, `https://x/${n}.json`, { kind: n === 'e' ? 'entity_profile' : 'ranking', n, pad: 'x'.repeat(400) }));
    const m = mergeCaches({ name: 'props', dir: base }, []);
    return { m, hs };
  };

  it('groups documents by first use, then by kind, and starts a new pack at the cap', () => {
    const { m, hs } = build();
    const runs = planPacks(m.docs, [{ group: 'home', hashes: [hs[3], hs[1], 'not-in-capture'] }], 100);
    expect(runs[0]).toEqual({ name: 'home', hashes: [hs[3], hs[1]], cap: 100 });
    expect(runs.map((r) => r.name)).toEqual(['home', 'other:entity_profile', 'other:ranking']);
    const built = buildPacks(m.docs, runs, 10); // a cap smaller than one document: each document is its own pack
    expect(built.packs.length).toBe(5);
    expect(Object.keys(built.entries).sort()).toEqual([...hs].sort());
  });

  it('round-trips every document byte for byte (binary and base64 packs), through the same reader the page uses', async () => {
    const { m, hs } = build();
    const built = buildPacks(m.docs, planPacks(m.docs, [], 1 << 20), 1 << 20);
    for (const enc of ['bin', 'b64'] as const) {
      const out = tmp();
      const { meta, entries } = writePacks(out, built, enc);
      const index = { docs: entries };
      const bytes = (i: number) => (enc === 'b64' ? Buffer.from(readFileSync(join(out, meta[i].file), 'utf8'), 'base64') : readFileSync(join(out, meta[i].file)));
      for (const h of hs) {
        expect(readDoc(index, bytes, h)!.equals(m.docs.get(h)!.bytes)).toBe(true);
        const pack = enc === 'b64' ? fromBase64(readFileSync(join(out, meta[entries[h][0]].file), 'utf8')) : new Uint8Array(bytes(entries[h][0]));
        expect(await readEntry(pack, entries[h])).toBe(m.docs.get(h)!.bytes.toString('utf8'));
      }
    }
  });

  it('refuses bytes that are not a gzip member (a host that altered the pack must not yield a silently wrong document)', async () => {
    await expect(gunzip(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/not a gzip member/);
  });

  it('hashes a request URL exactly like the disk cache does (SHA-1 of the URL)', async () => {
    const u = 'https://raw.githubusercontent.com/chmoses98/sift-sports-intelligence/live-quotes/games/26OCT26DALPHI.json';
    expect(await sha1Web(u)).toBe(sha1(u));
  });
});

describe('the one transformation: market observation times', () => {
  const clock = '2026-10-26T23:24:57.000Z';
  it('sets the quote feed\'s generated and observed times and a game document\'s market capture times, nothing else', () => {
    const feed = { schema: 'sift.live_quotes.v1', generated_at: '2026-10-27T00:43:52Z', markets: [{ ticker: 'K1', yes_ask: 0.54, observed_at: '2026-10-27T00:43:50Z' }, { ticker: 'K2', yes_ask: null, observed_at: null }] };
    const out = JSON.parse(restampMarketTimes(JSON.stringify(feed), clock));
    expect(out.generated_at).toBe(clock);
    expect(out.markets[0]).toEqual({ ticker: 'K1', yes_ask: 0.54, observed_at: clock });
    expect(out.markets[1]).toEqual({ ticker: 'K2', yes_ask: null, observed_at: null });  // no observation: stays none
    const ev = { kind: 'event_detail', generated_at: '2026-10-26T21:47:28Z', markets: [{ yes_ask: 0.5, captured_at: '2026-10-26T19:32:52Z' }] };
    const o2 = JSON.parse(restampMarketTimes(JSON.stringify(ev), clock));
    expect(o2.generated_at).toBe('2026-10-26T21:47:28Z');
    expect(o2.markets[0]).toEqual({ yes_ask: 0.5, captured_at: clock });
  });
  it('returns every other document byte for byte', () => {
    for (const doc of ['{"kind":"ranking","entries":[1,2]}', '{"kind":"entity_profile","markets":[{"captured_at":"2026-10-26T23:21:49Z"}]}', 'not json', '[]']) expect(restampMarketTimes(doc, clock)).toBe(doc);
  });
  it('places the clock a few seconds before the capture instant, inside the gate\'s 5 s future tolerance, and labels times in UTC', () => {
    expect(CLOCK_LEAD_MS).toBeLessThanOrEqual(5_000);
    expect(new Date(clockOf('2026-10-26T23:25:00Z')).toISOString()).toBe('2026-10-26T23:24:57.000Z');
    expect(utcLabel('2026-10-26T23:25:00Z')).toBe('26 Oct 2026, 23:25 UTC');
  });
});
