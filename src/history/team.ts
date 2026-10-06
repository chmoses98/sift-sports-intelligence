// Team-level history: who started at quarterback, and charted scheme rates (blitz, play action, motion,
// stacked boxes) with league ranks. Every rate is aggregated from per-week counts over the weeks BEFORE a
// given week, so a game's pregame research never includes that game or anything after it.
import type { TeamHistoryDoc, TeamWeek, UnitCounts } from './types';

export interface QbStint {
  gsis: string;
  name: string;
  /** Weeks he led the team in dropbacks. */
  weeks: number[];
  dropbacks: number;
  epa: number;
}

/** Each quarterback who started (led the team in dropbacks) a game before `beforeWeek`. Most starts first. */
export function qbStarts(weeks: TeamWeek[], beforeWeek: number): QbStint[] {
  const out = new Map<string, QbStint>();
  for (const w of weeks.filter((x) => x.week < beforeWeek)) {
    const s = w.qbs[0];
    if (!s || s.dropbacks < 10) continue;
    const q = out.get(s.gsis) ?? { gsis: s.gsis, name: s.name, weeks: [], dropbacks: 0, epa: 0 };
    q.weeks.push(w.week);
    out.set(s.gsis, q);
  }
  // Every dropback by each starter in the window (relief appearances included), for the EPA split.
  for (const w of weeks.filter((x) => x.week < beforeWeek)) {
    for (const q of w.qbs) {
      const s = out.get(q.gsis);
      if (s) { s.dropbacks += q.dropbacks; s.epa += q.epa ?? 0; }
    }
  }
  return [...out.values()].sort((a, b) => b.weeks.length - a.weeks.length || b.dropbacks - a.dropbacks);
}

export type SchemeKey = 'blitz_rate' | 'play_action_rate' | 'motion_rate' | 'stacked_box_rate' | 'epa_vs_blitz' | 'rb_target_share_vs_blitz';

export interface SchemeDef {
  key: SchemeKey;
  side: 'off' | 'def';
  label: string;
  /** How to read rank #1 (these are tendencies, not quality, unless `quality` is set). */
  rankWord: string;
  /** For quality measures: higher is better for the team that owns it. Tendencies have no direction. */
  quality: 'higher' | null;
  num: (u: UnitCounts) => number;
  den: (u: UnitCounts) => number;
  /** Smallest denominator a team needs before its rate is ranked. */
  minSample: number;
  sampleWord: string;
}

export const SCHEMES: SchemeDef[] = [
  { key: 'blitz_rate', side: 'def', label: 'Blitz rate', rankWord: 'most blitzes', quality: null, num: (u) => u.blitz_db, den: (u) => u.charted_db, minSample: 60, sampleWord: 'charted dropbacks' },
  { key: 'stacked_box_rate', side: 'def', label: 'Stacked boxes (8+) vs the run', rankWord: 'most stacked boxes', quality: null, num: (u) => u.stacked_box_rushes, den: (u) => u.charted_rushes, minSample: 40, sampleWord: 'charted runs' },
  { key: 'play_action_rate', side: 'off', label: 'Play-action rate', rankWord: 'most play action', quality: null, num: (u) => u.play_action, den: (u) => u.charted_plays, minSample: 100, sampleWord: 'charted plays' },
  { key: 'motion_rate', side: 'off', label: 'Pre-snap motion rate', rankWord: 'most motion', quality: null, num: (u) => u.motion, den: (u) => u.charted_plays, minSample: 100, sampleWord: 'charted plays' },
  { key: 'epa_vs_blitz', side: 'off', label: 'EPA per dropback vs the blitz', rankWord: 'best vs the blitz', quality: 'higher', num: (u) => u.blitz_db_epa, den: (u) => u.blitz_db, minSample: 30, sampleWord: 'blitzed dropbacks' },
  { key: 'rb_target_share_vs_blitz', side: 'off', label: 'Share of targets to backs vs the blitz', rankWord: 'most targets to backs vs the blitz', quality: null, num: (u) => u.blitz_rb_targets, den: (u) => u.blitz_targets, minSample: 20, sampleWord: 'targets vs the blitz' },
];

export interface SchemeValue {
  def: SchemeDef;
  team: string;
  value: number | null;
  n: number;
  rank: number | null;
  /** Teams with enough sample to be ranked. */
  of: number;
  weeks: number[];
}

function sum(weeks: TeamWeek[], side: 'off' | 'def', f: (u: UnitCounts) => number): number {
  return weeks.reduce((a, w) => a + f(w[side]), 0);
}

/** Every team's value for one scheme measure over weeks before `beforeWeek`, ranked (#1 = highest). */
export function schemeTable(doc: TeamHistoryDoc, key: SchemeKey, beforeWeek: number): SchemeValue[] {
  const def = SCHEMES.find((s) => s.key === key)!;
  const rows = Object.values(doc.teams).map((t) => {
    const ws = t.weeks.filter((w) => w.week < beforeWeek);
    const n = sum(ws, def.side, def.den);
    const v = n > 0 ? sum(ws, def.side, def.num) / n : null;
    return { def, team: t.team, value: n >= def.minSample ? v : null, n, rank: null as number | null, of: 0, weeks: ws.map((w) => w.week) };
  });
  const ranked = rows.filter((r) => r.value != null).sort((a, b) => (b.value as number) - (a.value as number));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  for (const r of rows) r.of = ranked.length;
  return rows;
}

export function schemeFor(doc: TeamHistoryDoc, key: SchemeKey, team: string, beforeWeek: number): SchemeValue | null {
  return schemeTable(doc, key, beforeWeek).find((r) => r.team === team) ?? null;
}

/** RB share of targets on non-blitzed dropbacks, for comparison with the blitz share. */
export function rbShareNoBlitz(doc: TeamHistoryDoc, team: string, beforeWeek: number): { value: number | null; n: number } {
  const ws = (doc.teams[team]?.weeks ?? []).filter((w) => w.week < beforeWeek);
  const n = sum(ws, 'off', (u) => u.noblitz_targets);
  return { value: n > 0 ? sum(ws, 'off', (u) => u.noblitz_rb_targets) / n : null, n };
}

/** EPA per dropback with each quarterback (all his dropbacks for the team in the window). */
export function epaPerDropback(stint: QbStint): number | null {
  return stint.dropbacks > 0 ? stint.epa / stint.dropbacks : null;
}
