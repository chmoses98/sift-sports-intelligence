// SCHEME TENDENCIES — how each team plays, not how well: pass rate over expected, play action, motion, shotgun,
// no-huddle, screens, RPOs, depth of target and pace for an offense; blitz rate, stacked boxes and how often
// opponents throw against a defense. Two sources, each named on screen:
//  - FTN charting via nflverse (history/teams.json): per-week counts, aggregated over the weeks before a game and
//    ranked across teams with enough charted plays (#1 = highest rate; a tendency has no "best");
//  - the NFL publication's team profile (style metrics over its last-34-games window, and its opponent-adjusted
//    pass-rate-over-expected ratings).
// Nothing here is a quality judgement except "EPA per dropback vs the blitz", which is ranked best-first.
import type { EntityProfileDoc, Observation } from '../contract/types';
import { SCHEMES, schemeTable, type SchemeKey } from '../history/team';
import type { TeamHistoryDoc, TeamWeek, UnitCounts } from '../history/types';
import { formatStat } from './units';

export type SchemeSource = 'ftn' | 'publication';

export interface SchemeCell {
  value: number | null;
  text: string;
  rank: number | null;
  of: number;
  /** Sample behind a charted rate ("412 charted plays"); null for publication metrics. */
  sample: string | null;
  /** 0..1 position among ranked teams (1 = highest / best), for percentile strips. */
  pos: number | null;
}

export interface SchemeRow {
  key: string;
  label: string;
  side: 'off' | 'def';
  source: SchemeSource;
  /** "% of dropbacks", "pts over expected", … */
  per: string;
  /** True only for measures where #1 is best (EPA vs the blitz). */
  quality: boolean;
  cells: Record<string, SchemeCell>;
  /** Every ranked team's value, for a percentile strip. */
  league: number[];
}

interface ExtraDef {
  key: string;
  label: string;
  side: 'off' | 'def';
  per: string;
  num: (u: UnitCounts) => number;
  den: (u: UnitCounts) => number;
  minSample: number;
  sampleWord: string;
  fmt: (v: number) => string;
  needs: (keyof UnitCounts)[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const EXTRA: ExtraDef[] = [
  { key: 'screen_rate', label: 'Screen passes', side: 'off', per: '% of charted dropbacks', num: (u) => u.screens ?? 0, den: (u) => u.charted_db, minSample: 60, sampleWord: 'charted dropbacks', fmt: pct, needs: ['screens'] },
  { key: 'rpo_rate', label: 'Run-pass options', side: 'off', per: '% of charted plays', num: (u) => u.rpo ?? 0, den: (u) => u.charted_plays, minSample: 100, sampleWord: 'charted plays', fmt: pct, needs: ['rpo'] },
  { key: 'stacked_faced', label: 'Runs into 8+ man boxes', side: 'off', per: '% of charted designed runs', num: (u) => u.stacked_box_rushes, den: (u) => u.charted_rushes, minSample: 40, sampleWord: 'charted runs', fmt: pct, needs: ['stacked_box_rushes'] },
];

const SCHEME_PER: Record<SchemeKey, string> = {
  blitz_rate: '% of charted dropbacks',
  stacked_box_rate: '% of charted designed runs',
  play_action_rate: '% of charted plays',
  motion_rate: '% of charted plays',
  epa_vs_blitz: 'EPA per blitzed dropback',
  rb_target_share_vs_blitz: '% of targets vs the blitz',
};

const PUBLICATION: { id: string; label: string; side: 'off' | 'def'; per: string }[] = [
  { id: 'met_nfl.off_proe_early_ng', label: 'Pass rate over expected (early downs, neutral script)', side: 'off', per: 'pts over expected · raw, last 34 games' },
  { id: 'met_nfl.adj_off_proe', label: 'Pass rate over expected, opponent-adjusted', side: 'off', per: 'pts vs league average · adjusted' },
  { id: 'met_nfl.off_shotgun_rate', label: 'Shotgun', side: 'off', per: '% of plays · raw, last 34 games' },
  { id: 'met_nfl.off_no_huddle_rate', label: 'No huddle', side: 'off', per: '% of plays · raw, last 34 games' },
  { id: 'met_nfl.off_adot', label: 'Average depth of target', side: 'off', per: 'air yards per target · raw, last 34 games' },
  { id: 'met_nfl.off_plays_per_drive', label: 'Plays per drive', side: 'off', per: 'plays per drive · raw, last 34 games' },
  { id: 'met_nfl.adj_def_proe', label: 'Opponents’ pass rate over expected', side: 'def', per: 'pts vs league average · adjusted' },
];

function sum(ws: TeamWeek[], side: 'off' | 'def', f: (u: UnitCounts) => number) {
  return ws.reduce((a, w) => a + f(w[side]), 0);
}

function rankDesc(values: { team: string; v: number | null }[]): Map<string, { rank: number; of: number; pos: number }> {
  const ranked = values.filter((x) => x.v != null).sort((a, b) => (b.v as number) - (a.v as number));
  const out = new Map<string, { rank: number; of: number; pos: number }>();
  ranked.forEach((x) => {
    const rank = 1 + ranked.filter((o) => (o.v as number) > (x.v as number) + 1e-12).length;
    out.set(x.team, { rank, of: ranked.length, pos: ranked.length > 1 ? (ranked.length - rank) / (ranked.length - 1) : 0.5 });
  });
  return out;
}

/**
 * The scheme board for the given teams (abbreviations): charted rates over weeks before `beforeWeek` (null = all),
 * then the publication's style metrics from each team's profile. A row with nothing for any team is dropped.
 */
export function schemeBoard(doc: TeamHistoryDoc | null | undefined, profiles: Record<string, EntityProfileDoc | null | undefined>, teams: string[], beforeWeek: number | null): SchemeRow[] {
  const rows: SchemeRow[] = [];
  if (doc) {
    const wk = beforeWeek ?? 99;
    for (const d of SCHEMES) {
      if (d.key === 'rb_target_share_vs_blitz') continue; // shown with the players it concerns, not as a team tendency
      const table = schemeTable(doc, d.key, wk);
      const fmt = (v: number) => (d.key === 'epa_vs_blitz' ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}` : pct(v));
      const ranked = table.filter((x) => x.rank != null);
      const cells: Record<string, SchemeCell> = {};
      for (const t of teams) {
        const x = table.find((y) => y.team === t);
        if (!x) continue;
        cells[t] = { value: x.value, text: x.value != null ? fmt(x.value) : '—', rank: x.rank, of: x.of, sample: `${x.n} ${d.sampleWord}`, pos: x.rank != null && x.of > 1 ? (x.of - x.rank) / (x.of - 1) : null };
      }
      if (Object.values(cells).some((c) => c.value != null)) rows.push({ key: d.key, label: d.label, side: d.side, source: 'ftn', per: SCHEME_PER[d.key], quality: d.quality === 'higher', cells, league: ranked.map((x) => x.value as number) });
    }
    for (const d of EXTRA) {
      const vals = Object.values(doc.teams).map((t) => {
        const ws = t.weeks.filter((w) => w.week < wk);
        const ok = ws.length > 0 && ws.every((w) => d.needs.every((k) => typeof (w[d.side] as unknown as Record<string, unknown>)[k] === 'number'));
        const n = ok ? sum(ws, d.side, d.den) : 0;
        return { team: t.team, n, v: ok && n >= d.minSample ? sum(ws, d.side, d.num) / n : null };
      });
      const ranks = rankDesc(vals);
      const cells: Record<string, SchemeCell> = {};
      for (const t of teams) {
        const x = vals.find((y) => y.team === t);
        if (!x) continue;
        const rk = ranks.get(t);
        cells[t] = { value: x.v, text: x.v != null ? d.fmt(x.v) : '—', rank: rk?.rank ?? null, of: ranks.size, sample: `${x.n} ${d.sampleWord}`, pos: rk?.pos ?? null };
      }
      if (Object.values(cells).some((c) => c.value != null)) rows.push({ key: d.key, label: d.label, side: d.side, source: 'ftn', per: d.per, quality: false, cells, league: vals.filter((v) => v.v != null).map((v) => v.v as number) });
    }
  }
  for (const p of PUBLICATION) {
    const cells: Record<string, SchemeCell> = {};
    let league: number[] = [];
    for (const t of teams) {
      const o: Observation | undefined = profiles[t]?.metrics.find((m) => m.metric_id === p.id && !m.split);
      if (!o) continue;
      const c = o.context;
      cells[t] = { value: o.value, text: formatStat(p.id, o.value), rank: c?.rank ?? null, of: c?.universe_size ?? 0, sample: null, pos: c?.rank != null && c.universe_size ? (c.universe_size - c.rank) / Math.max(1, c.universe_size - 1) : null };
      if (c?.worst_value != null && c.best_value != null) league = [c.worst_value, c.best_value];
    }
    if (Object.values(cells).some((c) => c.value != null)) rows.push({ key: p.id, label: p.label, side: p.side, source: 'publication', per: p.per, quality: false, cells, league });
  }
  return rows;
}

/** Tendency words for a rank among N: "Highest in the league", "Top 5", "League-typical", "Bottom 5", "Lowest". */
export function tendencyWord(rank: number | null, of: number): string {
  if (rank == null || !of) return 'Not ranked';
  if (rank === 1) return 'Highest in the NFL';
  if (rank === of) return 'Lowest in the NFL';
  if (rank <= 5) return `Top 5 (#${rank})`;
  if (rank > of - 5) return `Bottom 5 (#${rank})`;
  return `League-typical (#${rank})`;
}
