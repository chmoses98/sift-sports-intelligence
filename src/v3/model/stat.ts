/** Number formatting for a statistic by its published unit. Shares print as percentages; EPA-style rates keep three places. */
export function fmtStat(v: number | null | undefined, unit: string | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const u = (unit ?? '').toLowerCase();
  if (u === 'share' || u === 'rate' || u === 'pct') return `${(v * 100).toFixed(1)}%`;
  if (u.includes('pct points') || u.includes('percent')) return v.toFixed(1);
  if (u.includes('epa') || u.includes('deviation')) return v.toFixed(3);
  if (Math.abs(v) >= 100) return String(Math.round(v));
  return String(Math.round(v * 100) / 100);
}

export type Window = 'L10' | 'L20' | 'SEASON';
