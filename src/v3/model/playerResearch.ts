// Player Research (P1 to P4) as pure functions: the window and filter cuts, the facet counts the research-filters sheet shows
// BEFORE an option is applied, the rungs of a Kalshi ladder with their three evidence lanes, and the words for a lane that has
// no value. No React, no clock, no fetching: every number on the screen comes from here, so the chart, the readout, the ladder,
// the filter counts and the saved chips can never disagree.
//
// Lanes (DESIGN_SYSTEM.md): Market is the pre-fee Kalshi ask; History is the observed frequency over the games shown; SIFT model is
// the approved model estimate or nothing. They are never blended, averaged or subtracted, and a missing lane is "—" with a reason.
import type { Resolution } from '../../lib/projectionAuthority';
import { approvalFor } from '../../lib/projectionApprovals';
import { familyOf } from '../../lib/projections';
import { applyFilters, matchesFilters, NO_FILTERS, sliceWindow, summarize, type FilterContext, type Filters, type Obs, type Summary, type Window } from './research';
import { whenWords } from './time';
import type { Price } from './types';

// ------------------------------------------------------------------------------------------------ rungs

/** The "N+" rung a half-point line is: over 6.5 needs 7. A whole-number line (over 25) needs one more than the line. */
export const rungOf = (line: number): number => Math.floor(line) + 1;
export const rungLabel = (line: number): string => `${rungOf(line)}+`;

/** The line a rung sits on: "7+" is over 6.5. */
export const lineOfRung = (k: number): number => k - 0.5;

/** The ladder rung nearest a line (the snap target of a drag), or null for an empty ladder. */
export function nearestRung<T extends { line: number }>(rungs: T[], line: number): T | null {
  let best: T | null = null;
  for (const r of rungs) if (best == null || Math.abs(r.line - line) < Math.abs(best.line - line)) best = r;
  return best;
}

export const sameLine = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) < 1e-9;

// ------------------------------------------------------------------------------------------------ the cut

export interface CutContext extends FilterContext {
  /** The coming opponent (the "vs PHI" window). */
  opp: string | null;
  /** The season label of the current season's games. */
  season: string | null;
}

export interface Cut {
  /** The games the window defines (oldest first). */
  pool: Obs[];
  /** The games that remain after the filters: what the chart, the strip and the chips count. */
  games: Obs[];
}

/** A window defines a pool of games; filters narrow WITHIN it (the locked design: "L10 + Away" is the away games among the last ten). */
export function cutGames(all: Obs[], win: Window, f: Filters, ctx: CutContext): Cut {
  const pool = sliceWindow(all, win, ctx.opp, ctx.season);
  return { pool, games: applyFilters(pool, f, ctx) };
}

export interface HitCount { over: number; n: number; push: number }
export function hitCount(rows: Obs[], stat: string, line: number | null): HitCount {
  const s = summarize(rows, stat, line);
  return { over: s.over, n: s.n, push: s.push };
}

export interface WindowChip { win: Window; label: string; over: number; n: number }

/** The window chips with their hit counts at the line, filters applied inside each window. "vs PHI" exists only with a coming opponent. */
export function windowChips(all: Obs[], f: Filters, stat: string, line: number | null, ctx: CutContext): WindowChip[] {
  const labels: Record<Window, string> = { L5: 'L5', L10: 'L10', SEASON: ctx.season ?? 'Season', H2H: ctx.opp ? `vs ${ctx.opp}` : 'vs opp.', ALL: `All ${all.length}` };
  const wins: Window[] = ['L5', 'L10', 'SEASON', ...(ctx.opp ? (['H2H'] as Window[]) : []), 'ALL'];
  return wins.map((win) => { const { games } = cutGames(all, win, f, ctx); return { win, label: labels[win], ...hitCount(games, stat, line) }; });
}

export interface WindowRow extends WindowChip { mean: number | null; median: number | null; vsLine: number | null }

/** The Trends table: every window's hit count, average, median and distance from the line, filters applied inside each window. */
export function windowTable(all: Obs[], f: Filters, stat: string, line: number | null, ctx: CutContext): WindowRow[] {
  const labels = windowChips(all, f, stat, line, ctx);
  return labels.map((c) => { const { games } = cutGames(all, c.win, f, ctx); const s = summarize(games, stat, line); return { ...c, mean: s.mean, median: s.median, vsLine: s.vsLine }; });
}

/** The comparable games of SIFT Replay: the games on the coming game's side of the venue (or every game when it is not known), or those against the coming opponent. Newest 20, oldest first. */
export function replayGames(all: Obs[], mode: 'similar' | 'h2h', nextHome: boolean | null, opp: string | null): Obs[] {
  const pool = mode === 'h2h' ? all.filter((o) => opp != null && o.opp === opp) : nextHome == null ? all : all.filter((o) => o.home === nextHome);
  return [...pool].sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
}

/** The other statistics of a logged game, in one line: "6 TGT · 70 YDS" (statistics the log has no value for are left out). */
export function otherStats(o: Obs, stats: { key: string; short: string }[], except: string): string {
  return stats.filter((s) => s.key !== except && o.v[s.key] != null).map((s) => `${Math.round((o.v[s.key] as number) * 10) / 10} ${s.short}`).join(' · ');
}

export const windowLabel = (w: Window, ctx: { opp: string | null; season: string | null; total: number }): string =>
  w === 'SEASON' ? ctx.season ?? 'Season' : w === 'H2H' ? `vs ${ctx.opp ?? 'opp.'}` : w === 'ALL' ? `All ${ctx.total}` : w;

// ------------------------------------------------------------------------------------------------ filter words

export interface FilterChip { key: keyof Filters; label: string }

/** One removable chip per applied filter, in the order the sheet lists them. */
export function filterChips(f: Filters): FilterChip[] {
  const out: FilterChip[] = [];
  if (f.site) out.push({ key: 'site', label: f.site === 'home' ? 'Home' : 'Away' });
  if (f.opp) out.push({ key: 'opp', label: `vs ${f.opp}` });
  if (f.tier) out.push({ key: 'tier', label: f.tier === 'top' ? 'Top-10 D' : 'Bottom-10 D' });
  if (f.role) out.push({ key: 'role', label: f.role === 'snaps' ? 'Snaps ≥ 85%' : 'Target share ≥ 25%' });
  if (f.minMin != null) out.push({ key: 'minMin', label: `${f.minMin}+ min` });
  if (f.script) out.push({ key: 'script', label: f.script === 'won' ? 'Team won' : f.script === 'lost' ? 'Team lost' : f.script === 'close' ? 'Competitive' : 'Blowout' });
  if (f.rest) out.push({ key: 'rest', label: f.rest === 'short' ? '≤ 6 days' : f.rest === 'week' ? '7 days' : f.rest === 'long' ? '8+ days' : '7+ days' });
  return out;
}

export const filterCount = (f: Filters): number => filterChips(f).length;

// ------------------------------------------------------------------------------------------------ facets (P3)

export interface FacetOption {
  key: string;
  label: string;
  /** Games in the window that match this option together with the OTHER groups' applied filters. */
  n: number;
  over: number;
  /** Average of the statistic over those games (null with none). */
  mean: number | null;
  selected: boolean;
  /** Merged into the filters when the option is chosen. */
  patch: Partial<Filters>;
  /** Set when the option cannot work with the data this player's log carries (shown, never a working control). */
  locked: string | null;
}

export interface FacetGroup { id: 'site' | 'opponent' | 'role' | 'script' | 'rest'; label: string; options: FacetOption[]; note?: string }

export interface FacetContext extends CutContext {
  stat: string;
  line: number | null;
  /** Opponent ranks are published for this sport and stat (the Top-10 and Bottom-10 tiers can work). */
  tiers: boolean;
  /** Why the tiers cannot work, when they cannot. */
  tiersWhy: string | null;
  sport: string;
  hasMinutes: boolean;
}

const GROUP_KEYS: Record<FacetGroup['id'], (keyof Filters)[]> = { site: ['site'], opponent: ['opp', 'tier'], role: ['role', 'minMin'], script: ['script'], rest: ['rest'] };

const cleared = (f: Filters, id: FacetGroup['id']): Filters => { const c = { ...f } as Record<string, unknown>; for (const k of GROUP_KEYS[id]) c[k] = null; return c as unknown as Filters; };

/** The research-filters facets for a window's pool. Every count is what the chart would show if that option were applied now. */
export function facets(pool: Obs[], f: Filters, c: FacetContext): FacetGroup[] {
  const count = (id: FacetGroup['id'], patch: Partial<Filters>) => {
    const next = { ...cleared(f, id), ...patch };
    const rows = pool.filter((r) => matchesFilters(r, next, c));
    return { rows, ...hitCount(rows, c.stat, c.line), mean: summarize(rows, c.stat, c.line).mean };
  };
  const has = (fn: (r: Obs) => boolean) => pool.some(fn);
  const opt = (id: FacetGroup['id'], key: string, label: string, patch: Partial<Filters>, selected: boolean, locked: string | null = null): FacetOption => {
    const r = count(id, patch);
    return { key, label, n: r.n, over: r.over, mean: r.mean, selected, patch, locked };
  };
  const any = (id: FacetGroup['id'], label = 'All'): FacetOption => { const keys = GROUP_KEYS[id]; const sel = keys.every((k) => f[k] == null); return opt(id, 'any', label, Object.fromEntries(keys.map((k) => [k, null])) as Partial<Filters>, sel); };
  const groups: FacetGroup[] = [];

  groups.push({
    id: 'site', label: 'Site',
    options: [any('site'), opt('site', 'home', 'Home', { site: 'home' }, f.site === 'home', has((r) => r.home != null) ? null : 'needs data'), opt('site', 'away', 'Away', { site: 'away' }, f.site === 'away', has((r) => r.home != null) ? null : 'needs data')],
  });

  const opp: FacetOption[] = [];
  if (c.opp) opp.push(opt('opponent', 'opp', `vs ${c.opp}`, { opp: c.opp, tier: null }, f.opp === c.opp));
  opp.push(opt('opponent', 'top', 'Top-10 D', { tier: 'top', opp: null }, f.tier === 'top', c.tiers ? null : 'needs data'));
  opp.push(opt('opponent', 'bottom', 'Bottom-10 D', { tier: 'bottom', opp: null }, f.tier === 'bottom', c.tiers ? null : 'needs data'));
  groups.push({ id: 'opponent', label: 'Opponent', options: opp, note: c.tiers ? 'Opponent tiers use each team’s current season rank, not its rank on the game date.' : c.tiersWhy ?? undefined });

  const role: FacetOption[] = [];
  if (c.sport === 'NFL') {
    role.push(opt('role', 'snaps', 'Snaps ≥ 85%', { role: 'snaps', minMin: null }, f.role === 'snaps', has((r) => r.snap != null) ? null : 'needs data'));
    role.push(opt('role', 'share', 'Target share ≥ 25%', { role: 'share', minMin: null }, f.role === 'share', has((r) => r.tgtShare != null) ? null : 'needs data'));
  } else if (c.hasMinutes) {
    for (const m of [20, 28, 32, 36]) role.push(opt('role', `min${m}`, `${m}+ min`, { minMin: m, role: null }, f.minMin === m));
  }
  if (role.length) groups.push({ id: 'role', label: 'Role', options: role, note: c.sport === 'NFL' ? undefined : 'Minutes he actually played in each past game. A projection for the coming game is a different thing and is not used here.' });

  const margin = has((r) => r.margin != null);
  groups.push({
    id: 'script', label: 'Game script',
    options: [opt('script', 'won', 'Team won', { script: 'won' }, f.script === 'won', margin ? null : 'needs data'), opt('script', 'lost', 'Team lost', { script: 'lost' }, f.script === 'lost', margin ? null : 'needs data'),
      { key: 'fav', label: 'Favorite', n: 0, over: 0, mean: null, selected: false, patch: {}, locked: 'needs data' }],
    note: margin ? undefined : 'The final score is not in this player’s log.',
  });

  const rest = has((r) => r.rest != null);
  groups.push({
    id: 'rest', label: 'Rest',
    options: [opt('rest', 'short', '≤ 6 days', { rest: 'short' }, f.rest === 'short', rest ? null : 'needs data'), opt('rest', 'week', '7 days', { rest: 'week' }, f.rest === 'week', rest ? null : 'needs data'), opt('rest', 'long', '8+ days', { rest: 'long' }, f.rest === 'long', rest ? null : 'needs data')],
    note: rest ? undefined : 'The days between games are not in this player’s log.',
  });
  return groups;
}

/** Filters that need data SIFT does not publish, listed as locked rows with the reason (never working controls). */
export const LOCKED_FILTERS: { label: string; reason: string }[] = [
  { label: 'Teammate out', reason: 'Which teammates were out in each past game is not published.' },
  { label: 'Weather', reason: 'Game-day weather for past games is not published.' },
  { label: 'Pace', reason: 'Team pace by game is not published.' },
];

export interface MatchSummary { matched: number; of: number; hit: HitCount; mean: number | null; squares: { hit: boolean | null }[] }

/** The live card at the top of the filters sheet: how many games match, what they did, and which of the window's games they are. */
export function matchSummary(pool: Obs[], f: Filters, stat: string, line: number | null, ctx: FilterContext): MatchSummary {
  const games = applyFilters(pool, f, ctx);
  const s: Summary = summarize(games, stat, line);
  const ok = new Set(games.map((g) => g.key));
  return {
    matched: games.length, of: pool.length, hit: { over: s.over, n: s.n, push: s.push }, mean: s.mean,
    squares: pool.map((g) => { if (!ok.has(g.key)) return { hit: null }; const v = g.v[stat]; return { hit: v != null && line != null ? v > line : null }; }),
  };
}

// ------------------------------------------------------------------------------------------------ rung views (the three lanes)

export type SiftLane = { p: number; reason: null } | { p: null; reason: string };

export interface RungView {
  k: number;
  line: number;
  label: string;
  ticker: string;
  /** The pre-fee ask in cents, or null when no price may be shown (withheld by the display gate: "—"). */
  ask: number | null;
  over: number;
  n: number;
  /** History as a share of the games shown (0 to 100), or null with no games. */
  history: number | null;
  sift: SiftLane;
}

/** The ledger record behind a SIFT model number: what permits it, in the ledger's own terms (src/lib/projectionApprovals.ts). */
export interface LedgerProof { family: string; decision: string; engine: string; approvedOn: string; permitted: boolean; caveat: string | null }

/** The ledger row for a (sport, stat), or null when the stat has no row (nothing is then approved). `permitted` only for PROMOTED to the foundation engine. */
export function ledgerProof(sport: string, stat: string): LedgerProof | null {
  const family = familyOf(projectionStat(sport, stat));
  const a = approvalFor(sport, family);
  if (!a) return null;
  return { family, decision: a.decision, engine: a.engine, approvedOn: a.approvedOn, permitted: a.decision === 'PROMOTED' && a.engine === 'foundation' && a.publication?.standard !== 'NOT_MET', caveat: a.publication?.caveat ?? null };
}
export const ledgerPermits = (sport: string, stat: string): boolean => ledgerProof(sport, stat)?.permitted === true;
/** "NFL:receptions:PROMOTED:2026-10-18": the record, as a stable string for the screen (data-ledger) and the tests. */
export const ledgerKey = (sport: string, stat: string): string | null => { const p = ledgerProof(sport, stat); return p ? `${sport.toUpperCase()}:${p.family}:${p.decision}:${p.approvedOn}` : null; };

/** The approval ledger's own state for a stat, in the few words a lane shows. */
export function ledgerWords(sport: string, stat: string): string {
  const a = approvalFor(sport, familyOf(projectionStat(sport, stat)));
  return a?.decision === 'APPROVED_PENDING_LIVE_INPUTS' ? 'awaiting live inputs' : 'not approved yet';
}

/**
 * The SIFT model lane for one rung, only from the approved publication. `res` is the projection authority's resolution for this
 * player and stat: an authoritative value gives P(stat ≥ k) from its own published distribution; everything else is "—" with why.
 * The established simulation's number (kind legacy or fallback) is never the SIFT model lane, and nothing is back-filled from the
 * other lanes. Reasons never mention the age of an input.
 */
export function siftLaneFor(res: Resolution | null, sport: string, stat: string, k: number): SiftLane {
  if (!res) return { p: null, reason: 'not approved yet' };
  if (res.kind === 'authoritative') {
    // Belt and braces: the authority already routes through the ledger, but this lane re-checks the ledger row itself, so no resolution
    // for a stat whose row is not PROMOTED to the foundation engine can ever put a number on the screen.
    if (!ledgerPermits(sport, stat)) return { p: null, reason: ledgerWords(sport, stat) };
    const hit = res.value.thresholds.find((t) => t.k === k);
    return hit && Number.isFinite(hit.p) ? { p: hit.p, reason: null } : { p: null, reason: 'not published at this rung' };
  }
  if (res.kind === 'legacy' || res.kind === 'fallback') return { p: null, reason: ledgerWords(sport, stat) };
  switch (res.code) {
    case 'FAMILY_NOT_PUBLISHED': case 'FAMILY_NOT_READY': return { p: null, reason: ledgerWords(sport, stat) };
    case 'OUT': return { p: null, reason: 'withheld: availability' };
    case 'GATE_BLOCK': case 'INCOHERENT': return { p: null, reason: 'withheld by quality checks' };
    case 'NOT_PROJECTED': return { p: null, reason: 'not modelled for this game' };
    default: return { p: null, reason: 'not published yet' };
  }
}

export interface RungInput { line: number; price: Price }

/**
 * Every rung of the player's ladder with its three lanes at the games shown. `askOf` applies the display gate (null when the quote
 * may not be shown); History counts the games in the cut; SIFT comes from `siftAt`.
 */
export function rungViews(rungs: RungInput[], games: Obs[], stat: string, askOf: (p: Price) => number | null, siftAt: (k: number) => SiftLane): RungView[] {
  return [...rungs].sort((a, b) => a.line - b.line).map((r) => {
    const k = rungOf(r.line);
    const h = hitCount(games, stat, r.line);
    return { k, line: r.line, label: `${k}+`, ticker: r.price.ticker, ask: askOf(r.price), over: h.over, n: h.n, history: h.n ? Math.round((100 * h.over) / h.n) : null, sift: siftAt(k) };
  });
}

/** The rungs to list on the page: all of a short ladder, else a window around the selected line (the sheet lists every rung). */
export function rungWindow<T extends { line: number }>(rows: T[], line: number | null, max = 7): T[] {
  if (rows.length <= max) return rows;
  const at = line == null ? Math.floor(rows.length / 2) : Math.max(0, rows.findIndex((r) => sameLine(r.line, line)));
  const start = Math.max(0, Math.min(rows.length - max, at - Math.floor(max / 2)));
  return rows.slice(start, start + max);
}

// ------------------------------------------------------------------------------------------------ the opposing unit (P4)

export interface OppUnit { id: string; label: string }
export interface OppUnits {
  /** "pass defense": the opposing unit's name after the opponent's code ("PHI pass defense"). */
  unit: string;
  /** The statistics worth drawing, best fit first; only those the opponent's profile publishes are shown, the rest are named as not published. */
  candidates: OppUnit[];
}

const EXPLOSIVE: OppUnit = { id: 'adj_def_explosive', label: 'Explosive plays allowed' };
const PASS_D: OppUnits = { unit: 'pass defense', candidates: [{ id: 'adj_def_db_epa', label: 'EPA per dropback allowed' }, EXPLOSIVE] };
const RUN_D: OppUnits = { unit: 'run defense', candidates: [{ id: 'adj_def_rush_epa', label: 'EPA per rush allowed' }, EXPLOSIVE] };
const ALL_D: OppUnits = { unit: 'defense', candidates: [{ id: 'adj_def_epa', label: 'EPA per play allowed' }, EXPLOSIVE] };
const NFL_UNIT: Record<string, OppUnits> = {
  receptions: PASS_D, receiving_yards: PASS_D, targets: PASS_D, longest_reception: PASS_D, passing_yards: PASS_D, attempts: PASS_D, completions: PASS_D, passing_tds: PASS_D, interceptions: PASS_D,
  rushing_yards: RUN_D, carries: RUN_D, longest_rush: RUN_D, touchdowns: ALL_D, rush_rec_yards: ALL_D,
};

/** The opposing unit a statistic is up against, from the opponent's published opponent-adjusted rankings. Only football publishes these today. */
export function oppUnitsFor(sport: string, stat: string): OppUnits | null {
  return sport === 'NFL' ? NFL_UNIT[stat] ?? ALL_D : null;
}

/** 'top' for rank 10 or better, 'bottom' for the worst 10 of the universe, else null (the middle is neither tier). */
export function tierOfRank(rank: number | null, n: number | null): 'top' | 'bottom' | null {
  if (rank == null || n == null) return null;
  return rank <= 10 ? 'top' : rank > n - 10 ? 'bottom' : null;
}

// ------------------------------------------------------------------------------------------------ a past game's page

export interface ScheduledGame { eventId: string; opponentCode: string | null; startUtc: string; status: string }

/**
 * The published event of one logged game, matched on the opponent and the date (a Monday-night game is already the next day in UTC, so
 * the window is two days). A game the schedule does not list (last season's, for one) has no page: null, never a guessed link.
 */
export function eventForObs(games: ScheduledGame[], o: Pick<Obs, 'date' | 'opp'>): string | null {
  const t = Date.parse(`${o.date}T12:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const hit = games.filter((g) => g.opponentCode === o.opp && g.status === 'FINAL' && Math.abs(Date.parse(g.startUtc) - t) <= 2 * 86_400_000);
  return hit.length === 1 ? hit[0].eventId : null;
}

// ------------------------------------------------------------------------------------------------ words

/** "Mon 8:15 PM"; with the date when the game is more than a week away. */
export const gameWhen = (ms: number, now: number): string => whenWords(ms, now);

const UNIT_WORD: Record<string, string> = { rec: 'catches', yds: 'yds', tgt: 'targets', car: 'carries', att: 'attempts', cmp: 'completions', TD: 'TD', INT: 'INT' };
/** "7+ catches": the statistic's own unit after the rung. */
export const unitWord = (unit: string | null | undefined): string => (unit ? UNIT_WORD[unit] ?? unit : '');

/** The stat the player's market and log name differently, to the projection family. */
const FAMILY_FOR_BOX: Record<string, string> = { pts: 'points', reb: 'rebounds', ast: 'assists', fg3m: 'threes', pra: 'pra', g: 'goals', a: 'assists', p: 'points' };
export const projectionStat = (sport: string, stat: string): string => (sport === 'NFL' ? stat : FAMILY_FOR_BOX[stat] ?? stat);

/** Chips a saved record shows: the window, each applied filter, the rung. */
export function savedChips(win: string, f: Filters, k: number | null): string[] {
  return [win, ...filterChips(f).map((c) => c.label), ...(k != null ? [`${k}+`] : [])];
}

export { NO_FILTERS };
