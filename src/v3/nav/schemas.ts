// The research URL vocabulary, version 1: one schema per screen that carries durable state. A screen reads its state with
// `useRouteState(schema)`; every link to it is built with the route builders (routes.ts), so no screen hand-writes a query.
// Adding a field or a value is not a version change. Renaming or re-coding one is: add a migration from the old version.
import { defineSchema, f, registerSchema, VERSION_PARAM } from '../state/url';

export const WINDOWS_PLAYER = ['L5', 'L10', 'L20', 'SEASON', 'H2H'] as const;
export const PLAYER_TABS = ['overview', 'props', 'matchup', 'log', 'replay'] as const;
export const TEAM_TABS = ['overview', 'profile', 'form', 'players', 'schedule'] as const;
export const STAT_TABS = ['ranking', 'trend', 'compare', 'about'] as const;
export const GAME_TABS = ['overview', 'script', 'matchup', 'props', 'stats'] as const;

export const playerSchema = defineSchema({
  screen: 'player',
  version: 1,
  fields: {
    tab: f.oneOf(PLAYER_TABS, 'overview'),
    /** The statistic family ("rec", "pass_yds"…). Absent: the player's first listed prop. */
    stat: f.str(),
    /** The selected line. Absent: the listed market line, else a reference line. */
    line: f.num(),
    win: f.oneOf(WINDOWS_PLAYER, 'L10'),
    site: f.oneOf(['any', 'home', 'away'] as const, 'any'),
    opp: f.str(),
    rest: f.oneOf(['any', 'short', 'normal'] as const, 'any'),
    script: f.oneOf(['any', 'close', 'blowout'] as const, 'any'),
    min: f.int(null, { min: 0, max: 60 }),
    res: f.oneOf(['any', 'over', 'under'] as const, 'any'),
    /** The selected observation (bar) key. */
    obs: f.str(),
  },
});

export const teamSchema = defineSchema({
  screen: 'team',
  version: 1,
  fields: {
    tab: f.oneOf(TEAM_TABS, 'overview'),
    /** Opponent-adjusted (default) or raw statistics; the two are never mixed in one list. */
    adj: f.bool(true),
    win: f.str('SEASON', 16),
    /** Show every row of the tab's long list (Profile statistics, Form results). */
    all: f.bool(false),
    /** Expanded rows and disclosures on the tab ("av" availability list, "roster" all players, "ol" the offensive-line note). */
    exp: f.list([], 6),
  },
  migrations: {
    0: (q) => {
      const t = q.get('tab');
      if (t === 'roster' || t === 'injuries') q.set('tab', 'players');
      else if (t === 'stats') q.set('tab', 'profile');
      return q;
    },
  },
});

export const statSchema = defineSchema({
  screen: 'stat',
  version: 1,
  fields: {
    tab: f.oneOf(STAT_TABS, 'ranking'),
    win: f.str(),
    /** The highlighted entity (a team code, or a player id in player comparisons). */
    sel: f.str(),
    /** The next opponent (dashed outline). */
    opp: f.str(),
    obs: f.int(null, { min: 0, max: 400 }),
    cmpm: f.oneOf(['teams', 'players'] as const, 'teams'),
    a: f.str(),
    b: f.str(),
    all: f.bool(false),
    more: f.bool(false),
    sort: f.str(null, 24),
    scope: f.str(null, 24),
  },
  migrations: {
    0: (q) => {
      const t = q.get('tab');
      const map: Record<string, string> = { rankings: 'ranking', trends: 'trend', splits: 'ranking', matchups: 'ranking' };
      if (t && map[t]) q.set('tab', map[t]);
      const team = q.get('team');
      if (team && !q.has('sel')) q.set('sel', team);
      q.delete('team');
      return q;
    },
  },
});

export const gameSchema = defineSchema({
  screen: 'game',
  version: 1,
  fields: {
    tab: f.oneOf(GAME_TABS, 'overview'),
    /** Matchup direction (which team's offense leads). */
    dir: f.str(null, 8),
    lens: f.bool(false),
    unit: f.str(null, 24),
  },
  migrations: {
    0: (q) => {
      if (q.get('tab') === 'main') q.delete('tab');
      return q;
    },
  },
});

export const propsSchema = defineSchema({
  screen: 'props',
  version: 1,
  fields: {
    sport: f.str('all', 8),
    fam: f.str(),
    sort: f.str(null, 16),
    q: f.str(null, 60),
    hide: f.bool(true),
    exp: f.str(),
    cmp: f.list([], 4),
    team: f.str(),
    player: f.str(),
    game: f.str(),
    preset: f.str(null, 16),
    range: f.str(null, 16),
    hmin: f.int(null, { min: 0, max: 20 }),
    orank: f.str(null, 16),
    model: f.bool(false),
    more: f.int(null, { min: 1, max: 50 }),
  },
});

registerSchema(/^\/v3\/player\//, playerSchema);
registerSchema(/^\/v3\/team\//, teamSchema);
registerSchema(/^\/v3\/stat\//, statSchema);
registerSchema(/^\/v3\/game\//, gameSchema);
registerSchema(/^\/v3\/props(\/|$)/, propsSchema);

/** Parameters owned by the shell, not by a screen: an open sheet and the contract it shows. Kept out of scroll keys and saved research. */
export const SHELL_PARAMS = ['sheet', 'tk', 'demo'] as const;
export { VERSION_PARAM };
