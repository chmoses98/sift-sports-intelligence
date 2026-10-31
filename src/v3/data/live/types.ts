// The live-game DETAIL vocabulary for Game Detail: state (clock, possession, bases, power play), real plays and box-score leaders, as one
// provider-independent document. Every field is optional because every feed omits something; a missing field is null and the screen says
// "not available", it is never defaulted (no 0-0, no "Q1 15:00", no empty-handed "leaders"). Nothing here is a price, a projection or a signal.
// A source is only ever read when its rights position allows it (rights.ts); this file knows nothing about that.

export type Side = 'away' | 'home';

/** What the feed says the game is doing (its words, mapped). 'other' = a delay, suspension or a status the adapter did not understand. */
export type DetailPhase = 'live' | 'break' | 'final' | 'other';

export interface DetailPeriod {
  /** "Top 7th", "4th quarter", "2nd period". The provider's wording; null when it states none. */
  label: string | null;
  /** The game clock as a scoreboard prints it ("4:32"). null where the sport has none (baseball) or the feed does not publish it. */
  clock: string | null;
}

export type DetailSituation =
  | { kind: 'football'; possession: Side | null; downDistance: string | null; yardLine: string | null }
  | { kind: 'baseball'; half: 'top' | 'bottom' | null; inning: number | null; outs: number | null; balls: number | null; strikes: number | null; /** first, second, third */ bases: [boolean, boolean, boolean] | null }
  | { kind: 'hockey'; /** The side with the man advantage, and the time left on it when the feed gives one. */ powerPlay: { side: Side; remaining: string | null } | null };

/** One real play the provider reported. Newest first in `LiveDetail.plays`. Never reconstructed from the score. */
export interface DetailPlay {
  id: string;
  /** "Top 3rd", "2nd quarter": where in the game. */
  periodLabel: string | null;
  clock: string | null;
  /** The provider's own sentence, shown verbatim. */
  text: string;
  /** The side that scored on this play, or null (not a scoring play, or the feed does not say). */
  scoring: Side | null;
  /** The score after the play, when the feed states it. */
  score: { away: number; home: number } | null;
}

export interface DetailLeaderRow { name: string; /** "2-for-3, HR, 2 RBI": built only from stats the feed reported. */ line: string }
export interface DetailLeaders { side: Side; title: string; rows: DetailLeaderRow[] }

export interface LiveDetail {
  source: { id: string; label: string; /** The provider's required credit, shown wherever its data is. */ attribution: string | null };
  /** When this device received the answer (epoch ms). */
  fetchedAt: number;
  /** When the provider says the state was true (epoch ms), else null. */
  providerAt: number | null;
  phase: DetailPhase;
  score: { away: number; home: number } | null;
  period: DetailPeriod;
  situation: DetailSituation | null;
  /** null = this feed carries no plays; [] = it carries plays and none have happened yet. */
  plays: DetailPlay[] | null;
  /** null = this feed carries no box score. */
  leaders: DetailLeaders[] | null;
}

/** What a feed can carry at all, declared by the adapter: the screen only promises (and polls for) what a source can answer. */
export interface DetailCapabilities { score: boolean; period: boolean; clock: boolean; situation: boolean; plays: boolean; leaders: boolean }

export type Freshness = 'live' | 'delayed' | 'withheld';

/** What an adapter is asked about: a SIFT game, by the names the publication uses. */
export interface DetailTarget {
  sport: string;
  eventId: string;
  startMs: number;
  away: { name: string; abbr: string };
  home: { name: string; abbr: string };
}
