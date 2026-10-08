// The NHL game story: pure read-outs of the NHL publication that the slate and game page are built from.
//
// Nothing here is a model. Every number is either published as is (the simulation's win probability, expected goals,
// script probabilities, survival bits, research candidates) or an exact identity over published numbers (an
// expectation across the seven mutually exclusive scripts: Σ P(script) × E[x | script]). The words are fixed
// templates keyed on those numbers, so the same publication always reads the same way. When an input is missing the
// corresponding line is omitted; nothing is defaulted or invented.
import type { EventDoc, EventResearchDoc, Market } from '../contract/types';
import { quoteFreshness, type QuoteFreshness } from '../live/freshness';
import { isNhlScripts, readNhl, type NhlCandidate, type NhlMarketRow, type NhlScript, type NhlScripts, type Tier } from './nhl';

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const pct = (v: number) => `${Math.round(v * 100)}%`;

// ------------------------------------------------------------------ game phase

export type GamePhase = 'UPCOMING' | 'LIVE' | 'FINAL';

export interface PhaseView {
  phase: GamePhase;
  /** Final score only: a live score from a periodic publication would be stale, so it is never shown. */
  score: { home: number; away: number } | null;
  word: string;
}

/** UPCOMING until puck drop, LIVE after it (whatever a lagging publication says), FINAL when the publication says so. */
export function gamePhase(ev: Pick<EventDoc, 'status' | 'start_time_utc'> & { extensions?: Record<string, unknown> | null }, now: number): PhaseView {
  const st = String(ev.status ?? '').toUpperCase();
  const x = (ev.extensions ?? {}) as any;
  if (st === 'FINAL' || st === 'COMPLETED' || st === 'OFF') {
    const h = num(x.home_score);
    const a = num(x.away_score);
    return { phase: 'FINAL', score: h != null && a != null ? { home: h, away: a } : null, word: 'Final' };
  }
  if (st === 'LIVE' || st === 'IN_PROGRESS' || Date.parse(ev.start_time_utc) <= now) return { phase: 'LIVE', score: null, word: 'Live' };
  return { phase: 'UPCOMING', score: null, word: 'Upcoming' };
}

// ------------------------------------------------------------------ freshness

export type Fresh = 'CURRENT' | 'AGING' | 'STALE' | 'FROZEN' | 'UNKNOWN';

export const FRESH_WORD: Record<Fresh, string> = { CURRENT: 'Current', AGING: 'Aging', STALE: 'Stale', FROZEN: 'Frozen at puck drop', UNKNOWN: 'Unknown' };

/** The model publishes hourly while a game is within a day; the publisher's own health thresholds are 1 h / 6 h. */
export const MODEL_FRESH_MS = 3600e3;
export const MODEL_STALE_MS = 6 * 3600e3;

export function ageMs(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, now - t) : null;
}

/** Research-run freshness. A started game's research is frozen by contract, never "stale". */
export function modelFreshness(generatedAt: string | null | undefined, phase: GamePhase, now: number): Fresh {
  if (phase !== 'UPCOMING') return generatedAt ? 'FROZEN' : 'UNKNOWN';
  const a = ageMs(generatedAt, now);
  if (a == null) return 'UNKNOWN';
  return a <= MODEL_FRESH_MS ? 'CURRENT' : a <= MODEL_STALE_MS ? 'AGING' : 'STALE';
}

/** Price freshness in the same three words (Sift's market clock: FRESH < 15 min ≤ AGING ≤ 30 min < STALE). */
export function priceFreshness(capturedAt: string | null | undefined, now: number): Fresh {
  const q: QuoteFreshness = quoteFreshness(capturedAt ?? null, now);
  return q === 'FRESH' ? 'CURRENT' : q;
}

export function ageWords(ms: number | null): string {
  if (ms == null) return 'time unknown';
  const m = Math.round(ms / 60e3);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60 ? `${m % 60} min ` : ''}ago`;
  return `${Math.floor(h / 24)} days ago`;
}

// ------------------------------------------------------------------ teams

export interface SideIds { homeId: string; awayId: string; home: string; away: string }

export function sidesOf(r: EventResearchDoc): SideIds | null {
  const h = r.participants.find((p) => p.home_away === 'HOME');
  const a = r.participants.find((p) => p.home_away === 'AWAY');
  if (!h || !a) return null;
  const short = (pid: string) => r.event.participants.find((p) => p.participant_id === pid)?.short_name ?? '?';
  return { homeId: h.participant_id, awayId: a.participant_id, home: short(h.participant_id), away: short(a.participant_id) };
}

// ------------------------------------------------------------------ projection

export interface Projection {
  /** DATA_ONLY_V1 simulation (independent of market prices). */
  pHome: number | null;
  pAway: number | null;
  pOvertime: number | null;
  homeXg: number | null;
  awayXg: number | null;
  total: number | null;
  totalRange: { lo: number; hi: number } | null;
  /** League scoring baseline the model uses (2 × league goals per 60), for "above / below average" words. */
  leagueTotal: number | null;
  homeAdj: number | null;
  homeGoalieFactor: number | null;
  awayGoalieFactor: number | null;
  rest: { home: number | null; away: number | null; homeB2b: boolean; awayB2b: boolean };
  /** Expectations across the scripts (exact: Σ P(script) × E[x | script]). */
  shots: { home: number; away: number } | null;
  saves: { home: number; away: number } | null;
  ppGoals: { home: number; away: number } | null;
  /** The source of the headline numbers, said once. */
  source: string;
}

function weighted(s: NhlScripts, pick: (x: NhlScript) => number | null): number | null {
  let acc = 0;
  let mass = 0;
  for (const x of s.scripts) {
    const v = pick(x);
    if (v == null) return null;
    acc += x.probability * v;
    mass += x.probability;
  }
  return mass > 0.98 ? acc / mass : null;
}

export function projection(r: EventResearchDoc, s: NhlScripts | null): Projection | null {
  const ext = (r.extensions ?? {}) as any;
  const sim = ext.sim ?? null;
  const mc = ext.model_components ?? null;
  const ctx = s?.context as any;
  const dist = r.distributions.find((d) => /total goals/i.test(d.label));
  const q = (dist?.quantiles ?? {}) as Record<string, number>;
  const lo = num(q.p05) ?? num(q.p10);
  const hi = num(q.p95) ?? num(q.p90);
  const pHome = num(sim?.p_home_win) ?? (s ? weighted(s, (x) => x.pHomeWin) : null);
  const homeShots = s ? weighted(s, (x) => x.homeShots) : null;
  const awayShots = s ? weighted(s, (x) => x.awayShots) : null;
  const homeSaves = s ? weighted(s, (x) => x.homeSaves) : null;
  const awaySaves = s ? weighted(s, (x) => x.awaySaves) : null;
  const homePp = s ? weighted(s, (x) => x.homePpGoals) : null;
  const awayPp = s ? weighted(s, (x) => x.awayPpGoals) : null;
  if (pHome == null && !s && !sim) return null;
  const lg = num(mc?.league_g60);
  return {
    pHome, pAway: pHome == null ? null : num(sim?.p_away_win) ?? 1 - pHome, pOvertime: num(sim?.p_overtime),
    homeXg: num(sim?.home_lambda) ?? num(ctx?.lam_home), awayXg: num(sim?.away_lambda) ?? num(ctx?.lam_away),
    total: num(sim?.total_mean) ?? (s ? weighted(s, (x) => x.totalGoals) : null), totalRange: lo != null && hi != null ? { lo, hi } : null,
    leagueTotal: lg != null ? 2 * lg : null, homeAdj: num(mc?.home_adj),
    homeGoalieFactor: num(mc?.home_goalie_factor), awayGoalieFactor: num(mc?.away_goalie_factor),
    rest: { home: num(ctx?.home_rest_days), away: num(ctx?.away_rest_days), homeB2b: Boolean(mc?.home_b2b ?? ctx?.home_b2b), awayB2b: Boolean(mc?.away_b2b ?? ctx?.away_b2b) },
    shots: homeShots != null && awayShots != null ? { home: homeShots, away: awayShots } : null,
    saves: homeSaves != null && awaySaves != null ? { home: homeSaves, away: awaySaves } : null,
    ppGoals: homePp != null && awayPp != null ? { home: homePp, away: awayPp } : null,
    source: sim ? `${sim.sim_version ?? 'DATA_ONLY_V1'} simulation, ${Number(sim.n_sims ?? 0).toLocaleString('en-US')} games, independent of market prices` : 'NHL_SCRIPT_V1 joint draw',
  };
}

export type Scoring = 'ABOVE' | 'AVERAGE' | 'BELOW';
export const SCORING_WORD: Record<Scoring, string> = { ABOVE: 'Above-average scoring', AVERAGE: 'League-average scoring', BELOW: 'Below-average scoring' };

/** The model's total against its own league baseline: ±0.4 goals is the band called "average". */
export function scoringEnvironment(p: Projection | null): Scoring | null {
  if (p?.total == null || p.leagueTotal == null) return null;
  const d = p.total - p.leagueTotal;
  return d >= 0.4 ? 'ABOVE' : d <= -0.4 ? 'BELOW' : 'AVERAGE';
}

export function favourite(p: Projection | null, ids: SideIds): { team: string; p: number; words: string } | null {
  if (p?.pHome == null) return null;
  const home = p.pHome >= 0.5;
  const v = home ? p.pHome : 1 - p.pHome;
  const team = home ? ids.home : ids.away;
  const words = v < 0.53 ? 'Coin flip' : v < 0.6 ? `${team} slight edge` : v < 0.68 ? `${team} favoured` : `${team} clear favourite`;
  return { team, p: v, words };
}

/** An injury designation that keeps the player out of the lineup (OUT, injured reserve, LTIR), not day-to-day. */
export function isOut(status: string | null | undefined): boolean {
  return /^(OUT|IR|LTIR|INJURED[_ ]RESERVE|LONG[_ ]TERM[_ ]INJURED[_ ]RESERVE)$/i.test(String(status ?? '').trim());
}

// ------------------------------------------------------------------ the thesis

export interface Thesis {
  /** One short headline, e.g. "LAK slight edge · back-and-forth most likely". */
  headline: string;
  /** Two or three plain sentences: the shape of the game. */
  shape: string[];
  /** Drivers, each one line, only those the publication supports. */
  drivers: { key: string; label: string; text: string }[];
}

const byId = (s: NhlScripts, id: string) => s.byId.get(id) ?? null;

function lower(label: string): string {
  return /^[A-Z]{2,3}\b/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

export function thesis(s: NhlScripts | null, p: Projection | null, ids: SideIds, goalies: GoalieLine[], injuriesOut: { home: number; away: number } | null): Thesis | null {
  if (!s && !p) return null;
  const fav = favourite(p, ids);
  const scoring = scoringEnvironment(p);
  const shape: string[] = [];
  let headline = '';
  if (s && s.scripts.length) {
    const [a, b] = s.scripts;
    const top = a.probability;
    headline = [fav?.words, `${lower(a.short)} most likely`].filter(Boolean).join(' · ');
    if (top >= 0.4) shape.push(`${a.label} is the clear most likely shape: ${pct(top)} of simulated games.`);
    else if (b && top - b.probability <= 0.05) shape.push(`${a.label} (${pct(top)}) and ${lower(b.label)} (${pct(b.probability)}) are about equally likely; no single script dominates.`);
    else shape.push(`${a.label} is the single most likely shape (${pct(top)}), but ${pct(1 - top)} of simulated games play out another way.`);
    const hc = byId(s, 'HOME_CONTROL')?.probability ?? null;
    const ac = byId(s, 'AWAY_CONTROL')?.probability ?? null;
    if (hc != null && ac != null) {
      if (Math.abs(hc - ac) >= 0.03) {
        const [t, x, o] = hc > ac ? [ids.home, hc, ac] : [ids.away, ac, hc];
        shape.push(`${t} has the stronger control-and-pull-away branch (${pct(x)} vs ${pct(o)}).`);
      } else shape.push(`Neither team has a meaningfully stronger pull-away branch (${ids.home} ${pct(hc)}, ${ids.away} ${pct(ac)}).`);
    }
    const open = byId(s, 'OPEN_GAME');
    const tight = byId(s, 'TIGHT_LOW_EVENT');
    if (open && tight) {
      const lean = open.probability - tight.probability;
      shape.push(Math.abs(lean) < 0.03
        ? `Open, high-event (${pct(open.probability)}) and tight, low-event (${pct(tight.probability)}) outcomes are balanced.`
        : lean > 0 ? `An open, high-event game (${pct(open.probability)}) is more likely than a tight, low-event one (${pct(tight.probability)}).`
          : `A tight, low-event game (${pct(tight.probability)}) is more likely than an open, high-event one (${pct(open.probability)}).`);
    }
  } else if (fav) headline = fav.words;
  if (scoring) headline = [headline, SCORING_WORD[scoring].toLowerCase()].filter(Boolean).join(' · ');

  const drivers: Thesis['drivers'] = [];
  if (p?.homeXg != null && p.awayXg != null) {
    drivers.push({ key: 'strength', label: 'Team strength', text: `Model expected goals ${ids.away} ${p.awayXg.toFixed(2)} – ${ids.home} ${p.homeXg.toFixed(2)}${fav ? `; ${fav.team} wins ${pct(fav.p)} of simulations` : ''}.` });
  }
  if (p?.total != null) {
    const rng = p.totalRange ? ` (90% of simulations between ${p.totalRange.lo} and ${p.totalRange.hi})` : '';
    const base = p.leagueTotal != null ? `, against a ${p.leagueTotal.toFixed(1)}-goal league baseline` : '';
    drivers.push({ key: 'pace', label: 'Pace', text: `Projected total ${p.total.toFixed(1)} goals${rng}${base}.` });
  }
  if (p?.shots) {
    const share = p.shots.home / (p.shots.home + p.shots.away);
    const lead = Math.abs(share - 0.5) < 0.015 ? 'an even shot share' : `${share > 0.5 ? ids.home : ids.away} with ${pct(Math.max(share, 1 - share))} of shots`;
    drivers.push({ key: 'shots', label: 'Shot generation', text: `Expected shots on goal ${ids.away} ${p.shots.away.toFixed(0)} – ${ids.home} ${p.shots.home.toFixed(0)}: ${lead}.` });
  }
  if (goalies.length) {
    const unconf = goalies.filter((g) => g.status !== 'CONFIRMED');
    const facs = [p?.awayGoalieFactor, p?.homeGoalieFactor];
    const fx = facs.every((f) => f != null) ? ` Model goalie factors ${ids.away} ${facs[0]!.toFixed(2)}, ${ids.home} ${facs[1]!.toFixed(2)} (below 1 saves more than an average goalie).` : '';
    drivers.push({
      key: 'goalies', label: 'Goaltending',
      text: unconf.length
        ? `${unconf.map((g) => `${g.team} starter ${g.name ? `${g.name} is ` : 'is '}${(g.status ?? 'unknown').toLowerCase()}`).join('; ')} — the projection assumes this starter.${fx}`
        : `Both starters confirmed (${goalies.map((g) => `${g.team} ${g.name}`).join(', ')}).${fx}`,
    });
  }
  if (s) {
    const st = byId(s, 'SPECIAL_TEAMS');
    if (st && st.leagueBaseRate != null) {
      const d = st.probability - st.leagueBaseRate;
      const pp = p?.ppGoals ? ` Expected power-play goals ${ids.away} ${p.ppGoals.away.toFixed(2)}, ${ids.home} ${p.ppGoals.home.toFixed(2)}.` : '';
      drivers.push({ key: 'special', label: 'Special teams', text: `Special teams decide it in ${pct(st.probability)} of simulations, ${Math.abs(d) < 0.02 ? 'close to' : d > 0 ? 'above' : 'below'} the ${pct(st.leagueBaseRate)} league rate.${pp}` });
    }
  }
  if (p?.homeAdj != null && p.homeAdj !== 1) {
    drivers.push({ key: 'home', label: 'Home ice', text: `The model multiplies ${ids.home}'s expected goals by ${p.homeAdj.toFixed(3)} and divides ${ids.away}'s by the same factor.` });
  }
  const rest: string[] = [];
  if (p?.rest.awayB2b) rest.push(`${ids.away} on a back-to-back`);
  if (p?.rest.homeB2b) rest.push(`${ids.home} on a back-to-back`);
  if (!rest.length && p?.rest.home != null && p.rest.away != null) rest.push(`${ids.away} ${p.rest.away} days of rest, ${ids.home} ${p.rest.home}`);
  if (rest.length) drivers.push({ key: 'rest', label: 'Schedule', text: `${rest.join('; ')}.` });
  if (injuriesOut && injuriesOut.home + injuriesOut.away > 0) {
    drivers.push({ key: 'injuries', label: 'Lineups', text: `Out or on injured reserve: ${ids.away} ${injuriesOut.away}, ${ids.home} ${injuriesOut.home}. Injuries enter the model only through who is in the projected lineup.` });
  }
  return { headline: headline ? headline.charAt(0).toUpperCase() + headline.slice(1) : 'Projection', shape, drivers };
}

// ------------------------------------------------------------------ goalies

export interface GoalieLine {
  team: string;
  side: 'home' | 'away';
  name: string | null;
  status: string | null;
  confidence: number | null;
  observedAt: string | null;
  source: string | null;
  pid: string | null;
}

export function goalieLines(r: EventResearchDoc, s: NhlScripts | null, ids: SideIds): GoalieLine[] {
  const out: GoalieLine[] = [];
  const ctxG = (s?.context as any)?.goalies ?? {};
  for (const side of ['away', 'home'] as const) {
    const team = side === 'home' ? ids.home : ids.away;
    const l = ((r.context?.lineups ?? []) as any[]).find((x) => x.kind === 'goalie_status' && x.team === team);
    const cur = l?.current ?? ctxG[side] ?? null;
    const name = cur?.player_name ?? cur?.name ?? null;
    if (!l && !cur) continue;
    const tl = (l?.timeline ?? []) as any[];
    const p = name ? r.players.find((x) => x.display_name === name) : undefined;
    out.push({
      team, side, name, status: cur?.status ?? null, confidence: num(cur?.confidence), observedAt: tl.length ? tl[tl.length - 1]?.observed_at ?? null : null,
      source: cur?.source ?? l?.source ?? null, pid: p?.participant_id ?? null,
    });
  }
  return out;
}

export const allGoaliesConfirmed = (g: GoalieLine[]) => g.length === 2 && g.every((x) => x.status === 'CONFIRMED');

// ------------------------------------------------------------------ market fit

export type FitGroup = 'FITS' | 'SURVIVES' | 'DEPENDENT' | 'CONFLICTS' | 'HIGH_VARIANCE';

export const FIT_TITLE: Record<FitGroup, string> = {
  SURVIVES: 'Survives multiple scripts',
  FITS: 'Fits the projected game',
  DEPENDENT: 'Script-dependent',
  CONFLICTS: 'Conflicts with the thesis',
  HIGH_VARIANCE: 'High-variance research',
};
export const FIT_HELP: Record<FitGroup, string> = {
  SURVIVES: 'Robust: stays positive after fees and the conservative haircut across most simulated games, including three or more major scripts.',
  FITS: 'Holds up in the most likely script and in enough of the simulated games to be moderate, but leans on the projected shape.',
  DEPENDENT: 'Positive on average, but the value sits in a narrow set of scripts: it needs one particular game to happen.',
  CONFLICTS: 'Looks positive on the numbers, but fails in the most likely script and in most simulated games, or the model marks it as contradicting another idea.',
  HIGH_VARIANCE: 'Goal-scorer contracts: a handful of goals decide them. Shown for completeness, never featured.',
};

export const HIGH_VARIANCE_FAMILIES = new Set(['player_goals', 'first_goal']);

export interface FitItem {
  c: NhlCandidate;
  group: FitGroup;
  /** Scripts (most likely first) where the idea survives / fails, with their probabilities. */
  carries: NhlScript[];
  breaks: NhlScript[];
  reason: string;
}

/** Group the research candidates by how they relate to the scripts, from the published survival bits only. */
export function marketFit(s: NhlScripts): FitItem[] {
  const top = s.scripts[0];
  const topIdx = top ? s.order.indexOf(top.id) : -1;
  const out: FitItem[] = [];
  for (const c of s.candidates) {
    if (c.governance.status === 'REJECTED') continue;
    const bits = c.survival.survives;
    const carries = s.scripts.filter((x) => bits?.[s.order.indexOf(x.id)]);
    const breaks = s.scripts.filter((x) => bits && !bits[s.order.indexOf(x.id)]);
    const mass = c.survival.mass_survived ?? 0;
    const inTop = topIdx >= 0 && !!bits?.[topIdx];
    const contradicts = c.relations.some((x) => /CONTRADICT/.test(String(x.relationship ?? '')) || x.kind === 'OFFSETTING');
    let group: FitGroup;
    let reason: string;
    if (HIGH_VARIANCE_FAMILIES.has(c.family)) {
      group = 'HIGH_VARIANCE';
      reason = 'Decided by whether one player scores; high variance whatever the script.';
    } else if (!inTop && mass < 0.5) {
      group = 'CONFLICTS';
      reason = `Fails in the most likely script (${lower(top!.label)}) and survives only ${pct(mass)} of simulated games.`;
    } else if (c.robustness === 'ROBUST') {
      group = 'SURVIVES';
      reason = `Survives ${pct(mass)} of simulated games across ${carries.length} scripts.`;
    } else if (c.robustness === 'MODERATE' && inTop) {
      group = 'FITS';
      reason = `Holds in the most likely script and ${pct(mass)} of simulated games.`;
    } else {
      group = 'DEPENDENT';
      reason = carries.length ? `Needs ${carries.slice(0, 2).map((x) => lower(x.label)).join(' or ')} (${pct(mass)} of simulated games).` : 'Survives no single script outright.';
    }
    if (contradicts && group !== 'HIGH_VARIANCE' && group !== 'CONFLICTS') reason += ' The model marks it as partly contradicting another candidate (see the contradiction check).';
    out.push({ c, group, carries, breaks, reason });
  }
  return out;
}

export interface Conflict {
  a: NhlCandidate;
  b: NhlCandidate;
  /** Share of simulated games in which BOTH survive (Σ P(script) over scripts where both bits are set). */
  together: number;
  text: string;
  source: 'MODEL' | 'SCRIPTS';
}

/**
 * Pairs of research ideas that need different games. Two sources, both published: the model's own relation
 * (OFFSETTING / PARTIALLY_CONTRADICTORY), and the scripts — two ideas that each survive at least 45% of simulated
 * games but survive together in under 25% are telling opposite stories (e.g. one team dominating vs. the other
 * goalie facing few shots).
 */
export function conflicts(s: NhlScripts, items: FitItem[]): Conflict[] {
  const live = items.filter((x) => x.group !== 'HIGH_VARIANCE').map((x) => x.c);
  // The model's own relations count whatever group the partner is in (a goal-scorer candidate included).
  const any = items.map((x) => x.c);
  const out: Conflict[] = [];
  const seen = new Set<string>();
  const both = (a: NhlCandidate, b: NhlCandidate) => s.order.reduce((acc, id, i) => acc + (a.survival.survives?.[i] && b.survival.survives?.[i] ? s.byId.get(id)?.probability ?? 0 : 0), 0);
  for (const a of live) {
    for (const rel of a.relations) {
      if (!(/CONTRADICT/.test(String(rel.relationship ?? '')) || rel.kind === 'OFFSETTING')) continue;
      const b = any.find((x) => x.bet_id === rel.bet_id);
      if (!b) continue;
      const k = [a.bet_id, b.bet_id].sort().join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ a, b, together: both(a, b), text: rel.text, source: 'MODEL' });
    }
  }
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (!a.survival.survives || !b.survival.survives) continue;
      if ((a.survival.mass_survived ?? 0) < 0.45 || (b.survival.mass_survived ?? 0) < 0.45) continue;
      const k = [a.bet_id, b.bet_id].sort().join('|');
      if (seen.has(k)) continue;
      const t = both(a, b);
      if (t >= 0.25) continue;
      seen.add(k);
      out.push({ a, b, together: t, text: `Both survive together in only ${pct(t)} of simulated games: they need different games.`, source: 'SCRIPTS' });
    }
  }
  return out;
}

// ------------------------------------------------------------------ players

export interface PlayerLine {
  name: string;
  team: string | null;
  pid: string | null;
  role: string | null;
  goalie: boolean;
  markets: { family: string; label: string; threshold: number | null; ticker: string; marketId: string; pYes: number | null; pMid: number | null; byScript: (number | null)[]; best: { side: 'yes' | 'no'; tier: Tier; ev: number | null } | null }[];
}

const PLAYER_FAMILIES = ['player_points', 'player_assists', 'goalie_saves', 'player_goals'];

/** "Brad Marchand: 1+ points" → name and the stat label. */
export function splitPlayerMarket(desc: string): { name: string; stat: string } | null {
  const m = /^(.+?):\s*(.+)$/.exec(desc);
  return m ? { name: m[1].trim(), stat: m[2].trim() } : null;
}

/** Every player with priced props, grouped by player, from the publication's own markets and the script matrix. */
export function playerLines(r: EventResearchDoc, s: NhlScripts | null, markets: Market[], roleOf: (name: string) => string | null, teamOf: (name: string) => string | null): PlayerLine[] {
  const by = new Map<string, PlayerLine>();
  for (const m of markets) {
    if (!PLAYER_FAMILIES.includes(m.market_family)) continue;
    const sp = splitPlayerMarket(m.yes_description);
    if (!sp) continue;
    const row: NhlMarketRow | undefined = s?.markets.get(m.kalshi_ticker);
    const key = m.player_id ?? sp.name;
    let p = by.get(key);
    if (!p) {
      const ref = r.players.find((x) => x.participant_id === m.player_id || x.display_name === sp.name);
      p = { name: sp.name, team: row?.team ?? teamOf(sp.name), pid: ref?.participant_id ?? m.player_id ?? null, role: roleOf(sp.name), goalie: m.market_family === 'goalie_saves', markets: [] };
      by.set(key, p);
    }
    if (m.market_family === 'goalie_saves') p.goalie = true;
    const sides = row ? ([['yes', row.yes], ['no', row.no]] as const).filter(([, sd]) => sd && sd.ev != null && sd.ev > 0 && sd.tier !== 'DOES_NOT_SURVIVE' && sd.tier !== 'UNAVAILABLE') : [];
    const best = sides.sort((a, b) => (b[1]!.ev ?? 0) - (a[1]!.ev ?? 0))[0];
    p.markets.push({
      family: m.market_family, label: sp.stat, threshold: m.threshold ?? m.line, ticker: m.kalshi_ticker, marketId: m.market_id,
      pYes: row?.pYes ?? null, pMid: row?.pYesMid ?? (m.yes_bid != null && m.yes_ask != null ? (m.yes_bid + m.yes_ask) / 2 : null),
      byScript: row?.pYesByScript ?? [], best: best ? { side: best[0], tier: best[1]!.tier, ev: best[1]!.ev } : null,
    });
  }
  const famOrder = (f: string) => PLAYER_FAMILIES.indexOf(f);
  const lines = [...by.values()];
  for (const p of lines) p.markets.sort((a, b) => famOrder(a.family) - famOrder(b.family) || (a.threshold ?? 0) - (b.threshold ?? 0));
  const pt = (p: PlayerLine) => p.markets.find((x) => x.family === 'player_points' && (x.threshold ?? 0.5) <= 0.5)?.pYes ?? -1;
  return lines.sort((a, b) => Number(b.goalie) - Number(a.goalie) || pt(b) - pt(a) || a.name.localeCompare(b.name));
}

/** The script where a prop does best and worst, from the published conditional probabilities. */
export function scriptSwing(s: NhlScripts, byScript: (number | null)[]): { best: { x: NhlScript; p: number }; worst: { x: NhlScript; p: number } } | null {
  const pts = s.order.map((id, i) => ({ x: s.byId.get(id)!, p: byScript[i] })).filter((v): v is { x: NhlScript; p: number } => !!v.x && v.p != null && v.x.major);
  if (pts.length < 2) return null;
  pts.sort((a, b) => b.p - a.p);
  return { best: pts[0], worst: pts[pts.length - 1] };
}

// ------------------------------------------------------------------ the slate row

export interface SlateRead {
  scripts: NhlScripts | null;
  status: 'OK' | 'NOT_SIMULATED' | 'FAILED' | 'ABSENT' | 'NO_RESEARCH';
  reason: string | null;
  projection: Projection | null;
  goalies: GoalieLine[];
  candidates: { robust: number; moderate: number; total: number };
  ids: SideIds | null;
}

export function slateRead(r: EventResearchDoc | null | undefined): SlateRead {
  if (!r) return { scripts: null, status: 'NO_RESEARCH', reason: null, projection: null, goalies: [], candidates: { robust: 0, moderate: 0, total: 0 }, ids: null };
  const x = readNhl(r);
  const s = isNhlScripts(x) ? x : null;
  const ids = sidesOf(r);
  const live = s ? s.candidates.filter((c) => c.governance.status !== 'REJECTED' && !HIGH_VARIANCE_FAMILIES.has(c.family)) : [];
  return {
    scripts: s, status: s ? 'OK' : (x?.status ?? 'ABSENT') as SlateRead['status'], reason: s ? null : (x as any)?.reason ?? null,
    projection: projection(r, s), goalies: ids ? goalieLines(r, s, ids) : [],
    candidates: { robust: live.filter((c) => c.robustness === 'ROBUST').length, moderate: live.filter((c) => c.robustness === 'MODERATE').length, total: live.length },
    ids,
  };
}
