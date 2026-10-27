// Team Research state in the address, the sample profile, and the route builders its targets use.
import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../src/v3/state/url';
import { teamSchema } from '../../src/v3/nav/schemas';
import { routes } from '../../src/v3/nav/routes';
import { reviveSaved } from '../../src/v3/model/saved';
import { identityOf, profileOf, completedGames, upcomingOf, extremesOf } from '../../src/v3/model/teamResearch';
import { sampleLookup, sampleProfile } from '../../src/v3/model/teamSample';
import { teamSport } from '../../src/v3/model/teamSports';

describe('team address state', () => {
  it('round-trips tab, basis, window, expanded rows and the show-all flag; defaults are omitted', () => {
    const q = encode(teamSchema, { tab: 'profile', adj: false, win: 'L6', all: true, exp: ['av', 'ol'] });
    const s = decode(teamSchema, q);
    expect(s).toMatchObject({ tab: 'profile', adj: false, win: 'L6', all: true, exp: ['av', 'ol'] });
    expect(encode(teamSchema, {})).toBe('');
  });
  it('migrates the legacy tab names and ignores unknown values', () => {
    expect(decode(teamSchema, '?tab=roster').tab).toBe('players');
    expect(decode(teamSchema, '?tab=injuries').tab).toBe('players');
    expect(decode(teamSchema, '?tab=stats').tab).toBe('profile');
    expect(decode(teamSchema, '?v=1&tab=nonsense&adj=maybe').tab).toBe('overview');
    expect(decode(teamSchema, '?v=1&adj=maybe').adj).toBe(true);
  });
  it('builds the team, statistic, game, player and props addresses with the route builders', () => {
    expect(routes.team({ slug: 'nfl', id: 'DAL' }, { tab: 'form' })).toBe('/v3/team/nfl/DAL?v=1&tab=form');
    expect(routes.stat({ slug: 'nfl', statId: 'rnk_abc' }, { sel: 'DAL', win: 'ADJ_RIDGE' })).toMatch(/^\/v3\/stat\/nfl\/rnk_abc\?.*sel=DAL/);
    expect(routes.props({ team: 'DAL', sport: 'nfl' })).toMatch(/^\/v3\/props\?.*team=DAL/);
    expect(routes.props({ player: 'prt_1', sport: 'nfl' })).toMatch(/player=prt_1/);
  });
  it('a saved team route reopens at the same state', () => {
    const route = routes.team({ slug: 'nfl', id: 'DAL' }, { tab: 'profile', adj: false, win: 'L34' });
    const saved = reviveSaved({ route, title: 'Dallas Cowboys' })!;
    expect(saved.kind).toBe('team');
    expect(decode(teamSchema, saved.route.split('?')[1] ? `?${saved.route.split('?')[1]}` : '')).toMatchObject({ tab: 'profile', adj: false, win: 'L34' });
  });
});

describe('sample profile (?demo=1)', () => {
  const pool = [{ id: 'PHI', name: 'Philadelphia Eagles' }, { id: 'NYG', name: 'New York Giants' }, { id: 'WAS', name: 'Washington Commanders' }, { id: 'KC', name: 'Kansas City Chiefs' }];
  const now = Date.parse('2026-10-26T20:00:00Z');
  const up = [1, 2, 3].map((i) => ({ eventId: `sample-u${i}`, startUtc: new Date(now + i * 7 * 86_400_000).toISOString(), oppCode: pool[i].id, oppName: pool[i].name, home: i % 2 === 0 }));
  const p = sampleProfile('nfl', 'DAL', 'Dallas Cowboys', pool, up, now)!;
  const look = sampleLookup('nfl');
  it('is deterministic and feeds the same view-models as real data', () => {
    const q = sampleProfile('nfl', 'DAL', 'Dallas Cowboys', pool, up, now)!;
    expect([...p.metrics.entries()].map(([k, m]) => [k, m.windows.SEASON?.rank])).toEqual([...q.metrics.entries()].map(([k, m]) => [k, m.windows.SEASON?.rank]));
    expect(identityOf('nfl', p, { adj: true, win: null }, look)?.rows).toHaveLength(4);
    expect(identityOf('nfl', p, { adj: false, win: null }, look)?.rows).toHaveLength(4);
    expect(profileOf('nfl', p, { adj: false, win: 'L6', all: true }, look)?.groups.length).toBeGreaterThan(1);
    expect(extremesOf('nfl', p, 'SEASON', look)?.best).toHaveLength(3);
    expect(completedGames('nfl', p, (id) => id)).toHaveLength(12);
    expect(upcomingOf(p, [], (id) => id, now, 6).map((u) => u.oppCode)).toEqual(['NYG', 'WAS', 'KC']);
  });
  it('every sample ranking id is a sample id the demo Stat Detail understands', () => {
    for (const m of p.metrics.values()) for (const w of Object.values(m.windows)) expect(w.rankingId).toMatch(/^sample-[0-5]$/);
  });
  it('hockey sample has no adjusted set and no profile declaration (the tab is gated)', () => {
    expect(teamSport('nhl')?.profile).toBeUndefined();
    const h = sampleProfile('nhl', 'TOR', 'Toronto Maple Leafs', [{ id: 'CGY', name: 'Calgary Flames' }], [], now)!;
    expect(identityOf('nhl', h, { adj: true, win: null }, sampleLookup('nhl'))?.rows.length).toBeGreaterThan(0);
  });
});
