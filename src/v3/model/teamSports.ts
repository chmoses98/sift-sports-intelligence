// What a team page says about each sport, as data. A new sport adds a declaration here (and its documents); no screen changes.
// Statistic ids are the short ids of the published metric registry ("adj_off_epa"). Nothing here is a number: the numbers always come
// from the team profile, and a statistic the document lacks simply does not render (never a substitute).

export type Role = 'off' | 'def';

export interface PairDecl {
  label: string;
  off: string;
  def: string;
  /** The letters on the league track when the pair is not offense/defense ("P" power play, "K" penalty kill). */
  marks?: [string, string];
}

export interface IdentityDecl {
  /** The card's headline ("Offense vs defense"). */
  title: string;
  /** `basis`: the switch is Adjusted / Raw (football). `window`: the switch is the window (hockey: season or last 10). */
  control: 'basis' | 'window';
  head: { off: string; def: string; offUnit: string; defUnit: string };
  adjusted?: { window: string; pairs: PairDecl[] };
  raw: { pairs: PairDecl[] };
  /** Windows the `window` control offers, in order, as url values ('SEASON' means the current season's own label). */
  windows?: string[];
  /** One sentence closing the card, by the basis shown. `{special}` is replaced by the special-teams sentence when that row is shown. */
  note: { adjusted: string; raw: string };
  /** The pair whose row is a special-teams pair: published for the season only, so it is left out of other windows. */
  seasonOnly?: string[];
  /** What the Schedule tab's opponent strength is measured in, as a phrase after "season-long raw" (football: "EPA per play"). */
  scheduleBasis?: string;
}

export interface ProfileGroupDecl { key: string; label: string; role: Role | null; categories: string[]; idPattern?: RegExp }

export interface SportTeamDecl {
  slug: string;
  /** How a window label reads ("L6" is "Last 6"). Season windows ("2026-27") and unknown labels read as published. */
  windowWords: Record<string, string>;
  identity: IdentityDecl;
  extremes: { categories: string[]; skip: RegExp };
  profile?: {
    windows: string[];
    /** The long window shown as a ghost marker beside the shorter ones. */
    baseline: string | null;
    raw: ProfileGroupDecl[];
    adjusted: ProfileGroupDecl[];
    adjustedWindowWord: string;
  };
  form: { overview: number; form: number; oneScore: { margin: number; label: string }; otNote: boolean };
  players?: { skillRoles: string[]; lineNote: string | null; /** The roster card's name; "Skill players" where the sport has them. */ label?: string };
  /** Names for the sample-data (demo) statistics: [id, name, category, unit, higherIsBetter]. */
  sample: { n: number; metrics: [string, string, string, string, boolean | null][]; adjustedWindow: string | null; windows: string[] };
}

const FOOTBALL_RAW: PairDecl[] = [
  { label: 'Overall', off: 'off_epa_play', def: 'def_epa_play' },
  { label: 'Passing', off: 'off_dropback_epa', def: 'def_dropback_epa' },
  { label: 'Rushing', off: 'off_rush_epa', def: 'def_rush_epa' },
  { label: 'Early downs', off: 'off_early_down_epa', def: 'def_early_down_epa' },
];
const FOOTBALL_ADJ: PairDecl[] = [
  { label: 'Overall', off: 'adj_off_epa', def: 'adj_def_epa' },
  { label: 'Passing', off: 'adj_off_db_epa', def: 'adj_def_db_epa' },
  { label: 'Rushing', off: 'adj_off_rush_epa', def: 'adj_def_rush_epa' },
  { label: 'Early downs', off: 'adj_off_ed_epa', def: 'adj_def_ed_epa' },
];

const NFL: SportTeamDecl = {
  slug: 'nfl',
  windowWords: { SEASON: 'Season', L6: 'Last 6', L34: 'Last 34', ADJ_RIDGE: 'Three-season weighted rating' },
  identity: {
    title: 'Offense vs defense',
    control: 'basis',
    head: { off: 'OFFENSE', def: 'DEFENSE', offUnit: 'EPA/play', defUnit: 'allowed' },
    adjusted: { window: 'ADJ_RIDGE', pairs: FOOTBALL_ADJ },
    raw: { pairs: FOOTBALL_RAW },
    note: {
      adjusted: 'Opponent-adjusted; the raw values are one switch away and never mixed.',
      raw: 'Raw season values: what happened, not how good the team is.',
    },
  },
  extremes: { categories: ['offense', 'defense'], skip: /^(off_adot|off_no_huddle|off_plays_per|off_proe|off_shotgun|corsi|fenwick|model|rating|sva|hd_xgf)/ },
  profile: {
    windows: ['SEASON', 'L6', 'L34'],
    baseline: 'L34',
    raw: [
      { key: 'off', label: 'Offense', role: 'off', categories: ['offense'] },
      { key: 'def', label: 'Defense', role: 'def', categories: ['defense'] },
      { key: 'style', label: 'Style', role: null, categories: ['style'] },
      { key: 'results', label: 'Results', role: null, categories: ['results'] },
    ],
    adjusted: [
      { key: 'off', label: 'Offense', role: 'off', categories: ['opponent-adjusted'], idPattern: /^adj_off_/ },
      { key: 'def', label: 'Defense', role: 'def', categories: ['opponent-adjusted'], idPattern: /^adj_def_/ },
    ],
    adjustedWindowWord: 'Three-season weighted rating',
  },
  form: { overview: 6, form: 12, oneScore: { margin: 8, label: 'One score' }, otNote: false },
  players: { skillRoles: ['QB', 'RB', 'WR', 'TE'], lineNote: 'Offensive-line quality is not published' },
  sample: {
    n: 32,
    adjustedWindow: 'ADJ_RIDGE',
    windows: ['SEASON', 'L6', 'L34'],
    metrics: [
      ['adj_off_epa', 'Adjusted offensive EPA per play', 'opponent-adjusted', 'deviation from league mean', true],
      ['adj_def_epa', 'Adjusted defensive EPA per play allowed', 'opponent-adjusted', 'deviation from league mean', false],
      ['adj_off_db_epa', 'Adjusted offensive EPA per dropback', 'opponent-adjusted', 'deviation from league mean', true],
      ['adj_def_db_epa', 'Adjusted defensive EPA per dropback allowed', 'opponent-adjusted', 'deviation from league mean', false],
      ['adj_off_rush_epa', 'Adjusted offensive EPA per rush', 'opponent-adjusted', 'deviation from league mean', true],
      ['adj_def_rush_epa', 'Adjusted defensive EPA per rush allowed', 'opponent-adjusted', 'deviation from league mean', false],
      ['adj_off_ed_epa', 'Adjusted offensive early-down EPA', 'opponent-adjusted', 'deviation from league mean', true],
      ['adj_def_ed_epa', 'Adjusted defensive early-down EPA allowed', 'opponent-adjusted', 'deviation from league mean', false],
      ['off_epa_play', 'Offensive EPA per play', 'offense', 'EPA/play', true],
      ['def_epa_play', 'Defensive EPA per play allowed', 'defense', 'EPA/play', false],
      ['off_dropback_epa', 'Offensive EPA per dropback', 'offense', 'EPA/dropback', true],
      ['def_dropback_epa', 'Defensive EPA per dropback allowed', 'defense', 'EPA/dropback', false],
      ['off_rush_epa', 'Offensive EPA per rush', 'offense', 'EPA/rush', true],
      ['def_rush_epa', 'Defensive EPA per rush allowed', 'defense', 'EPA/rush', false],
      ['off_early_down_epa', 'Offensive early-down EPA per play', 'offense', 'EPA/play', true],
      ['def_early_down_epa', 'Defensive early-down EPA allowed', 'defense', 'EPA/play', false],
      ['off_success_rate', 'Offensive success rate', 'offense', 'share', true],
      ['def_success_rate', 'Defensive success rate allowed', 'defense', 'share', false],
      ['off_explosive_rate', 'Explosive play rate', 'offense', 'share', true],
      ['def_explosive_rate', 'Explosive play rate allowed', 'defense', 'share', false],
      ['off_td_drive_rate', 'Touchdown drive rate', 'offense', 'share', true],
      ['def_sack_rate', 'Defensive sack rate', 'defense', 'share', true],
    ],
  },
};

const NHL: SportTeamDecl = {
  slug: 'nhl',
  windowWords: { SEASON: 'Season', L10: 'Last 10' },
  identity: {
    title: 'Scoring vs preventing',
    control: 'window',
    head: { off: 'GOALS FOR', def: 'GOALS AGAINST', offUnit: 'per game', defUnit: 'per game' },
    raw: {
      pairs: [
        { label: 'Goals', off: 'gf_per_game', def: 'ga_per_game' },
        { label: 'Exp. goals', off: 'xgf_per60', def: 'xga_per60' },
        { label: 'Special teams', off: 'pp_pct', def: 'pk_pct', marks: ['P', 'K'] },
      ],
    },
    windows: ['SEASON', 'L10'],
    seasonOnly: ['pp_pct'],
    scheduleBasis: 'goals scored and allowed per game',
    note: { adjusted: '', raw: 'Special teams: P is the power play, K the penalty kill. Power play and penalty kill are published for the season only.' },
  },
  extremes: { categories: ['advanced', 'official'], skip: /^(off_adot|off_no_huddle|off_plays_per|off_proe|off_shotgun|corsi|fenwick|model|rating|sva|hd_xgf)/ },
  form: { overview: 8, form: 8, oneScore: { margin: 1, label: 'One goal' }, otNote: true },
  // Skaters and goalies by position (the roster document's own role codes); no line-quality note: hockey has no counterpart to the offensive-line gap.
  players: { skillRoles: ['C', 'L', 'R', 'D', 'G'], lineNote: null, label: 'Players' },
  sample: {
    n: 32,
    adjustedWindow: null,
    windows: ['SEASON', 'L10'],
    metrics: [
      ['gf_per_game', 'Goals for per game', 'advanced', 'goals per game', true],
      ['ga_per_game', 'Goals against per game', 'advanced', 'goals per game', false],
      ['xgf_per60', 'Expected goals for per 60', 'advanced', 'xG per 60', true],
      ['xga_per60', 'Expected goals against per 60', 'advanced', 'xG per 60', false],
      ['pp_pct', 'Power-play percentage (official)', 'official', 'share', true],
      ['pk_pct', 'Penalty-kill percentage (official)', 'official', 'share', true],
      ['points_pct', 'Points percentage (official)', 'official', 'share', true],
      ['xgf_pct', 'Expected-goals share', 'advanced', 'share', true],
    ],
  },
};

export const TEAM_SPORTS: Record<string, SportTeamDecl> = { nfl: NFL, nhl: NHL };
export const teamSport = (slug: string): SportTeamDecl | undefined => TEAM_SPORTS[slug.toLowerCase()];
