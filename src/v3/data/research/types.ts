// The research data layer's view models: what the screens read. Everything here is derived from published documents (team profiles,
// rankings, the metric registry, the explorer index) and carries where it came from; nothing is estimated. Screens never read a
// contract document directly.

/** One statistic for one team in one window, as the team profile publishes it (rank, universe size and percentile come with it). */
export interface WindowObs {
  value: number | null;
  /** The opponent-adjusted value when the publication carries one beside the raw value. */
  adjusted: number | null;
  rank: number | null;
  /** Size of the ranking universe the rank is out of (28 teams in the current NFL packet, not 32). */
  n: number | null;
  /** Percentile, 0 worst to 100 best, as published. */
  percentile: number | null;
  rankingId: string | null;
  higherIsBetter: boolean | null;
  sample: number | null;
  asOf: string | null;
  /** Published display text ("32-36-14"), when the publication gives one. */
  display: string | null;
  universe: string | null;
}

export interface TeamMetric {
  metricId: string;
  /** The id without its sport prefix ("adj_off_epa"); the route's statistic id when a ranking id is not used. */
  id: string;
  unit: string | null;
  windows: Record<string, WindowObs>;
}

export type Outcome = 'W' | 'L' | 'T' | 'OTL';

export interface TeamGame {
  eventId: string;
  competition: string | null;
  opponentId: string | null;
  opponentName: string | null;
  home: boolean | null;
  startUtc: string;
  status: string;
  /** Completed result from the team's side. */
  result: { for: number; against: number; outcome: Outcome | null } | null;
}

export interface AvailabilityRow { status: string; detail: string | null; asOf: string | null; eventId: string | null; source: string | null }

export interface TeamProfile {
  participantId: string;
  abbr: string | null;
  name: string;
  slug: string;
  season: string | null;
  asOf: string | null;
  metrics: Map<string, TeamMetric>;
  games: TeamGame[];
  availability: AvailabilityRow[];
  players: { participantId: string; name: string; role: string | null }[];
  /** Series published for this team, by metric id. */
  seriesByMetric: Map<string, string>;
  record: TeamRecord | null;
  limitations: string[];
}

export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number | null;
  /** Hockey: overtime losses, shown separately (7–4–2). */
  otLosses: number | null;
  games: number;
  /** "published": the publication states it. "derived": from the official points percentage. "results": counted from completed games. */
  source: 'published' | 'derived' | 'results';
  text: string;
}

export interface RankingEntryVM { rank: number; entityId: string; code: string; name: string; value: number | null; adjusted: number | null; percentile: number | null; sample: number | null }

export interface RankingVM {
  rankingId: string;
  metricId: string;
  id: string;
  name: string;
  unit: string | null;
  window: string;
  higherIsBetter: boolean | null;
  universe: string;
  n: number;
  season: string | null;
  asOf: string;
  entries: RankingEntryVM[];
  summary: { mean: number | null; median: number | null; min: number | null; max: number | null; stdev: number | null };
  limitations: string[];
  adjusted: boolean;
}

export interface RankingCatalog {
  /** metric id to window label to ranking id, from the documents' own ranking lists. Never guessed from labels. */
  windows: Map<string, Map<string, string>>;
  /** ranking id to its (metric, window). */
  byRanking: Map<string, { metricId: string; window: string }>;
}

export interface ScheduleEvent { eventId: string; startUtc: string; status: string; homeCode: string | null; awayCode: string | null; homeId: string | null; awayId: string | null }

/** A statistic relation derived in the client because the registry's own list is empty (backend backlog item 1). Temporary. */
export interface DerivedRelation { metricId: string; relation: 'raw_counterpart' | 'adjusted_counterpart' | 'component' | 'opposing_unit' | 'same_family'; }
