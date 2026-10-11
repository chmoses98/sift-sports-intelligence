// UNITS, DENOMINATORS AND FOOTING for the NHL, soccer, CBB and CFB stat sections (issue 6, beyond the NFL helpers in
// insights/units.ts). Every denominator below is the publication's own: it is copied from the metric registry's
// `description` / `unit` (explorer/metrics.json, or the CFB Script Engine's metric_registry) — Sift writes it down in
// fan words and never converts one measure into another. A rate stays a rate ("% of shot attempts"), a per-60 rate
// stays per 60, and a value whose unit the publication does not state is labelled "unit not stated" rather than
// guessed. Raw and opponent-adjusted values carry different footing words so the two can never be confused.
import type { MetricDef, Observation, ObservationContext } from '../contract/types';

/** How a stored number maps to what is printed: 0.523 → "52.3%" (fraction), 52.3 → "52.3%" (percent), or as is. */
export type Scale = 'fraction' | 'percent' | 'none';

export interface SportUnit {
  /** Words printed right after the value: "of shot attempts" (after a %), "xG / 60 min", "pts / 100 poss". */
  short: string;
  /** The full denominator, for a title or a footnote: "expected goals per 60 minutes of 5-on-5 play". */
  long: string;
  scale: Scale;
  /** Decimals for a non-percentage value. */
  dp: number;
  /** Prefix + / − (differences and deviations). */
  signed?: boolean;
  /** False when the publication states no unit at all; screens then say "unit not stated". */
  stated: boolean;
}

const U = (short: string, long: string, scale: Scale = 'none', dp = 1, signed = false): SportUnit => ({ short, long, scale, dp, signed, stated: true });

// ---- NHL (met_nhl.*): descriptions in the NHL publication's metric registry.
const NHL: Record<string, SportUnit> = {
  xgf_pct: U('of expected goals', 'share of all expected goals in its games (xGF ÷ (xGF + xGA))', 'fraction'),
  corsi_pct: U('of shot attempts', 'share of all shot attempts in its games, blocked and missed included (CF ÷ (CF + CA))', 'fraction'),
  fenwick_pct: U('of unblocked attempts', 'share of unblocked shot attempts in its games (FF ÷ (FF + FA))', 'fraction'),
  hd_xgf_pct: U('of high-danger xG', 'share of high-danger expected goals in its games (HDxGF ÷ (HDxGF + HDxGA))', 'fraction'),
  sva_xgf_pct: U('of xG (score & venue adj.)', 'share of expected goals, adjusted by MoneyPuck for score state and rink — not for the opponent', 'fraction'),
  gf_per_game: U('goals / game', 'goals scored per game (shootout goals excluded)', 'none', 2),
  ga_per_game: U('goals against / game', 'goals allowed per game (shootout goals excluded)', 'none', 2),
  xgf_per60: U('xG / 60 min', 'expected goals for per 60 minutes of ice time (MoneyPuck)', 'none', 2),
  xga_per60: U('xGA / 60 min', 'expected goals against per 60 minutes of ice time (MoneyPuck)', 'none', 2),
  points_pct: U('of available points', 'standings points ÷ (2 × games played)', 'fraction'),
  pp_pct: U('of power plays scored on', 'power-play goals per power-play opportunity', 'fraction'),
  pk_pct: U('of shorthanded spells killed', 'times shorthanded without allowing a goal', 'fraction'),
  rating_off_xg60: U('xG / 60 (model rating)', 'model offensive rating: weighted expected goals for per 60, shrunk toward the league rate', 'none', 2),
  rating_def_xg60: U('xGA / 60 (model rating)', 'model defensive rating: weighted expected goals against per 60, shrunk toward the league rate', 'none', 2),
  rating_finish: U('× xG (finishing)', 'goals scored per expected goal relative to the league; above 1 converts chances better than xG', 'none', 2),
  rating_stop: U('× xG allowed', 'goals allowed per expected goal against; below 1 allows fewer goals than xG', 'none', 2),
  model_expected_goals: U('expected goals this game', 'the model’s goal rate for this team in this game (Poisson λ)', 'none', 2),
  oa_xgf60_5v5: U('xG / 60 at 5v5', 'expected goals per 60 minutes of 5-on-5 play against a league-average defense', 'none', 2),
  oa_xga60_5v5: U('xGA / 60 at 5v5', 'expected goals allowed per 60 minutes of 5-on-5 play to a league-average offense', 'none', 2),
  oa_gf60_5v5: U('goals / 60 at 5v5', 'goals per 60 minutes of 5-on-5 play against a league-average defense', 'none', 2),
  oa_ga60_5v5: U('goals against / 60 at 5v5', 'goals allowed per 60 minutes of 5-on-5 play to a league-average offense', 'none', 2),
  oa_xgf_pct_5v5: U('of 5v5 xG', 'share of 5-on-5 expected goals with each opponent removed', 'fraction'),
  oa_cf_pct_5v5: U('of 5v5 shot attempts', 'share of 5-on-5 shot attempts with each opponent removed', 'fraction'),
  oa_hdxgf_pct_5v5: U('of 5v5 high-danger xG', 'share of 5-on-5 high-danger expected goals with each opponent removed', 'fraction'),
  goals: U('goals', 'official goals in the window (shootout excluded)', 'none', 0),
  assists: U('assists', 'official assists in the window', 'none', 0),
  points: U('points', 'official points (goals + assists) in the window', 'none', 0),
  shots_on_goal: U('shots on goal', 'official shots on goal in the window', 'none', 0),
  games_played: U('games', 'games with a boxscore line in the window', 'none', 0),
  goalie_games: U('games', 'goalie appearances in the window', 'none', 0),
  goalie_starts: U('starts', 'games started in the window', 'none', 0),
  points_per60: U('pts / 60 min', 'points per 60 minutes of all-situation ice time', 'none', 2),
  toi_per_game: U('min / game', 'average ice time per game, in minutes', 'none', 1),
  save_pct: U('of shots saved', 'saves ÷ shots against, all situations', 'fraction'),
  ev_save_pct: U('of even-strength shots saved', 'even-strength saves ÷ even-strength shots against', 'fraction'),
  gaa: U('goals against / 60 min', 'goals against per 60 minutes of goalie ice time', 'none', 2),
};

// ---- Soccer (met_soccer.*): values in "%" are already percentages (0–100).
const SOCCER: Record<string, SportUnit> = {
  points_per_game: U('pts / match', 'league points per match (3 win, 1 draw, 0 loss)', 'none', 2),
  goals_for_per_game: U('goals / match', 'goals scored per match (extra time included where played)', 'none', 2),
  goals_against_per_game: U('conceded / match', 'goals conceded per match', 'none', 2),
  goal_difference_per_game: U('goal diff. / match', 'goals scored minus goals conceded, per match', 'none', 2, true),
  clean_sheet_rate: U('of matches with a clean sheet', 'share of matches with zero goals conceded', 'percent', 0),
  btts_rate: U('of matches where both scored', 'share of matches in which both sides scored', 'percent', 0),
  over_2_5_rate: U('of matches with 3+ goals', 'share of matches with three or more total goals', 'percent', 0),
  dc_attack: U('attack rating (log goals)', 'Dixon–Coles attack parameter on a log-goals scale, opponent-adjusted by construction; 0 is the pool average', 'none', 2, true),
  dc_defence: U('defence rating (log goals)', 'Dixon–Coles defence parameter on a log-goals scale, opponent-adjusted by construction; higher concedes fewer', 'none', 2, true),
  elo_rating: U('Elo points', 'pre-match international Elo rating', 'none', 0),
};

// ---- CBB (met_cbb.*): "%" values are percentages; turnover and free-throw rates are per 100 possessions / FGA.
const CBB: Record<string, SportUnit> = {
  adj_off: U('pts / 100 poss', 'points scored per 100 possessions against an average D-I defense'),
  adj_def: U('pts allowed / 100 poss', 'points allowed per 100 possessions against an average D-I offense'),
  adj_tempo: U('poss / 40 min', 'possessions per 40 minutes against an average-tempo opponent'),
  adj_efg_off: U('effective FG', 'effective field-goal percentage', 'percent'),
  adj_efg_def: U('opponents’ effective FG', 'effective field-goal percentage allowed to opponents', 'percent'),
  adj_to_off: U('turnovers / 100 poss', 'turnovers per 100 possessions'),
  adj_to_def: U('opp. turnovers / 100 poss', 'opponents’ turnovers per 100 possessions against the team'),
  adj_orb_off: U('of own misses rebounded', 'share of its own missed shots the offense rebounds', 'percent'),
  adj_orb_def: U('of misses rebounded by opponents', 'share of their own missed shots opponents rebound against the team', 'percent'),
  adj_ftr_off: U('FTA per 100 FGA', 'free-throw attempts per field-goal attempt (×100)'),
  adj_ftr_def: U('opp. FTA per 100 FGA', 'opponents’ free-throw attempts per field-goal attempt (×100)'),
  adj_fg2_off: U('of 2-pt attempts made', 'two-point field-goal percentage', 'percent'),
  adj_fg2_def: U('of opp. 2-pt attempts made', 'two-point field-goal percentage allowed', 'percent'),
  adj_fg3_off: U('of 3-pt attempts made', 'three-point field-goal percentage', 'percent'),
  adj_fg3_def: U('of opp. 3-pt attempts made', 'three-point field-goal percentage allowed', 'percent'),
  adj_fg3a_rate_off: U('of FGA are threes', 'three-point attempts per field-goal attempt (shot profile)', 'percent'),
  adj_fg3a_rate_def: U('of opp. FGA are threes', 'opponents’ three-point attempts per field-goal attempt (shot profile)', 'percent'),
  returning_minutes_share: U('of last season’s minutes', 'share of last season’s minutes played by players on this roster', 'fraction', 0),
  expected_returning_minutes: U('of 200 min', 'expected minutes, of 200 team minutes, to returning players', 'none', 0),
  expected_transfer_minutes: U('of 200 min', 'expected minutes, of 200 team minutes, to incoming D-I transfers', 'none', 0),
  expected_first_d1_minutes: U('of 200 min', 'expected minutes, of 200 team minutes, to players new to D-I', 'none', 0),
  proj_margin: U('pts (home − away)', 'projected home margin in points', 'none', 1, true),
  proj_total: U('pts', 'projected total points'),
  proj_possessions: U('poss', 'projected possessions'),
};

// ---- CFB Script Engine (metric_registry keys): `rate` values are fractions.
const CFB: Record<string, SportUnit> = {
  success_rate: U('of plays successful', 'share of non-garbage scrimmage plays gaining 50% / 70% / 100% of the distance on 1st / 2nd / 3rd–4th down', 'fraction'),
  early_down_success_rate: U('of 1st & 2nd downs successful', 'success rate on 1st and 2nd down only', 'fraction'),
  pass_success_rate: U('of dropbacks successful', 'success rate on dropbacks (sacks count as failures)', 'fraction'),
  rush_success_rate: U('of designed runs successful', 'success rate on designed runs (sacks excluded)', 'fraction'),
  explosive_play_rate: U('of plays explosive', 'share of scrimmage plays gaining 12+ (rush) or 16+ (pass) yards', 'fraction'),
  explosive_pass_rate: U('of dropbacks gain 16+', 'dropbacks gaining 16+ yards', 'fraction'),
  explosive_rush_rate: U('of designed runs gain 12+', 'designed runs gaining 12+ yards', 'fraction'),
  explosive_yard_share: U('of yards from explosives', 'share of the offense’s yards that came on explosive plays', 'fraction'),
  first_down_rate: U('of plays gain a first down', 'first downs (all methods) ÷ offensive plays', 'fraction'),
  havoc_allowed: U('of plays with TFL or PD', '(tackles for loss + passes defended) ÷ offensive plays; turnovers excluded', 'fraction'),
  interception_rate: U('of pass attempts', 'interceptions thrown ÷ pass attempts', 'fraction'),
  sack_rate_allowed: U('of dropbacks', 'sacks ÷ (pass attempts + sacks)', 'fraction'),
  neutral_pass_rate: U('of neutral-situation plays', 'dropbacks ÷ plays in quarters 1–3 with the score within 14', 'fraction'),
  pass_rate: U('of plays', 'pass attempts ÷ plays, all situations', 'fraction'),
  third_down_rate: U('of 3rd downs converted', 'third-down conversion rate', 'fraction'),
  net_yards_per_dropback: U('yds / dropback', 'passing yards minus sack yards, per dropback (attempts + sacks)', 'none', 2),
  yards_per_designed_rush: U('yds / designed run', 'rushing yards per designed run, sacks removed', 'none', 2),
  yards_per_pass_attempt: U('yds / pass attempt', 'passing yards ÷ pass attempts (not sack-adjusted)', 'none', 2),
  yards_per_play: U('yds / play', 'total offensive yards ÷ (rush + pass attempts); sacks count as rushes', 'none', 2),
  yards_per_rush: U('yds / rush', 'box-score rushing yards per rush; sacks count as rushes', 'none', 2),
  plays_per_game: U('plays / game', 'offensive plays per game'),
  points_per_drive: U('pts / drive', 'offensive points (TD = 7, FG = 3) per offensive drive'),
  points_per_game: U('pts / game', 'points scored per game, all phases'),
  points_per_opportunity: U('pts / trip inside the 40', 'offensive points per drive that reached the opponent’s 40'),
  seconds_per_play: U('sec / play', 'time of possession ÷ offensive plays (lower is faster)'),
  turnovers_per_game: U('turnovers / game', 'giveaways per game'),
};

const NOT_STATED: SportUnit = { short: '', long: 'unit not stated by the publication', scale: 'none', dp: 2, stated: false };

/** A registry unit Sift has no specific entry for, written as published (never guessed). */
function fromRegistryUnit(unit: string | null | undefined): SportUnit {
  const u = (unit ?? '').trim();
  if (!u) return NOT_STATED;
  if (u === 'share' || u === 'fraction') return { short: '', long: 'share (%)', scale: 'fraction', dp: 1, stated: true };
  if (u === 'probability') return U('probability', 'probability', 'fraction');
  if (u === '%') return { short: '', long: 'percent', scale: 'percent', dp: 1, stated: true };
  if (u === 'rate') return { short: '', long: 'rate (the publication does not state the denominator)', scale: 'fraction', dp: 1, stated: true };
  return U(u, u, 'none', 2);
}

const TABLES: [RegExp, Record<string, SportUnit>][] = [[/^met_nhl\./, NHL], [/^met_soccer\./, SOCCER], [/^met_cbb\./, CBB]];

/**
 * The unit of a metric outside the NFL: the publication's own denominator in fan words, or the registry's unit as
 * published, or "unit not stated". CFB Script Engine ids are bare (`success_rate`) and pass `sport: 'CFB'`.
 */
export function sportUnit(metricId: string, def?: Pick<MetricDef, 'unit'> | { unit?: string | null } | null, sport?: string): SportUnit {
  if (sport === 'CFB') return CFB[metricId] ?? fromRegistryUnit(def?.unit);
  for (const [re, t] of TABLES) if (re.test(metricId)) return t[metricId.replace(re, '')] ?? fromRegistryUnit(def?.unit);
  return fromRegistryUnit(def?.unit);
}

/** The number in its unit's printed form: "52.3%", "2.45", "+0.12". Never adds a unit the value does not have. */
export function formatUnitValue(v: number | null | undefined, u: SportUnit): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (u.scale === 'fraction') return `${(v * 100).toFixed(u.dp)}%`;
  if (u.scale === 'percent') return `${v.toFixed(u.dp)}%`;
  const t = Math.abs(v).toFixed(u.dp);
  if (u.signed) return Number(t) === 0 ? t : `${v > 0 ? '+' : '−'}${t}`;
  return v < 0 ? `−${t}` : t;
}

/** The value with its unit, for a sentence or an accessible name: "52.3% of shot attempts", "2.45 xG / 60 at 5v5". */
export function valueAndUnit(v: number | null | undefined, u: SportUnit): string {
  const t = formatUnitValue(v, u);
  if (t === '—') return t;
  if (!u.stated) return `${t} (unit not stated)`;
  return u.short ? `${t} ${u.short}` : t;
}

/** What a unit cell says when there is nothing after the number. */
export const unitText = (u: SportUnit) => (u.stated ? u.short : 'unit not stated');

export type FootingKind = 'adjusted' | 'raw' | 'model' | 'roster' | 'rating';

export interface Footing {
  kind: FootingKind;
  /** On-screen word: "Adjusted", "Raw · season 2026-27", "Raw · last 10 games", "Model input". */
  word: string;
  /** One line for a title attribute. */
  detail: string;
}

/** "season 2026-27", "last 10 games", "model run", "5v5 recency-weighted", "pregame". */
export function windowWords(w: Observation['window'] | null | undefined): string {
  if (!w) return '';
  const label = String(w.label ?? '');
  if (w.kind === 'SEASON') return /^SEASON$/i.test(label) || !label ? 'season' : `season ${label}`;
  if (w.kind === 'LAST_N' && w.n) return `last ${w.n} games`;
  if (/^L(\d+)$/.test(label)) return `last ${label.slice(1)} games`;
  if (w.kind === 'RUN' || /^run /.test(label)) return 'model run';
  if (/^PREGAME$/i.test(label)) return 'pregame';
  if (/^PRESEASON_ROSTER$/i.test(label)) return 'preseason roster';
  return label.replace(/_/g, ' ').toLowerCase();
}

type DefLike = Pick<MetricDef, 'category'> & { extensions?: Record<string, unknown> | null; description?: string | null };

/**
 * Which footing a value stands on, from the publication's own flags: an opponent-adjusted registry category, the
 * observation's `basis: OPPONENT_ADJUSTED`, CBB's `extensions.cbb.adjusted`, or a Dixon–Coles rating ("opponent-adjusted
 * by construction"); model inputs and roster measures say so; everything else is raw, with its window.
 */
export function footingOf(metricId: string, def: DefLike | null | undefined, o?: Pick<Observation, 'window' | 'extensions'> | null): Footing {
  const ext = (o?.extensions ?? {}) as Record<string, unknown>;
  const cbb = ((def?.extensions ?? {}) as { cbb?: { adjusted?: boolean } }).cbb;
  const cat = String(def?.category ?? '').toLowerCase();
  const win = windowWords(o?.window);
  if (ext.basis === 'OPPONENT_ADJUSTED' || cat === 'opponent_adjusted' || cat === 'opponent-adjusted' || cbb?.adjusted === true || /opponent-adjusted by construction/i.test(def?.description ?? '')) {
    return { kind: 'adjusted', word: 'Adjusted', detail: `Opponent-adjusted${win ? ` (${win})` : ''}: the opponents' strength is removed. Compare only with other adjusted values.` };
  }
  if (cat === 'model_inputs' || cat === 'matchup' || cat === 'model' || cat === 'projection') {
    return { kind: 'model', word: 'Model input', detail: `A number from the model${win ? ` (${win})` : ''}, not a box-score statistic.` };
  }
  if (cat === 'roster') return { kind: 'roster', word: 'Roster', detail: 'Roster construction, not team strength; not opponent-adjusted.' };
  if (cat === 'rating') return { kind: 'rating', word: 'Rating', detail: 'A rating as published; not a per-game statistic.' };
  const venue = /score- and venue-adjusted/i.test(def?.description ?? '') || metricId === 'met_nhl.sva_xgf_pct';
  return {
    kind: 'raw',
    word: `Raw${win ? ` · ${win}` : ''}`,
    detail: venue ? 'Raw: adjusted for score state and rink by MoneyPuck, NOT for the opponent.' : `Raw${win ? ` (${win})` : ''}: not opponent-adjusted.`,
  };
}

/**
 * "#4 of 32" — the rank with its universe, which comes from the data (a slate-only ranking says "of 6 on the slate",
 * never "of 32").
 */
export function rankWords(ctx: Pick<ObservationContext, 'rank' | 'universe_size' | 'universe_label'> | null | undefined): string {
  if (!ctx || ctx.rank == null) return '';
  const n = ctx.universe_size;
  const slate = /on the slate/i.test(ctx.universe_label ?? '');
  return n ? `#${ctx.rank} of ${n}${slate ? ' on the slate' : ''}` : `#${ctx.rank}`;
}
