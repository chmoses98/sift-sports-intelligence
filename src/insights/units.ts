// UNITS AND DENOMINATORS — what every NFL team number is measured per, in words a fan reads at a glance.
//
// The denominators come from the publication's own metric registry descriptions (explorer/metrics.json):
// "Sacks / opponent dropbacks", "Turnovers / offensive plays", "Mean EPA per designed rush" … Sift only
// writes them down; it never converts one into another. A rate stays a rate: a turnover RATE is "% of plays",
// never "per game". Opponent-adjusted ratings are deviations from the league average of the same measure,
// and are labelled that way; the raw measure is labelled with its own window (the publication's raw team
// profile uses the last 34 games, which span seasons).
import type { MetricDef, Observation } from '../contract/types';

export type StatBasis = 'adjusted' | 'raw' | 'season' | 'other';

export interface UnitInfo {
  /** "per dropback", "% of dropbacks", "per game" — what the number is counted over. */
  per: string;
  /** What follows the value: "EPA / dropback", "of dropbacks" (after a %), "over expected" (after pts). */
  short: string;
  /** True when the value is a share of a denominator (shown as %). */
  share: boolean;
}

// Stem (after met_nfl., adj_/off_/def_ removed) → denominator. First match wins.
const STEMS: [RegExp, UnitInfo][] = [
  [/^(dropback_epa|db_epa)$/, { per: 'EPA per dropback', short: 'EPA / dropback', share: false }],
  [/^rush_epa$/, { per: 'EPA per designed run', short: 'EPA / run', share: false }],
  [/^(early_down_epa|ed_epa)$/, { per: 'EPA per 1st- and 2nd-down play', short: 'EPA / early-down play', share: false }],
  [/^rz_epa$/, { per: 'EPA per red-zone play', short: 'EPA / red-zone play', share: false }],
  [/^st_epa$/, { per: 'special-teams EPA', short: 'special-teams EPA', share: false }],
  [/^(epa_play_ng|epa_ng)$/, { per: 'EPA per play, neutral game script', short: 'EPA / play (neutral)', share: false }],
  [/^(epa_play|epa)$/, { per: 'EPA per play', short: 'EPA / play', share: false }],
  [/^(success_rate|sr)$/, { per: '% of plays with positive EPA', short: 'of plays', share: true }],
  [/^(explosive_rate|explosive)$/, { per: '% of plays that are explosive', short: 'of plays', share: true }],
  [/^(sack_rate_allowed|sack_rate)$/, { per: 'sacks per dropback (%)', short: 'of dropbacks', share: true }],
  [/^qb_hit_rate$/, { per: 'QB hits per opponent dropback (%)', short: 'of dropbacks', share: true }],
  [/^(turnover_rate|takeaway_rate|to_rate)$/, { per: 'turnovers per play (%) — a rate, not a per-game count', short: 'of plays', share: true }],
  [/^td_drive_rate$/, { per: 'touchdown drives per drive (%)', short: 'of drives', share: true }],
  [/^plays_per_drive$/, { per: 'offensive plays per drive', short: 'plays / drive', share: false }],
  [/^(no_huddle_rate)$/, { per: '% of offensive plays without a huddle', short: 'of plays', share: true }],
  [/^(shotgun_rate)$/, { per: '% of offensive plays from shotgun', short: 'of plays', share: true }],
  [/^(proe_early_ng|proe)$/, { per: 'early-down pass rate over expected (percentage points)', short: 'over expected', share: false }],
  [/^adot$/, { per: 'air yards per target', short: 'air yds / target', share: false }],
  [/^cpoe$/, { per: 'completion % over expected (percentage points)', short: 'over expected', share: false }],
  [/^(points_for|points_against|point_margin)$/, { per: 'points per game', short: 'per game', share: false }],
];

function stem(metricId: string): string {
  return metricId.replace(/^met_nfl\./, '').replace(/^adj_/, '').replace(/^(off|def)_/, '');
}

/** The denominator of an NFL team metric, or null when the registry gives Sift nothing to go on. */
export function unitInfo(metricId: string): UnitInfo | null {
  const s = stem(metricId);
  for (const [re, u] of STEMS) if (re.test(s)) return u;
  return null;
}

export const isAdjusted = (metricId: string, def?: Pick<MetricDef, 'category'> | null) =>
  /^met_nfl\.adj_/.test(metricId) || def?.category === 'opponent-adjusted' || def?.category === 'opponent_adjusted';

/** Which footing an observation stands on, from its window (ADJ_RIDGE = opponent-adjusted; L34/L6 = raw). */
export function basisOf(o: Pick<Observation, 'metric_id' | 'window'> | null | undefined): StatBasis {
  if (!o) return 'other';
  if (o.window?.label === 'ADJ_RIDGE' || isAdjusted(o.metric_id)) return 'adjusted';
  if (o.window?.label === 'SEASON') return 'season';
  if (o.window?.label === 'L34' || o.window?.label === 'L6') return 'raw';
  return 'other';
}

/** The tag a value carries on screen: "Adjusted", "Raw · last 34 games", "Season". */
export function basisTag(o: Pick<Observation, 'metric_id' | 'window'> | null | undefined): string {
  const b = basisOf(o);
  if (b === 'adjusted') return 'Adjusted';
  if (b === 'season') return 'Season';
  if (b === 'raw') return o?.window?.label === 'L6' ? 'Raw · last 6 games' : 'Raw · last 34 games';
  return '';
}

/**
 * The unit line under a value. Adjusted ratings are a difference from the league average of the same measure
 * ("EPA per dropback vs league average"); raw values are the measure itself.
 */
export function unitLine(metricId: string, def?: Pick<MetricDef, 'unit'> | null): string {
  const u = unitInfo(metricId);
  const s = stem(metricId);
  if (/^met_nfl\.adj_/.test(metricId) || def?.unit === 'deviation from league mean') {
    if (u?.share) return `pts vs league average (% ${u.short})`;
    if (/proe|cpoe/.test(s)) return 'pts vs league average';
    return u ? `${u.short} vs league average` : 'vs league average';
  }
  if (/^points_|^point_margin/.test(s)) return 'per game';
  if (u?.share) return `% ${u.short}`;
  if (u && /proe|cpoe/.test(s)) return `pts ${u.short}`;
  if (u) return u.short;
  return def?.unit ?? '';
}

/** A value with its unit, for a sentence: "14.4% of dropbacks", "−0.8 pts over expected", "+0.123 EPA / play". */
export function valueWithUnit(metricId: string, v: number | null | undefined, def?: Pick<MetricDef, 'unit'> | null): string {
  const t = formatStat(metricId, v, def);
  if (t === '—') return t;
  const u = unitInfo(metricId);
  const adjusted = /^met_nfl\.adj_/.test(metricId) || def?.unit === 'deviation from league mean';
  if (adjusted) return `${t} vs league average${u?.share ? ` (% ${u.short})` : u && !/proe|cpoe/.test(stem(metricId)) ? ` (${u.short})` : ''}`;
  if (!u) return t;
  if (/^points_|^point_margin/.test(stem(metricId))) return `${t} per game`;
  return `${t} ${u.short}`;
}

/** "#4 of 32" — every rank says how many it is out of. */
export const rankOf = (rank: number | null | undefined, of: number | null | undefined) =>
  rank == null ? 'unranked' : of ? `#${rank} of ${of}` : `#${rank}`;

const signedN = (v: number, dp: number) => {
  const t = Math.abs(v).toFixed(dp);
  return Number(t) === 0 ? t : `${v > 0 ? '+' : '−'}${t}`;
};

/**
 * A team metric value written in its own unit. Shares show as % (raw) or percentage points vs average (adjusted);
 * EPA keeps three decimals with its sign; counts and points one decimal. Never converts a rate into a count.
 */
export function formatStat(metricId: string, v: number | null | undefined, def?: Pick<MetricDef, 'unit'> | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const u = unitInfo(metricId);
  const adjusted = /^met_nfl\.adj_/.test(metricId) || def?.unit === 'deviation from league mean';
  const s = stem(metricId);
  if (adjusted) {
    if (u?.share) return `${signedN(v * 100, Math.abs(v * 100) < 1 ? 2 : 1)} pts`;
    if (/proe|cpoe/.test(s)) return `${signedN(v, 1)} pts`;
    return signedN(v, 3);
  }
  if (u?.share || def?.unit === 'share') return `${(v * 100).toFixed(1)}%`;
  if (/proe|cpoe/.test(s) || def?.unit === 'pct points') return `${signedN(v, 1)} pts`;
  if (/epa/.test(s) || /^EPA/.test(def?.unit ?? '')) return signedN(v, 3);
  if (s === 'point_margin') return signedN(v, 1);
  return v.toFixed(Math.abs(v) >= 100 ? 0 : 1);
}

/**
 * The formatter a metric screen should use: NFL team metrics with a known denominator are written by formatStat (so
 * an adjusted share reads "+1.8 pts", a raw share "8.1%"); anything else keeps the caller's generic formatter.
 */
export function statFormatter(metricId: string, def: Pick<MetricDef, 'unit'> | null | undefined, fallback: (v: number | null | undefined) => string): (v: number | null | undefined) => string {
  return /^met_nfl\./.test(metricId) && unitInfo(metricId) ? (v) => formatStat(metricId, v, def) : fallback;
}
