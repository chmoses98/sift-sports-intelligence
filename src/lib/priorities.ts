// SLATE PRIORITIES — where to look first on an NFL week. Decision compression, not a new model.
//
// Four sections, each chosen by a fixed rule over evidence the NFL publication already carries. Nothing here
// changes a probability, invents a score or ranks a "best bet"; a section with no qualifying candidate is
// omitted (or, for the Top SIFT Edge, says plainly that nothing qualifies). Every number shown comes from:
//
//   board.json                                status, kickoff, recommendations_count       (which games are live)
//   recommendations.json                      the publication's own recommendations        (Top SIFT Edge)
//   explorer/events/<id>.json  (event_research)
//     .markets[] + live quote overlay         current bid/ask, availability, quote time
//     .projections[].fair_probability         the model's price for a game-line market
//     .extensions.game_script_inputs          the four game scripts (lib/scripts.ts) and the game environment
//     .extensions.model_view                  the model's projected spread and total
//     .extensions.market_implied              the market's implied spread and total
//
// The ranking rules below are PRESENTATION ONLY: deterministic orderings of published evidence so the page can
// say "start here". They are not validated predictive models and are never shown as a score.
import type { BoardItem, EventResearchDoc, Market, Recommendation } from '../contract/types';
import { quoteFreshness } from '../live/freshness';
import type { QuoteView } from '../live/overlay';
import { describeMarket } from './marketLabel';
import { isFullGame } from './period';
import { cfbName } from './cfbTeams';
import { gameScripts, scriptFit, sharePct, type GameScript, type ScriptSet } from './scripts';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------------ thresholds (named, documented, tested)

/** A price is only usable when it is FRESH (< 15 min) or AGING (≤ 30 min) by the market-quote policy. */
const USABLE_QUOTES = new Set(['FRESH', 'AGING']);
/** Contracts priced outside 10–90¢ are long shots or near-locks; the game page's own survivor table excludes them too. */
export const PRICE_MIN = 0.1;
export const PRICE_MAX = 0.9;
/** Works in Multiple Scripts: the scripts the market always wins in must cover at least half of the simulated games… */
export const HOLDS_MIN_COVERAGE = 0.5;
/** …in at least two of the four scripts… */
export const HOLDS_MIN_SCRIPTS = 2;
/** …and the model must price it at least 2 points above the market midpoint (it never surfaces a market the model calls overpriced). */
export const HOLDS_MIN_GAP = 0.02;
/** Game to Watch: the game must lead the slate on a signal by at least 1.5 standard deviations… */
export const WATCH_MIN_Z = 1.5;
/** …Worth a Look by at least 1.0. */
export const LOOK_MIN_Z = 1.0;
/** Fewer eligible games than this and "unusual for the slate" means nothing: Watch and Look are omitted. */
export const MIN_SLATE = 4;
/** Absolute floors, so a slate of identical games never produces a "standout". */
export const FLOORS = { blowout: 0.25, close: 0.5, totalPts: 5, disagreePts: 1.5 } as const;
/** "Prices are close to SIFT's projections" is said only when no game-line gap on the slate reaches 5 points. */
export const CLOSE_GAP = 0.05;

// ------------------------------------------------------------------ types

export interface GameRef {
  eventId: string;
  away: string;
  home: string;
  awayName: string;
  homeName: string;
  kickoff: string;
}

export type EdgeState =
  | { kind: 'edge'; item: EdgePick }
  | { kind: 'none'; title: string; text: string }
  | { kind: 'stale'; title: string; text: string }
  | { kind: 'unavailable'; title: string; text: string };

export interface EdgePick {
  game: GameRef;
  market: Market;
  label: string;
  fair: number;
  ask: number;
  quote: QuoteView;
}

export interface HoldsPick {
  game: GameRef;
  market: Market;
  label: string;
  /** Scripts the market always wins in, and how many there are. */
  full: number;
  of: number;
  coverage: number;
  /** The scripts it always wins in (display title + colour index). */
  wins: { name: string; index: number }[];
  /** The team the contract is on. */
  team: string | null;
  model: number;
  mid: number;
  ask: number;
  gap: number;
  quote: QuoteView;
}

export type SignalKind = 'blowout' | 'close' | 'high' | 'low' | 'disagree';

export interface WatchPick {
  game: GameRef;
  signal: SignalKind;
  /** Short chip text ("Most lopsided"). */
  tag: string;
  /** One plain line saying why. */
  reason: string;
  /** Standard deviations from the slate average (the ordering key; never shown as a score). */
  z: number;
  lead: GameScript | null;
}

export type HoldsState = { kind: 'pick'; item: HoldsPick } | { kind: 'stale' } | { kind: 'none' };

export interface SlatePriorities {
  edge: EdgeState;
  holds: HoldsState;
  watch: WatchPick | null;
  look: WatchPick[];
  /** Upcoming, not kicked-off games with research — the pool every section draws from. */
  eligible: number;
  /** Eligible games whose publication carries no game scripts yet. */
  scriptsMissing: number;
  /** Largest model-vs-market gap on any game line (null when nothing is priced). */
  maxGap: number | null;
}

export interface PriorityInput {
  items: BoardItem[];
  research: Map<string, EventResearchDoc>;
  /** The publication's recommendations; null when recommendations.json could not be read. */
  recommendations: Recommendation[] | null;
  /** The current quote for a market (live when newer, else the publication's capture). */
  quote: (m: Market) => QuoteView;
  now: number;
  sport?: string;
}

// ------------------------------------------------------------------ helpers

/** "Dallas Cowboys" → "Cowboys". College names are one name ("Iowa State"), never cut to their last word. */
const nickOf = (display: string | undefined, abbr: string, sport?: string) => (sport === 'CFB' ? cfbName(abbr, display) : display ? display.split(' ').pop() || abbr : abbr);

function gameRef(item: BoardItem, sport?: string): GameRef {
  const away = item.participants.find((p) => p.participant_id === item.away_participant);
  const home = item.participants.find((p) => p.participant_id === item.home_participant);
  const a = away?.short_name ?? '?';
  const h = home?.short_name ?? '?';
  return { eventId: item.event_id, away: a, home: h, awayName: nickOf(away?.display_name, a, sport), homeName: nickOf(home?.display_name, h, sport), kickoff: item.start_time_utc };
}

/** Upcoming and not kicked off on the app clock: the only games a priority may point at. */
export function isActionable(item: BoardItem, now: number): boolean {
  if (item.status !== 'SCHEDULED') return false;
  const t = Date.parse(item.start_time_utc);
  return Number.isFinite(t) && t > now;
}

/** A quote that can be acted on: the market is open (or its status unknown) and the quote is fresh or aging. */
export function usableQuote(v: QuoteView, now: number): boolean {
  if (v.availability !== 'OPEN' && v.availability !== 'UNKNOWN') return false;
  return USABLE_QUOTES.has(quoteFreshness(v.observedAt, now));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};
const byKickoff = (a: GameRef, b: GameRef) => a.kickoff.localeCompare(b.kickoff) || a.eventId.localeCompare(b.eventId);
const round = (v: number) => Math.round(v);

function labelFor(m: Market, r: EventResearchDoc, sport: string): string {
  const abbrOf = (pid: string | null) => r.event.participants.find((p) => p.participant_id === pid)?.short_name ?? null;
  return describeMarket(m as any, { abbrOf, sport }).title;
}

// ------------------------------------------------------------------ Top SIFT Edge

const DEAD = /expired|void|cancel|settled|withdrawn|closed|superseded|rejected|inactive/i;

/**
 * The publication's own recommendations are the only source of an "edge": the model's lines are research
 * (authority RESEARCH_ONLY, real_money_status NOT VALIDATED) and a model-vs-market gap alone is never promoted
 * to one. A recommendation qualifies when it is not research-only, still active, on an upcoming game, and its
 * market has a usable quote at or under the publication's bet-up-to price with the model above the ask.
 * Ranked by (model − ask), then kickoff, then id.
 */
function topEdge(input: PriorityInput, games: Map<string, { item: BoardItem; r: EventResearchDoc }>, maxGap: number | null): EdgeState {
  const { recommendations, now } = input;
  if (recommendations == null) {
    return { kind: 'unavailable', title: 'Edge check unavailable', text: 'SIFT could not read this week’s recommendations, so nothing is called an edge.' };
  }
  const live = recommendations.filter((x) => !x.research_only && x.authority !== 'RESEARCH_ONLY' && !DEAD.test(x.status ?? '') && (!x.expires_at || Date.parse(x.expires_at) > now) && x.event_id && games.has(x.event_id));
  const picks: EdgePick[] = [];
  let stale = 0;
  for (const x of live) {
    const g = games.get(x.event_id!)!;
    const m = g.r.markets.find((mm) => mm.market_id === x.market_id);
    if (!m || x.fair_probability == null) continue;
    const q = input.quote(m);
    if (!usableQuote(q, now)) {
      stale++;
      continue;
    }
    const ask = q.yesAsk;
    if (ask == null || ask >= x.fair_probability || (x.bet_up_to_price != null && ask > x.bet_up_to_price)) continue;
    picks.push({ game: gameRef(g.item, input.sport), market: m, label: labelFor(m, g.r, input.sport ?? 'NFL'), fair: x.fair_probability, ask, quote: q });
  }
  picks.sort((a, b) => b.fair - b.ask - (a.fair - a.ask) || byKickoff(a.game, b.game) || a.market.market_id.localeCompare(b.market.market_id));
  if (picks.length) return { kind: 'edge', item: picks[0] };
  if (stale) return { kind: 'stale', title: 'Waiting for updated markets', text: 'SIFT has a recommendation, but its current price is stale. It will show once a fresh quote arrives.' };
  if (live.length) return { kind: 'none', title: 'No strong SIFT edge right now', text: 'The market has moved past SIFT’s number on this week’s recommendations.' };
  return {
    kind: 'none',
    title: 'No strong SIFT edge yet',
    text:
      maxGap != null && maxGap < CLOSE_GAP
        ? 'Current prices are close to SIFT’s projections, and the NFL model is still research-only — so nothing is called a bet.'
        : 'The NFL model is still research-only, so a gap between SIFT and the market isn’t called an edge.',
  };
}

// ------------------------------------------------------------------ Works in Multiple Scripts

/**
 * Works in Multiple Scripts (internally still `holds`): the strongest cross-script survivor on the slate: a
 * full-game moneyline or spread (the markets whose script fit is exact) that always wins in at least
 * HOLDS_MIN_SCRIPTS scripts covering HOLDS_MIN_COVERAGE of simulated games, priced 10–90¢ on a usable quote, with the model at least HOLDS_MIN_GAP above the midpoint. Ranked by
 * coverage, then the model gap, then kickoff, then market id. Same evidence as the game page's
 * "Bets That Survive Multiple Scripts", stricter bar. The four scripts are final-margin buckets, so a moneyline or
 * spread can win in at most two of them: the UI says "supported in N of the 4", never "most scripts".
 */
function holdsUp(input: PriorityInput, games: { item: BoardItem; r: EventResearchDoc; set: ScriptSet | null }[]): HoldsState {
  const { now } = input;
  const out: HoldsPick[] = [];
  let staleOnly = 0;
  for (const { item, r, set } of games) {
    if (!set) continue;
    const homeP = r.participants.find((p) => p.home_away === 'HOME');
    const awayP = r.participants.find((p) => p.home_away === 'AWAY');
    if (!homeP || !awayP) continue;
    const model = new Map(r.projections.map((p) => [p.market_id, p.fair_probability]));
    for (const m of r.markets) {
      if (!isFullGame(m.period) || (m.market_family !== 'game_winner' && m.market_family !== 'spread')) continue;
      const fit = scriptFit(m, set, homeP.participant_id, awayP.participant_id);
      const fair = model.get(m.market_id);
      if (!fit || fair == null || fit.full < HOLDS_MIN_SCRIPTS || fit.coverage < HOLDS_MIN_COVERAGE) continue;
      const q = input.quote(m);
      if (q.yesBid == null || q.yesAsk == null) continue;
      if (!usableQuote(q, now)) {
        staleOnly++;
        continue;
      }
      const ask = q.yesAsk;
      const mid = (q.yesBid + q.yesAsk) / 2;
      if (ask < PRICE_MIN || ask > PRICE_MAX || fair - mid < HOLDS_MIN_GAP) continue;
      out.push({
        game: gameRef(item, input.sport), market: m, label: labelFor(m, r, input.sport ?? 'NFL'), full: fit.full, of: set.scripts.length, coverage: fit.coverage,
        wins: set.scripts.filter((_, i) => fit.fits[i] === 'yes').map((s) => ({ name: s.name, index: s.index })),
        team: r.event.participants.find((x) => x.participant_id === m.participant_id)?.short_name ?? null, model: fair, mid, ask, gap: fair - mid, quote: q,
      });
    }
  }
  out.sort((a, b) => b.coverage - a.coverage || b.gap - a.gap || byKickoff(a.game, b.game) || a.market.market_id.localeCompare(b.market.market_id));
  if (out.length) return { kind: 'pick', item: out[0] };
  return staleOnly ? { kind: 'stale' } : { kind: 'none' };
}

// ------------------------------------------------------------------ Game to Watch / Worth a Look

interface Env {
  game: GameRef;
  set: ScriptSet | null;
  blowout: number | null;
  close: number | null;
  total: number | null;
  disagree: { pts: number; text: string } | null;
}

function envOf(item: BoardItem, r: EventResearchDoc, set: ScriptSet | null): Env {
  const ext = (r.extensions ?? {}) as any;
  const ge = ext.game_script_inputs?.game_environment ?? {};
  const mv = ext.model_view ?? {};
  const mi = ext.market_implied ?? {};
  const g = gameRef(item);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const total = num(mv.model_total) ?? num(ge.total?.mean);
  let disagree: Env['disagree'] = null;
  const ms = num(mv.model_spread);
  const is = num(mi.implied_spread);
  const mt = num(mv.model_total);
  const it = num(mi.implied_total_median);
  // Spreads are HOME margin negated (−8 = home by 8): say who and by how much in words.
  const side = (s: number) => (s <= 0 ? `${g.homeName} by ${Math.abs(Math.round(s * 2) / 2)}` : `${g.awayName} by ${Math.round(s * 2) / 2}`);
  const sGap = ms != null && is != null ? Math.abs(ms - is) : 0;
  const tGap = mt != null && it != null ? Math.abs(mt - it) : 0;
  if (sGap >= tGap && ms != null && is != null) disagree = { pts: sGap, text: `SIFT has the ${side(ms)}; the betting market has the ${side(is)}.` };
  else if (mt != null && it != null) disagree = { pts: tGap, text: `SIFT projects ${round(mt)} total points; the betting market expects ${round(it)}.` };
  return { game: g, set, blowout: num(ge.p_blowout_17plus), close: num(ge.p_one_score), total, disagree };
}

/**
 * One leader per signal, scored by how far it stands from the slate (z = (value − slate mean) / slate SD), kept
 * only above both its absolute floor and the z bar. Game to Watch is the strongest leader at z ≥ WATCH_MIN_Z;
 * Worth a Look is up to two more leaders at z ≥ LOOK_MIN_Z, each on a different game (and not a game another
 * section already points at). Ties: z, then kickoff, then event id.
 */
function standouts(envs: Env[], taken: Set<string>): { watch: WatchPick | null; look: WatchPick[] } {
  if (envs.length < MIN_SLATE) return { watch: null, look: [] };
  const cands: WatchPick[] = [];
  const lead = (e: Env) => e.set?.scripts[0] ?? null;
  const consider = (signal: SignalKind, value: (e: Env) => number | null, floor: (v: number, slate: number[]) => boolean, words: (e: Env, slate: number[]) => { tag: string; reason: string }) => {
    const xs = envs.filter((e) => value(e) != null);
    if (xs.length < MIN_SLATE) return;
    const vals = xs.map((e) => value(e)!);
    const s = sd(vals);
    if (!(s > 0)) return;
    const m = mean(vals);
    const best = [...xs].sort((a, b) => value(b)! - value(a)! || byKickoff(a.game, b.game))[0];
    const v = value(best)!;
    if (!floor(v, vals)) return;
    cands.push({ game: best.game, signal, z: (v - m) / s, lead: lead(best), ...words(best, vals) });
  };
  consider('blowout', (e) => e.blowout, (v) => v >= FLOORS.blowout, (e) => ({
    tag: 'Most lopsided',
    // p_blowout_17plus is a final margin of 17+ EITHER way, so the line never credits one team with it.
    reason: `The likeliest blowout of the week: decided by 17 points or more in ${sharePct(e.blowout!)} of simulations.`,
  }));
  consider('close', (e) => e.close, (v) => v >= FLOORS.close, (e) => ({
    tag: 'Closest game',
    reason: `The closest game of the week: decided by 6 points or fewer in ${sharePct(e.close!)} of simulations.`,
  }));
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  consider('high', (e) => e.total, (v, xs) => v - median(xs) >= FLOORS.totalPts, (e, xs) => ({
    tag: 'Highest-scoring',
    reason: `The highest-scoring game of the week: SIFT projects about ${round(e.total!)} points (the typical game this week: ${round(median(xs))}).`,
  }));
  consider('low', (e) => (e.total == null ? null : -e.total), (v, xs) => v - median(xs) >= FLOORS.totalPts, (e, xs) => ({
    tag: 'Lowest-scoring',
    reason: `The lowest-scoring game of the week: SIFT projects about ${round(e.total!)} points (the typical game this week: ${round(-median(xs))}).`,
  }));
  consider('disagree', (e) => e.disagree?.pts ?? null, (v) => v >= FLOORS.disagreePts, (e) => ({
    tag: 'SIFT vs market',
    reason: `SIFT and the market disagree most here. ${e.disagree!.text}`,
  }));
  cands.sort((a, b) => b.z - a.z || byKickoff(a.game, b.game));
  const used = new Set(taken);
  let watch: WatchPick | null = null;
  const look: WatchPick[] = [];
  for (const c of cands) {
    if (used.has(c.game.eventId)) continue;
    if (!watch && c.z >= WATCH_MIN_Z) {
      watch = c;
      used.add(c.game.eventId);
    } else if (look.length < 2 && c.z >= LOOK_MIN_Z) {
      look.push(c);
      used.add(c.game.eventId);
    }
  }
  return { watch, look };
}

// ------------------------------------------------------------------ the whole rail

export function slatePriorities(input: PriorityInput): SlatePriorities {
  const { items, research, now } = input;
  const games = items
    .filter((i) => isActionable(i, now))
    .map((item) => ({ item, r: research.get(item.event_id) }))
    .filter((x): x is { item: BoardItem; r: EventResearchDoc } => !!x.r)
    .map((x) => ({ ...x, set: gameScripts(x.r) }));
  const byId = new Map(games.map((g) => [g.item.event_id, g]));

  // The largest model-vs-market gap on any priced game line (for the honest "prices are close" line).
  let maxGap: number | null = null;
  for (const { r } of games) {
    const byMarket = new Map(r.markets.map((m) => [m.market_id, m]));
    for (const p of r.projections) {
      const m = byMarket.get(p.market_id ?? '');
      if (!m || p.fair_probability == null || p.market_probability == null || !isFullGame(m.period)) continue;
      if (!['game_winner', 'spread', 'total'].includes(m.market_family)) continue;
      if (p.market_probability < PRICE_MIN || p.market_probability > PRICE_MAX) continue;
      maxGap = Math.max(maxGap ?? 0, Math.abs(p.fair_probability - p.market_probability));
    }
  }

  const edge = topEdge(input, byId, maxGap);
  const holds = holdsUp(input, games);
  const taken = new Set<string>();
  if (edge.kind === 'edge') taken.add(edge.item.game.eventId);
  if (holds.kind === 'pick') taken.add(holds.item.game.eventId);
  const envs = games.map((g) => envOf(g.item, g.r, g.set));
  const { watch, look } = standouts(envs, taken);
  return { edge, holds, watch, look, eligible: games.length, scriptsMissing: games.filter((g) => !g.set).length, maxGap };
}
