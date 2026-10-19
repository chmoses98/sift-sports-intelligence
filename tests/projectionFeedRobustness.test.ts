// A malformed or invalid projection feed never crashes SIFT and never produces a number: it is read as "no feed" (the approved
// fallback or a withheld reason), and a row with an invalid value is withheld on its own. Regression for the MLB feed published on
// 2026-10-19 with bare NaN tokens (invalid JSON), which browsers' JSON.parse rejects.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAuthority } from '../src/data/projections';
import { setFetchJson } from '../src/data/fetcher';
import { decodeProjections } from '../src/lib/projections';
import { makeAuthority } from '../src/lib/projectionAuthority';
import { decoded, feed, mlbPitcher, NOW, nflPlayer } from './support/projectionFeed';

const Q = { stat: 'pitcher_strikeouts', playerId: '607192', name: 'Tyler Glasnow', team: 'LAD', opponent: 'ATL' };
const validBody = (over: Record<string, unknown> = {}) => JSON.stringify(feed('MLB', [mlbPitcher(over)], { pitcher_strikeouts: {} }));

function serve(body: string, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'application/json' } })));
}

beforeEach(() => setFetchJson(null));          // the real fetcher, over a stubbed network
afterEach(() => { vi.unstubAllGlobals(); setFetchJson(null); });

describe('malformed feed text is read as "no feed", never as a crash or a number', () => {
  const bodies: [string, string][] = [
    ['bare NaN (the 2026-10-19 publication)', validBody().replace('"mean":7.4', '"mean":NaN')],
    ['NaN in an optional descriptor', validBody({ opponent_adjustment: '__NAN__' }).replace('"__NAN__"', '{"factor":NaN,"sample_games":null}')],
    ['Infinity', validBody().replace('"mean":7.4', '"mean":Infinity')],
    ['-Infinity', validBody().replace('"p10":4', '"p10":-Infinity')],
    ['truncated', validBody().slice(0, 120)],
    ['empty body', ''],
    ['an HTML error page', '<!doctype html><title>Bad gateway</title>'],
    ['JSON null', 'null'],
    ['a JSON array', '[]'],
    ['a string', '"hello"'],
  ];
  for (const [label, body] of bodies) {
    it(`${label}: feed unavailable, nothing shown`, async () => {
      serve(body);
      const authority = await loadAuthority('MLB', NOW);
      expect(authority).not.toBeNull();
      const r = authority!.resolve(Q);
      expect(r.kind).toBe('withheld');
      if (r.kind === 'withheld') expect(r.code).toBe('FEED_UNAVAILABLE');
    });
  }
  it('an HTTP error is also "no feed"', async () => {
    serve('{"message":"Not Found"}', 404);
    const r = (await loadAuthority('MLB', NOW))!.resolve(Q);
    expect(r.kind === 'withheld' && r.code).toBe('FEED_UNAVAILABLE');
  });
  it('the same feed with the missing descriptor as strict-JSON null is read normally and gives the promoted number', async () => {
    serve(validBody({ opponent_adjustment: { factor: null, sample_games: null } }));
    const r = (await loadAuthority('MLB', NOW))!.resolve(Q);
    expect(r.kind).toBe('authoritative');
    if (r.kind === 'authoritative') { expect(r.value.mean).toBe(7.4); expect(r.value.opponentFactor).toBeNull(); }
  });
});

describe('rows with invalid values are withheld on their own', () => {
  const resolveWith = (over: Record<string, unknown>) => makeAuthority('MLB', decoded('MLB', [mlbPitcher(over)], { pitcher_strikeouts: {} }), NOW).resolve(Q);
  it('a non-finite mean is dropped by the decoder (no row, so no number)', () => {
    for (const bad of [NaN, Infinity, -Infinity, null, undefined, '7.4', {}]) {
      const doc = decodeProjections(feed('MLB', [mlbPitcher({ mean: bad })], { pitcher_strikeouts: {} }));
      expect(doc!.players).toHaveLength(0);
    }
    const r = resolveWith({ mean: NaN });
    expect(r.kind === 'withheld' && r.code).toBe('NOT_PUBLISHED');   // no row, so the game is not published for him
  });
  it('missing required identifiers drop the row', () => {
    for (const k of ['player_id', 'family']) {
      const p = mlbPitcher(); delete (p as Record<string, unknown>)[k];
      expect(decodeProjections(feed('MLB', [p], { pitcher_strikeouts: {} }))!.players).toHaveLength(0);
    }
  });
  it('a negative mean or range is withheld as incoherent', () => {
    for (const over of [{ mean: -1 }, { p10: -2 }, { p90: -1, p10: -3 }, { median: -1 }]) {
      const r = resolveWith(over);
      expect(r.kind === 'withheld' && r.code).toBe('INCOHERENT');
    }
  });
  it('an inverted range, a non-finite threshold probability or an out-of-range one is withheld as incoherent', () => {
    for (const over of [{ p10: 12, p90: 4, mean: 8 }, { thresholds: { '5': NaN } }, { thresholds: { '5': 1.4 } }, { thresholds: { '5': 0.3, '7': 0.6 } }]) {
      const r = resolveWith(over);
      expect(r.kind === 'withheld' && r.code, JSON.stringify(over)).toBe('INCOHERENT');
    }
  });
  it('a missing or null optional descriptor does not matter; missing optional range fields still give a number without a range', () => {
    expect(resolveWith({ opponent_adjustment: null }).kind).toBe('authoritative');
    expect(resolveWith({ opponent_adjustment: { factor: null, sample_games: null } }).kind).toBe('authoritative');
    const r = resolveWith({ p10: null, p90: null, quantiles: null });
    expect(r.kind).toBe('authoritative');
    if (r.kind === 'authoritative') expect([r.value.p10, r.value.p90]).toEqual([null, null]);
  });
  it('an unparseable or missing data time is withheld as stale rather than shown as fresh', () => {
    for (const bad of ['not a date', '', null]) {
      const f = feed('MLB', [mlbPitcher({ data_asof_utc: bad })], { pitcher_strikeouts: {} });
      f.data_asof_utc = bad;
      const r = makeAuthority('MLB', decodeProjections(f), NOW).resolve(Q);
      expect(r.kind === 'withheld' && r.code, String(bad)).toBe('STALE');
    }
  });
  it('one bad row does not take the others with it', () => {
    const good = nflPlayer({ player_id: 'ok', name: 'Good Player', mean: 5.1 });
    const bad = nflPlayer({ player_id: 'bad', name: 'Bad Player', mean: NaN });
    const doc = decodeProjections(feed('NFL', [bad, good], { receptions: {} }))!;
    expect(doc.players.map((p) => p.playerId)).toEqual(['ok']);
  });
});
