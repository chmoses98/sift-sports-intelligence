// The research URL vocabulary, version 1: one schema per screen that carries durable state. A screen reads its state with
// `useRouteState(schema)`; every link to it is built with the route builders (routes.ts), so no screen hand-writes a query.
// Adding a field or a value is not a version change. Renaming or re-coding one is: add a migration from the old version.
import { defineSchema, f, registerSchema, VERSION_PARAM } from '../state/url';

/** The locked windows (P1): last 5, last 10, this season, games against the coming opponent, every logged game. */
export const WINDOWS_PLAYER = ['L5', 'L10', 'SEASON', 'H2H', 'ALL'] as const;
/** The locked tabs (the mockups' tab bar): Overview, Props, Matchup, Trends, Log. SIFT Replay is a deeper view inside Trends (`view=replay`). */
export const PLAYER_TABS = ['overview', 'props', 'matchup', 'trends', 'log'] as const;
export const TEAM_TABS = ['overview', 'profile', 'form', 'players', 'schedule'] as const;
export const STAT_TABS = ['ranking', 'trend', 'compare', 'about'] as const;
export const GAME_TABS = ['overview', 'script', 'matchup', 'props', 'stats'] as const;
export type GameTab = (typeof GAME_TABS)[number];

export const playerSchema = defineSchema({
  screen: 'player',
  version: 2,
  fields: {
    tab: f.oneOf(PLAYER_TABS, 'overview'),
    /** The statistic family ("rec", "pass_yds"…). Absent: the player's first listed prop. */
    stat: f.str(),
    /** The selected line. Absent: the listed market line, else a reference line. */
    line: f.num(),
    win: f.oneOf(WINDOWS_PLAYER, 'L10'),
    site: f.oneOf(['any', 'home', 'away'] as const, 'any'),
    /** Only games against this opponent ("vs PHI"). */
    opp: f.str(),
    /** Opponent tier by the opponent's CURRENT season rank for the opposing unit: top 10 or bottom 10 defense. */
    tier: f.oneOf(['any', 'top', 'bottom'] as const, 'any'),
    /** Days of rest: 6 or fewer, exactly 7, 8 or more. `normal` (7 or more) is the pre-lock value, kept so older links still open. */
    rest: f.oneOf(['any', 'short', 'week', 'long', 'normal'] as const, 'any'),
    /** Game script by the final margin: the team won, the team lost. `close` and `blowout` are the pre-lock values. */
    script: f.oneOf(['any', 'won', 'lost', 'close', 'blowout'] as const, 'any'),
    /** Role: snaps of 85% or more, target share of 25% or more. */
    role: f.oneOf(['any', 'snaps', 'share'] as const, 'any'),
    min: f.int(null, { min: 0, max: 60 }),
    res: f.oneOf(['any', 'over', 'under'] as const, 'any'),
    /** The selected observation (bar) key. */
    obs: f.str(),
    /** Trends: the trend itself, or SIFT Replay (comparable games, kept apart from any adjusted what-if). */
    view: f.oneOf(['main', 'replay'] as const, 'main'),
    /** Replay's comparison: similar games (same venue side) or head-to-head (the coming opponent). */
    rmode: f.oneOf(['similar', 'h2h'] as const, 'similar'),
    /** Log: every logged game instead of the first screenful. */
    more: f.bool(false),
  },
  migrations: {
    // Version 1 to 2: the tab bar is Overview, Props, Matchup, Trends, Log. The old Game log tab is Log; the old Replay tab is Trends with
    // its Replay view open (and keeps its own mode); any other tab value is unknown and opens Overview. The locked windows are L5, L10,
    // season, vs opponent and all (L20 is not offered: its nearest window is all).
    1: (q) => {
      const t = q.get('tab');
      if (t === 'replay') { q.set('tab', 'trends'); q.set('view', 'replay'); }
      if (t === 'replay' && q.get('win') === 'H2H') q.set('rmode', 'h2h');
      if (q.get('win') === 'L20') q.set('win', 'ALL');
      return q;
    },
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
    /** Ranking: every team shown (default: the leaders, the selected team and its neighbours, the next opponent). */
    all: f.bool(false),
    /** Expanded in place: About (full definition, every limit) or the player-comparison "why" note. */
    more: f.bool(false),
    sort: f.str(null, 24),
    scope: f.str(null, 24),
    /** Ranking: raw and opponent-adjusted shown as two separate cards, side by side (never one list). */
    sbs: f.bool(false),
    /** Trend: the cut of the series ("last" = latest games, or a season label such as "2025"). */
    st: f.str(null, 12),
    /** Player comparison: the statistic being compared (a game-log key). */
    cs: f.str(null, 24),
    /** Player comparison: the "N+" threshold line (observed frequency at or above it). */
    thr: f.int(null, { min: 0, max: 200 }),
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

export const PROPS_VIEWS = ['home', 'list', 'compare'] as const;
/** Prop Discovery horizons: games starting within 48 hours (default), within 7 days, or every upcoming game. */
export const PROPS_HORIZONS = ['48h', '7d', 'all'] as const;
export const PROPS_SORTS = ['soon', 'price', 'hist', 'model', 'match', 'vol'] as const;

/**
 * Prop Discovery (PD1 to PD6). One address holds everything: the home, the list and the comparison are `view`s of the same route, so
 * Back restores filters, sort, search, selections, the expanded row and the line exactly. A list address without `view` (a link from
 * Team Research, `routes.props({ team: 'DAL' })`) opens the list: any list-state field also implies `view=list`.
 * Adding a field or a value is not a version change.
 */
export const propsSchema = defineSchema({
  screen: 'props',
  version: 1,
  fields: {
    /** home (PD1), list (PD2 and PD3), compare (PD5). Absent with no other field: the home. */
    view: f.oneOf(PROPS_VIEWS, 'home'),
    /** A sport slug ("nfl"), or "all". */
    sport: f.str('all', 8),
    /** A statistic family ("receptions", "goals"). */
    fam: f.str(),
    /** soon (default), price, hist, model, match, vol. */
    sort: f.str(null, 16),
    /** Search text: replaced in place as it is typed, never a history entry per keystroke. */
    q: f.str(null, 60),
    /** Hide players the publication lists out or doubtful. */
    hide: f.bool(true),
    /** The expanded prop (PD3): its id, with `@k` when a rung other than the featured one is chosen. */
    exp: f.str(null, 80),
    /** Compare selection: up to three props (`id` or `id@k`). */
    cmp: f.list([], 3),
    /** Compare mode on: the avatars become tick boxes. */
    cmpm: f.bool(false),
    /** A team code, with `sport` when the code is ambiguous across sports ("DAL"). */
    team: f.str(),
    /** A published player id. */
    player: f.str(),
    /** A published game (event) id. */
    game: f.str(),
    /** A shelf's filter: model (SIFT model published) or bottom3 (facing a bottom-3 defense). */
    preset: f.str(null, 16),
    /** The rung's price range in cents, "35-75". */
    range: f.str(null, 16),
    /** History at the rung: at least this many hits in the window. */
    hmin: f.int(null, { min: 0, max: 20 }),
    /** The history window the threshold counts: L10 (default) or L5. */
    hwin: f.oneOf(['L10', 'L5'] as const, 'L10'),
    /** Opponent unit rank: bottom10 or top10. */
    orank: f.str(null, 16),
    /** Only props with a published SIFT model estimate. */
    model: f.bool(false),
    /** Arrived from a shelf's lanes: the expanded prop is listed first. */
    pin: f.bool(false),
    /** Reserved (the list is windowed, not paged). */
    more: f.int(null, { min: 1, max: 50 }),
    /** Discovery horizon: games starting within 48 hours (default), 7 days, or every upcoming game. Home, list and compare read it. */
    hz: f.oneOf(PROPS_HORIZONS, '48h'),
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
