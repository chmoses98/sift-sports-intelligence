// The Prop Discovery universe: every player-prop contract the publications list, grouped into one row per (player, statistic, game) with
// its rung ladder. Nothing here is a price to display: a price is only ever shown through `data/quoteGate.ts`. `ask` on a rung is the
// publication's CAPTURED ask, used for ordering and for choosing the featured rung (stable between reloads of the universe), never printed
// unless it passes the gate.

import type { V3Team } from '../../model/types';

export interface PropRung {
  /** The count the contract settles on: "3+ receptions" is k = 3. */
  k: number;
  ticker: string;
  /** The publication's captured YES ask and bid in cents (NOT a displayable price). */
  ask: number | null;
  bid: number | null;
  volume: number | null;
  capturedAt: string | null;
  source: 'Kalshi' | 'Sample';
}

/** What the opponent chip measures and where its ranking lives (declared per statistic family, never per slate). */
export interface OppUnit {
  /** The ranked statistic ("adj_def_db_epa", "ga_per_game"), without the sport prefix. */
  metric: string;
  /** The chip's words: "pass D", "goals against". */
  chip: string;
  /** The peek's words: "pass defense", "goals against". */
  long: string;
  /** The compare-row words: "pass D", "goals vs". */
  short: string;
  /** Unit of the ranking's own value ("goals per game"), when the peek prints it. */
  perGame: boolean;
}

export type HistorySpec =
  | { kind: 'nfl'; stat: string }
  | { kind: 'nhl'; col: string };

/** The SIFT model lane for one prop: a published estimate per rung, or the reason there is none. Never estimated. */
export type ModelLane =
  | { state: 'published'; byK: Record<number, number> }
  | { state: 'none'; reason: string };

export interface Prop {
  /** The contract ticker without its rung: stable across reloads and short enough for an address. */
  id: string;
  slug: string;
  sportLabel: string;
  eventId: string;
  gameKey: string;
  startMs: number;
  away: V3Team;
  home: V3Team;
  /** The published player id ("prt_…") when the contract carries one. */
  playerId: string | null;
  /** The history layer's id: the NFL gsis id, or the NHL published player id (its profile carries the game log). */
  histId: string | null;
  name: string;
  /** The player's team code and the coming opponent's. Null when the publication does not say. */
  team: string | null;
  opp: string | null;
  position: string | null;
  /** The publication's own statistic key ("receptions", "player_goals"). */
  stat: string;
  /** Statistic family shared across sports ("receptions", "goals"): the stat chips. */
  fam: string;
  label: string;
  abbr: string;
  /** The Player Research statistic key for this prop. */
  playerStat: string | null;
  history: HistorySpec | null;
  oppUnit: OppUnit | null;
  rungs: PropRung[];
  /** The rung nearest a coin flip at the publication's captured ask. */
  featured: number;
  /** Player Research exists for this player (a published profile in a sport whose player research is ready). */
  playerPage: boolean;
  /** Availability when the publication says he is OUT, DOUBTFUL, SUSPENDED or on IR. */
  out: string | null;
  /** The game's availability (injury) rows were readable: only then does "Listed" mean anything. */
  availKnown: boolean;
  /** The game's availability document has not been read yet (it is read for the rows on screen): `out` says nothing until it is. */
  availPending: boolean;
  model: ModelLane;
  provenance: 'publication' | 'demo';
}

export interface UnitRank { rank: number; n: number; value: number | null; window: string; rankingId: string }

/** The opponent chip for one prop: the opposing team's rank on the statistic's unit. */
export interface Matchup {
  rank: number;
  n: number;
  value: number | null;
  /** "PHI pass D · 10th of 28". */
  text: string;
  statId: string;
  window: string;
  oppCode: string;
  selfCode: string | null;
}

export interface UniverseStats { games: number; props: number; contracts: number; bySport: Record<string, number>; byFam: Record<string, number> }

export interface Universe {
  props: Prop[];
  byId: Map<string, Prop>;
  /** Rankings by `${slug}:${metric}` then team code (sample data only; real rankings are read for the rows that need them: bank.ts RankBank). */
  ranks: Map<string, Map<string, UnitRank>>;
  stats: UniverseStats;
  /** Sports with props today, in capability order, with the label their chip prints. */
  sports: { slug: string; label: string; count: number }[];
  /** Games on the slate that publish no player props (named, never silent). */
  unreadable: string[];
  /** True when availability (OUT/doubtful) could not be read for some game, so "Hide out" cannot be complete there. */
  availabilityGaps: number;
  demo: boolean;
  loadedAt: number;
  /** Games whose availability document has not been read yet (their rows say "Checking availability"). */
  availPendingGames: number;
  /** Games read so far and games the horizon holds: `complete` once all are read. Until then counts and orders cover the soonest `gamesLoaded`. */
  gamesLoaded: number;
  gamesTotal: number;
  complete: boolean;
}
