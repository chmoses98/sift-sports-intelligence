// The event research document already carries both teams' league ranks for every matchup statistic (`matchup` rows: one observation per side with
// its rank and the universe it is out of). This reads those rows as the same rank source the team profiles give, so the Overview can show
// opponent-adjusted offense-against-defense comparisons without fetching a team profile. Pure: no fetching, no React, nothing estimated.
// A statistic the document does not carry for a side is simply absent; the unit rows then drop that unit.
import type { EventResearchDoc, MatchupRow, Observation } from '../../../contract/types';
import type { V3Game } from '../../model/types';
import { shortMetricId, percentileOf } from '../research/normalize';
import { unitRows, unitsFor, MATCHUP_WINDOW, type RankSource, type UnitRow } from '../research/matchup';
import type { TeamMetric, WindowObs } from '../research/types';

const windowOf = (o: Observation): WindowObs => ({
  value: o.value, adjusted: o.adjusted_value, rank: o.context?.rank ?? null, n: o.context?.universe_size ?? null,
  percentile: o.context?.percentile ?? percentileOf(o.context?.rank ?? null, o.context?.universe_size ?? null),
  rankingId: o.context?.ranking_id ?? null, higherIsBetter: o.context?.higher_is_better ?? null, sample: o.sample_size, asOf: o.as_of, display: o.display_value, universe: o.context?.universe_label ?? null,
});

function source(rows: MatchupRow[], side: 'away' | 'home'): RankSource {
  const metrics = new Map<string, TeamMetric>();
  for (const m of rows) {
    const o = m[side];
    if (!o) continue;
    const id = shortMetricId(m.metric_id);
    const t = metrics.get(id) ?? { metricId: m.metric_id, id, unit: o.unit, windows: {} };
    // A split observation never replaces the unsplit one (the same rule as a team profile).
    if (!o.split || !t.windows[o.window.label]) t.windows[o.window.label] = windowOf(o);
    metrics.set(id, t);
  }
  return { metrics };
}

/** The two teams' ranks as the event's research document states them (null when it carries no matchup rows). */
export function ranksFromResearch(research: EventResearchDoc | null | undefined): { away: RankSource; home: RankSource } | null {
  const rows = research?.matchup ?? [];
  if (!rows.length) return null;
  return { away: source(rows, 'away'), home: source(rows, 'home') };
}

export interface ResearchUnits {
  /** Away offense against home defense, then home offense against away defense, in the sport's declared unit order. */
  rowsAway: UnitRow[];
  rowsHome: UnitRow[];
  away: RankSource;
  home: RankSource;
}

/** Unit rows for a sport that declares units (NFL), from the research document alone. Null when the sport has no units or the document no rows. */
export function unitsFromResearch(g: Pick<V3Game, 'slug' | 'away' | 'home'>, research: EventResearchDoc | null | undefined): ResearchUnits | null {
  const units = unitsFor(g.slug);
  const ranks = ranksFromResearch(research);
  if (!units.length || !ranks) return null;
  const rowsAway = unitRows(units, g.away.id, g.home.id, ranks.away, ranks.home);
  const rowsHome = unitRows(units, g.home.id, g.away.id, ranks.home, ranks.away);
  if (!rowsAway.length && !rowsHome.length) return null;
  return { rowsAway, rowsHome, ...ranks };
}

export { MATCHUP_WINDOW };
