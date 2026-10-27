// The Player Research address: the five locked tabs and the migrations that keep every older saved or shared route opening where it used to.
import { describe, expect, it } from 'vitest';
import { canonicalRoute, decode, encode, migrateQuery } from '../../src/v3/state/url';
import { PLAYER_TABS, playerSchema } from '../../src/v3/nav/schemas';
import { reviveSaved } from '../../src/v3/model/saved';

describe('player tabs', () => {
  it('are the locked five, in the mockup’s order', () => {
    expect([...PLAYER_TABS]).toEqual(['overview', 'props', 'matchup', 'trends', 'log']);
  });
});

describe('older player routes keep opening', () => {
  it('tab=replay (no version, or version 1) opens Replay inside Trends, and its mode survives', () => {
    for (const q of ['?tab=replay', '?v=1&tab=replay']) {
      const d = decode(playerSchema, q);
      expect([d.tab, d.view, d.rmode]).toEqual(['trends', 'replay', 'similar']);
    }
    const h2h = decode(playerSchema, '?v=1&tab=replay&win=H2H&stat=receptions&line=6.5');
    expect([h2h.tab, h2h.view, h2h.rmode, h2h.win, h2h.stat, h2h.line]).toEqual(['trends', 'replay', 'h2h', 'H2H', 'receptions', 6.5]);
  });
  it('tab=log (either old version) opens Log', () => {
    expect(decode(playerSchema, '?tab=log').tab).toBe('log');
    expect(decode(playerSchema, '?v=1&tab=log&win=L5').tab).toBe('log');
  });
  it('an unknown tab falls back to Overview, field by field, without losing the rest of the state', () => {
    for (const q of ['?v=2&tab=stats', '?v=1&tab=bogus&win=L5', '?tab=%00', '?v=2&tab=replay']) expect(decode(playerSchema, q).tab).toBe('overview');
    expect(decode(playerSchema, '?v=1&tab=bogus&win=L5&site=away')).toMatchObject({ win: 'L5', site: 'away' });
  });
  it('the retired L20 window becomes all games; the pre-lock filter values still decode', () => {
    expect(decode(playerSchema, '?v=1&win=L20').win).toBe('ALL');
    expect(decode(playerSchema, '?v=1&rest=normal&script=close').rest).toBe('normal');
    expect(decode(playerSchema, '?v=1&script=blowout').script).toBe('blowout');
  });
  it('every migrated route is written back in the current version, and is stable on the second pass', () => {
    const once = canonicalRoute('/v3/player/nfl/p1?tab=replay&win=H2H&stat=rec');
    expect(once).toBe('/v3/player/nfl/p1?v=2&tab=trends&stat=rec&win=H2H&view=replay&rmode=h2h');
    expect(canonicalRoute(once)).toBe(once);
    expect(migrateQuery(playerSchema, '?v=1&tab=replay').from).toBe(1);
    expect(migrateQuery(playerSchema, '?v=2&tab=trends').from).toBe(2);
  });
  it('a saved record whose route says tab=replay is revived into Trends with Replay open', () => {
    const r = reviveSaved({ id: 'r1', title: 'Lamb', subtitle: 'L10', route: '/v3/player/nfl/p1?v=1&tab=replay&stat=receptions', savedAt: 1 })!;
    expect(r.route).toBe('/v3/player/nfl/p1?v=2&tab=trends&stat=receptions&view=replay');
    expect(r.kind).toBe('player');
  });
});

describe('the address holds everything the viewer can change', () => {
  it('round-trips the research state, including the new tabs, the view and the log’s expansion', () => {
    const s = { tab: 'log', stat: 'receptions', line: 6.5, win: 'SEASON', site: 'away', tier: 'top', rest: 'week', script: 'won', role: 'share', min: 28, obs: 'g1', view: 'replay', rmode: 'h2h', more: true } as const;
    expect(decode(playerSchema, encode(playerSchema, s))).toMatchObject(s);
  });
  it('defaults are not written: the default Overview is an empty address', () => {
    expect(encode(playerSchema, { tab: 'overview', view: 'main', rmode: 'similar', more: false, tier: 'any', role: 'any' })).toBe('');
  });
});
