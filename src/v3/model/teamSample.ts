// SAMPLE DATA for `?demo=1`: a deterministic, clearly labelled team profile built from the sport's declaration, so the locked Team
// Research design can be exercised without the publication. Ranks, values and scores here are invented; the screen says "sample data"
// wherever this is used, and real mode never reads it. Same shape as the real normalized profile, so the screen cannot tell.
import { seasonOfDate } from '../data/research/normalize';
import type { TeamGame, TeamMetric, TeamProfile, WindowObs } from '../data/research/types';
import { teamSport } from './teamSports';
import type { MetricLookup } from './teamResearch';

const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; };

/** Where each unit sits and how far one rank moves it, so sample values order the way ranks do. */
const SCALE: [RegExp, number, number][] = [[/epa|deviation/i, 0, 0.012], [/share/i, 0.45, 0.006], [/goals per game/i, 3, 0.06], [/per 60/i, 2.9, 0.05], [/points/i, 22, 0.4]];

export function sampleLookup(slug: string): MetricLookup {
  const d = teamSport(slug);
  const m = new Map((d?.sample.metrics ?? []).map(([id, name, category, unit, hib]) => [id, { name, category, unit, higherIsBetter: hib }]));
  return (id) => m.get(id);
}

export interface SampleOpp { id: string; name: string }
export interface SampleUpcoming { eventId: string; startUtc: string; oppCode: string; oppName: string; home: boolean }

export function sampleProfile(slug: string, code: string, name: string, pool: SampleOpp[], upcoming: SampleUpcoming[], now: number): TeamProfile | null {
  const d = teamSport(slug);
  if (!d) return null;
  const n = d.sample.n;
  const season = seasonOfDate(slug, new Date(now).toISOString());
  const metrics = new Map<string, TeamMetric>();
  for (const [id, , , unit, hib] of d.sample.metrics) {
    const adjusted = /^(adj_|oa_)/.test(id);
    const windows: Record<string, WindowObs> = {};
    const labels = adjusted ? (d.sample.adjustedWindow ? [d.sample.adjustedWindow] : []) : d.sample.windows.map((w) => (w === 'SEASON' && slug === 'nhl' ? season : w));
    for (const w of labels) {
      const rank = (hash(`${code}|${id}|${w}`) % n) + 1;
      const sc = SCALE.find(([re]) => re.test(unit ?? ''));
      const base = sc?.[1] ?? 0, step = sc?.[2] ?? 0.01;
      const dir = hib === false ? -1 : 1;
      windows[w] = {
        value: base + dir * ((n + 1) / 2 - rank) * step, adjusted: null, rank, n, percentile: null, rankingId: `sample-${hash(id) % 6}`,
        higherIsBetter: hib, sample: 6, asOf: null, display: null, universe: `${d.slug.toUpperCase()} teams (sample)`,
      };
    }
    if (Object.keys(windows).length) metrics.set(id, { metricId: `met_${slug}.${id}`, id, unit, windows });
  }
  const teams = pool.filter((p) => p.id !== code);
  const pick = (i: number) => teams[hash(`${code}|opp|${i}`) % Math.max(1, teams.length)] ?? { id: 'OPP', name: 'Opponent' };
  const nGames = slug === 'nhl' ? 10 : 12;
  const spacing = slug === 'nhl' ? 2 : 7;
  const games: TeamGame[] = [];
  for (let i = 0; i < nGames; i++) {
    const opp = pick(i);
    const f = 14 + (hash(`${code}|f|${i}`) % 20), a = 10 + (hash(`${code}|a|${i}`) % 20);
    const hf = slug === 'nhl' ? 1 + (hash(`${code}|f|${i}`) % 5) : f, ha = slug === 'nhl' ? 1 + (hash(`${code}|a|${i}`) % 5) : a;
    const win = hf > ha ? 'W' : hf < ha ? 'L' : 'T';
    games.push({
      eventId: `sample-${code}-r${i}`, competition: slug === 'nhl' ? 'regular' : `${season} REG week ${i + 1}`, opponentId: opp.id, opponentName: opp.name,
      home: i % 2 === 0, startUtc: new Date(now - (nGames - i) * spacing * 86_400_000).toISOString(), status: 'FINAL', result: { for: hf, against: ha, outcome: win },
    });
  }
  upcoming.forEach((u) => games.push({ eventId: u.eventId, competition: null, opponentId: u.oppCode, opponentName: u.oppName, home: u.home, startUtc: u.startUtc, status: 'SCHEDULED', result: null }));
  const w = games.filter((g) => g.status === 'FINAL' && g.result?.outcome === 'W').length;
  const l = games.filter((g) => g.status === 'FINAL' && g.result?.outcome === 'L').length;
  return {
    participantId: code, abbr: code, name, slug, season, asOf: null, metrics, games, availability: [], players: [], seriesByMetric: new Map(),
    record: { wins: w, losses: l, ties: null, otLosses: slug === 'nhl' ? 0 : null, games: w + l, source: 'results', text: slug === 'nhl' ? `${w}–${l}–0` : `${w}–${l}` },
    limitations: ['Sample data: not published statistics.'],
  };
}
