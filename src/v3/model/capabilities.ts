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
  | 'gameMatchup' | 'gameProps'
  | 'propPrices';

export type Availability =
  | { status: 'ready' }
  /** Published but intentionally not shown, with the reason the viewer is told. */
  | { status: 'gated'; reason: string }
  /** The sport does not publish it. */
  | { status: 'none'; reason: string };

export interface SportCapabilities {
  slug: string;
  label: string;
  /** League record format: wins–losses (NFL) or wins–losses–overtime losses (NHL). */
  record: 'wl' | 'wlo';
  sections: Record<Section, Availability>;
}

const ready: Availability = { status: 'ready' };
const none = (reason: string): Availability => ({ status: 'none', reason });
const gated = (reason: string): Availability => ({ status: 'gated', reason });

const NOT_YET = 'Not part of the first release of this screen.';
const ALL_NONE = (reason: string): Record<Section, Availability> => ({
  teamOverview: none(reason), teamProfile: none(reason), teamForm: none(reason), teamSchedule: none(reason), teamPlayers: none(reason),
  ranking: none(reason), statTrend: none(reason), statCompare: none(reason),
  playerResearch: none(reason), playerMatchup: none(reason), gameMatchup: none(reason), gameProps: none(reason), propPrices: none(reason),
});

export const CAPABILITIES: Record<string, SportCapabilities> = {
  nfl: {
    slug: 'nfl', label: 'NFL', record: 'wl',
    sections: {
      teamOverview: ready, teamProfile: ready, teamForm: ready, teamSchedule: ready, teamPlayers: ready,
      ranking: ready, statTrend: ready, statCompare: ready,
      playerResearch: ready, playerMatchup: ready, gameMatchup: ready, gameProps: ready, propPrices: ready,
    },
  },
  nhl: {
    slug: 'nhl', label: 'NHL', record: 'wlo',
    sections: {
      // Hockey ships Overview and Form first; the other team tabs repeat the NFL patterns with hockey statistics and come later.
      teamOverview: ready, teamProfile: gated(NOT_YET), teamForm: ready, teamSchedule: gated(NOT_YET), teamPlayers: gated(NOT_YET),
      ranking: ready, statTrend: ready, statCompare: ready,
      playerResearch: ready, playerMatchup: none('No published opposing-unit rankings for hockey players yet.'), gameMatchup: gated(NOT_YET), gameProps: ready, propPrices: ready,
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
    },
  },
  nba: {
    slug: 'nba', label: 'NBA', record: 'wl',
    sections: { ...ALL_NONE(NOT_YET), playerResearch: ready, gameProps: ready, propPrices: ready },
  },
  cfb: { slug: 'cfb', label: 'CFB', record: 'wl', sections: { ...ALL_NONE(NOT_YET), propPrices: ready } },
  cbb: { slug: 'cbb', label: 'CBB', record: 'wl', sections: { ...ALL_NONE(NOT_YET), propPrices: ready } },
};

const UNKNOWN: Availability = none('This sport is not part of the research screens.');

export const capability = (slug: string, section: Section): Availability => CAPABILITIES[slug.toLowerCase()]?.sections[section] ?? UNKNOWN;
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
