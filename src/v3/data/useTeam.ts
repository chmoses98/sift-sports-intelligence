// Team data: the sport's explorer profile (real) or a deterministic labelled sample. One view-model for both so the screen cannot tell.
import { useMemo } from 'react';
import type { EntityProfileDoc, MetricDef, Observation, RankingDoc } from '../../contract/types';
import { useAsync, useRepo } from '../../data/hooks';
import { sportBySlug } from '../../data/sports';
import { heroTeam } from '../../lib/hero/input';
import { completedGames, recordOf } from '../../lib/gamedata';
import { demoOn } from '../state/prefs';
import { useSlate } from './useSlate';
import type { V3Game, V3Team } from '../model/types';

export type MetricGroup = 'offense' | 'defense' | 'adjusted' | 'style' | 'results' | 'other';
export interface MetricRow {
  id: string;
  name: string;
  value: string;
  rank: number | null;
  n: number | null;
  higherIsBetter: boolean | null;
  group: MetricGroup;
  window: string;
  unit: string | null;
  /** The in-app Stat Detail route (a ranking exists for this metric and window), or undefined. */
  route?: string;
}
export interface ResultRow { eventId: string; date: string; oppId: string; oppName: string; home: boolean; for: number; against: number; outcome: 'W' | 'L' | 'T'; opp: V3Team }
export interface InjuryItem { player: string; position: string | null; status: string; note: string | null; asOf: string | null }
export interface RosterItem { id: string; name: string; role: string | null }
export interface TeamVM {
  team: V3Team;
  league: string;
  record: string | null;
  season: string | null;
  metrics: MetricRow[];
  results: ResultRow[];
  roster: RosterItem[];
  injuries: InjuryItem[];
  asOf: string | null;
  provenance: 'publication' | 'demo' | 'none';
  /** Why a section is empty, in words (never a blank panel). */
  why: { stats?: string; roster?: string; injuries?: string; results?: string };
}

const GROUPS: Record<string, MetricGroup> = { offense: 'offense', defense: 'defense', 'opponent-adjusted': 'adjusted', style: 'style', results: 'results' };

const fmtValue = (o: Observation, unit: string | null) => {
  if (o.display_value) return o.display_value;
  if (o.value == null) return '—';
  const v = Math.abs(o.value) >= 100 ? Math.round(o.value) : Math.round(o.value * 1000) / 1000;
  const share = unit === 'share' ? `${(o.value * 100).toFixed(1)}%` : null;
  return share ?? String(v);
};

export function metricRows(p: EntityProfileDoc, defs: Map<string, MetricDef> | undefined, slug: string): MetricRow[] {
  const rankingFor = new Map<string, string>();
  for (const r of p.rankings ?? []) {
    const k = `${r.metric_id}|${r.window_label}`;
    if (!rankingFor.has(k)) rankingFor.set(k, r.ranking_id);
  }
  const rows: MetricRow[] = [];
  for (const o of p.metrics ?? []) {
    const def = defs?.get(o.metric_id);
    const win = o.window?.label ?? 'SEASON';
    // Raw season rows and the adjusted rows; the L6/L34 windows are one tap deeper in the Stat Detail.
    if (o.split || !/^(SEASON|ADJ_RIDGE)$/i.test(win)) continue;
    const rid = rankingFor.get(`${o.metric_id}|${win}`);
    rows.push({
      id: `${o.metric_id}|${win}`, name: def?.name ?? o.metric_id.replace(/^met_[a-z]+\./, '').replace(/_/g, ' '),
      value: fmtValue(o, o.unit), rank: o.context?.rank ?? null, n: o.context?.universe_size ?? null,
      higherIsBetter: o.context?.higher_is_better ?? def?.higher_is_better ?? null,
      group: GROUPS[def?.category ?? ''] ?? 'other', window: win, unit: o.unit,
      route: rid ? `/v3/stat/${slug}/${encodeURIComponent(rid)}` : undefined,
    });
  }
  return rows;
}

const hash = (s: string) => { let h = 11; for (const c of s) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; };

function demoVM(team: V3Team, games: V3Game[]): TeamVM {
  const h = hash(team.id);
  const n = team.sport === 'NBA' ? 30 : team.sport === 'NFL' ? 32 : 134;
  const names: [string, MetricGroup, string][] = [['Points per game', 'offense', '28.4'], ['Yards per game', 'offense', '362.1'], ['Success rate', 'offense', '47.1%'], ['Points allowed per game', 'defense', '19.6'], ['Explosive plays allowed', 'defense', '12.8%'], ['Adjusted EPA per play', 'adjusted', '0.04']];
  const same = games.filter((g) => g.slug === team.slug).flatMap((g) => [g.away, g.home]).filter((t, i, a) => t.id !== team.id && a.findIndex((x) => x.id === t.id) === i);
  const pool = (same.length ? same : [team]).sort((a, b) => (hash(a.id + team.id) % 97) - (hash(b.id + team.id) % 97));
  return {
    team, league: team.sport === 'CFB' ? 'NCAAF' : team.sport, record: `${(h % 5) + 3}-${(h % 3) + 1}`, season: null,
    metrics: names.map(([name, group, value], i) => ({ id: `sample-${i}`, name, value, rank: ((h >> i) % n) + 1, n, higherIsBetter: true, group, window: 'SEASON', unit: null, route: `/v3/stat/${team.slug}/sample-${i}?team=${team.id}` })),
    results: pool.slice(0, 5).map((o, i) => { const f = 14 + ((h >> i) % 24), a = 10 + ((h >> (i + 3)) % 20); return { eventId: `sample-${i}`, date: new Date(Date.now() - (i + 1) * 7 * 864e5).toISOString(), oppId: o.id, oppName: o.name, home: i % 2 === 0, for: f, against: a, outcome: f > a ? 'W' : 'L', opp: o }; }),
    roster: [], injuries: [], asOf: null, provenance: 'demo',
    why: { roster: 'The sample data has no roster.', injuries: 'The sample data has no injury report.' },
  };
}

/** Team page data for `/v3/team/:slug/:teamId`. */
export function useTeamVM(slug: string, teamId: string) {
  const slate = useSlate();
  const demo = demoOn();
  const sport = sportBySlug(slug);
  const repo = useRepo(demo ? undefined : sport);
  const explorer = !!repo.data?.hasExplorer;
  const idx = useAsync(explorer ? `v3:xidx:${slug}` : null, () => repo.data!.index());
  const pid = teamId.startsWith('prt_') ? teamId : idx.data?.teams.find((t) => t.short_name === teamId)?.participant_id ?? null;
  const prof = useAsync(explorer && pid ? `v3:prof:${slug}:${pid}` : null, () => repo.data!.profile(pid!));
  const defs = useAsync(explorer ? `v3:defs:${slug}` : null, () => repo.data!.metricMap());

  // identity: from the slate when the team is on it, else from the identity tables
  const team = useMemo<V3Team>(() => {
    for (const g of slate.games) for (const t of [g.away, g.home]) if (t.slug === slug && (t.id === teamId || t.id === pid)) return t;
    const sportCode = (sport?.code ?? slug.toUpperCase());
    const full = prof.data?.entity?.display_name ?? idx.data?.teams.find((t) => t.participant_id === pid)?.display_name ?? teamId;
    const h = heroTeam(sportCode, prof.data?.entity?.short_name ?? teamId, full);
    return { id: teamId, slug, sport: sportCode, name: h?.name ?? full, nick: h?.short ?? full, abbr: prof.data?.entity?.short_name ?? teamId.slice(0, 3).toUpperCase(), logo: h?.logo ?? null, colors: h?.colors ?? ['#1d2d52', '#3f5079'] };
  }, [slate.games, slug, teamId, pid, sport, prof.data, idx.data]);

  const vm = useMemo<TeamVM>(() => {
    if (demo) return demoVM(team, slate.games);
    const p = prof.data;
    if (!p) {
      return { team, league: sport?.label ?? slug.toUpperCase(), record: null, season: null, metrics: [], results: [], roster: [], injuries: [], asOf: null, provenance: 'none',
        why: { stats: explorer ? 'Team statistics are loading.' : 'This sport publishes no team statistics yet.', roster: explorer ? 'The roster is loading.' : 'This sport publishes no roster yet.', injuries: explorer ? 'The injury report is loading.' : 'This sport publishes no injury report yet.', results: 'Results come from the publication.' } };
    }
    const season = p.season;
    const seasonStart = season ? `${season}-06-01` : '';
    const oppTeam = (id: string, name: string): V3Team => {
      const code = idx.data?.teams.find((t) => t.participant_id === id)?.short_name ?? id;
      const h = heroTeam(sport?.code ?? slug.toUpperCase(), code, name);
      const fromSlate = slate.games.flatMap((g) => [g.away, g.home]).find((t) => t.slug === slug && t.id === code);
      return fromSlate ?? { id: code, slug, sport: sport?.code ?? slug.toUpperCase(), name: h?.name ?? name, nick: h?.short ?? name, abbr: code, logo: h?.logo ?? null, colors: h?.colors ?? ['#1d2d52', '#3f5079'] };
    };
    const results = completedGames(p, undefined).filter((g) => g.date >= seasonStart).map((g): ResultRow => ({ ...g, oppId: g.opponentId, oppName: g.opponentName, opp: oppTeam(g.opponentId, g.opponentName) }));
    const rec = recordOf(p);
    const wl = results.length ? `${results.filter((r) => r.outcome === 'W').length}-${results.filter((r) => r.outcome === 'L').length}${results.some((r) => r.outcome === 'T') ? `-${results.filter((r) => r.outcome === 'T').length}` : ''}` : null;
    const inj = (p.availability ?? []).filter((a) => a.status && a.status !== 'ACTIVE').map((a): InjuryItem => {
      const m = /^(.+?) \(([^,)]+)(?:, [A-Z]{2,3})?\):\s*(.*)$/.exec(a.detail ?? '');
      return { player: m?.[1] ?? a.detail ?? '', position: m?.[2] ?? null, status: a.status, note: m ? m[3].replace(/;?\s*impact:.*$/i, '') : null, asOf: a.as_of };
    });
    const metrics = metricRows(p, defs.data, slug);
    return {
      team, league: p.league ?? sport?.label ?? slug.toUpperCase(), record: rec?.text ?? wl, season, metrics, results,
      roster: (p.players ?? []).map((x) => ({ id: x.participant_id, name: x.display_name, role: x.role ?? null })),
      injuries: inj, asOf: p.generated_at ?? null, provenance: 'publication',
      why: {
        stats: metrics.length ? undefined : 'The publication has no team statistics for this team.',
        roster: p.players?.length ? undefined : 'The publication lists no roster for this team.',
        injuries: inj.length ? undefined : 'The publication lists no injuries for this team.',
        results: results.length ? undefined : 'No completed games this season in the publication.',
      },
    };
  }, [demo, team, prof.data, defs.data, idx.data, slate.games, sport, slug, explorer]);

  const loading = !demo && (repo.loading || (explorer && (idx.loading || (!!pid && prof.loading))));
  const upcoming = useMemo(() => slate.games.filter((g) => g.slug === slug && (g.away.id === team.id || g.home.id === team.id)).sort((a, b) => a.startMs - b.startMs), [slate.games, slug, team.id]);
  return { vm, loading, upcoming, slateNow: slate.now, notFound: !demo && explorer && !idx.loading && !pid && !teamId.startsWith('prt_') && !upcoming.length };
}

export type { RankingDoc };
