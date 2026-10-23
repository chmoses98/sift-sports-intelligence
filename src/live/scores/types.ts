// The live-GAME vocabulary (sift.live_game/1): score, clock, status and provenance for one game, whatever the
// provider. It sits beside the market clock (src/live/types.ts) and shares nothing with it but the idea that every
// number carries the time it was OBSERVED. It carries no price, no projection and no recommendation: a live score
// is a fact about the game, never an input to a model and never a betting signal.
//
// Strictness rules the rest of this module enforces:
//   * a game is only ever attached to a Sift event by identity evidence (identity.ts), never by name similarity;
//   * a field the provider did not report is null, never a default (no 0-0, no "Q1 15:00" invented for a game
//     that has not started);
//   * every observation has a provider time and a fetch time; freshness is measured from the provider's own
//     time when it has one, otherwise from the fetch time, and a failed refresh never makes data younger.

export type LiveSport = 'NFL' | 'MLB' | 'CFB' | 'NBA' | 'NHL' | 'SOCCER' | 'CBB' | 'TENNIS';
export const LIVE_SPORTS: readonly LiveSport[] = ['NFL', 'MLB', 'CFB', 'NBA', 'NHL', 'SOCCER', 'CBB', 'TENNIS'];

/** What the game is doing, in Sift's words. UNKNOWN is a real answer: the provider's status was not understood. */
export type GamePhase = 'SCHEDULED' | 'LIVE' | 'BREAK' | 'DELAYED' | 'SUSPENDED' | 'FINAL' | 'POSTPONED' | 'CANCELLED' | 'UNKNOWN';

export interface LiveTeamRef {
  /** Canonical key (identity.ts teamKey): sport-scoped, provider-independent. */
  key: string;
  name: string;
  abbr: string | null;
  /** The provider's own id for this team, kept for the crosswalk and diagnostics only. */
  providerTeamId: string | null;
}

export interface LiveClock {
  /** 1-based period index (quarter, half, period, inning, set), null when the provider gives none. */
  period: number | null;
  /** The provider's wording for the period ("2nd Quarter", "Top 7th", "OT", "Set 2"). */
  periodLabel: string | null;
  /** The game clock as shown on a scoreboard ("4:32"), null when the sport has none (baseball, tennis). */
  display: string | null;
  /** Seconds remaining in the period (or elapsed, for soccer: see `direction`); null when unknown. */
  seconds: number | null;
  direction: 'down' | 'up' | null;
  /** True only when the provider says the clock is running. Never inferred. */
  running: boolean | null;
}

/** One scoring play a provider reports, newest first in `LiveGame.recentPlays`. Optional: a feed with no play data omits it. */
export interface LivePlay {
  periodLabel: string | null;
  /** The game clock when it happened ("4:32", "67'"), null where the sport has none. */
  clock: string | null;
  text: string;
  /** The score after the play. */
  home: number;
  away: number;
}

/** Sport-specific situation, optional and sparse: only what the provider reported. */
export interface LiveSituation {
  /** Football: team key with the ball; down & distance as text ("3rd & 7"); yard line text. */
  possessionTeam?: string | null;
  downDistance?: string | null;
  yardLine?: string | null;
  /** Baseball: "top" | "bottom", outs, and runners on first/second/third. */
  half?: 'top' | 'bottom' | null;
  outs?: number | null;
  bases?: [boolean, boolean, boolean] | null;
  /** Tennis: per-set games and the current game's points, by side. */
  sets?: { home: number; away: number }[] | null;
  /** A short provider sentence about the last play, shown verbatim or not at all. */
  lastPlay?: string | null;
}

export interface Provenance {
  /** Adapter id ("espn", "thesportsdb", ...). */
  provider: string;
  providerGameId: string;
  /** When the provider says this state was true (ISO 8601), or null if it does not say. */
  providerUpdatedAt: string | null;
  /** When Sift's server (relay / publisher) fetched it. Always present. */
  fetchedAt: string;
  /** Attribution text the provider's terms require next to the data, or null if none is required. */
  attribution: string | null;
}

export interface LiveGame {
  schema: 'sift.live_game/1';
  sport: LiveSport;
  league: string | null;
  startUtc: string;
  home: LiveTeamRef;
  away: LiveTeamRef;
  phase: GamePhase;
  /** The provider's raw status word, kept for diagnostics. */
  rawStatus: string | null;
  /** Null until the provider reports a score for a game that has one (never 0-0 by default). */
  score: { home: number; away: number } | null;
  clock: LiveClock | null;
  situation: LiveSituation | null;
  /** Recent scoring plays, newest first. Absent when the provider reports none; never reconstructed from the score. */
  recentPlays?: LivePlay[];
  provenance: Provenance;
}

/** How a provider game was tied to a Sift event: the evidence, so a reviewer can see why. */
export type MatchMethod = 'PROVIDER_ID' | 'TEAMS_AND_START';

export interface EventMatch {
  eventId: string;
  method: MatchMethod;
  /** Minutes between the provider's start and the Sift event's start. */
  startDeltaMin: number;
  /** True when home/away were reversed relative to the event (only ever accepted for a neutral site). */
  swapped: boolean;
}

export type MatchResult =
  | { ok: true; match: EventMatch }
  | { ok: false; reason: 'NO_EVENT' | 'AMBIGUOUS' | 'TEAM_UNKNOWN' | 'ORIENTATION' | 'SPORT_MISMATCH' | 'ID_CONFLICT'; detail: string };

/** The Sift side of a match: what the publications already say about the game. */
export interface SiftEventRef {
  eventId: string;
  sport: LiveSport;
  startUtc: string;
  home: { key: string; name: string };
  away: { key: string; name: string };
  /** True for a neutral-site game (bowl, tournament, neutral NFL/CBB): orientation may legitimately differ. */
  neutral?: boolean;
  /** Provider ids the publication already carries for this event, by provider ("espn": "401547417"). */
  providerIds?: Record<string, string>;
}

/** Whether a number on screen may be called live, and how to say so. Computed at read time, never stored. */
export type ScoreFreshness = 'LIVE' | 'DELAYED' | 'STALE' | 'FINAL' | 'PREGAME' | 'UNKNOWN';

/** What a screen is allowed to show for a game's score right now. The order is the fallback order. */
export type DisplayMode =
  | 'LIVE' // provider score, fresh: "LIVE" label allowed
  | 'FINAL' // provider says the game is over: a fact, shown with no age
  | 'DELAYED' // provider score, older than the live window: shown with its age, never labelled live
  | 'LAST_KNOWN' // provider outage: the last observation with its real age
  | 'PUBLICATION_FINAL' // the sport publication's own final result (extensions.result)
  | 'UNAVAILABLE'; // today's wording: "Live — score unavailable"

export interface LiveScoreView {
  mode: DisplayMode;
  freshness: ScoreFreshness;
  game: LiveGame | null;
  ageMs: number | null;
  /** One line a chip can show verbatim: "LIVE · 12s", "Last update 4m ago", "Score unavailable". */
  label: string;
}

export interface ProviderBatch {
  provider: string;
  games: LiveGame[];
  fetchedAt: string;
  /** Provider-reported rate-limit or quota note, for diagnostics. */
  quota?: string | null;
}

export type ScoreErrorKind = 'rate_limited' | 'http' | 'network' | 'timeout' | 'schema' | 'unauthorized' | 'unsupported';

export class ScoreProviderError extends Error {
  constructor(public kind: ScoreErrorKind, message: string, public status: number | null = null, public retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ScoreProviderError';
  }
}

/** Anything that can answer "what is happening in this sport's games today". */
export interface LiveScoreProvider {
  readonly id: string;
  readonly label: string;
  /** The fastest this provider's data can change; polling faster only costs quota. */
  readonly minIntervalMs: number;
  /** Sports this provider can answer for. A sport outside it is a skip, never an error. */
  readonly sports: readonly LiveSport[];
  fetchScoreboard(sport: LiveSport, signal?: AbortSignal): Promise<ProviderBatch>;
}

export interface ObservedTeam { abbr: string | null; name: string }
/** A SIFT event a screen is showing, with its teams as the publication names them: what a provider is asked about, and matched against. */
export interface ObservedEvent { ref: SiftEventRef; home: ObservedTeam; away: ObservedTeam; /** The publication's league word ("usa.mls"), when it has one. */ league?: string | null }
