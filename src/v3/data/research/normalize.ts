// Pure normalizers from published documents to the view models in types.ts. No fetching, no React, no clock: testable against
// real documents. A value the publication does not carry is null, never a substitute.
import type { EntityProfileDoc, ExplorerIndexDoc, MetricDef, Observation, ProfileGame, RankingDoc } from '../../../contract/types';
import type { AvailabilityRow, Outcome, RankingCatalog, RankingVM, ScheduleEvent, TeamGame, TeamMetric, TeamProfile, TeamRecord, WindowObs } from './types';

/** "met_nfl.adj_off_epa" to "adj_off_epa". */
export const shortMetricId = (metricId: string) => metricId.replace(/^met_[a-z0-9]+\./, '');

/** Percentile 0 worst to 100 best from a rank out of n (rank 1 is best), as the design system defines it. */
export const percentileOf = (rank: number | null, n: number | null): number | null => (rank == null || n == null || n < 2 ? null : ((n - rank) / (n - 1)) * 100);

const obsToWindow = (o: Observation): WindowObs => ({
  value: o.value,
  adjusted: o.adjusted_value,
  rank: o.context?.rank ?? null,
  n: o.context?.universe_size ?? null,
  percentile: o.context?.percentile ?? percentileOf(o.context?.rank ?? null, o.context?.universe_size ?? null),
  rankingId: o.context?.ranking_id ?? null,
  higherIsBetter: o.context?.higher_is_better ?? null,
  sample: o.sample_size,
  asOf: o.as_of,
  display: o.display_value,
  universe: o.context?.universe_label ?? null,
});

const outcomeOf = (s: string | null | undefined): Outcome | null => {
  const u = (s ?? '').toUpperCase();
  return u === 'W' || u === 'L' || u === 'T' || u === 'OTL' ? u : null;
};

const toGame = (g: ProfileGame): TeamGame => ({
  eventId: g.event_id,
  competition: g.competition,
  opponentId: g.opponent_id,
  opponentName: g.opponent_name,
  home: g.home_away === 'HOME' ? true : g.home_away === 'AWAY' ? false : null,
  startUtc: g.start_time_utc,
  status: g.status,
  result: g.result && g.result.for != null && g.result.against != null ? { for: g.result.for, against: g.result.against, outcome: outcomeOf(g.result.outcome) } : null,
});

/** The season a date belongs to: NHL and NBA seasons span two calendar years ("2026-27"), NFL and MLB are the year. */
export function seasonOfDate(slug: string, iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  if (slug === 'nhl' || slug === 'nba' || slug === 'cbb') { const s = m >= 8 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; }
  if (slug === 'nfl' || slug === 'cfb') return String(m >= 3 ? y : y - 1);
  return String(y);
}

const fmtRecord = (w: number, l: number, t: number | null, otl: number | null) => (otl != null ? `${w}–${l}–${otl}` : t ? `${w}–${l}–${t}` : `${w}–${l}`);

/**
 * The team's record for the current season.
 *  - Hockey: wins, regulation losses and overtime losses, separately. The publication states the full record as the display value of
 *    the points-percentage observation for completed seasons; for the current season it carries the percentage and the results, and
 *    overtime losses are derived from the official percentage (points = percentage x 2 x games played). Unreconcilable: no record.
 *  - Other sports: counted from completed regular-season results of the current season.
 */
export function teamRecord(slug: string, profile: { games: TeamGame[]; metrics: Map<string, TeamMetric>; season: string | null }): TeamRecord | null {
  const season = profile.season;
  const done = profile.games.filter((g) => g.status === 'FINAL' && g.result && (!season || seasonOfDate(slug, g.startUtc) === season || (g.competition ?? '').startsWith(season)));
  const regular = done.filter((g) => !/pre|post|playoff|cup|exhib/i.test(g.competition ?? ''));
  const games = regular.length ? regular : done;
  const wins = games.filter((g) => g.result!.outcome === 'W').length;
  const losses = games.filter((g) => g.result!.outcome === 'L').length;
  const ties = games.filter((g) => g.result!.outcome === 'T').length;
  if (slug === 'nhl') {
    const pp = profile.metrics.get('points_pct');
    const w = season ? pp?.windows[season] : undefined;
    if (w?.display && /^\d+-\d+-\d+$/.test(w.display)) {
      const [a, b, c] = w.display.split('-').map(Number);
      return { wins: a, losses: b, ties: null, otLosses: c, games: a + b + c, source: 'published', text: fmtRecord(a, b, null, c) };
    }
    if (w?.value == null || !games.length) return null;
    const gp = games.length, points = Math.round(w.value * 2 * gp);
    const nonWins = gp - wins;
    const otl = points - 2 * wins;
    if (otl < 0 || otl > nonWins || Math.abs(points / (2 * gp) - w.value) > 0.6 / (2 * gp)) return null;
    return { wins, losses: nonWins - otl, ties: null, otLosses: otl, games: gp, source: 'derived', text: fmtRecord(wins, nonWins - otl, null, otl) };
  }
  if (!games.length) return null;
  return { wins, losses, ties: ties || null, otLosses: null, games: games.length, source: 'results', text: fmtRecord(wins, losses, ties || null, null) };
}

export function normalizeTeamProfile(doc: EntityProfileDoc, slug: string): TeamProfile {
  const metrics = new Map<string, TeamMetric>();
  for (const o of doc.metrics) {
    const key = shortMetricId(o.metric_id);
    const m = metrics.get(key) ?? { metricId: o.metric_id, id: key, unit: o.unit, windows: {} };
    // One observation per window; a split observation (a different universe) never overwrites the unsplit one.
    if (!o.split || !m.windows[o.window.label]) m.windows[o.window.label] = obsToWindow(o);
    metrics.set(key, m);
  }
  const games = doc.games.map(toGame).sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  const season = doc.season ?? null;
  const base = { games, metrics, season };
  return {
    participantId: doc.entity.participant_id,
    abbr: doc.entity.short_name,
    name: doc.entity.display_name,
    slug,
    season,
    asOf: doc.generated_at ?? null,
    metrics,
    games,
    availability: doc.availability.map((a): AvailabilityRow => ({ status: a.status, detail: a.detail, asOf: a.as_of, eventId: a.event_id, source: a.source })),
    players: doc.players.map((p) => ({ participantId: p.participant_id, name: p.display_name, role: p.role ?? null })),
    seriesByMetric: new Map(doc.series.map((s) => [s.metric_id, s.series_id])),
    record: teamRecord(slug, base),
    limitations: doc.quality?.limitations ?? [],
  };
}

/** Which ranking is which, read from the profiles' own ranking lists (authoritative: metric id and window label come with the id). */
export function buildRankingCatalog(profiles: EntityProfileDoc[]): RankingCatalog {
  const windows: RankingCatalog['windows'] = new Map();
  const byRanking: RankingCatalog['byRanking'] = new Map();
  for (const p of profiles) {
    for (const r of p.rankings ?? []) {
      if (r.split) continue;
      const w = windows.get(r.metric_id) ?? new Map<string, string>();
      if (!w.has(r.window_label)) w.set(r.window_label, r.ranking_id);
      windows.set(r.metric_id, w);
      byRanking.set(r.ranking_id, { metricId: r.metric_id, window: r.window_label });
    }
  }
  return { windows, byRanking };
}

/** The window a statistic opens in when none is chosen: the sport's own current-view window, else the longest season window. */
export function defaultWindow(available: string[], prefer: string[] = []): string | null {
  for (const p of [...prefer, 'ADJ_RIDGE', 'SEASON']) if (available.includes(p)) return p;
  const season = available.find((w) => /^\d{4}(-\d{2})?$/.test(w));
  return season ?? available[0] ?? null;
}

export function normalizeRanking(doc: RankingDoc, def: MetricDef | undefined, teamCodeOf: (entityId: string, short: string | null) => string): RankingVM {
  return {
    rankingId: doc.ranking_id,
    metricId: doc.metric_id,
    id: shortMetricId(doc.metric_id),
    name: def?.name ?? shortMetricId(doc.metric_id).replace(/_/g, ' '),
    unit: def?.unit ?? null,
    window: doc.window?.label ?? 'SEASON',
    higherIsBetter: doc.higher_is_better,
    universe: doc.universe?.label ?? '',
    n: doc.universe?.size ?? doc.entries.length,
    season: doc.universe?.season ?? null,
    asOf: doc.as_of,
    entries: doc.entries.map((e) => ({ rank: e.rank, entityId: e.entity_id, code: teamCodeOf(e.entity_id, e.short_name), name: e.display_name, value: e.value, adjusted: e.adjusted_value, percentile: e.percentile ?? percentileOf(e.rank, doc.universe?.size ?? doc.entries.length), sample: e.sample_size })),
    summary: { mean: doc.summary.mean, median: doc.summary.median, min: doc.summary.min, max: doc.summary.max, stdev: doc.summary.stdev },
    limitations: def?.known_limitations?.length ? def.known_limitations : doc.quality?.limitations ?? [],
    adjusted: def?.category === 'opponent-adjusted' || /adj/i.test(doc.window?.label ?? ''),
  };
}

/** The schedule authority: start times come from the league schedule in the explorer index, never from Kalshi event metadata. */
export function scheduleOf(index: ExplorerIndexDoc): ScheduleEvent[] {
  const code = new Map(index.teams.map((t) => [t.participant_id, t.short_name]));
  return index.events
    .map((e) => ({ eventId: e.event_id, startUtc: e.start_time_utc, status: e.status, homeId: e.home_participant, awayId: e.away_participant, homeCode: e.home_participant ? code.get(e.home_participant) ?? null : null, awayCode: e.away_participant ? code.get(e.away_participant) ?? null : null }))
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}

/** The team's next scheduled game after `now`, from the schedule authority. */
export function nextGame(schedule: ScheduleEvent[], participantId: string, now: number): ScheduleEvent | null {
  return schedule.find((e) => (e.homeId === participantId || e.awayId === participantId) && e.status !== 'FINAL' && !/CANCEL|POSTPON/i.test(e.status) && Date.parse(e.startUtc) >= now - 4 * 3600_000) ?? null;
}
