import { describe, expect, it } from 'vitest';
import { canonicalRoute, decode, encode, migrateQuery } from '../../src/v3/state/url';
import { gameSchema, playerSchema, propsSchema, statSchema, teamSchema } from '../../src/v3/nav/schemas';

describe('versioned URL state', () => {
  it('omits defaults and writes nothing at all for the default state', () => {
    expect(encode(playerSchema, {})).toBe('');
    expect(encode(playerSchema, { win: 'L10', tab: 'overview', site: 'any' })).toBe('');
  });
  it('writes the version first, then fields in declaration order, regardless of input order', () => {
    const a = encode(playerSchema, { win: 'L5', line: 6.5, site: 'away', stat: 'rec' });
    const b = encode(playerSchema, { stat: 'rec', site: 'away', line: 6.5, win: 'L5' });
    expect(a).toBe(b);
    expect(a).toBe('?v=2&stat=rec&line=6.5&win=L5&site=away');
  });
  it('round-trips every field type', () => {
    const s = { tab: 'matchup', stat: 'rec', line: 6, win: 'H2H', site: 'away', opp: 'PHI', tier: 'top', rest: 'short', script: 'close', role: 'snaps', min: 28, res: 'over', obs: 'g12', view: 'replay', rmode: 'h2h' } as const;
    expect(decode(playerSchema, encode(playerSchema, s))).toEqual(s);
    const p = { sport: 'nhl', fam: 'goals', cmp: ['a', 'b'], hide: false, more: 3, model: true };
    expect(decode(propsSchema, encode(propsSchema, p))).toMatchObject({ ...p, cmp: ['a', 'b'] });
  });
  it('never throws on a hostile address and falls back to defaults field by field', () => {
    const d = decode(playerSchema, '?v=2&win=NOPE&line=abc&min=9999&site=away&tab=%00&obs=');
    expect(d.win).toBe('L10');
    expect(d.line).toBeNull();
    expect(d.min).toBeNull();
    expect(d.site).toBe('away');
    expect(d.tab).toBe('overview');
    expect(d.obs).toBeNull();
    expect(() => decode(statSchema, '?%E0%A4%A&&=&v=-1&v=x')).not.toThrow();
  });
  it('bounds typed text and lists so an address cannot carry an unbounded payload', () => {
    expect(decode(propsSchema, `?q=${'x'.repeat(500)}`).q).toHaveLength(60);
    expect(decode(propsSchema, `?cmp=${'a,'.repeat(40)}`).cmp).toHaveLength(4);
  });
  it('keeps parameters the schema does not own, in a stable order', () => {
    expect(encode(playerSchema, { win: 'L5' }, '?zeta=1&sheet=contract&tk=KX-1&alpha=2')).toBe('?v=2&win=L5&alpha=2&sheet=contract&tk=KX-1&zeta=1');
    expect(encode(playerSchema, {}, '?sheet=contract&tk=KX-1')).toBe('?sheet=contract&tk=KX-1');
  });
  it('treats parameters without a version as the pre-versioning vocabulary and migrates them', () => {
    expect(migrateQuery(statSchema, '?tab=rankings&team=DAL').from).toBe(0);
    const d = decode(statSchema, '?tab=rankings&team=DAL');
    expect(d.tab).toBe('ranking');
    expect(d.sel).toBe('DAL');
    expect(decode(statSchema, '?tab=trends').tab).toBe('trend');
    expect(decode(teamSchema, '?tab=roster').tab).toBe('players');
    expect(decode(teamSchema, '?tab=injuries').tab).toBe('players');
    expect(decode(gameSchema, '?tab=main').tab).toBe('overview');
    expect(decode(gameSchema, '?tab=matchup').tab).toBe('matchup');
  });
  it('an empty address is the current version, not a legacy one', () => {
    expect(migrateQuery(statSchema, '').from).toBe(statSchema.version);
  });
  it('does not run legacy migrations on a current-version address', () => {
    // "team" in a v1 address is not a statistic parameter; it must not be promoted to "sel".
    expect(decode(statSchema, '?v=1&team=DAL').sel).toBeNull();
  });
  it('reads an address from a newer build best-effort without downgrading its tokens', () => {
    const m = migrateQuery(statSchema, '?v=9&tab=ranking');
    expect(m.future).toBe(true);
    expect(decode(statSchema, '?v=9&tab=ranking').tab).toBe('ranking');
  });
  it('canonicalises a whole route (legacy vocabulary in, current vocabulary out) and leaves unknown screens alone', () => {
    expect(canonicalRoute('/v3/stat/nfl/adj_off_epa?tab=rankings&team=DAL')).toBe('/v3/stat/nfl/adj_off_epa?v=1&sel=DAL');
    expect(canonicalRoute('/v3/player/nfl/p1?stat=rec&win=L5')).toBe('/v3/player/nfl/p1?v=2&stat=rec&win=L5');
    expect(canonicalRoute('/v3/player/nfl/p1?win=L10')).toBe('/v3/player/nfl/p1');
    expect(canonicalRoute('/v3/explore?q=x')).toBe('/v3/explore?q=x');
    expect(canonicalRoute('/v3/stat/nfl/x?v=1&sel=DAL')).toBe('/v3/stat/nfl/x?v=1&sel=DAL');
  });
  it('is idempotent', () => {
    const once = canonicalRoute('/v3/team/nfl/DAL?tab=roster&adj=0');
    expect(canonicalRoute(once)).toBe(once);
  });
});
