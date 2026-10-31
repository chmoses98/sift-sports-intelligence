// What each sport publishes, and whether it is current. A section of a screen renders only when its sport supplies the data AND the
// data is current; otherwise the section is absent or a locked row names the reason. Screens ask `capability(slug, section)` and never
// compare sport names. A new sport adds a declaration here (and its documents), not new screens.
//
// This is a declaration of what the publications carry today, kept honest by tests: a section may be marked `ready` only if a real
// document feeds it. Gating that depends on a document being fresh (a cache that stops) is a `gated` entry with the reason, until the
// publication is current again and the declaration is changed in a reviewed change.

export type Section =
  | 'teamOverview' | 'teamProfile' | 'teamForm' | 'teamSchedule' | 'teamPlayers'
  | 'ranking' | 'statTrend' | 'statCompare'
  | 'playerResearch' | 'playerMatchup'
  | 'gameMatchup' | 'gameScript' | 'gameProps'
  /** The Overview's research layers other than matchup and scripts: a published model view, the pace and scoring environment, and starters, lineups, injuries or rotations. */
  | 'gameModel' | 'gameEnvironment' | 'gameAvailability'
  | 'propPrices';

export type Availability =
  | { status: 'ready' }
  /** Published but intentionally not shown, with the reason the viewer is told. */
  | { status: 'gated'; reason: string }
  /** The sport does not publish it. */
  | { status: 'none'; reason: string };

/**
 * Evidence about ONE game, read from its own research document. `scriptEngine`: the event's research carries the Script Engine payload
 * (`extensions.script_engine` with `script_generation`: src/lib/scriptEngine.ts `readEngine` decoded it). A section the declaration cannot promise for
 * every game of a sport (CFB's script and matchup views) is decided here, per game, from the data and never from a flag.
 */
export interface GameEvidence {
  scriptEngine?: boolean;
  /** The Overview research sections this game's own document fills (`GameIntel.present`, as capability sections): `gameCapability` opens a gated one for the game. */
  sections?: readonly Section[];
}

export interface SportCapabilities {
  slug: string;
  label: string;
  /** League record format: wins–losses (NFL), wins–losses–overtime losses (NHL), or wins–draws–losses (soccer). */
  record: 'wl' | 'wlo' | 'wdl';
  sections: Record<Section, Availability>;
}

const ready: Availability = { status: 'ready' };
const none = (reason: string): Availability => ({ status: 'none', reason });
const gated = (reason: string): Availability => ({ status: 'gated', reason });

const NOT_YET = 'Not part of the first release of this screen.';
const NHL_PROFILE = 'The statistic list has no hockey declaration yet: its opponent-adjusted switch is football’s, and hockey publishes its opponent-adjusted ratings under a different window.';
const NBA_STALE = 'NBA team profiles carry last season’s final statistics (through 14 June) and do not yet include 2026-27 games, so they are not shown as current.';
const CFB_OWNED = 'A college football game presents its projection and research through the Script Engine view.';
const NO_PLAYER_PROPS = 'Kalshi lists match markets for this sport, not player props, and the publication has no player layer.';
const NO_TEAM_DECL = 'The club profile publishes goals, points and both-teams-to-score rates, but the Team Research screens have no soccer declaration yet.';
const PER_GAME = 'Shown for a game only when that game\'s research carries a Script Engine payload; a game without one keeps the generic view.';
const PER_GAME_DOC = 'Shown for a game only when that game\'s own research document states it; a game whose document does not keeps its other sections and is told what the publication did not publish.';
const ALL_NONE = (reason: string): Record<Section, Availability> => ({
  teamOverview: none(reason), teamProfile: none(reason), teamForm: none(reason), teamSchedule: none(reason), teamPlayers: none(reason),
  ranking: none(reason), statTrend: none(reason), statCompare: none(reason),
  playerResearch: none(reason), playerMatchup: none(reason), gameMatchup: none(reason), gameScript: none(reason), gameProps: none(reason),
  gameModel: none(reason), gameEnvironment: none(reason), gameAvailability: none(reason), propPrices: none(reason),
});
/** The Overview's three research layers for a sport whose documents carry them game by game. */
const OVERVIEW_PER_GAME: Pick<Record<Section, Availability>, 'gameModel' | 'gameEnvironment' | 'gameAvailability'> = { gameModel: gated(PER_GAME_DOC), gameEnvironment: gated(PER_GAME_DOC), gameAvailability: gated(PER_GAME_DOC) };

export const CAPABILITIES: Record<string, SportCapabilities> = {
  nfl: {
    slug: 'nfl', label: 'NFL', record: 'wl',
    sections: {
      teamOverview: ready, teamProfile: ready, teamForm: ready, teamSchedule: ready, teamPlayers: ready,
      ranking: ready, statTrend: ready, statCompare: ready,
      playerResearch: ready, playerMatchup: ready, gameMatchup: ready, gameScript: ready, gameProps: ready, propPrices: ready,
      gameModel: ready, gameEnvironment: ready, gameAvailability: ready,
    },
  },
  nhl: {
    slug: 'nhl', label: 'NHL', record: 'wlo',
    sections: {
      // Overview, Form, Schedule and Players read the team document (season and last-10 goals and expected goals, 82 games, the roster and its designations; all current).
      // Profile stays gated: its opponent-adjusted switch is football's (the ADJ_RIDGE window) and hockey publishes its `oa_*` ratings under a different window.
      teamOverview: ready, teamProfile: gated(NHL_PROFILE), teamForm: ready, teamSchedule: ready, teamPlayers: ready,
      ranking: ready, statTrend: ready, statCompare: ready,
      playerResearch: ready, playerMatchup: none('No published opposing-unit rankings for hockey players yet.'), gameMatchup: gated(NOT_YET), gameScript: gated(NOT_YET), gameProps: ready, propPrices: ready,
      ...OVERVIEW_PER_GAME,
    },
  },
  mlb: {
    slug: 'mlb', label: 'MLB', record: 'wl',
    sections: {
      ...ALL_NONE('MLB publishes no current research for this.'),
      // Team profiles exist but the publication says they are a one-off cache that stops in late August: never shown as current.
      teamOverview: gated('MLB team profiles are a one-off cache that stopped in late August, so they are not shown as current.'),
      teamProfile: gated('MLB team profiles are a one-off cache that stopped in late August, so they are not shown as current.'),
      teamForm: gated('MLB team profiles are a one-off cache that stopped in late August, so they are not shown as current.'),
      teamSchedule: gated('MLB team profiles are a one-off cache that stopped in late August, so they are not shown as current.'),
      teamPlayers: gated('MLB team profiles are a one-off cache that stopped in late August, so they are not shown as current.'),
      // The league rankings, trends and comparisons are built from the same cache (docs/sift3/redesign/board-sd.html, "MLB is not shown as current").
      ranking: gated('MLB team statistics are a one-off cache that stopped in late August, so they are not shown as current.'),
      statTrend: gated('MLB team statistics are a one-off cache that stopped in late August, so they are not shown as current.'),
      statCompare: gated('MLB team statistics are a one-off cache that stopped in late August, so they are not shown as current.'),
      // Players: prices only, no game log.
      playerResearch: gated('MLB shows prices only; no player game log is published.'),
      gameProps: ready, propPrices: ready,
      // The slate document (event research) is a different publication from the team cache and is current daily; `readMlbSport` also checks its own data-as-of.
      ...OVERVIEW_PER_GAME,
    },
  },
  nba: {
    slug: 'nba', label: 'NBA', record: 'wl',
    sections: {
      ...ALL_NONE(NOT_YET), playerResearch: ready, gameProps: ready, propPrices: ready, ...OVERVIEW_PER_GAME,
      // Team pages: the publication's team profiles carry last season's final statistics (as of 14 June) and have not taken in 2026-27 games.
      teamOverview: gated(NBA_STALE), teamProfile: gated(NBA_STALE), teamForm: gated(NBA_STALE), teamSchedule: gated(NBA_STALE), teamPlayers: gated(NBA_STALE),
    },
  },
  // College football's game script and matchup come from the Script Engine payload (docs/CFB_SCRIPT_ENGINE.md). Not every game has one (the engine
  // abstains when it cannot match the teams), so these are gated here and `gameCapability` opens them per game from the data.
  cfb: {
    slug: 'cfb', label: 'CFB', record: 'wl',
    sections: {
      ...ALL_NONE(NOT_YET), gameMatchup: gated(PER_GAME), gameScript: gated(PER_GAME), propPrices: ready,
      gameModel: none(CFB_OWNED), gameEnvironment: none(CFB_OWNED), gameAvailability: none(CFB_OWNED),
    },
  },
  // College basketball: tempo and efficiency exist only once a game has been projected (the prospective capture window); rosters and rotation when the publisher has one.
  cbb: { slug: 'cbb', label: 'CBB', record: 'wl', sections: { ...ALL_NONE(NOT_YET), propPrices: ready, ...OVERVIEW_PER_GAME } },
  // Soccer and tennis: Kalshi lists match markets (the result, totals, handicaps, set markets), not player props, so the props and player sections stay `none`.
  // Their research reaches the Overview game by game from the fixture's own document; the Team Research screens have no soccer or tennis declaration yet.
  soccer: {
    slug: 'soccer', label: 'Soccer', record: 'wdl',
    sections: {
      ...ALL_NONE(NO_PLAYER_PROPS), ...OVERVIEW_PER_GAME,
      teamOverview: gated(NO_TEAM_DECL), teamProfile: gated(NO_TEAM_DECL), teamForm: gated(NO_TEAM_DECL), teamSchedule: gated(NO_TEAM_DECL), teamPlayers: none('The soccer publication has no player layer.'),
      gameScript: gated('Soccer’s six scripts are on the Overview, from the fixture’s script engine payload; a dedicated Game Script tab is not built for soccer.'),
    },
  },
  tennis: {
    slug: 'tennis', label: 'Tennis', record: 'wl',
    sections: {
      ...ALL_NONE(NO_PLAYER_PROPS), gameModel: gated(PER_GAME_DOC), gameAvailability: gated(PER_GAME_DOC),
      gameEnvironment: none('Tennis publishes no scoring or pace simulation for a match.'),
      gameScript: none('Tennis has no game scripts.'),
    },
  },
};

const UNKNOWN: Availability = none('This sport is not part of the research screens.');

export const capability = (slug: string, section: Section): Availability => CAPABILITIES[slug.toLowerCase()]?.sections[section] ?? UNKNOWN;
/** Sections a Script Engine payload feeds, for whichever sport's research carries one. */
export const SCRIPT_SECTIONS: readonly Section[] = ['gameScript', 'gameMatchup'];

/**
 * The availability of a section for ONE game: the declaration, except that the script sections are `ready` when this game's research carries the payload
 * that feeds them. A sport that already declares the section ready (NFL) keeps its own screen. Without the payload the declaration stands (its reason is the
 * one the viewer is told).
 */
export function gameCapability(slug: string, section: Section, evidence: GameEvidence = {}): Availability {
  const declared = capability(slug, section);
  if (declared.status === 'ready') return declared;
  if (evidence.scriptEngine && SCRIPT_SECTIONS.includes(section)) return ready;
  // A `gated` section opens for a game whose own document filled it; a `none` section never does (the sport does not publish it).
  if (declared.status === 'gated' && evidence.sections?.includes(section) && OVERVIEW_SECTIONS.includes(section)) return ready;
  return declared;
}
/** The Overview research layers whose availability is read from the game's own document. */
export const OVERVIEW_SECTIONS: readonly Section[] = ['gameModel', 'gameEnvironment', 'gameAvailability'];
export const isReady = (slug: string, section: Section) => capability(slug, section).status === 'ready';
/** The words a locked row or an absent-section note uses. Null when the section is ready. */
export const lockedReason = (slug: string, section: Section): string | null => {
  const c = capability(slug, section);
  return c.status === 'ready' ? null : c.reason;
};
/** Sports that can show a given section, in declaration order (the selectors of cross-sport screens list only these). */
export const sportsWith = (section: Section): string[] => Object.values(CAPABILITIES).filter((c) => c.sections[section].status === 'ready').map((c) => c.slug);

/** A publication is current when its as-of is within `maxDays`. Used by declarations that gate on freshness (never assumed). */
export function isCurrent(asOf: string | null | undefined, maxDays: number, now = Date.now()): boolean {
  const t = asOf ? Date.parse(asOf) : NaN;
  return Number.isFinite(t) && now - t <= maxDays * 86_400_000;
}
