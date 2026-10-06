// The research path resets at its roots: the global Home clears it, a sport home restarts it.
import { describe, expect, it } from 'vitest';
import { nextTrail, type TrailStep } from '../src/state/trail';

const s = (href: string, label: string, kind: TrailStep['kind']): TrailStep => ({ href, label, kind });

describe('research path', () => {
  const deep = [s('/nfl', 'NFL', 'sport'), s('/nfl/game/e1', 'NE @ BUF', 'game'), s('/nfl/player/p1', 'Josh Allen', 'player'), s('/nfl/market/m1?event=e1', 'Allen 250+', 'market')];

  it('appends deeper screens', () => {
    expect(deep.reduce(nextTrail, [] as TrailStep[]).map((x) => x.label)).toEqual(['NFL', 'NE @ BUF', 'Josh Allen', 'Allen 250+']);
  });

  it('restarts at the sport home', () => {
    const after = nextTrail(deep, s('/nfl', 'NFL', 'sport'));
    expect(after).toEqual([s('/nfl', 'NFL', 'sport')]);
  });

  it('clears at the global Home', () => {
    expect(nextTrail(deep, s('/', 'Home', 'home'))).toEqual([]);
  });

  it('a tab change on the same game replaces its step', () => {
    const t = nextTrail(deep.slice(0, 2), s('/nfl/game/e1?tab=script', 'NE @ BUF', 'game'));
    expect(t.map((x) => x.href)).toEqual(['/nfl', '/nfl/game/e1?tab=script']);
  });
});
