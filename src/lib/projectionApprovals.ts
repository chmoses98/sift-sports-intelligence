// PROJECTION APPROVALS — the explicit, per-sport, per-stat record of which engine is SIFT's one authoritative
// projection, and why. One row per (sport, family). Changing a row is the promotion (or the rollback) of that family
// alone: no other family, sport or surface moves, and no deployment-wide revert is needed.
//
// Rules this table enforces (tests/projectionApprovals.test.ts):
//   * a family is PROMOTED only if the frozen holdout evidence passes PROMOTION_POLICY (src/lib/projectionPolicy.ts);
//   * every family in the evidence file has a row, so a new family can never appear without a decision;
//   * the legacy engine stays available (engine 'legacy') for rollback, benchmarking and monitoring, but its numbers
//     are shown only for stats whose approved engine is 'legacy' — never beside a promoted number;
//   * no row grants betting authority. Kalshi routing, validated-signal rules, thresholds and staking are untouched.
//
// Ledger of changes: docs/PROJECTION_PROMOTION.md.
import type { ProjSport } from './projections';
import type { PublicationStandard } from './projectionPolicy';

export type Engine = 'foundation' | 'legacy';
export type Decision =
  | 'PROMOTED'                      // foundation engine is the one number
  | 'APPROVED_PENDING_LIVE_INPUTS'  // history supports promotion; live inputs not yet proven, so legacy stays the one number
  | 'RETAINED'                      // incumbent kept: the challenger lost, tied, or its gain is marginal
  | 'HELD';                         // not eligible: evidence incomplete, or a verified defect is unresolved

export interface Approval {
  sport: ProjSport;
  /** the Projection Foundation family name */
  family: string;
  decision: Decision;
  /** the engine whose number SIFT shows for this stat */
  engine: Engine;
  /** SIFT already shows a production number for this stat (so a promotion would replace it, and needs an incumbent win) */
  competingProductionNumber: boolean;
  /** plain-English live-data status and the reason for the decision (shown in docs, not in the app) */
  liveInputs: string;
  reason: string;
  approvedOn: string;
  /**
   * Critical input: the projection is withheld unless availability is CONFIRMED_ACTIVE or LIKELY_ACTIVE. Set for MLB
   * pitchers, whose projection is meaningless unless the pitcher is the (probable or confirmed) starter.
   */
  requiresVerifiedParticipation?: boolean;
  /**
   * Absolute publication standard (calibration, bias, information, stability), recorded for promoted families that have no
   * incumbent comparison or a displayed projected score. NOT_MET keeps the promotion on record but WITHHOLDS the number until
   * the evidence changes; MET_WITH_CAVEATS publishes it with the caveat shown as a reliability reason. Checked against
   * research/projection_foundation/promotion/absolute_evidence.json by tests/projectionApprovals.test.ts.
   */
  publication?: { standard: PublicationStandard; caveat?: string };
  /**
   * Explicitly approved alternative when the foundation feed is temporarily missing, stale or has not yet published the
   * game. Null (the default) means an unavailable promoted projection is withheld, never swapped. Even with an approval the
   * established number is used only if IT independently passes the freshness, availability and quality checks in
   * projectionFallback.ts, and never when the player is out, a structural defect is detected, or the information needed to
   * rule one out is unreliable. Exactly one number is ever shown.
   */
  fallback: FallbackApproval | null;
}

export type FallbackTrigger = 'FEED_UNAVAILABLE' | 'STALE' | 'NOT_PUBLISHED';
export interface FallbackApproval {
  engine: 'legacy';
  approvedOn: string;
  /** why this family may fall back, in the owner's terms */
  approval: string;
  /** the only situations in which it may be used */
  triggers: readonly FallbackTrigger[];
  /**
   * The foundation feed must have positively shown the player is not in a documented defect segment (an NFL player's first
   * games with a new team run high). With no feed row there is no such evidence, so the established number is not used.
   */
  requiresKnownSegments?: boolean;
}

const D = '2026-10-18';
const row = (sport: ProjSport, family: string, decision: Decision, competing: boolean, liveInputs: string, reason: string): Approval => ({
  sport, family, decision, engine: decision === 'PROMOTED' ? 'foundation' : 'legacy', competingProductionNumber: competing,
  liveInputs, reason, approvedOn: D, fallback: null,
});
/** Approve the established model as the fallback for a promoted row that has a production number SIFT already shows. */
const withFallback = (a: Approval, approval: string, extra: Partial<FallbackApproval> = {}): Approval => ({
  ...a, fallback: { engine: 'legacy', approvedOn: D, approval, triggers: ['FEED_UNAVAILABLE', 'STALE', 'NOT_PUBLISHED'], ...extra },
});
const FB_NFL = 'Owner-approved 2026-10-18: while the feed is missing, stale or has not yet published a game, the established simulation may be shown if it is fresh, the player is listed available, and its projection is coherent.';
const FB_MLB = 'Owner-approved 2026-10-18: while the feed is missing, stale or has not yet published a game, the established projection may be shown if it is fresh, the publisher projects him as the starter, and it is coherent.';

const NFL_LIVE = 'Ready: ESPN, Sleeper and nflverse injuries plus the roster inactive list (coverage 0.997); player segments published with each row.';
const NFL_NEWTEAM = 'Ready. First games with a new team run high (targets +18% on development/validation); SIFT lowers the reliability of those rows and says why, and applies no unvalidated correction.';
const NBA_PENDING = 'Pending: the official NBA injury report path has not run on live data (every captured row is REVIEW until it publishes, expected 2026-10-19/20) and ESPN pregame starters are unverified.';
const MLB_LIVE = 'Ready: probable pitchers archived pregame (PROJECTED), replaced probables become NOT_STARTING, posted lineup cards CONFIRMED; the probable with a posted card was the actual starter 1011/1014 times. SIFT withholds a pitcher who is not the confirmed or probable starter.';
const CFB_TEAM = 'Ready for team-level families: they do not depend on player availability. QB-change rows are lowered to REVIEW. Player availability is not available (ESPN returns stale records), so CFB player families stay out.';

const RAW_APPROVALS: readonly Approval[] = [
  // ---- NFL -------------------------------------------------------------------------------------------------------------
  row('NFL', 'team_pass_attempts', 'PROMOTED', false, NFL_LIVE, 'READY; beats the season-average baseline (CI excludes 0). No competing production number is displayed.'),
  row('NFL', 'team_rush_attempts', 'PROMOTED', false, NFL_LIVE, 'READY; beats the season-average baseline (CI excludes 0). No competing production number is displayed.'),
  row('NFL', 'team_points', 'HELD', true, NFL_LIVE, 'No incumbent comparison exists and the projection is essentially the closing implied team total, so promoting it would turn SIFT’s projection into a copy of the market. Keeps projection quality separate from market value; revisit with a live record.'),
  row('NFL', 'targets', 'PROMOTED', false, NFL_NEWTEAM, 'READY; beats the incumbent by 8.2% of its holdout CRPS (CI excludes 0).'),
  // receptions has a documented first-games-with-a-new-team defect, so its fallback needs the feed's own segment flag
  withFallback(row('NFL', 'receptions', 'PROMOTED', true, NFL_NEWTEAM, 'READY; beats the incumbent by 6.1% of its holdout CRPS (CI excludes 0).'), FB_NFL, { requiresKnownSegments: true }),
  withFallback(row('NFL', 'completions', 'PROMOTED', true, NFL_LIVE, 'READY; beats the incumbent by 2.7% of its holdout CRPS (CI excludes 0).'), FB_NFL),
  row('NFL', 'passing_yards', 'HELD', true, NFL_LIVE, 'READY and 1.3% better than the incumbent, but the interval versus the incumbent includes 0 [-1.194, 0.087]: not a credible win yet. Incumbent kept; revisit with the live paired record.'),
  row('NFL', 'passing_attempts', 'HELD', true, NFL_LIVE, 'SHADOW VALIDATION: the validation gain over baseline was not significant; needs a further untouched season.'),
  row('NFL', 'receiving_yards', 'HELD', true, NFL_NEWTEAM, 'Subgroup failure: first game with a new team runs +6.3 yds on a 21.5 mean. The tenure correction is verified on development data but not adopted (not holdout-tested).'),
  row('NFL', 'carries', 'HELD', true, NFL_NEWTEAM, 'Subgroup failure: first game with a new team runs +2.2 carries on a 6.2 mean.'),
  row('NFL', 'rushing_yards', 'HELD', true, NFL_NEWTEAM, 'Subgroup failure: first game with a new team runs +12.3 yds on a 24.5 mean.'),
  row('NFL', 'anytime_td', 'HELD', true, NFL_NEWTEAM, 'Subgroup failure (new team) and a 0.65% gain, below the materiality floor.'),
  row('NFL', 'passing_tds', 'RETAINED', true, NFL_LIVE, 'The challenger is significantly worse than the incumbent on holdout (NEEDS IMPROVEMENT).'),

  // ---- CFB -------------------------------------------------------------------------------------------------------------
  row('CFB', 'team_points', 'PROMOTED', true, CFB_TEAM, 'READY; beats the retired script-engine baseline by 8.9% of its holdout CRPS (CI excludes 0), confirmed on the 2025 second holdout. The script engine’s descriptive baseline points are no longer shown beside it.'),
  row('CFB', 'plays', 'PROMOTED', false, CFB_TEAM, 'READY; beats the baseline (CI excludes 0), confirmed on 2025. No competing production number.'),
  row('CFB', 'team_passing_yards', 'PROMOTED', false, CFB_TEAM, 'READY; beats the baseline (CI excludes 0), confirmed on 2025. No competing production number.'),
  row('CFB', 'team_rushing_yards', 'PROMOTED', false, CFB_TEAM, 'READY; beats the baseline (CI excludes 0), confirmed on 2025. No competing production number.'),
  row('CFB', 'points_per_play', 'PROMOTED', false, CFB_TEAM, 'READY; beats the baseline (CI excludes 0), confirmed on 2025. No competing production number.'),
  row('CFB', 'success_rate', 'PROMOTED', false, CFB_TEAM, 'READY; beats the baseline (CI excludes 0), confirmed on 2025. No competing production number.'),
  row('CFB', 'epa_per_play', 'HELD', false, 'Inadequate: the live 2026 source carries no EPA.', 'INSUFFICIENT DATA: it cannot be projected forward from the live source.'),
  row('CFB', 'game_total', 'RETAINED', true, CFB_TEAM, 'Existing production behavior for totals is retained: the model stays behind the closing line (edge_claim false).'),
  row('CFB', 'margin', 'RETAINED', true, CFB_TEAM, 'Existing production behavior for spreads is retained: the model stays behind the closing line (edge_claim false).'),
  ...['passing_attempts', 'passing_yards', 'carries', 'rushing_yards', 'receptions', 'receiving_yards'].map((f) =>
    row('CFB', f, 'HELD', false, 'Inadequate: no usable pregame CFB availability feed (player coverage 9.2%, no player can be CONFIRMED).', 'SHADOW VALIDATION: participation cannot be verified pre-game and there is no prospective record.')),
  row('CFB', 'targets', 'HELD', false, 'Inadequate: no target data in any season.', 'INSUFFICIENT DATA.'),
  row('CFB', 'player_week1', 'HELD', false, 'Inadequate: no depth chart for week 1.', 'INSUFFICIENT DATA.'),

  // ---- NBA -------------------------------------------------------------------------------------------------------------
  row('NBA', 'minutes', 'APPROVED_PENDING_LIVE_INPUTS', true, NBA_PENDING, 'READY; beats the incumbent by 25.2% of its holdout CRPS and removes the incumbent’s −2.4 minute bias. Held only for live availability.'),
  row('NBA', 'points', 'APPROVED_PENDING_LIVE_INPUTS', true, NBA_PENDING, 'READY; beats the incumbent by 10.8% of its holdout CRPS.'),
  row('NBA', 'rebounds', 'APPROVED_PENDING_LIVE_INPUTS', true, NBA_PENDING, 'READY; beats the incumbent by 10.9% of its holdout CRPS.'),
  row('NBA', 'assists', 'APPROVED_PENDING_LIVE_INPUTS', true, NBA_PENDING, 'READY; beats the incumbent by 9.0% of its holdout CRPS.'),
  row('NBA', 'threes', 'APPROVED_PENDING_LIVE_INPUTS', true, NBA_PENDING, 'READY; beats the incumbent by 5.8% of its holdout CRPS.'),
  row('NBA', 'pra', 'APPROVED_PENDING_LIVE_INPUTS', true, NBA_PENDING, 'READY; beats the incumbent by 14.4% of its holdout CRPS.'),
  row('NBA', 'fga', 'APPROVED_PENDING_LIVE_INPUTS', true, NBA_PENDING, 'READY; beats the incumbent by 16.5% of its holdout CRPS.'),
  row('NBA', 'team_points', 'HELD', true, NBA_PENDING, 'SHADOW VALIDATION and no incumbent comparison; not in the initial promotion set.'),

  // ---- MLB -------------------------------------------------------------------------------------------------------------
  { ...withFallback(row('MLB', 'pitcher_strikeouts', 'PROMOTED', true, MLB_LIVE, 'READY; beats the production pitcher engine by 2.6% of its holdout CRPS (CI excludes 0) on the 2026 holdout.'), FB_MLB), requiresVerifiedParticipation: true },
  { ...row('MLB', 'batters_faced', 'PROMOTED', true, MLB_LIVE, 'READY; beats the production pitcher engine by 11.6% of its holdout RPS (CI excludes 0).'), requiresVerifiedParticipation: true },
  { ...withFallback(row('MLB', 'outs', 'PROMOTED', true, MLB_LIVE, 'READY; beats the production pitcher engine by 3.8% of its holdout CRPS (CI excludes 0).'), FB_MLB), requiresVerifiedParticipation: true },
  ...['pitcher_walks', 'pitcher_hits_allowed', 'pitcher_runs_allowed'].map((f) =>
    row('MLB', f, 'HELD', false, MLB_LIVE, 'SHADOW VALIDATION and no incumbent comparison; not in the initial promotion set.')),
  ...['plate_appearances', 'hits', 'total_bases', 'home_runs', 'runs', 'rbis', 'hits_runs_rbis'].map((f) =>
    row('MLB', f, 'HELD', true, 'Inadequate: hitter projections need a posted lineup card; point-in-time lineup integrity is established only for CONFIRMED cards, and there is no injury/IL source.', 'Hitter models stay out until point-in-time lineup integrity is established over a live record.')),
  row('MLB', 'team_runs', 'HELD', true, MLB_LIVE, 'Tied with the incumbent (CI includes 0).'),
  row('MLB', 'game_total', 'HELD', true, MLB_LIVE, 'SHADOW VALIDATION and no incumbent comparison.'),

  // ---- NHL -------------------------------------------------------------------------------------------------------------
  row('NHL', 'shots', 'RETAINED', true, 'Ready: DailyFaceoff goalies/lines, ESPN injuries, official roster. The starter flag is repaired for the live runner.', 'Statistically significant but marginal: 0.27% of the incumbent’s holdout CRPS, below the 1% materiality floor.'),
  row('NHL', 'goals', 'RETAINED', true, 'As above.', 'A tie with the incumbent (0.15%).'),
  row('NHL', 'assists', 'RETAINED', true, 'As above.', 'Significant but marginal: 0.95% of the incumbent’s holdout CRPS, below the 1% materiality floor.'),
  row('NHL', 'points', 'RETAINED', true, 'As above.', 'Significant but marginal: 0.71% of the incumbent’s holdout CRPS, below the 1% materiality floor.'),
  row('NHL', 'saves', 'RETAINED', true, 'As above.', 'The challenger is worse than the incumbent goalie-saves model on holdout.'),
  row('NHL', 'team_goals', 'RETAINED', true, 'As above.', 'Statistically tied with the incumbent.'),
];

/**
 * Absolute publication standard per family (docs/PROJECTION_ABSOLUTE_ACCURACY.md). Recorded for every promoted family with no
 * incumbent comparison and for CFB's displayed team points. The status must equal the verdict recomputed from the frozen
 * per-period evidence (tests/projectionApprovals.test.ts), so it cannot drift from the numbers.
 */
const PUBLICATION: Record<string, NonNullable<Approval['publication']>> = {
  'NFL:team_pass_attempts': { standard: 'MET_WITH_CAVEATS', caveat: 'Low information: team pass attempts are mostly game-script noise (the model explains about 8% of the variance); read the range, not the point.' },
  'NFL:team_rush_attempts': { standard: 'MET_WITH_CAVEATS', caveat: 'Low information: team rush attempts are mostly game-script noise (the model explains about 9% of the variance); not yet confirmed on 2026 games.' },
  'CFB:team_points': { standard: 'MET' },
  'CFB:plays': { standard: 'MET' },
  'CFB:points_per_play': { standard: 'MET' },
  'CFB:team_passing_yards': { standard: 'MET_WITH_CAVEATS', caveat: 'Ranges run slightly wide (80% ranges contain about 83% of outcomes), so they overstate the risk a little.' },
  'CFB:team_rushing_yards': { standard: 'MET_WITH_CAVEATS', caveat: 'Ranges run slightly wide (80% ranges contain about 83–84% of outcomes), so they overstate the risk a little.' },
  // 2026 games to date: the 80% range caught 73.2% and the 90% range 85.1% (more than 3 standard errors under). Withheld until the
  // 2026 ESPN-source discrepancy is explained or enough live games show the ranges are calibrated.
  'CFB:success_rate': { standard: 'NOT_MET' },
};

export const APPROVALS: readonly Approval[] = RAW_APPROVALS.map((a) => (PUBLICATION[`${a.sport}:${a.family}`] ? { ...a, publication: PUBLICATION[`${a.sport}:${a.family}`] } : a));

const BY_KEY = new Map(APPROVALS.map((a) => [`${a.sport}:${a.family}`, a]));
export const approvalFor = (sport: string, family: string): Approval | null => BY_KEY.get(`${sport.toUpperCase()}:${family}`) ?? null;

/**
 * Build-time rollback switch, `VITE_SIFT_PROJECTION_ENGINES="NBA:points=legacy;MLB:*=legacy"`. It can only move a family
 * BACK to the legacy engine: a promotion is never created by configuration, only by a reviewed change to APPROVALS.
 * Reverting one family therefore needs a rebuild with this variable, not a code revert of the deployment.
 */
export function parseRollback(spec: string | undefined): { sport: string; family: string }[] {
  const out: { sport: string; family: string }[] = [];
  for (const part of (spec ?? '').split(/[;,]/)) {
    const m = /^\s*([A-Za-z]+):([A-Za-z0-9_*]+)\s*=\s*legacy\s*$/.exec(part);
    if (m) out.push({ sport: m[1].toUpperCase(), family: m[2] });
  }
  return out;
}

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const ROLLBACK = parseRollback(env.VITE_SIFT_PROJECTION_ENGINES);

/** The engine whose number SIFT shows for (sport, family). Unknown families are legacy: nothing is promoted by default. */
export function engineFor(sport: string, family: string, rollback: { sport: string; family: string }[] = ROLLBACK): Engine {
  const s = sport.toUpperCase();
  if (rollback.some((r) => r.sport === s && (r.family === '*' || r.family === family))) return 'legacy';
  return approvalFor(s, family)?.engine ?? 'legacy';
}
