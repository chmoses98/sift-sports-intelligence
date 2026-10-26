// What each sport's player-prop statistics are called and what can be said about them: a DECLARATION per (sport, published statistic),
// never a list of today's players or games. A statistic the table does not know still appears in Prop Discovery with its price and the
// publication's own words (history, opponent and model lanes are then "—"); adding a sport or a statistic is a row here.
import type { HistorySpec, OppUnit } from './types';

export interface FamilyDef {
  /** The chip key, shared across sports where the statistic is the same word ("points" for NHL and, later, NBA). */
  fam: string;
  label: string;
  abbr: string;
  /** Player Research's own key for this statistic. */
  playerStat: string | null;
  history: HistorySpec | null;
  oppUnit: OppUnit | null;
}

const passD: OppUnit = { metric: 'adj_def_db_epa', chip: 'pass D', short: 'pass D', perGame: false };
const runD: OppUnit = { metric: 'adj_def_rush_epa', chip: 'run D', short: 'run D', perGame: false };
const allD: OppUnit = { metric: 'adj_def_epa', chip: 'defense', short: 'defense', perGame: false };
const goalsAgainst: OppUnit = { metric: 'ga_per_game', chip: 'goals against', short: 'goals vs', perGame: true };

const nfl = (stat: string, label: string, abbr: string, oppUnit: OppUnit | null): FamilyDef => ({ fam: stat, label, abbr, playerStat: stat, history: { kind: 'nfl', stat }, oppUnit });
const nhl = (fam: string, label: string, abbr: string, col: string, playerStat: string, oppUnit: OppUnit | null = goalsAgainst): FamilyDef => ({ fam, label, abbr, playerStat, history: { kind: 'nhl', col }, oppUnit });
const priceOnly = (fam: string, label: string, abbr: string): FamilyDef => ({ fam, label, abbr, playerStat: null, history: null, oppUnit: null });

/** Keyed by `${sport slug}:${statistic}`; the statistic is the publication's `extensions.stat` (football) or its market family (hockey, baseball). */
export const FAMILIES: Record<string, FamilyDef> = {
  'nfl:passing_yards': nfl('passing_yards', 'Passing yds', 'PASS YDS', passD),
  'nfl:attempts': nfl('attempts', 'Pass attempts', 'ATT', passD),
  'nfl:completions': nfl('completions', 'Completions', 'CMP', passD),
  'nfl:passing_tds': nfl('passing_tds', 'Passing TDs', 'PASS TD', passD),
  'nfl:interceptions': nfl('interceptions', 'Interceptions', 'INT', passD),
  'nfl:receiving_yards': nfl('receiving_yards', 'Receiving yds', 'REC YDS', passD),
  'nfl:receptions': nfl('receptions', 'Receptions', 'REC', passD),
  'nfl:longest_reception': nfl('longest_reception', 'Longest reception', 'LNG REC', passD),
  'nfl:rushing_yards': nfl('rushing_yards', 'Rushing yds', 'RUSH YDS', runD),
  'nfl:carries': nfl('carries', 'Carries', 'CAR', runD),
  'nfl:longest_rush': nfl('longest_rush', 'Longest rush', 'LNG RUSH', runD),
  'nfl:rush_rec_yards': nfl('rush_rec_yards', 'Rush + rec yds', 'RUSH+REC', allD),
  'nfl:touchdowns': nfl('touchdowns', 'Touchdowns', 'TD', allD),
  'nfl:fantasy_points': priceOnly('fantasy_points', 'Fantasy points', 'FPTS'),
  'nfl:field_goals': priceOnly('field_goals', 'Field goals', 'FG'),
  'nhl:player_goals': nhl('goals', 'Goals', 'GOALS', 'g', 'g'),
  'nhl:player_assists': nhl('assists', 'Assists', 'AST', 'a', 'a'),
  'nhl:player_points': nhl('points', 'Points', 'PTS', 'p', 'p'),
  'nhl:goalie_saves': { fam: 'saves', label: 'Saves', abbr: 'SV', playerStat: null, history: { kind: 'nhl', col: 'sv' }, oppUnit: null },
  'mlb:hitter_hits': priceOnly('hits', 'Hits', 'HITS'),
  'mlb:hitter_total_bases': priceOnly('total_bases', 'Total bases', 'TB'),
  'mlb:hitter_hits_runs_rbis': priceOnly('hrr', 'H+R+RBI', 'H+R+RBI'),
  'mlb:hitter_rbis': priceOnly('rbis', 'RBIs', 'RBI'),
  'mlb:hitter_stolen_bases': priceOnly('stolen_bases', 'Stolen bases', 'SB'),
  'mlb:pitcher_strikeouts': priceOnly('strikeouts', 'Strikeouts', 'K'),
  'mlb:pitcher_outs': priceOnly('outs', 'Outs recorded', 'OUTS'),
};

const words = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** The declaration for a statistic, or a price-only family built from the publication's own key. */
export function familyFor(slug: string, stat: string): FamilyDef {
  return FAMILIES[`${slug}:${stat}`] ?? priceOnly(stat.replace(/^(player|hitter|pitcher|goalie)_/, ''), words(stat.replace(/^(player|hitter|pitcher|goalie)_/, '')), stat.replace(/^(player|hitter|pitcher|goalie)_/, '').toUpperCase().slice(0, 8));
}

/** The Player Research key for a prop's statistic family in a sport, when the sport's player page can chart it. */
export const playerStatKey = (slug: string, stat: string): string | null => FAMILIES[`${slug}:${stat}`]?.playerStat ?? null;
