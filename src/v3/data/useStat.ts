// Stat Detail data: a published ranking (real) or a labelled deterministic sample. One shape for both.
import { useMemo } from 'react';
import type { MetricDef, RankingDoc, SeriesDoc } from '../../contract/types';
import { useAsync, useRepo } from '../../data/hooks';
import { sportBySlug } from '../../data/sports';
import { heroTeam } from '../../lib/hero/input';
import { cfbTeam } from '../../lib/cfbTeams';
import { mlbClub } from '../../lib/mlb';
import { nbaTeam } from '../../lib/nba';
import { nhlTeam } from '../../lib/nhlTeams';
import { demoOn } from '../state/prefs';
import type { V3Team } from '../model/types';

export interface StatEntry { rank: number; team: V3Team; value: number | null; entityId: string }
export interface StatVM {
  id: string;
  name: string;
  scope: string;
  description: string;
  methodology: string | null;
  source: string | null;
  limitations: string[];
  unit: string | null;
  higherIsBetter: boolean | null;
  adjusted: boolean;
  window: string;
  season: string | null;
  universe: string;
  summary: { mean: number | null; median: number | null; min: number | null; max: number | null } | null;
  entries: StatEntry[];
  asOf: string | null;
  metricId: string | null;
  siblings: { id: string; window: string }[];
  related: { id: string; name: string; route: string }[];
  provenance: 'publication' | 'demo';
}

const TEAMS: Record<string, string[]> = {
  nfl: 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' '),
  nba: 'ATL BKN BOS CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(' '),
  nhl: 'ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LAK MIN MTL NJD NSH NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WPG WSH'.split(' '),
  mlb: 'ATL AZ BAL BOS CHC CIN CLE COL CWS DET HOU KC LAA LAD MIA MIL MIN NYM NYY PHI PIT SD SEA SF STL TB TEX TOR WSH'.split(' '),
  cfb: 'UGA FLA LSU AUB TEX OKLA ALA TENN ND USC MICH ILL ORE WASH OSU PSU CLEM FSU MIA MISS ARK UK MIZZ TXAM SCAR UCLA UTAH COLO ASU BYU'.split(' '),
};
const hash = (s: string) => { let h = 5; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

const NFL_NAMES: Record<string, string> = { ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills', CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns', DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers', HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs', LV: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams', MIA: 'Miami Dolphins', MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants', NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks', SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', WAS: 'Washington Commanders' };
/** Full names for the sample rankings, from the repository's own identity tables. */
export function sampleTeamName(slug: string, code: string): string {
  if (slug === 'nfl') return NFL_NAMES[code] ?? code;
  if (slug === 'nba') return nbaTeam(code) ? `${nbaTeam(code)!.city} ${nbaTeam(code)!.name}` : code;
  if (slug === 'nhl') return nhlTeam(code) ? `${nhlTeam(code)!.city} ${nhlTeam(code)!.name}` : code;
  if (slug === 'mlb') return mlbClub(code)?.nick ?? code;
  if (slug === 'cfb') return cfbTeam(code)?.n ?? code;
  return code;
}

export function toStatTeam(sport: string, slug: string, code: string, name: string): V3Team {
  const h = heroTeam(sport, code, name);
  return { id: code, slug, sport, name: h?.name ?? name, nick: h?.short ?? name, abbr: code, logo: h?.logo ?? null, colors: h?.colors ?? ['#1d2d52', '#3f5079'] };
}

const SAMPLE_STATS: Record<string, { name: string; unit: string; desc: string }> = {
  'sample-0': { name: 'Points per game', unit: '', desc: 'Sample definition: average points scored per game.' },
  'sample-1': { name: 'Yards per game', unit: '', desc: 'Sample definition: average total yards gained per game.' },
  'sample-2': { name: 'Success rate', unit: 'share', desc: 'Sample definition: share of plays that keep the offense on schedule.' },
  'sample-3': { name: 'Points allowed per game', unit: '', desc: 'Sample definition: average points allowed per game.' },
  'sample-4': { name: 'Explosive plays allowed', unit: 'share', desc: 'Sample definition: share of opponent plays that gain a large chunk of yards.' },
  'sample-5': { name: 'Adjusted EPA per play', unit: 'EPA/play', desc: 'Sample definition: expected points added per play, adjusted for opponent.' },
};

function demoStat(slug: string, id: string): StatVM {
  const s = SAMPLE_STATS[id] ?? SAMPLE_STATS['sample-0'];
  const sport = slug.toUpperCase();
  const codes = TEAMS[slug] ?? TEAMS.nfl;
  const hi = id !== 'sample-3' && id !== 'sample-4';
  const vals = codes.map((c) => ({ c, v: s.unit === 'share' ? 0.3 + (hash(c + id) % 220) / 1000 : s.unit === 'EPA/play' ? ((hash(c + id) % 300) - 150) / 1000 : 14 + (hash(c + id) % 2200) / 100 }));
  vals.sort((a, b) => (hi ? b.v - a.v : a.v - b.v));
  return {
    id, name: s.name, scope: `${sport} · TEAM STATISTIC`, description: s.desc, methodology: 'Sample methodology text.', source: 'Sample data', limitations: ['Sample values: not a real ranking.'],
    unit: s.unit || null, higherIsBetter: hi, adjusted: id === 'sample-5', window: 'SEASON', season: null, universe: `${sport} teams (sample)`,
    summary: null, entries: vals.map((x, i) => ({ rank: i + 1, team: toStatTeam(sport, slug, x.c, sampleTeamName(slug, x.c)), value: x.v, entityId: x.c })),
    asOf: null, metricId: null, siblings: [], related: Object.keys(SAMPLE_STATS).filter((k) => k !== id).slice(0, 4).map((k) => ({ id: k, name: SAMPLE_STATS[k].name, route: `/v3/stat/${slug}/${k}` })),
    provenance: 'demo',
  };
}

const windowOf = (label: string) => /\(([^)]+)\)\s*$/.exec(label)?.[1] ?? 'SEASON';

export function useStatVM(slug: string, statId: string) {
  const demo = demoOn();
  const sport = sportBySlug(slug);
  const repo = useRepo(demo ? undefined : sport);
  const explorer = !!repo.data?.hasExplorer;
  const rk = useAsync<RankingDoc>(!demo && explorer ? `v3:rk:${slug}:${statId}` : null, () => repo.data!.ranking(statId));
  const defs = useAsync(explorer ? `v3:defs:${slug}` : null, () => repo.data!.metricMap());
  const si = useAsync(explorer ? `v3:si:${slug}` : null, () => repo.data!.searchIndex());
  const vm = useMemo<StatVM | null>(() => {
    if (demo) return demoStat(slug, statId);
    const r = rk.data;
    if (!r) return null;
    const def: MetricDef | undefined = defs.data?.get(r.metric_id);
    const code = sport?.code ?? slug.toUpperCase();
    const name = def?.name ?? r.metric_id.replace(/^met_[a-z]+\./, '').replace(/_/g, ' ');
    const sibs = (si.data?.items ?? []).filter((x) => x.kind === 'RANKING' && x.label.startsWith(`${name} ranking (`)).map((x) => ({ id: x.id, window: windowOf(x.label) }));
    const rankingFor = (metricId: string) => {
      const n = defs.data?.get(metricId)?.name;
      const hits = n ? (si.data?.items ?? []).filter((x) => x.kind === 'RANKING' && x.label.startsWith(`${n} ranking (`)) : [];
      return hits.find((h) => windowOf(h.label) === 'SEASON') ?? hits[0];
    };
    return {
      id: statId, name, scope: `${code} · ${def?.entity_type === 'PLAYER' ? 'PLAYER' : 'TEAM'} STATISTIC`,
      description: def?.description ?? 'The publication gives no definition for this statistic.',
      methodology: def?.methodology_version ?? null, source: def?.source ?? null, limitations: def?.known_limitations ?? [],
      unit: def?.unit ?? null, higherIsBetter: r.higher_is_better, adjusted: /adj/i.test(r.window?.label ?? '') || def?.category === 'opponent-adjusted',
      window: r.window?.label ?? 'SEASON', season: r.universe?.season ?? null, universe: r.universe?.label ?? '',
      summary: { mean: r.summary.mean, median: r.summary.median, min: r.summary.min, max: r.summary.max },
      entries: r.entries.map((e) => ({ rank: e.rank, team: toStatTeam(code, slug, e.short_name ?? e.entity_id, e.display_name), value: e.adjusted_value ?? e.value, entityId: e.entity_id })),
      asOf: r.as_of, metricId: r.metric_id, siblings: sibs,
      related: (def?.related_metrics ?? []).map((m) => { const hit = rankingFor(m); const n = defs.data?.get(m)?.name ?? m; return hit ? { id: hit.id, name: n, route: `/v3/stat/${slug}/${encodeURIComponent(hit.id)}` } : null; }).filter(Boolean) as StatVM['related'],
      provenance: 'publication',
    };
  }, [demo, rk.data, defs.data, si.data, sport, slug, statId]);
  return { vm, loading: !demo && (repo.loading || (explorer && rk.loading)), error: !demo && (!explorer && !repo.loading ? 'This sport publishes no statistics yet.' : rk.error ? 'This ranking is not in the publication.' : null), repo: repo.data, explorer };
}

/** A team's published history for a metric: the profile's time series whose metric matches. */
export function useTeamSeries(slug: string, metricId: string | null, teamCode: string | null, enabled: boolean) {
  const demo = demoOn();
  const sport = sportBySlug(slug);
  const repo = useRepo(demo || !enabled ? undefined : sport);
  const idx = useAsync(repo.data?.hasExplorer && teamCode ? `v3:xidx:${slug}` : null, () => repo.data!.index());
  const pid = teamCode ? idx.data?.teams.find((t) => t.short_name === teamCode)?.participant_id ?? null : null;
  const prof = useAsync(pid ? `v3:prof:${slug}:${pid}` : null, () => repo.data!.profile(pid!));
  const ref = prof.data?.series?.find((s) => s.metric_id === metricId) ?? null;
  const ser = useAsync<SeriesDoc>(ref ? `v3:ser:${slug}:${ref.series_id}` : null, () => repo.data!.series(ref!.series_id));
  return { series: ser.data ?? null, loading: !demo && enabled && (repo.loading || idx.loading || prof.loading || ser.loading), profile: prof.data ?? null, available: !!ref };
}
