// The opposing unit a player is facing, from the published opponent-adjusted team statistics (src/v3/data/research): the opponent's own
// profile gives each unit's value, rank and the universe the rank is out of; one ranking document (all teams) draws the league strip and
// gives every past opponent's CURRENT season rank for the Top-10 / Bottom-10 filter tiers. Both are fetched only when something needs them
// (the Matchup tab, an applied tier, the filters sheet), and only a statistic the publication carries is drawn: the rest are named as not published.
import { useMemo } from 'react';
import { defaultWindow } from './research/normalize';
import { useRankingCatalog, useRankingDoc, useTeamProfile } from './research/hooks';
import type { RankingVM, WindowObs } from './research/types';
import { oppUnitsFor, tierOfRank, type OppUnit } from '../model/playerResearch';

export interface OppUnitView extends OppUnit {
  /** The published window the rank is read in ("ADJ_RIDGE": the opponent-adjusted season view). */
  window: string;
  obs: WindowObs;
}

export interface OppProfile {
  unit: string | null;
  shown: OppUnitView[];
  /** Candidate statistics the opponent's profile does not publish. */
  missing: OppUnit[];
  loading: boolean;
  /** Why there is nothing to draw, when there is nothing. */
  why: string | null;
}

export function useOppProfile(slug: string, sport: string, stat: string | null, oppCode: string | null, enabled: boolean): OppProfile {
  const spec = stat ? oppUnitsFor(sport, stat) : null;
  const { profile, loading, error } = useTeamProfile(enabled && spec && oppCode ? slug : '', enabled && spec ? oppCode : null);
  return useMemo(() => {
    if (!spec) return { unit: null, shown: [], missing: [], loading: false, why: `No opposing-unit rankings are published for ${sport} players yet.` };
    if (!oppCode) return { unit: spec.unit, shown: [], missing: [], loading: false, why: 'There is no coming opponent on the published slate.' };
    if (loading) return { unit: spec.unit, shown: [], missing: [], loading: true, why: null };
    if (!profile || error) return { unit: spec.unit, shown: [], missing: spec.candidates, loading: false, why: `${oppCode} has no published team profile.` };
    const shown: OppUnitView[] = [];
    const missing: OppUnit[] = [];
    for (const c of spec.candidates) {
      const m = profile.metrics.get(c.id);
      const w = m ? defaultWindow(Object.keys(m.windows)) : null;
      const obs = m && w ? m.windows[w] : undefined;
      if (obs && obs.rank != null && obs.n != null) shown.push({ ...c, window: w!, obs }); else missing.push(c);
    }
    return { unit: spec.unit, shown, missing, loading: false, why: shown.length ? null : `${oppCode}'s ${spec.unit} rankings are not published yet.` };
  }, [spec, sport, oppCode, loading, profile, error]);
}

/** One ranking document for a unit: every team's value and rank (the league strip). Fetched only when drawn. */
export function useUnitRanking(slug: string, unit: OppUnitView | null): { ranking: RankingVM | null; loading: boolean } {
  const { ranking, loading } = useRankingDoc(unit ? slug : '', unit?.obs.rankingId ?? null);
  return { ranking, loading };
}

export interface TierRanks {
  /** Each opponent's tier by its current season rank for the opposing unit, or null when the ranks are not available. */
  tierOf: ((opp: string) => 'top' | 'bottom' | null) | null;
  /** What the tiers are measured on ("EPA per dropback allowed"). */
  unit: OppUnit | null;
  loading: boolean;
  why: string | null;
}

export function useTierRanks(slug: string, sport: string, stat: string | null, enabled: boolean): TierRanks {
  const spec = stat ? oppUnitsFor(sport, stat) : null;
  const on = enabled && !!spec;
  const { catalog, loading: cl } = useRankingCatalog(on ? slug : '');
  const pick = useMemo(() => {
    if (!spec || !catalog) return null;
    for (const c of spec.candidates) {
      const w = catalog.windows.get(`met_${slug}.${c.id}`);
      const label = w ? defaultWindow([...w.keys()]) : null;
      const id = label ? w!.get(label) ?? null : null;
      if (id) return { unit: c, rankingId: id };
    }
    return null;
  }, [spec, catalog, slug]);
  const { ranking, loading: rl } = useRankingDoc(on && pick ? slug : '', pick?.rankingId ?? null);
  return useMemo(() => {
    if (!spec) return { tierOf: null, unit: null, loading: false, why: `Opponent tiers need published opposing-unit rankings, which ${sport} players do not have yet.` };
    if (!on) return { tierOf: null, unit: pick?.unit ?? null, loading: false, why: null };
    if (cl || rl) return { tierOf: null, unit: pick?.unit ?? null, loading: true, why: null };
    if (!ranking || !pick) return { tierOf: null, unit: null, loading: false, why: 'The opposing-unit ranking is not published yet.' };
    const byCode = new Map(ranking.entries.map((e) => [e.code, e.rank]));
    return { tierOf: (opp: string) => tierOfRank(byCode.get(opp) ?? null, ranking.n), unit: pick.unit, loading: false, why: null };
  }, [spec, on, cl, rl, ranking, pick, sport]);
}
