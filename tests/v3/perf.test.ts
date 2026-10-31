// Mobile-performance seams (docs/sift3/IMPLEMENTATION_STATUS.md "Hardening: mobile performance"): each is behaviour-preserving, and each is pinned here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentExists, existenceProbeIsLight, NotFoundError, setExistenceProbe, setFetchJson, setFetchTimeout } from '../../src/data/fetcher';
import { v3PathOf } from '../../src/v3/data/early';

describe('existence probe (documentExists)', () => {
  beforeEach(() => { setFetchJson(null); });
  afterEach(() => { vi.unstubAllGlobals(); setExistenceProbe(false); setFetchTimeout(null); setFetchJson(null); });

  it('is OFF by default: SIFT 2.0 and classic still read the document (and its schema version is checked)', async () => {
    expect(existenceProbeIsLight()).toBe(false);
    const f = vi.fn(async () => new Response(JSON.stringify({ schema_version: 'edge_finder.app.v1' }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await documentExists('https://x.test/index.json');
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as unknown[])[1]).toMatchObject({ cache: 'no-cache' });
    expect(((f.mock.calls[0] as unknown[])[1] as RequestInit).method).toBeUndefined();
  });

  it('with the probe on (SIFT 3.0) it is one HEAD request and no body is read', async () => {
    setExistenceProbe(true);
    expect(existenceProbeIsLight()).toBe(true);
    const json = vi.fn();
    const f = vi.fn(async () => ({ status: 200, ok: true, json } as unknown as Response));
    vi.stubGlobal('fetch', f);
    await documentExists('https://x.test/index.json');
    expect(f).toHaveBeenCalledTimes(1);
    expect(((f.mock.calls[0] as unknown[])[1] as RequestInit).method).toBe('HEAD');
    expect(json).not.toHaveBeenCalled();
  });

  it('a missing document is a NotFoundError and any other failure an ordinary error, as with a read', async () => {
    setExistenceProbe(true);
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 404, ok: false } as unknown as Response)));
    await expect(documentExists('https://x.test/a.json')).rejects.toBeInstanceOf(NotFoundError);
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 503, ok: false } as unknown as Response)));
    const e = await documentExists('https://x.test/b.json').then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(NotFoundError);
  });

  it('a host that does not answer HEAD (405) gets the document read instead, so the source decision is never wrong for want of a HEAD', async () => {
    setExistenceProbe(true);
    const f = vi.fn(async (_u: string, init?: RequestInit) => (init?.method === 'HEAD'
      ? ({ status: 405, ok: false } as unknown as Response)
      : new Response(JSON.stringify({ schema_version: 'edge_finder.app.v1' }), { status: 200 })));
    vi.stubGlobal('fetch', f);
    await documentExists('https://x.test/d.json');
    expect(f.mock.calls.map((c) => (c[1] as RequestInit | undefined)?.method ?? 'GET')).toEqual(['HEAD', 'GET']);
  });

  it('where the reader is swapped (tests, the disk reader) the probe is a read through it, whatever the flag says', async () => {
    setExistenceProbe(true);
    const read = vi.fn(async () => ({ schema_version: 'edge_finder.app.v1' }));
    setFetchJson(read);
    expect(existenceProbeIsLight()).toBe(false);
    await documentExists('https://x.test/c.json');
    expect(read).toHaveBeenCalledWith('https://x.test/c.json');
  });
});

describe('early start addresses', () => {
  it('knows a SIFT 3.0 address from its hash, ignoring the query', () => {
    expect(v3PathOf('#/v3')).toBe('/v3');
    expect(v3PathOf('#/v3/')).toBe('/v3');
    expect(v3PathOf('#/v3?demo=1')).toBe('/v3');
    expect(v3PathOf('#/v3/games?sport=nfl&state=upcoming')).toBe('/v3/games');
    expect(v3PathOf('#/v3/search?focus=1')).toBe('/v3/search');
    expect(v3PathOf('#/v3/game/nfl/evt_x?tab=props')).toBe('/v3/game/nfl/evt_x');
    expect(v3PathOf('#/v3/player/nfl/prt_x')).toBe('/v3/player/nfl/prt_x');
  });
  it('leaves every other address alone', () => {
    for (const h of ['', '#', '#/', '#/nfl', '#/v4', '#/v4/props', '#/v30', '#/nfl/v3', '#/sift2']) expect(v3PathOf(h)).toBeNull();
  });
});
