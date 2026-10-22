// The Signals feed's pure view-model. It decides nothing about opportunities: the opportunity layer produces them
// (src/opportunity/*), `compareOpportunities` / `featureOpportunities` (src/opportunity/rank.ts) order and group them, and
// the exact-side / eligibility rules of the prop sheet (src/v4/signal.ts) say whether one is still current. This file
// only (a) places each opportunity in the group its published fields support at the current time, (b) filters by sport,
// game and status, and (c) reports, per sport, what was read: signals, a verdict, or an unavailable publication.
// There is no score, no EV sort and no derived edge anywhere in it.
import type { SportBundle } from '../opportunity/load';
import { compareOpportunities, featureOpportunities, type Featured } from '../opportunity/rank';
import type { Opportunity, Side, SportVerdict } from '../opportunity/types';
import { quoteFreshness } from '../live/freshness';
import { ineligibleWhy } from './signal';

/** current: an eligible actionable or research-candidate signal. watch: a published watch (not a priced contract signal).
 *  passed: the publication judged it and said no. stale: it was once a signal and no longer qualifies (expired, stale, frozen). */
export type StandingKind = 'current' | 'watch' | 'passed' | 'stale';

export interface Standing {
  kind: StandingKind;
  /** Why it is not current / why it passed, in the publication's or the eligibility rule's words; null for current and watch. */
  why: string | null;
}

export const STANDING_LABEL: Record<StandingKind, string> = { current: 'Current signals', watch: 'Watch', passed: 'Passed', stale: 'No longer current' };
export const STANDING_ORDER: StandingKind[] = ['current', 'watch', 'passed', 'stale'];

const pregame = (o: Opportunity) => o.phase === 'PREGAME';

/**
 * Where an opportunity stands at `now`. Time-dependent facts are re-read from the opportunity's own fields against the
 * caller's clock (a window that has closed, a quote that has aged, a game that has started), so a feed left open does
 * not keep presenting a lapsed signal as current. A PASS keeps the publication's reason; it is "no longer current"
 * (not "passed") only when the pass is about time: the game has started, the price window expired, or the quote went stale.
 */
export function standingOf(o: Opportunity, now: number): Standing {
  const expired = !!o.price.expiresAt && Number.isFinite(Date.parse(o.price.expiresAt)) && Date.parse(o.price.expiresAt) <= now;
  if (o.status === 'PASS') {
    if (!pregame(o)) return { kind: 'stale', why: o.statusReason };
    if (o.price.state === 'EXPIRED' || o.price.state === 'STALE' || expired) return { kind: 'stale', why: o.statusReason };
    return { kind: 'passed', why: o.statusReason };
  }
  if (o.status === 'WATCH') {
    if (!pregame(o)) return { kind: 'stale', why: 'The game has started or is no longer scheduled: pregame research is frozen.' };
    const q = quoteFreshness(o.price.observedAt, now);
    if (o.price.ask != null && q !== 'FRESH' && q !== 'AGING') return { kind: 'stale', why: 'The quote behind this watch is stale.' };
    return { kind: 'watch', why: null };
  }
  const why = ineligibleWhy(o, now);
  return why ? { kind: 'stale', why } : { kind: 'current', why: null };
}

// ------------------------------------------------------------------ filters (all in the address)

export interface SignalFilter {
  /** The sport slug (nfl, nhl, mlb, soccer, tennis, cfb …), or null for every sport. */
  sport: string | null;
  /** An event id, or null for every game. */
  game: string | null;
  /** One group, or null for every group. */
  status: StandingKind | null;
  /** Set when arriving from a prop or a game: the contract and side to bring into view. */
  market: string | null;
  side: Side | null;
}

export function parseFilter(sp: URLSearchParams): SignalFilter {
  const status = sp.get('status');
  const side = sp.get('side')?.toUpperCase();
  return {
    sport: sp.get('sport') || null,
    game: sp.get('game') || null,
    status: STANDING_ORDER.includes(status as StandingKind) ? (status as StandingKind) : null,
    market: sp.get('market') || null,
    side: side === 'YES' || side === 'NO' ? side : null,
  };
}

/** The address of the Signals feed for a context (sport, game, contract and side survive the trip and the way back). */
export function signalsHref(f: Partial<{ sport: string | null; game: string | null; status: StandingKind | null; market: string | null; side: Side | null }> = {}): string {
  const q = new URLSearchParams();
  if (f.sport) q.set('sport', f.sport);
  if (f.game) q.set('game', f.game);
  if (f.status) q.set('status', f.status);
  if (f.market) q.set('market', f.market);
  if (f.market && f.side) q.set('side', f.side);
  const s = q.toString();
  return `/v4/signals${s ? `?${s}` : ''}`;
}

// ------------------------------------------------------------------ the feed

export interface StaleItem { o: Opportunity; why: string }

export interface Feed {
  /** The app's own grouping and order (featureOpportunities) of the eligible signals and of the watches. */
  current: Featured[];
  watch: Featured[];
  /** Passes in the app's own order (compareOpportunities), each with the publication's reason. */
  passed: { o: Opportunity; why: string }[];
  stale: StaleItem[];
  /** Counts per group before the status filter, so the filter chips can say what each holds. */
  counts: Record<StandingKind, number>;
  /** Standing of every opportunity in view, by id. */
  standing: Map<string, Standing>;
}

const inSport = (o: Opportunity, sport: string | null) => !sport || o.slug === sport;
const inGame = (o: Opportunity, game: string | null) => !game || o.eventId === game;

export function buildFeed(opps: readonly Opportunity[], now: number, f: Pick<SignalFilter, 'sport' | 'game' | 'status'>): Feed {
  const standing = new Map<string, Standing>();
  const by: Record<StandingKind, Opportunity[]> = { current: [], watch: [], passed: [], stale: [] };
  for (const o of opps) {
    if (!inSport(o, f.sport) || !inGame(o, f.game)) continue;
    const s = standingOf(o, now);
    standing.set(o.id, s);
    by[s.kind].push(o);
  }
  const counts = { current: by.current.length, watch: by.watch.length, passed: by.passed.length, stale: by.stale.length };
  const shows = (k: StandingKind) => !f.status || f.status === k;
  const ordered = (list: Opportunity[]) => [...list].sort(compareOpportunities);
  return {
    current: shows('current') ? featureOpportunities(by.current) : [],
    watch: shows('watch') ? featureOpportunities(by.watch) : [],
    passed: shows('passed') ? ordered(by.passed).map((o) => ({ o, why: standing.get(o.id)!.why ?? o.statusReason })) : [],
    stale: shows('stale') ? ordered(by.stale).map((o) => ({ o, why: standing.get(o.id)!.why ?? o.statusReason })) : [],
    counts, standing,
  };
}

/**
 * What a prop or game link points at. `exact` is the opportunity for that market AND side; `other` is set only when the
 * publication names the market for the other side alone, so the screen can say that instead of showing it as a match.
 */
export function focusOf(opps: readonly Opportunity[], market: string | null, side: Side | null): { exact: Opportunity | null; other: Opportunity | null } {
  if (!market) return { exact: null, other: null };
  const exact = opps.find((o) => o.marketId === market && (!side || o.what.side === side)) ?? null;
  const other = exact || !side ? null : opps.find((o) => o.marketId === market) ?? null;
  return { exact, other };
}

// ------------------------------------------------------------------ what was read, per sport

export interface SportCoverage {
  code: string;
  slug: string;
  label: string;
  /** unavailable: the publication could not be read (never "zero signals"); verdict: read, nothing live; signals: read, with live rows. */
  state: 'unavailable' | 'verdict' | 'signals';
  counts: Record<StandingKind, number>;
  /** The publication's own sentence for why nothing qualifies, or the read error. */
  note: string | null;
  verdict: SportVerdict | null;
}

export function coverage(bundles: readonly SportBundle[], verdicts: readonly SportVerdict[], opps: readonly Opportunity[], now: number): SportCoverage[] {
  return bundles.map((b) => {
    const mine = opps.filter((o) => o.slug === b.sport.slug);
    const counts: Record<StandingKind, number> = { current: 0, watch: 0, passed: 0, stale: 0 };
    for (const o of mine) counts[standingOf(o, now).kind] += 1;
    const verdict = verdicts.find((v) => v.slug === b.sport.slug) ?? null;
    const unavailable = b.error != null || (verdict != null && !verdict.loaded);
    const live = counts.current + counts.watch;
    return {
      code: b.sport.code, slug: b.sport.slug, label: b.sport.label,
      state: unavailable ? 'unavailable' : live > 0 ? 'signals' : 'verdict',
      counts,
      note: unavailable ? (b.error ?? verdict?.error ?? 'The publication could not be read.') : live > 0 ? null : verdict?.passReason ?? null,
      verdict,
    };
  });
}

/** Games that carry opportunities in the chosen sport, soonest first (for the game filter). */
export function gameOptions(opps: readonly Opportunity[], sport: string | null): { eventId: string; label: string; startTime: string; slug: string; n: number }[] {
  const by = new Map<string, { eventId: string; label: string; startTime: string; slug: string; n: number }>();
  for (const o of opps) {
    if (!inSport(o, sport)) continue;
    const g = by.get(o.eventId);
    if (g) g.n += 1; else by.set(o.eventId, { eventId: o.eventId, label: o.eventLabel, startTime: o.startTime, slug: o.slug, n: 1 });
  }
  return [...by.values()].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.label.localeCompare(b.label));
}
