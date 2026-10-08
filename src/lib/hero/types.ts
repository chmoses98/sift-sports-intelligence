// The hero system's vocabulary. A hero is decided once, from facts the publication states (home team, venue,
// neutral site, date), by src/lib/hero/resolve.ts; every page renders what it decides and never re-derives it.

export interface HeroTeam {
  sport: string;
  /** The team code the publication uses (NFL "NO", NHL "BOS", CFB "AUB", CBB "KU" …). */
  code: string;
  /** Display name ("New Orleans Saints"). */
  name: string;
  /** Short name for the identity line ("Saints"). */
  short: string;
  colors: [string, string];
  logo: string | null;
}

export interface HeroInput {
  sport: string;
  /** Event start (ISO). Decides tenancy and photo validity: a 2019 game never gets a 2026 stadium. */
  date: string;
  home: HeroTeam | null;
  away: HeroTeam | null;
  /**
   * The home side is STATED by the publication. False when home/away is only a convention (e.g. the CFB feed's
   * `event_title_order`): then nobody is shown as being at home.
   */
  homeVerified: boolean;
  /** The venue name the publication gives, verbatim. */
  venueName: string | null;
  /** true / false when the publication says so; null when it does not say. */
  neutral: boolean | null;
  /** A named event (CBB "Eternal City Tip-Off", a tennis tournament, a bowl). */
  eventName?: string | null;
  /** The publication marks the game as postseason. */
  postseason?: boolean;
  /** The game's research (venue, neutral flag) has not loaded yet: show identity only, never guess a venue. */
  pending?: boolean;
}

export type HeroKind = 'photo' | 'branded';

/**
 * Why the hero looks the way it does:
 * - home: the stated home team at its own venue (photo when a verified one exists, else its branded hero);
 * - home-elsewhere: the stated home team at a venue that is not (verifiably) its own — a temporary home, an
 *   unknown building, a postseason site — so its identity is shown but no home-stadium photo;
 * - neutral: a neutral site; both teams are shown, nobody is "at home";
 * - matchup: home/away is not stated (only a display-order convention); no home claim at all;
 * - event: a sport without home teams (tennis): the event's identity.
 */
export type HeroContext = 'home' | 'home-elsewhere' | 'neutral' | 'matchup' | 'event';

export interface HeroVenue {
  id: string | null;
  name: string;
  city: string | null;
  roof: 'outdoor' | 'dome' | 'retractable' | null;
  /** published: the publication named it; tenancy: the home team's venue on that date (nothing published). */
  source: 'published' | 'tenancy';
}

export interface HeroPhoto {
  id: string;
  /** Responsive sources, widest first. */
  srcset: { src: string; w: number }[];
  /** The small file for cards and tiles. */
  card: string;
  width: number;
  height: number;
  focus: { desktop: string; mobile: string };
  /** What in the frame shows the home team's identity (end zone, centre ice …). */
  identity: string;
  credit: { artist: string; license: string; licenseUrl: string | null; source: string; file: string; modifications: string };
}

export interface HeroSpec {
  kind: HeroKind;
  context: HeroContext;
  sport: string;
  home: HeroTeam | null;
  away: HeroTeam | null;
  venue: HeroVenue | null;
  photo: HeroPhoto | null;
  /** The identity line, e.g. "Saints home game", "Neutral site", "International Series". Never long. */
  label: string;
  /** Machine-readable reason, for tests, the audit and data-hero-reason. */
  reason: string;
}
