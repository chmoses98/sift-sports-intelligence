// Sift's history layer: observed game-by-game results built from public play-by-play
// (scripts/history/build-nfl-history.mjs). Sport-neutral shapes: a sport adds its own stat keys in
// history/stats.ts; screens only ever ask for "this stat, per game".

export interface GameScore { for: number; against: number }

export interface GameLogRow {
  week: number;
  game_id: string;
  season_type: string;
  /** YYYY-MM-DD (local game date). */
  date: string | null;
  team: string;
  opp: string;
  home: boolean | null;
  score: GameScore | null;
  snaps: { off: number; pct: number | null } | null;
  passing: { att: number; cmp: number; yds: number; td: number; int: number; sacks: number; epa: number | null } | null;
  rushing: { car: number; yds: number; td: number; long: number | null };
  receiving: { tgt: number; rec: number; yds: number; td: number; long: number | null; target_share: number | null; air_share: number | null };
}

export interface BlitzSplit {
  dropbacks_blitz: number;
  epa_per_db_blitz: number | null;
  dropbacks_no_blitz: number;
  epa_per_db_no_blitz: number | null;
  targets_blitz: number;
  targets_no_blitz: number;
  team_targets_blitz: number | null;
  team_targets_no_blitz: number | null;
}

export interface PlayerHistoryDoc {
  kind: 'sift_player_history';
  sport: string;
  season: number;
  gsis: string;
  name: string;
  position: string;
  team: string;
  games: GameLogRow[];
  vs_blitz: BlitzSplit | null;
}

/** One side (offense or defense) of one team's game: raw counts, never rates. */
export interface UnitCounts {
  plays: number;
  dropbacks: number;
  db_epa: number;
  rushes: number;
  rush_epa: number;
  rush_success: number;
  charted_db: number;
  blitz_db: number;
  blitz_db_epa: number;
  noblitz_db: number;
  noblitz_db_epa: number;
  blitz_targets: number;
  blitz_rb_targets: number;
  noblitz_targets: number;
  noblitz_rb_targets: number;
  charted_plays: number;
  play_action: number;
  motion: number;
  charted_rushes: number;
  stacked_box_rushes: number;
}

export interface TeamWeek {
  week: number;
  game_id: string;
  date: string | null;
  opp: string | null;
  home: boolean | null;
  qbs: { gsis: string; name: string; dropbacks: number; epa: number | null }[];
  off: UnitCounts;
  def: UnitCounts;
}

export interface TeamHistoryDoc {
  kind: 'sift_team_history';
  sport: string;
  season: number;
  teams: Record<string, { team: string; weeks: TeamWeek[] }>;
}

export interface HistoryIndexDoc {
  kind: 'sift_history_index';
  sport: string;
  season: number;
  built_at: string;
  sources: { key: string; url: string; rows: number }[];
  licence: string;
  games_by_week: Record<string, number>;
  ftn_charted_plays_by_week: Record<string, number>;
  notes: string[];
  players: Record<string, { name: string; position: string; team: string; games: number }>;
}
