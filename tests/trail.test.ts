// The research path resets at its roots: the global Home clears it, a sport home restarts it. It never
// claims a context the screen does not have: a player or market sits under its own game.
import { describe, expect, it } from 'vitest';
import { nextTrail, type TrailStep } from '../src/state/trail';

const s = (href: string, label: string, kind: TrailStep['kind']): TrailStep => ({ href, label, kind });

describe('research path', () => {
  const deep = [s('/nfl', 'NFL', 'sport'), s('/nfl/game/e1', 'NE @ BUF', 'game'), s('/nfl/player/p1', 'Josh Allen', 'player'), s('/nfl/market/m1?event=e1', 'Allen 250+', 'market')];

  it('appends deeper screens', () => {
    expect(deep.reduce((acc, x) => nextTrail(acc, x), [] as TrailStep[]).map((x) => x.label)).toEqual(['NFL', 'NE @ BUF', 'Josh Allen', 'Allen 250+']);
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

  const nfl = s('/nfl', 'NFL', 'sport');
  const nebuf = s('/nfl/game/e1', 'NE @ BUF', 'game');
  const atlno = s('/nfl/game/e2', 'ATL @ NO', 'game');
  const bijan = s('/nfl/player/p2', 'Bijan Robinson', 'player');
  const allen = s('/nfl/player/p1', 'Josh Allen', 'player');
  const labels = (t: TrailStep[]) => t.map((x) => x.label);

  it('a player opened while another game is in the path sits under his own game', () => {
    expect(labels(nextTrail([nfl, nebuf], bijan, atlno))).toEqual(['NFL', 'ATL @ NO', 'Bijan Robinson']);
  });

  it('a player opened from his own game (any tab) keeps that path', () => {
    const fromProps = s('/nfl/game/e2?tab=props', 'ATL @ NO', 'game');
    expect(nextTrail([nfl, fromProps], bijan, atlno).map((x) => x.href)).toEqual(['/nfl', '/nfl/game/e2?tab=props', '/nfl/player/p2']);
  });

  it('a direct link (or a refresh with an unrelated path) shows the player under his game', () => {
    expect(labels(nextTrail([], bijan, atlno))).toEqual(['ATL @ NO', 'Bijan Robinson']);
    expect(labels(nextTrail([nfl, nebuf, allen], bijan, atlno))).toEqual(['NFL', 'ATL @ NO', 'Bijan Robinson']);
  });

  it('players from different games, one after another, each show their own game', () => {
    let t = nextTrail([nfl, atlno], bijan, atlno);
    t = nextTrail(t, allen, nebuf);
    expect(labels(t)).toEqual(['NFL', 'NE @ BUF', 'Josh Allen']);
    t = nextTrail(t, bijan, atlno);
    expect(labels(t)).toEqual(['NFL', 'ATL @ NO', 'Bijan Robinson']);
  });

  it('opening a game replaces any other game, so back/forward never leaks context', () => {
    const t = nextTrail([nfl, atlno, bijan], nebuf);
    expect(labels(t)).toEqual(['NFL', 'NE @ BUF']);
    expect(labels(nextTrail(t, bijan, atlno))).toEqual(['NFL', 'ATL @ NO', 'Bijan Robinson']);
  });

  it('a market under the same game extends the path', () => {
    const m = s('/nfl/market/m2?event=e2', 'Bijan Robinson over 89.5 rushing yards', 'market');
    expect(labels(nextTrail([nfl, atlno, bijan], m, atlno))).toEqual(['NFL', 'ATL @ NO', 'Bijan Robinson', 'Bijan Robinson over 89.5 rushing yards']);
  });
});

