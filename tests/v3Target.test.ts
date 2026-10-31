import { describe, expect, it } from 'vitest';
import { v3Target } from '../src/lib/v3Target';

describe('v3Target (classic address -> SIFT 3.0)', () => {
  it('root and games open Home', () => { expect(v3Target('/', '')).toBe('/v3'); expect(v3Target('/games', '')).toBe('/v3'); });
  it('keeps the query of Home, props and search', () => {
    expect(v3Target('/games', '?sport=nfl')).toBe('/v3?sport=nfl');
    expect(v3Target('/props', '?sport=mlb')).toBe('/v3/props?sport=mlb');
    expect(v3Target('/explore', '?q=eagles')).toBe('/v3/search?q=eagles');
  });
  it('maps sport game, team and player pages to the v3 routes (sport first)', () => {
    expect(v3Target('/nfl/game/evt_1', '')).toBe('/v3/game/nfl/evt_1');
    expect(v3Target('/cfb/team/ALA', '')).toBe('/v3/team/cfb/ALA');
    expect(v3Target('/nba/player/p1', '')).toBe('/v3/player/nba/p1');
    expect(v3Target('/nfl/props', '')).toBe('/v3/props');
  });
  it('a sport home opens Home on that sport; anything else opens Home', () => {
    expect(v3Target('/mlb', '')).toBe('/v3?sport=mlb');
    expect(v3Target('/status', '')).toBe('/v3');
    expect(v3Target('/zz-not-a-sport/x/y', '')).toBe('/v3');
  });
});
