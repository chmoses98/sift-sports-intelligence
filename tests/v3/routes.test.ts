import { describe, expect, it } from 'vitest';
import { routes, sheetOf, withSheet } from '../../src/v3/nav/routes';
import { CAPABILITIES, capability, isCurrent, lockedReason, sportsWith } from '../../src/v3/model/capabilities';

describe('route builders: one destination per object', () => {
  it('builds the canonical address for each semantic target', () => {
    expect(routes.team({ slug: 'nfl', id: 'DAL' })).toBe('/v3/team/nfl/DAL');
    expect(routes.team({ slug: 'nfl', id: 'DAL' }, { tab: 'schedule' })).toBe('/v3/team/nfl/DAL?v=1&tab=schedule');
    expect(routes.player({ slug: 'nfl', id: 'a b' }, { stat: 'rec', line: 6 })).toBe('/v3/player/nfl/a%20b?v=2&stat=rec&line=6');
    expect(routes.stat({ slug: 'nfl', statId: 'adj_off_epa' }, { sel: 'DAL', opp: 'PHI', win: 'ADJ_RIDGE' })).toBe('/v3/stat/nfl/adj_off_epa?v=1&win=ADJ_RIDGE&sel=DAL&opp=PHI');
    expect(routes.game({ slug: 'nfl', eventId: 'KXNFLGAME-26OCT26DALPHI' }, { tab: 'matchup' })).toBe('/v3/game/nfl/KXNFLGAME-26OCT26DALPHI?v=1&tab=matchup');
    expect(routes.props({ team: 'DAL' })).toBe('/v3/props?v=1&team=DAL');
    expect(routes.props()).toBe('/v3/props');
  });
  it('opens and closes a sheet on top of an address without disturbing the screen state', () => {
    const s = withSheet('?v=2&win=L5', { kind: 'contract', tk: 'KX-1' });
    expect(s).toBe('?v=2&win=L5&sheet=contract&tk=KX-1');
    expect(sheetOf(s)).toEqual({ kind: 'contract', tk: 'KX-1' });
    expect(withSheet(s, null)).toBe('?v=2&win=L5');
    expect(sheetOf('?v=1')).toBeNull();
  });
});

describe('sport capabilities', () => {
  it('declares NFL and NHL ready for the first release and keeps MLB team research off', () => {
    expect(capability('nfl', 'teamPlayers').status).toBe('ready');
    expect(capability('nhl', 'teamOverview').status).toBe('ready');
    expect(capability('nhl', 'teamForm').status).toBe('ready');
    expect(capability('nhl', 'teamSchedule').status).toBe('gated');
    expect(capability('mlb', 'teamOverview').status).toBe('gated');
    expect(lockedReason('mlb', 'teamForm')).toMatch(/late August/);
    expect(lockedReason('nfl', 'ranking')).toBeNull();
  });
  it('never claims an unknown sport publishes something', () => {
    expect(capability('curling', 'ranking').status).toBe('none');
    expect(sportsWith('teamOverview')).toEqual(['nfl', 'nhl']);
  });
  it('every gated or missing section carries a reason the viewer can read', () => {
    for (const c of Object.values(CAPABILITIES)) for (const a of Object.values(c.sections)) if (a.status !== 'ready') expect(a.reason.length).toBeGreaterThan(10);
  });
  it('currentness is never assumed', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(isCurrent('2026-10-25T12:00:00Z', 2, now)).toBe(true);
    expect(isCurrent('2026-08-28T12:00:00Z', 30, now)).toBe(false);
    expect(isCurrent(null, 30, now)).toBe(false);
    expect(isCurrent('not a date', 30, now)).toBe(false);
  });
});
