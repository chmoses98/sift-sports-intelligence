// Team Research view-models (TR1 to TR6): pure functions from the normalized team profile, the metric registry and the schedule
// authority to what the screen draws. No React, no fetching, no clock (callers pass `now`). A value the publication does not carry
// is null and the row is left out or shows "—"; nothing is estimated. Percentile is the design system's rule: (n - rank) / (n - 1).
import type { MetricDef } from '../../contract/types';
import { ordinal } from '../data/lens';
import { percentileOf, seasonOfDate } from '../data/research/normalize';
import type { Outcome, ScheduleEvent, TeamGame, TeamMetric, TeamProfile } from '../data/research/types';
import { teamSport, type PairDecl, type ProfileGroupDecl, type Role, type SportTeamDecl } from './teamSports';

export { ordinal };

/* ---------------------------------------------------------------- statistics */

export interface MetricInfo { name: string; category: string | null; unit: string | null; higherIsBetter: boolean | null }
export type MetricLookup = (shortId: string) => MetricInfo | undefined;

export const humanize = (id: string) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Names, categories and units from the sport's metric registry, by short id. */
export function metricLookup(defs: Map<string, MetricDef> | undefined, slug: string): MetricLookup {
  return (id) => {
    const d = defs?.get(`met_${slug}.${id}`);
    return d ? { name: d.name, category: d.category, unit: d.unit, higherIsBetter: d.higher_is_better } : undefined;
  };
}

export interface StatObs {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  /** The published window label this observation is in ("SEASON", "L6", "2026-27"). */
  window: string;
  value: number | null;
  rank: number | null;
  n: number | null;
  /** 0 worst to 100 best, by the design system's rule. */
  pct: number | null;
  rankingId: string | null;
  sample: number | null;
  role: Role;
}

/** Opponent-adjusted statistics are their own statistics (never mixed with raw): "adj_*" in football, "oa_*" in hockey, or the registry's category. */
export const isAdjustedId = (id: string, info?: MetricInfo): boolean => /^(adj_|oa_)/.test(id) || /adjusted/i.test(info?.category ?? '');

/** Defense by name: "def_*", "adj_def_*", goals against, expected goals against, penalty kill. */
export const roleOf = (id: string): Role => (/^(adj_)?def_|^ga_|^xga|^pk_/.test(id) ? 'def' : 'off');

/** The published window key a url window resolves to for one statistic: 'SEASON' is the sport's own season label when that is how it publishes. */
export function windowKey(m: TeamMetric | undefined, win: string, season: string | null): string | null {
  if (!m) return null;
  if (win === 'SEASON') return m.windows.SEASON ? 'SEASON' : season && m.windows[season] ? season : null;
  return m.windows[win] ? win : null;
}

export function observe(profile: TeamProfile, id: string, win: string, look: MetricLookup): StatObs | null {
  const m = profile.metrics.get(id);
  const key = windowKey(m, win, profile.season);
  if (!m || !key) return null;
  const w = m.windows[key];
  if (w.value == null && w.rank == null) return null;
  const info = look(id);
  return {
    id, name: info?.name ?? humanize(id), category: info?.category ?? null, unit: info?.unit ?? m.unit,
    window: key, value: w.value, rank: w.rank, n: w.n, pct: percentileOf(w.rank, w.n),
    rankingId: w.rankingId, sample: w.sample, role: roleOf(id),
  };
}

/** A statistic's value as the page prints it: shares as percent, EPA-style rates and deviations signed to three places. */
export function fmtValue(v: number | null | undefined, unit: string | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const u = (unit ?? '').toLowerCase();
  const signed = (x: number, d: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`;
  if (u === 'share' || u === 'rate' || u === 'pct') return `${(v * 100).toFixed(1)}%`;
  if (u.includes('epa') || u.includes('deviation')) return signed(v, 3);
  if (u.includes('pct points') || u.includes('percent')) return v.toFixed(1);
  if (u.includes('per 60') || u.includes('per game') || u.includes('points')) return v.toFixed(2);
  if (Math.abs(v) >= 100) return String(Math.round(v));
  return String(Math.round(v * 100) / 100);
}

export const rankText = (o: Pick<StatObs, 'rank' | 'n'>) => (o.rank == null ? '—' : o.n ? `${ordinal(o.rank)} of ${o.n}` : ordinal(o.rank));

/** How a window reads. A season label ("2026-27") reads with an en dash; an unknown label reads as published. */
export function windowWord(decl: SportTeamDecl | undefined, key: string): string {
  const w = decl?.windowWords[key];
  if (w) return w;
  if (/^\d{4}-\d{2}$/.test(key)) return key.replace('-', '–');
  return key;
}

/** The window a url value resolves to among the ones a screen offers; anything else is the season. */
export const resolveWindow = (win: string | null | undefined, offered: string[]): string => (win && offered.includes(win) ? win : 'SEASON');

/* ---------------------------------------------------------------- identity (TR1, TR6) */

export interface IdentityRowVM { label: string; off: StatObs; def: StatObs; marks: [string, string] }
export interface IdentityVM {
  title: string;
  control: 'basis' | 'window';
  adjusted: boolean;
  window: string;
  windowText: string;
  rows: IdentityRowVM[];
  head: { off: IdentityRowVM['off']; def: IdentityRowVM['def']; offLabel: string; defLabel: string; offText: string; defText: string };
  /** The window options when the switch is the window. */
  options: { key: string; label: string }[];
  sentence: string;
  /** Pairs left out because the publication has no such window for them, with the reason, for the card's closing line. */
  omitted: string[];
}

const rangeText = (ranks: number[], n: number | null) => {
  const lo = Math.min(...ranks), hi = Math.max(...ranks);
  return `${lo === hi ? ordinal(lo) : `${ordinal(lo)} to ${ordinal(hi)}`}${n ? ` of ${n}` : ''}`;
};

export function identityOf(slug: string, profile: TeamProfile, state: { adj: boolean; win: string | null }, look: MetricLookup): IdentityVM | null {
  const decl = teamSport(slug);
  if (!decl) return null;
  const idn = decl.identity;
  const adjusted = idn.control === 'basis' && state.adj && !!idn.adjusted;
  const offered = idn.windows ?? ['SEASON'];
  const win = idn.control === 'window' ? resolveWindow(state.win, offered) : adjusted ? idn.adjusted!.window : 'SEASON';
  const pairs: PairDecl[] = adjusted ? idn.adjusted!.pairs : idn.raw.pairs;
  const rows: IdentityRowVM[] = [];
  const omitted: string[] = [];
  for (const p of pairs) {
    const off = observe(profile, p.off, win, look), def = observe(profile, p.def, win, look);
    if (!off || !def || off.rank == null || def.rank == null) { if (idn.seasonOnly?.includes(p.off)) omitted.push(p.label); continue; }
    rows.push({ label: p.label, off, def, marks: p.marks ?? ['O', 'D'] });
  }
  if (!rows.length) return null;
  const first = rows[0];
  const same = rows.every((r) => r.off.n === first.off.n && r.def.n === first.def.n);
  const windowText = windowWord(decl, win === 'SEASON' ? profile.season ?? 'SEASON' : win);
  let sentence: string;
  if (idn.control === 'basis') {
    const unitsWord = rows.length === 4 ? 'these four units' : `these ${rows.length} unit${rows.length === 1 ? '' : 's'}`;
    sentence = `Offense ranks ${rangeText(rows.map((r) => r.off.rank!), same ? first.off.n : null)} and defense ${rangeText(rows.map((r) => r.def.rank!), same ? first.def.n : null)} across ${unitsWord}. ${adjusted ? idn.note.adjusted : idn.note.raw}`;
  } else {
    const st = rows.find((r) => r.marks[0] === 'P');
    sentence = st
      ? `Special teams: P is the power play (${fmtValue(st.off.value, st.off.unit)}), K the penalty kill (${fmtValue(st.def.value, st.def.unit)}). ${windowText} values.`
      : `${windowText} values.${omitted.length ? ` ${omitted.join(' and ')} ${omitted.length > 1 ? 'are' : 'is'} published for the season only.` : ''}`;
  }
  return {
    title: idn.title, control: idn.control, adjusted, window: win, windowText, rows,
    head: {
      off: first.off, def: first.def, offLabel: idn.head.off, defLabel: idn.head.def,
      offText: `${fmtValue(first.off.value, first.off.unit)} ${idn.head.offUnit}`.trim(),
      defText: `${fmtValue(first.def.value, first.def.unit)} ${idn.head.defUnit}`.trim(),
    },
    options: offered.map((k) => ({ key: k, label: k === 'SEASON' ? windowWord(decl, profile.season ?? 'SEASON') : k })),
    sentence, omitted,
  };
}

/* ---------------------------------------------------------------- strongest and weakest (TR1, TR6) */

const family = (id: string) => {
  const b = id.replace(/^(adj_)?(off_|def_)/, '');
  const f = /rz/.test(b) ? 'rz' : /rush/.test(b) ? 'rush' : /epa/.test(b) ? 'epa' : b.replace(/_ng$/, '').replace(/(_play|_per60)$/, '');
  return f + (/^(adj_)?def_/.test(id) ? 'd' : /^(adj_)?off_/.test(id) ? 'o' : '');
};

export interface ExtremesVM { best: StatObs[]; worst: StatObs[]; n: number | null; windowText: string }

/** The raw statistics the team ranks highest and lowest on in a window, one per family so five EPA variants do not fill the list. */
export function extremesOf(slug: string, profile: TeamProfile, win: string, look: MetricLookup, k = 3): ExtremesVM | null {
  const decl = teamSport(slug);
  if (!decl) return null;
  const rows: StatObs[] = [];
  for (const id of profile.metrics.keys()) {
    const info = look(id);
    if (!info?.category || !decl.extremes.categories.includes(info.category) || decl.extremes.skip.test(id)) continue;
    const o = observe(profile, id, win, look);
    if (o && o.rank != null && o.pct != null) rows.push(o);
  }
  if (rows.length < 2) return null;
  const by = [...rows].sort((a, b) => b.pct! - a.pct! || a.rank! - b.rank! || a.id.localeCompare(b.id));
  const pick = (arr: StatObs[]) => {
    const seen = new Set<string>(), out: StatObs[] = [];
    for (const r of arr) { const f = family(r.id); if (seen.has(f)) continue; seen.add(f); out.push(r); if (out.length === k) break; }
    return out;
  };
  return { best: pick(by), worst: pick([...by].reverse()), n: by[0].n, windowText: windowWord(decl, win === 'SEASON' ? profile.season ?? 'SEASON' : win) };
}

/* ---------------------------------------------------------------- profile (TR2) */

export interface ProfileRowVM { obs: StatObs; base: StatObs | null; /** Baseline rank minus this rank: positive means the team ranks better now. */ delta: number | null }
export interface ProfileGroupVM { key: string; label: string; role: Role | null; rows: ProfileRowVM[]; total: number }
export interface ProfileVM {
  adjusted: boolean;
  window: string;
  windows: { key: string; label: string }[];
  baselineLabel: string | null;
  groups: ProfileGroupVM[];
  /** "Show all 11 offense and 11 defense stats". */
  counts: { off: number; def: number };
  hasMore: boolean;
}

const rankSort = (a: StatObs, b: StatObs) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name);

export function profileOf(slug: string, profile: TeamProfile, state: { adj: boolean; win: string | null; all: boolean }, look: MetricLookup, perGroup = 4): ProfileVM | null {
  const decl = teamSport(slug);
  const pd = decl?.profile;
  if (!decl || !pd) return null;
  const adjusted = state.adj;
  const groups: ProfileGroupDecl[] = adjusted ? pd.adjusted : pd.raw;
  // raw windows offered: those the declaration lists and at least one raw statistic publishes
  const rawIds = [...profile.metrics.keys()].filter((id) => !isAdjustedId(id, look(id)));
  const offered = pd.windows.filter((w) => rawIds.some((id) => windowKey(profile.metrics.get(id), w, profile.season))).filter((w, i, a) => a.indexOf(w) === i);
  const win = adjusted ? 'ADJ_RIDGE' : resolveWindow(state.win, offered);
  const out: ProfileGroupVM[] = [];
  for (const g of groups) {
    const rows: ProfileRowVM[] = [];
    for (const id of profile.metrics.keys()) {
      const info = look(id);
      if (isAdjustedId(id, info) !== adjusted) continue;
      const inGroup = g.idPattern ? g.idPattern.test(id) : !!info?.category && g.categories.includes(info.category);
      if (!inGroup) continue;
      const o = observe(profile, id, win, look);
      if (!o) continue;
      const base = !adjusted && pd.baseline && win !== pd.baseline ? observe(profile, id, pd.baseline, look) : null;
      rows.push({ obs: o, base: base && base.rank != null ? base : null, delta: base && base.rank != null && o.rank != null ? base.rank - o.rank : null });
    }
    rows.sort((a, b) => rankSort(a.obs, b.obs));
    if (rows.length) out.push({ key: g.key, label: g.label, role: g.role, rows, total: rows.length });
  }
  const counts = { off: out.find((g) => g.key === 'off')?.total ?? 0, def: out.find((g) => g.key === 'def')?.total ?? 0 };
  const core = out.filter((g) => g.role);
  const extra = out.filter((g) => !g.role);
  const shown = state.all ? out : core.map((g) => ({ ...g, rows: g.rows.slice(0, perGroup) }));
  const hasMore = out.some((g) => g.rows.length > perGroup) || extra.length > 0;
  if (!out.length) return null;
  return {
    adjusted, window: win,
    windows: adjusted ? [] : offered.map((w) => ({ key: w, label: windowWord(decl, w) })),
    baselineLabel: !adjusted && pd.baseline && win !== pd.baseline && out.some((g) => g.rows.some((r) => r.base)) ? windowWord(decl, pd.baseline).toLowerCase() : null,
    groups: shown, counts, hasMore,
  };
}

/** How many games the season window covers, for "Season · 6 g": the largest published sample among the window's statistics. */
export function seasonGames(profile: TeamProfile): number | null {
  let best: number | null = null;
  for (const m of profile.metrics.values()) {
    const w = m.windows.SEASON ?? (profile.season ? m.windows[profile.season] : undefined);
    if (w?.sample != null && (best == null || w.sample > best)) best = w.sample;
  }
  return best ?? profile.record?.games ?? null;
}

/* ---------------------------------------------------------------- games (TR1, TR3) */

export interface GameRowVM {
  eventId: string;
  oppId: string | null;
  oppCode: string | null;
  oppName: string;
  home: boolean | null;
  startUtc: string;
  season: string;
  for: number;
  against: number;
  margin: number;
  outcome: Outcome | null;
  week: string | null;
}

const weekOf = (competition: string | null) => {
  const m = /week\s+(\d+)/i.exec(competition ?? '');
  return m ? `Wk ${m[1]}` : null;
};

export type CodeOf = (participantId: string | null) => string | null;

/** Completed games with a published result, oldest first. */
export function completedGames(slug: string, profile: TeamProfile, codeOf: CodeOf): GameRowVM[] {
  return profile.games
    .filter((g): g is TeamGame & { result: NonNullable<TeamGame['result']> } => g.status === 'FINAL' && !!g.result)
    .map((g) => ({
      eventId: g.eventId, oppId: g.opponentId, oppCode: codeOf(g.opponentId), oppName: g.opponentName ?? g.opponentId ?? 'Opponent',
      home: g.home, startUtc: g.startUtc, season: seasonOfDate(slug, g.startUtc), for: g.result.for, against: g.result.against,
      margin: g.result.for - g.result.against, outcome: g.result.outcome, week: weekOf(g.competition),
    }));
}

export const lastN = <T,>(a: T[], n: number): T[] => a.slice(Math.max(0, a.length - n));
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export interface ScoredAllowed { scored: number; allowed: number; n: number }
export function scoredAllowed(games: GameRowVM[]): ScoredAllowed | null {
  if (!games.length) return null;
  return { scored: avg(games.map((g) => g.for))!, allowed: avg(games.map((g) => g.against))!, n: games.length };
}

/** Last N split into the most recent half and the half before it ("last 6" and "previous 6"). */
export function halves(games: GameRowVM[]): { last: ScoredAllowed | null; prev: ScoredAllowed | null } {
  const half = Math.floor(games.length / 2);
  if (half < 1) return { last: scoredAllowed(games), prev: null };
  return { last: scoredAllowed(games.slice(games.length - half)), prev: scoredAllowed(games.slice(games.length - 2 * half, games.length - half)) };
}

/** The bar scale: the largest margin, never less than 6 so a one-score week is not drawn as a full-height bar. */
export const marginScale = (games: GameRowVM[], floor = 6) => Math.max(floor, ...games.map((g) => Math.abs(g.margin)));

export interface SplitVM { wins: number; losses: number; ties: number; avgMargin: number | null; n: number }
const splitOf = (games: GameRowVM[]): SplitVM => ({
  wins: games.filter((g) => g.outcome === 'W').length,
  losses: games.filter((g) => g.outcome === 'L' || g.outcome === 'OTL').length,
  ties: games.filter((g) => g.outcome === 'T').length,
  avgMargin: avg(games.map((g) => g.margin)),
  n: games.length,
});

/** Home, away and one-score splits, computed from the game rows only (the publication stores no home/away statistics). */
export function splitsOf(games: GameRowVM[], oneScoreMargin: number): { home: SplitVM; away: SplitVM; one: SplitVM } {
  return {
    home: splitOf(games.filter((g) => g.home === true)),
    away: splitOf(games.filter((g) => g.home === false)),
    one: splitOf(games.filter((g) => Math.abs(g.margin) <= oneScoreMargin)),
  };
}

export const recordText = (s: SplitVM) => `${s.wins}–${s.losses}${s.ties ? `–${s.ties}` : ''}`;
export const signedOne = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`);
export const oneDecimal = (v: number | null) => (v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1));

/** The span of seasons the games cover, "2025 · 2026", or null when they are all one season. */
export function seasonSpan(games: GameRowVM[]): string | null {
  const s = [...new Set(games.map((g) => g.season))];
  return s.length > 1 ? s.map((x) => x.replace('-', '–')).join(' · ') : null;
}

/* ---------------------------------------------------------------- schedule (TR4) and the next game */

export interface UpcomingVM { eventId: string; startUtc: string; oppId: string | null; oppCode: string | null; oppName: string; home: boolean | null; restDays: number | null }

const DEAD = /CANCEL|POSTPON/i;

/**
 * The team's coming games. The profile lists the whole schedule; the league schedule (explorer index) is the authority for start times
 * and wins when both name the game. Rest days are the days since the team's previous game.
 */
export function upcomingOf(profile: TeamProfile, schedule: ScheduleEvent[], codeOf: CodeOf, now: number, limit = 6): UpcomingVM[] {
  const sched = new Map(schedule.map((e) => [e.eventId, e]));
  const rows = new Map<string, UpcomingVM & { sort: number }>();
  const add = (eventId: string, startUtc: string, oppId: string | null, oppName: string | null, home: boolean | null) => {
    const t = Date.parse(startUtc);
    if (!Number.isFinite(t) || t < now - 4 * 3600_000) return;
    rows.set(eventId, { eventId, startUtc, oppId, oppCode: codeOf(oppId), oppName: oppName ?? oppId ?? 'Opponent', home, restDays: null, sort: t });
  };
  for (const g of profile.games) if (g.status !== 'FINAL' && !DEAD.test(g.status)) {
    const s = sched.get(g.eventId);
    add(g.eventId, s?.startUtc ?? g.startUtc, g.opponentId, g.opponentName, g.home);
  }
  for (const e of schedule) if ((e.homeId === profile.participantId || e.awayId === profile.participantId) && e.status !== 'FINAL' && !DEAD.test(e.status) && !rows.has(e.eventId)) {
    const home = e.homeId === profile.participantId;
    add(e.eventId, e.startUtc, home ? e.awayId : e.homeId, null, home);
  }
  const list = [...rows.values()].sort((a, b) => a.sort - b.sort);
  const prevStart = [...profile.games].filter((g) => g.status === 'FINAL').map((g) => Date.parse(g.startUtc)).filter(Number.isFinite).sort((a, b) => a - b).pop() ?? null;
  let last = prevStart;
  for (const r of list) {
    r.restDays = last == null ? null : Math.max(0, Math.round((r.sort - last) / 86_400_000));
    last = r.sort;
  }
  return list.slice(0, limit).map((r) => ({ eventId: r.eventId, startUtc: r.startUtc, oppId: r.oppId, oppCode: r.oppCode, oppName: r.oppName, home: r.home, restDays: r.restDays }));
}

export interface NextGameVM { eventId: string; startUtc: string; oppId: string | null; oppCode: string | null; oppName: string; home: boolean | null }

/** The next game for the strip: the schedule authority first (it carries the start time), else the first coming game in the profile. */
export function nextGameOf(profile: TeamProfile | null, participantId: string | null, schedule: ScheduleEvent[], next: ScheduleEvent | null, codeOf: CodeOf, nameOf: (id: string | null) => string | null, now: number): NextGameVM | null {
  if (next && participantId) {
    const home = next.homeId === participantId;
    const oppId = home ? next.awayId : next.homeId;
    return { eventId: next.eventId, startUtc: next.startUtc, oppId, oppCode: home ? next.awayCode : next.homeCode, oppName: nameOf(oppId) ?? oppId ?? 'Opponent', home };
  }
  if (!profile) return null;
  const u = upcomingOf(profile, schedule, codeOf, now, 1)[0];
  return u ? { eventId: u.eventId, startUtc: u.startUtc, oppId: u.oppId, oppCode: u.oppCode, oppName: u.oppName, home: u.home } : null;
}

export interface OppUnits { off: StatObs | null; def: StatObs | null }

/** An opponent's units as the schedule shows them: opponent-adjusted offense and defense where the sport has them, else the raw overall pair. */
export function opponentUnits(slug: string, opp: TeamProfile | null, look: MetricLookup): OppUnits {
  const decl = teamSport(slug);
  if (!decl || !opp) return { off: null, def: null };
  const adj = decl.identity.adjusted;
  const pair = (adj?.pairs ?? decl.identity.raw.pairs)[0];
  const win = adj ? adj.window : 'SEASON';
  return { off: observe(opp, pair.off, win, look), def: observe(opp, pair.def, win, look) };
}

export interface ScheduleSummary { off: number | null; def: number | null; ranked: number; total: number }
export function scheduleSummary(units: OppUnits[]): ScheduleSummary {
  const both = units.filter((u) => u.off?.pct != null && u.def?.pct != null);
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return { off: mean(both.map((u) => u.off!.pct!)), def: mean(both.map((u) => u.def!.pct!)), ranked: both.length, total: units.length };
}

/* ---------------------------------------------------------------- availability and players (TR5) */

export interface AvailabilityVM {
  key: string;
  name: string;
  pos: string | null;
  reason: string | null;
  /** YYYY-MM-DD as published. */
  returnDate: string | null;
  status: string;
  kind: 'out' | 'ir' | 'other';
  label: string;
  playerId: string | null;
}

/** "Dee Winters (LB, DAL): Strain; return 2026-11-01; impact: ruled out" and "Cade Webber (D): Injured Reserve, Elbow; return 2026-10-31". */
export function parseAvailability(detail: string | null): { name: string; pos: string | null; reason: string | null; returnDate: string | null } | null {
  if (!detail) return null;
  const m = /^(.+?) \(([A-Z0-9/]+)(?:, [A-Z0-9]+)?\):\s*(.*)$/.exec(detail);
  if (!m) return { name: detail.trim(), pos: null, reason: null, returnDate: null };
  const parts = m[3].split(';').map((s) => s.trim()).filter(Boolean);
  const ret = parts.find((p) => /^return\s+\d{4}-\d{2}-\d{2}/i.test(p));
  const reason = parts.find((p) => !/^return\s/i.test(p) && !/^impact:/i.test(p)) ?? null;
  return { name: m[1].trim(), pos: m[2], reason, returnDate: ret ? /(\d{4}-\d{2}-\d{2})/.exec(ret)![1] : null };
}

const nameKey = (s: string) => s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');

const KIND_ORDER = { out: 0, ir: 1, other: 2 } as const;

export function availabilityOf(profile: TeamProfile): AvailabilityVM[] {
  const byName = new Map(profile.players.map((p) => [nameKey(p.name), p.participantId]));
  const rows: AvailabilityVM[] = [];
  profile.availability.forEach((a, i) => {
    if (!a.status || a.status === 'ACTIVE') return;
    const p = parseAvailability(a.detail);
    if (!p) return;
    const kind = a.status === 'OUT' ? 'out' : a.status === 'INJURED_RESERVE' ? 'ir' : 'other';
    const label = kind === 'out' ? 'Out' : kind === 'ir' ? 'IR' : a.status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
    rows.push({ key: `${i}:${p.name}`, name: p.name, pos: p.pos, reason: p.reason, returnDate: p.returnDate, status: a.status, kind, label, playerId: byName.get(nameKey(p.name)) ?? null });
  });
  return rows.map((r, i) => ({ r, i })).sort((a, b) => KIND_ORDER[a.r.kind] - KIND_ORDER[b.r.kind] || a.i - b.i).map((x) => x.r);
}

export function availabilityCounts(rows: AvailabilityVM[]) {
  return { out: rows.filter((r) => r.kind === 'out').length, ir: rows.filter((r) => r.kind === 'ir').length, other: rows.filter((r) => r.kind === 'other').length };
}

export interface SkillPlayerVM { id: string; name: string; role: string | null; /** Props listed on the next game; null when that board is not loaded (never "no props" on a guess). */ props: number | null; out: boolean }

export function skillPlayersOf(slug: string, profile: TeamProfile, propCounts: Map<string, number> | null, avail: AvailabilityVM[]): SkillPlayerVM[] {
  const decl = teamSport(slug);
  const roles = decl?.players?.skillRoles;
  const out = new Set(avail.filter((a) => a.kind === 'out').map((a) => nameKey(a.name)));
  const list = profile.players
    .filter((p) => !roles || (p.role != null && roles.includes(p.role)))
    .map((p): SkillPlayerVM => ({ id: p.participantId, name: p.name, role: p.role, props: propCounts ? propCounts.get(p.participantId) ?? 0 : null, out: out.has(nameKey(p.name)) }));
  return list.sort((a, b) => (b.props ?? 0) - (a.props ?? 0) || a.name.localeCompare(b.name));
}

/** Prop counts per player of one team from the board's derived prop rows, and the totals the "Props today" row prints. */
export function propCountsOf(rows: { playerId: string | null }[], playerIds: string[]): { byPlayer: Map<string, number>; props: number; players: number } {
  const mine = new Set(playerIds);
  const byPlayer = new Map<string, number>();
  let props = 0;
  for (const r of rows) if (r.playerId && mine.has(r.playerId)) { byPlayer.set(r.playerId, (byPlayer.get(r.playerId) ?? 0) + 1); props += 1; }
  return { byPlayer, props, players: byPlayer.size };
}
