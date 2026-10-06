// Presentation mappings between NFL contract identifiers. They connect published metrics to each
// other (offense ↔ the defense that faces it) and to markets; they never create a number.
import type { MetricDef } from '../contract/types';

/** The repository's matchup_pairs names -> the opponent-adjusted metrics they are computed from. */
export const MATCHUP_AREAS: { name: string; label: string; offense: string; defense: string }[] = [
  { name: 'pass offense vs pass defense', label: 'Passing', offense: 'met_nfl.adj_off_db_epa', defense: 'met_nfl.adj_def_db_epa' },
  { name: 'run offense vs run defense', label: 'Rushing', offense: 'met_nfl.adj_off_rush_epa', defense: 'met_nfl.adj_def_rush_epa' },
  { name: 'pass protection vs pass rush', label: 'Pressure', offense: 'met_nfl.adj_off_sack_rate', defense: 'met_nfl.adj_def_sack_rate' },
  { name: 'explosive plays', label: 'Explosives', offense: 'met_nfl.adj_off_explosive', defense: 'met_nfl.adj_def_explosive' },
  { name: 'early-down efficiency', label: 'Early downs', offense: 'met_nfl.adj_off_ed_epa', defense: 'met_nfl.adj_def_ed_epa' },
  { name: 'neutral-script efficiency', label: 'Neutral script', offense: 'met_nfl.adj_off_epa_ng', defense: 'met_nfl.adj_def_epa_ng' },
  { name: 'overall efficiency', label: 'Overall', offense: 'met_nfl.adj_off_epa', defense: 'met_nfl.adj_def_epa' },
];

const EXPLICIT: Record<string, string> = {
  'met_nfl.off_sack_rate_allowed': 'met_nfl.def_sack_rate',
  'met_nfl.def_sack_rate': 'met_nfl.off_sack_rate_allowed',
  'met_nfl.off_turnover_rate': 'met_nfl.def_takeaway_rate',
  'met_nfl.def_takeaway_rate': 'met_nfl.off_turnover_rate',
  'met_nfl.off_epa_play': 'met_nfl.def_epa_play',
  'met_nfl.def_epa_play': 'met_nfl.off_epa_play',
  'met_nfl.off_epa_play_ng': 'met_nfl.def_epa_play_ng',
  'met_nfl.def_epa_play_ng': 'met_nfl.off_epa_play_ng',
  'met_nfl.points_for': 'met_nfl.points_against',
  'met_nfl.points_against': 'met_nfl.points_for',
};

/** The metric that measures the other side of the same matchup (pass defense <-> pass offense). */
export function counterpartMetric(metricId: string, registry: Map<string, MetricDef>): string | null {
  if (EXPLICIT[metricId] && registry.has(EXPLICIT[metricId])) return EXPLICIT[metricId];
  const swapped = metricId.includes('_off_')
    ? metricId.replace('_off_', '_def_')
    : metricId.includes('_def_')
      ? metricId.replace('_def_', '_off_')
      : metricId.replace('nfl.off_', 'nfl.def_') !== metricId
        ? metricId.replace('nfl.off_', 'nfl.def_')
        : metricId.replace('nfl.def_', 'nfl.off_');
  return swapped !== metricId && registry.has(swapped) ? swapped : null;
}

/** Kalshi player-stat names (market extensions.stat) -> the simulation metric that projects them. */
export const STAT_TO_SIM: Record<string, string> = {
  passing_yards: 'met_nfl.sim_passing_yards',
  receiving_yards: 'met_nfl.sim_receiving_yards',
  rushing_yards: 'met_nfl.sim_rushing_yards',
  receptions: 'met_nfl.sim_receptions',
  carries: 'met_nfl.sim_carries',
  attempts: 'met_nfl.sim_attempts',
  completions: 'met_nfl.sim_completions',
  passing_tds: 'met_nfl.sim_passing_tds',
  touchdowns: 'met_nfl.sim_touchdowns',
};

export const STAT_LABEL: Record<string, string> = {
  passing_yards: 'Passing yards', receiving_yards: 'Receiving yards', rushing_yards: 'Rushing yards', receptions: 'Receptions',
  carries: 'Carries', attempts: 'Pass attempts', completions: 'Completions', passing_tds: 'Passing TDs', touchdowns: 'Touchdowns',
  fantasy_points: 'Fantasy points', longest_reception: 'Longest reception', longest_rush: 'Longest rush',
  rush_rec_yards: 'Rush + rec yards', interceptions: 'Interceptions', field_goals: 'Field goals', first_td: 'First TD scorer',
  team_sacks: 'Team sacks', team_yards: 'Team yards',
};

export const CATEGORY_ORDER = ['opponent-adjusted', 'offense', 'defense', 'style', 'results', 'quarterback', 'usage', 'projection', 'model'];

export const CATEGORY_LABEL: Record<string, string> = {
  'opponent-adjusted': 'Opponent-adjusted ratings',
  offense: 'Offense',
  defense: 'Defense',
  style: 'Style & pace',
  results: 'Results',
  quarterback: 'Quarterback',
  usage: 'Usage',
  projection: 'Projections',
  model: 'Model',
};

/** Raw (L34) metric <-> its opponent-adjusted (ridge) counterpart, both published by the repository. */
const RAW_ADJ_PAIRS: [string, string][] = [
  ['off_epa_play', 'adj_off_epa'], ['def_epa_play', 'adj_def_epa'],
  ['off_dropback_epa', 'adj_off_db_epa'], ['def_dropback_epa', 'adj_def_db_epa'],
  ['off_rush_epa', 'adj_off_rush_epa'], ['def_rush_epa', 'adj_def_rush_epa'],
  ['off_success_rate', 'adj_off_sr'], ['def_success_rate', 'adj_def_sr'],
  ['off_explosive_rate', 'adj_off_explosive'], ['def_explosive_rate', 'adj_def_explosive'],
  ['off_early_down_epa', 'adj_off_ed_epa'], ['def_early_down_epa', 'adj_def_ed_epa'],
  ['off_epa_play_ng', 'adj_off_epa_ng'], ['def_epa_play_ng', 'adj_def_epa_ng'],
  ['off_sack_rate_allowed', 'adj_off_sack_rate'], ['def_sack_rate', 'adj_def_sack_rate'],
  ['off_turnover_rate', 'adj_off_to_rate'], ['def_takeaway_rate', 'adj_def_to_rate'],
  ['off_proe_early_ng', 'adj_off_proe'],
];

export function adjustedTwin(metricId: string): { id: string; kind: 'adjusted' | 'raw' } | null {
  const slug = metricId.replace(/^met_nfl\./, '');
  for (const [raw, adj] of RAW_ADJ_PAIRS) {
    if (slug === raw) return { id: `met_nfl.${adj}`, kind: 'adjusted' };
    if (slug === adj) return { id: `met_nfl.${raw}`, kind: 'raw' };
  }
  return null;
}

export const WINDOW_EXPLAIN: Record<string, string> = {
  ADJ_RIDGE: 'opponent-adjusted ridge rating over a 3-season window, games before this week only',
  L34: 'the last 34 games (long baseline)',
  L6: 'the last 6 games',
  SEASON: 'this season to date',
  GAME: 'one game (a projection for the upcoming game)',
};

/** An availability status for people (INJURED_RESERVE → "Injured reserve"). */
const STATUS_NAME: Record<string, string> = {
  ACTIVE: 'Active', QUESTIONABLE: 'Questionable', DOUBTFUL: 'Doubtful', OUT: 'Out', INACTIVE: 'Inactive', PROBABLE: 'Probable',
  INJURED_RESERVE: 'Injured reserve', IR: 'Injured reserve', SUSPENDED: 'Suspended', PUP: 'PUP list', PHYSICALLY_UNABLE_TO_PERFORM: 'PUP list',
  NON_FOOTBALL_INJURY: 'Non-football injury', NFI: 'Non-football injury', DAY_TO_DAY: 'Day to day',
};
export function statusWord(status: string | null | undefined): string {
  if (!status) return '';
  return STATUS_NAME[status] ?? status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (x) => x.toUpperCase());
}

/** The window's name for people (the publication's code — ADJ_RIDGE, L34 — stays out of sight). */
export const WINDOW_NAME: Record<string, string> = {
  ADJ_RIDGE: 'Opponent-adjusted', L34: 'Last 34 games', L6: 'Last 6 games', SEASON: 'Season to date', GAME: 'This game', L200_DROPBACKS: 'Last 200 dropbacks',
};
export function windowName(label: string | null | undefined): string {
  if (!label) return '';
  return WINDOW_NAME[label] ?? label.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (x) => x.toUpperCase());
}

export function categoryLabel(c: string): string {
  return CATEGORY_LABEL[c] ?? c.replace(/_/g, ' ').replace(/^\w/, (x) => x.toUpperCase());
}
