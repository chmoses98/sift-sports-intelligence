// Presentation formatting. Never changes a value, only how it is written.
import type { MetricDef } from '../contract/types';

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const pct = (v: number | null | undefined, dp = 1) => (v == null ? '—' : `${(v * 100).toFixed(dp)}%`);

export const signed = (v: number, dp: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(dp);

/** Kalshi YES price (0..1) as cents. */
export const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 1000) / 10}¢`);

export function decimalsFor(absMax: number): number {
  if (absMax < 0.05) return 4;
  if (absMax < 2) return 3;
  if (absMax < 20) return 2;
  return 1;
}

/** A formatter for one metric; `scale` is the largest |value| in its universe when known. */
export function metricFormatter(m: Pick<MetricDef, 'unit' | 'stat_type'> | null | undefined, scale?: number | null) {
  const unit = m?.unit ?? null;
  return (v: number | null | undefined): string => {
    if (v == null || Number.isNaN(v)) return '—';
    switch (unit) {
      case 'share':
      case 'probability':
        return pct(v, 1);
      case 'pct points':
        return `${signed(v, 1)} pp`;
      case 'EPA/play':
      case 'EPA/dropback':
      case 'EPA/rush':
        return signed(v, 3);
      case 'deviation from league mean':
        return signed(v, decimalsFor(Math.abs(scale ?? v)));
      case 'points':
        return v.toFixed(1);
      case 'touchdowns':
        return v.toFixed(2);
      case 'plays':
        return v.toFixed(2);
      case 'yards':
      case 'attempts':
      case 'carries':
      case 'completions':
      case 'receptions':
        return v.toFixed(1);
      default:
        return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(decimalsFor(Math.abs(scale ?? v)));
    }
  };
}

export function unitLabel(unit: string | null | undefined): string {
  if (!unit) return '';
  if (unit === 'share') return '% of plays';
  if (unit === 'deviation from league mean') return 'vs league mean';
  return unit;
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function kickoff(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

export function exactTime(iso: string | null | undefined): string {
  if (!iso) return 'no timestamp';
  const d = new Date(iso);
  return `${d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' })} (${iso})`;
}

export const timeZone = TZ;

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'unknown';
  const s = Math.round((now - Date.parse(iso)) / 1000);
  const fut = s < 0;
  const a = Math.abs(s);
  const txt = a < 60 ? `${a}s` : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}d`;
  return fut ? `in ${txt}` : `${txt} ago`;
}

export function until(iso: string, now = Date.now()): string {
  const s = Math.round((Date.parse(iso) - now) / 1000);
  if (s <= 0) return 'started';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 48) return `in ${Math.round(h / 24)}d`;
  return h ? `in ${h}h ${m}m` : `in ${m}m`;
}

export const compact = (n: number) =>
  Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export function familyLabel(f: string): string {
  const map: Record<string, string> = {
    game_winner: 'Moneyline', spread: 'Spread', total: 'Total', team_total: 'Team total', period_winner: 'Period winner',
    both_teams_score_n: 'Both teams score', team_stat: 'Team stat', race_to_n: 'Race to N', win_margin_bucket: 'Win margin',
    half_full_result: 'Half / full', first_td_team: 'First TD team', player_stat: 'Player stat', player_td: 'Touchdown scorer',
    anytime_td: 'Anytime TD', first_td: 'First TD',
    // MLB (edge-finder-api families)
    game_result: 'Moneyline', ml: 'Moneyline', ml_home: 'Moneyline', ml_away: 'Moneyline', winning_margin: 'Run line',
    game_total: 'Total runs', inning_result: 'Inning result', inning_total: 'Total runs', first_inning_run: 'Run in 1st inning',
    yrfi: 'Run in 1st inning', f5_ml: 'Moneyline', pitcher_strikeouts: 'Strikeouts', pitcher_outs: 'Outs recorded', hitter_hits: 'Hits',
    hitter_total_bases: 'Total bases', hitter_hits_runs_rbis: 'Hits + runs + RBIs', hitter_hrr: 'Hits + runs + RBIs', hitter_rbis: 'RBIs',
    hitter_rbi: 'RBIs', hitter_runs: 'Runs', hitter_stolen_bases: 'Stolen bases', hitter_home_runs: 'Home runs',
  };
  return map[f] ?? f.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Some published display names repeat the nickname ("New York Jets Jets"). Presentation only: the
 * repeated final word is dropped; ids and packets keep the published name.
 */
export function displayName(name: string | null | undefined): string {
  if (!name) return '';
  const w = name.split(' ');
  return w.length > 2 && w[w.length - 1] === w[w.length - 2] ? w.slice(0, -1).join(' ') : name;
}
