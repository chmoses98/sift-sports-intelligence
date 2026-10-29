// Everything the Player Research screen shows, derived once from the address (what the viewer chose) and the published documents (what is
// true). The address holds the tab, statistic, line, window and every filter; nothing the viewer can change lives only in component state
// except the line while a finger is dragging it (it is committed to the address on release).
import { useEffect, useMemo, useState } from 'react';
import { useParams } from '../../../routing';
import { useNow } from '../../../live/hooks';
import { useRouteState } from '../../state/url';
import { playerSchema } from '../../nav/schemas';
import { usePlayerVM, type PlayerStat, type PlayerVM } from '../../data/usePlayer';
import { useSiftModel, type SiftModel } from '../../data/useSiftModel';
import { useTierRanks, type TierRanks } from '../../data/useOppUnits';
import { usePlayerGames } from './games';
import { usablePrice, type QuoteContext } from '../../data/quoteGate';
import type { PropRow } from '../../data/adapt';
import { NO_FILTERS, referenceLine, summarize, type Filters, type Obs, type Summary, type Window } from '../../model/research';
import {
  cutGames, filterChips, filterCount, hitCount, lineOfRung, nearestRung, rungOf, rungViews, sameLine, siftLaneFor, windowChips, windowLabel,
  type Cut, type CutContext, type RungView, type SiftLane, type WindowChip,
} from '../../model/playerResearch';
import type { Resolution } from '../../../lib/projectionAuthority';
import type { Price } from '../../model/types';
import { isReady, lockedReason } from '../../model/capabilities';

export type PlayerState = ReturnType<typeof useRouteState<typeof playerSchema.fields>>[0];

const NONE_OBS: Obs[] = [];
const NONE_RUNGS: { line: number; price: Price }[] = [];

export const filtersOf = (s: PlayerState): Filters => ({
  site: s.site === 'any' ? null : s.site, opp: s.opp, tier: s.tier === 'any' ? null : s.tier, rest: s.rest === 'any' ? null : s.rest,
  script: s.script === 'any' ? null : s.script, role: s.role === 'any' ? null : s.role, minMin: s.min,
});

/** A Filters value as an address patch (null clears). */
export const filterPatch = (f: Filters) => ({ site: f.site ?? 'any', opp: f.opp, tier: f.tier ?? 'any', rest: f.rest ?? 'any', script: f.script ?? 'any', role: f.role ?? 'any', min: f.minMin }) as const;

export interface PlayerView {
  slug: string;
  pid: string;
  vm: PlayerVM | null;
  loading: boolean;
  notFound: boolean;
  /** A document failed (the player's profile, the index): the screen says so and can Retry. */
  error?: unknown;
  retry?: () => void;
  /** The coming game's contract list failed: prices are absent for that reason, not because no market is listed. */
  marketsError?: unknown;
  marketsRetry?: () => void;
  /** The game log failed (not "none published"): the chart's empty state says so and can Retry. */
  histError?: unknown;
  histRetry?: () => void;
  noExplorer: boolean;
  /** The sport's capability for this screen (ready, or why not). */
  researchReady: boolean;
  researchWhy: string | null;
  state: PlayerState;
  set: ReturnType<typeof useRouteState<typeof playerSchema.fields>>[1];
  now: number;
  stat: string | null;
  statDef: PlayerStat | null;
  prop: PropRow | undefined;
  win: Window;
  filters: Filters;
  /** The line the chart, lanes and numbers use (the dragged line while a finger is down). */
  line: number | null;
  /** The line the address holds (or the listed market line): what is saved. */
  committedLine: number | null;
  /** The line is a reference (median) line, not a listed contract. */
  isRef: boolean;
  /** "7+" for a half-point line. */
  k: number | null;
  cut: Cut;
  chips: WindowChip[];
  summary: Summary;
  hit: { over: number; n: number };
  rungs: RungView[];
  /** The rung the line sits on, when it is a listed contract. */
  current: RungView | null;
  /** The pre-fee ask of the selected contract after the display gate; null shows "—". */
  ask: number | null;
  ticker: string | null;
  sift: SiftLane;
  res: Resolution | null;
  modelReady: SiftModel;
  tonightModel: { median: number; mean: number; p10: number; p90: number } | null;
  tiers: TierRanks;
  cutCtx: CutContext;
  filterChips: ReturnType<typeof filterChips>;
  filterCount: number;
  ctx: QuoteContext;
  askOf: (p: Price) => number | null;
  /** Dragging the line. */
  drag: { on: boolean; onLine: (line: number, commit: boolean) => void; setOn: (on: boolean) => void };
  /** Game Detail ids of logged games (matched from the team's schedule), for the selected bar. */
  eventIdOf: (o: Obs) => string | null;
  total: number;
}

export function usePlayerView(): PlayerView {
  const { slug = '', playerId = '' } = useParams();
  const pid = decodeURIComponent(playerId);
  const { vm, loading, notFound, noExplorer, error, retry, marketsError, marketsRetry, histError, histRetry } = usePlayerVM(slug, pid);
  const [state, set] = useRouteState(playerSchema);
  const sift = useSiftModel(vm);
  const now = useNow(15_000);
  const [dragLine, setDragLine] = useState<number | null>(null);
  const [dragOn, setDragOn] = useState(false);
  const sport = vm?.sport ?? slug.toUpperCase();

  const stats = vm?.stats ?? [];
  const stat = vm ? (stats.some((s) => s.key === state.stat) ? state.stat : (stats.find((s) => vm.props.has(s.key)) ?? stats[0])?.key ?? null) : null;
  const statDef = stats.find((s) => s.key === stat) ?? null;
  const prop = vm && stat ? vm.props.get(stat) : undefined;
  const filters = useMemo(() => filtersOf(state), [state]);
  const win = state.win;
  const oppCode = vm?.opp?.abbr ?? null;

  const tiers = useTierRanks(slug, sport, stat, filters.tier != null);
  const cutCtx = useMemo<CutContext>(() => ({ opp: oppCode, season: vm?.season ?? null, tierOf: tiers.tierOf ?? undefined }), [oppCode, vm?.season, tiers.tierOf]);
  const all = vm?.obs ?? NONE_OBS;

  const ctx = useMemo<QuoteContext>(() => ({ kind: 'list', startMs: vm?.nextStartMs ?? null, live: vm?.next?.phase === 'live' }), [vm?.nextStartMs, vm?.next?.phase]);
  const askOf = useMemo(() => (p: Price) => usablePrice(p, ctx, now)?.ask ?? null, [ctx, now]);

  const cut = useMemo(() => cutGames(all, win, filters, cutCtx), [all, win, filters, cutCtx]);

  const committedLine = useMemo(() => {
    if (!vm || !stat) return null;
    if (state.line != null) return state.line;
    if (prop) return prop.line;
    return referenceLine(cut.games.length ? cut.games : cut.pool.length ? cut.pool : all, stat);
  }, [vm, stat, state.line, prop, cut, all]);
  const line = dragLine ?? committedLine;
  const rungInputs = prop?.rungs ?? NONE_RUNGS;
  const isRef = line == null || !rungInputs.some((r) => sameLine(r.line, line));
  const k = line == null ? null : rungOf(line);

  const res = useMemo(() => (stat ? sift.resolve(stat) : null), [sift, stat]);
  const rungs = useMemo(
    () => (stat ? rungViews(rungInputs, cut.games, stat, (p) => askOf(p), (kk) => (sift.ready ? siftLaneFor(res, sport, stat, kk) : { p: null, reason: 'loading' })) : []),
    [rungInputs, cut.games, stat, askOf, sift.ready, res, sport],
  );
  const current = rungs.find((r) => sameLine(r.line, line)) ?? null;
  const chips = useMemo(() => (stat ? windowChips(all, filters, stat, line, cutCtx) : []), [all, filters, stat, line, cutCtx]);
  const summary = useMemo(() => (stat ? summarize(cut.games, stat, line) : summarize([], '', null)), [cut.games, stat, line]);
  const hc = stat ? hitCount(cut.games, stat, line) : { over: 0, n: 0, push: 0 };
  const siftLane: SiftLane = !stat || k == null ? { p: null, reason: 'not approved yet' } : sift.ready ? siftLaneFor(res, sport, stat, k) : { p: null, reason: 'loading' };
  const tonightModel = res?.kind === 'authoritative' && res.value.median != null && res.value.p10 != null && res.value.p90 != null ? { median: res.value.median, mean: res.value.mean, p10: res.value.p10, p90: res.value.p90 } : null;

  const eventIdOf = usePlayerGames(slug, vm, state.obs ? all.find((o) => o.key === state.obs) ?? null : null, state.tab === 'log' || (state.tab === 'trends' && state.view === 'replay'));

  // The line only ever snaps to a listed rung; a stat change drops a line that is not on the new ladder.
  useEffect(() => { setDragLine(null); }, [stat, state.line]);

  const readiness = isReady(slug, 'playerResearch');
  return {
    slug, pid, vm, loading, notFound, noExplorer, error, retry, marketsError, marketsRetry, histError, histRetry, researchReady: readiness, researchWhy: lockedReason(slug, 'playerResearch'),
    state, set, now, stat, statDef, prop, win, filters, line, committedLine, isRef, k, cut, chips, summary, hit: { over: hc.over, n: hc.n },
    rungs, current, ask: current?.ask ?? null, ticker: current?.ticker ?? null, sift: siftLane, res, modelReady: sift, tonightModel, tiers, cutCtx,
    filterChips: filterChips(filters), filterCount: filterCount(filters), ctx, askOf,
    drag: {
      on: dragOn, setOn: setDragOn,
      onLine: (l, commit) => { const r = nearestRung(rungInputs, l); const next = r ? r.line : l; if (commit) { setDragLine(null); set({ line: next }); } else setDragLine(next); },
    },
    eventIdOf, total: all.length,
  };
}

export { NO_FILTERS, lineOfRung, windowLabel };
