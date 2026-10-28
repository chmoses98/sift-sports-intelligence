// Mobile-performance seams (docs/sift3/IMPLEMENTATION_STATUS.md "Hardening: mobile performance"): each is behaviour-preserving, and each is pinned here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentExists, existenceProbeIsLight, NotFoundError, setExistenceProbe, setFetchJson, setFetchTimeout } from '../../src/data/fetcher';
import { v3PathOf } from '../../src/v3/data/early';
import { pickFeatured, stripGames, followsTeamOf } from '../../src/v3/model/feature';
import type { V3Game, V3Team } from '../../src/v3/model/types';

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
    expect(v3PathOf('#/v3/game/nfl/evt_x?tab=props')).toBe('/v3/game/nfl/evt_x');
    expect(v3PathOf('#/v3/player/nfl/prt_x')).toBe('/v3/player/nfl/prt_x');
  });
  it('leaves every other address alone', () => {
    for (const h of ['', '#', '#/', '#/nfl', '#/v4', '#/v4/props', '#/v30', '#/nfl/v3', '#/sift2']) expect(v3PathOf(h)).toBeNull();
  });
});

// ---- the featured game and the strip: one pass with each tier computed once, the same answer as sorting every game
const team = (id: string, logo: string | null = '/l.png'): V3Team => ({ id, slug: 'nfl', sport: 'NFL', name: id, nick: id, abbr: id, logo, colors: ['#000', '#fff'] });
const SPORTS = ['NFL', 'CFB', 'NBA', 'NHL', 'MLB', 'CBB', 'SOCCER', 'TENNIS'];
const PHASES = ['pregame', 'live', 'final', 'other'] as const;
const NOW = Date.parse('2026-10-25T15:00:00Z');
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

function make(n: number, r: () => number): V3Game[] {
  return Array.from({ length: n }, (_, i) => {
    const sport = SPORTS[Math.floor(r() * SPORTS.length)];
    const phase = PHASES[Math.floor(r() * PHASES.length)];
    const away = `A${Math.floor(r() * 40)}`, home = `H${Math.floor(r() * 40)}`;
    return {
      key: `${sport.toLowerCase()}:e${i}`, slug: sport.toLowerCase(), sport, eventId: `e${i}`, league: sport, phase,
      startMs: NOW + Math.floor((r() - 0.5) * 6) * 3600_000 * Math.floor(1 + r() * 20),
      network: null, away: team(away, r() < 0.1 ? null : '/l.png'), home: team(home, r() < 0.1 ? null : '/l.png'),
      score: phase === 'live' && r() < 0.6 ? { away: 1, home: 0, clock: 'Q1', source: 'score-feed', asOf: null } : null,
      lines: [], signals: Math.floor(r() * 4), provenance: 'publication', item: null as never,
    } as unknown as V3Game;
  });
}

/** The previous implementation, kept here as the reference. */
const PREF = ['NFL', 'CFB', 'NBA', 'NHL', 'MLB', 'CBB', 'SOCCER', 'TENNIS'];
const prefOf = (g: V3Game) => { const i = PREF.indexOf(g.sport); return i < 0 ? 99 : i; };
const hasId = (g: V3Game) => !!(g.away.logo && g.home.logo);
function tierRef(g: V3Game, f: { teams: string[]; games: string[] }, now: number): number {
  const fol = followsTeamOf(g, f);
  const soon = g.phase === 'pregame' && g.startMs > now - 3600_000;
  let t: number;
  if (g.phase === 'live' && g.score != null) t = fol ? 0 : 1;
  else if (fol && (soon || g.phase === 'live')) t = 2;
  else if (soon && g.startMs - now < 24 * 3600_000) t = 3;
  else if (g.phase === 'live') t = 4;
  else if (soon) t = 5;
  else if (g.phase === 'final') t = 6;
  else t = 7;
  return t + (hasId(g) ? 0 : 10);
}
const pickRef = (games: V3Game[], f: { teams: string[]; games: string[] }, now: number) => [...games].sort((a, b) => tierRef(a, f, now) - tierRef(b, f, now) || prefOf(a) - prefOf(b) || b.signals - a.signals
  || (a.phase === 'final' ? b.startMs - a.startMs : a.startMs - b.startMs) || a.key.localeCompare(b.key))[0] ?? null;
const stripRef = (games: V3Game[], f: { teams: string[]; games: string[] }, featured: V3Game | null, limit = 10) => {
  const rank = (g: V3Game) => (followsTeamOf(g, f) ? 0 : 8) + (hasId(g) ? 0 : 20) + (g.phase === 'live' ? (g.score != null ? 0 : 2) : g.phase === 'pregame' ? 1 : 3);
  return games.filter((g) => g.key !== featured?.key && g.phase !== 'other').sort((a, b) => rank(a) - rank(b) || a.startMs - b.startMs).slice(0, limit);
};

describe('featured game and strip: the single-pass versions answer exactly as the sorted ones did', () => {
  it('on 300 random slates, with and without follows', () => {
    const r = rng(7);
    for (let k = 0; k < 300; k++) {
      const games = make(1 + Math.floor(r() * 120), r);
      const follows = r() < 0.5 ? { teams: [], games: [] } : { teams: [`nfl:A${Math.floor(r() * 40)}`, `cfb:H${Math.floor(r() * 40)}`], games: games.length > 3 ? [games[2].key] : [] };
      const got = pickFeatured(games, follows, NOW);
      expect(got?.key).toBe(pickRef(games, follows, NOW)?.key);
      expect(stripGames(games, follows, got).map((g) => g.key)).toEqual(stripRef(games, follows, got).map((g) => g.key));
    }
  });
  it('no games, no featured game; a game without both teams is never featured', () => {
    expect(pickFeatured([], { teams: [], games: [] }, NOW)).toBeNull();
    const g = make(1, rng(3))[0];
    expect(pickFeatured([{ ...g, away: undefined as never }], { teams: [], games: [] }, NOW)).toBeNull();
  });
});
