// Game priority: the one deterministic, sport-aware rule that orders games on Home. Pure (no React, no clock, no network) and
// explainable: every point of a score comes from a named reason, and a field the data does not state adds nothing (a clock that
// cannot be read is "not late", a game with no rank is "unranked", rivalry and postseason count only when a source says so).
//
//   Live      followed teams first; then closeness x lateness, because a one-score game in the fourth quarter matters more than
//             either alone (a strong COMBINED boost); then rankings, rivalry and postseason.
//   Upcoming  ranked-vs-ranked, then any ranked team, then a conference matchup, then the rest; always time-ordered by window
//             (the schedule groups by kickoff), followed games first inside a window.
//   Stable    a live score changes every few seconds; the order must not. A game's score is bucketed into a TIER, the tier only
//             changes when the score leaves its band by a margin, and inside a tier the order the viewer already saw is kept
//             (`Memory`), new games slotting in by score then key. Only a tier change reorders.
import type { V3Game, V3Team } from './types';

export interface FollowsLike { teams: string[]; games: string[] }

/** The ordering memory a screen keeps in a ref between refreshes. */
export interface Memory { order: string[]; tier: Record<string, number> }
export const emptyMemory = (): Memory => ({ order: [], tier: {} });

// ---------------------------------------------------------------------------------------------------- following / rank

export const followsGame = (g: V3Game, f: FollowsLike): boolean =>
  f.games.includes(g.key) || f.teams.includes(`${g.slug}:${g.away.id}`) || f.teams.includes(`${g.slug}:${g.home.id}`);

const ranked = (t: V3Team): number | null => (typeof t.rank === 'number' && t.rank >= 1 && t.rank <= 25 ? t.rank : null);
/** Ranked-vs-ranked: both teams carry a top-25 rank the source stated. */
export const bothRanked = (g: V3Game): boolean => ranked(g.away) != null && ranked(g.home) != null;
export const anyRanked = (g: V3Game): boolean => ranked(g.away) != null || ranked(g.home) != null;
/** A matchup inside one conference, only when both conferences are known (never inferred from a name). */
export const conferenceMatchup = (g: V3Game): boolean => !!g.away.conference && g.away.conference === g.home.conference;

/** 0 (unranked) to 1 (#1): how much a rank is worth. */
const rankWeight = (r: number | null) => (r == null ? 0 : (26 - r) / 25);

// ---------------------------------------------------------------------------------------------------- the clock model

/** One sport's regulation: how its clock reads and how to turn it into "how much of the game has been played" (0 to 1). */
type ClockKind = 'quarters' | 'halves' | 'periods' | 'innings' | 'soccer' | 'none';
const CLOCK: Record<string, { kind: ClockKind; periods?: number; secs?: number }> = {
  NFL: { kind: 'quarters', periods: 4, secs: 900 },
  CFB: { kind: 'quarters', periods: 4, secs: 900 },
  NBA: { kind: 'quarters', periods: 4, secs: 720 },
  CBB: { kind: 'halves', periods: 2, secs: 1200 },
  NHL: { kind: 'periods', periods: 3, secs: 1200 },
  MLB: { kind: 'innings' },
  SOCCER: { kind: 'soccer' },
  TENNIS: { kind: 'none' },
};

/** A margin (points, goals, runs) at which a game stops being "close", per sport: two possessions, a few buckets, a goal or two, a few runs. */
const CLOSE_CAP: Record<string, number> = { NFL: 16, CFB: 16, NBA: 15, CBB: 12, NHL: 3, MLB: 5, SOCCER: 2 };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** "6:24" -> 384 seconds; null when there is no clock time in the text. */
function remainingSecs(s: string): number | null {
  const m = /(\d{1,2}):(\d{2})/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The period a clock names: "Q3 6:24", "P2", "H1 12:00", "3rd 4:11", "2nd half". Null when it names none. */
function periodOf(s: string): number | null {
  const a = /\b(?:q|qtr|p|per|h)\s?([1-9])\b/.exec(s) ?? /\b([1-9])(?:st|nd|rd|th)\b/.exec(s);
  return a ? Number(a[1]) : null;
}

/**
 * How much of regulation a live game has played, 0 to 1, from the clock text a source stated ("Q3 6:24", "P2 4:17", "Bot 7th", "67'").
 * Null when the clock is missing or unreadable: a game whose progress is unknown is never treated as late. Overtime and extra innings are 1.
 */
export function progressOf(sport: string, clock: string | null | undefined): number | null {
  const spec = CLOCK[sport.toUpperCase()];
  if (!spec || spec.kind === 'none' || !clock) return null;
  const s = clock.trim().toLowerCase();
  if (!s) return null;
  if (/\bfinal\b/.test(s)) return 1;
  if (/\b(ot|overtime|so|shootout|extra time|et)\b/.test(s) || /\b(\d)ot\b/.test(s)) return 1;
  if (/\b(half-?time|halftime|ht)\b/.test(s) && spec.kind !== 'innings') return 0.5;
  if (spec.kind === 'innings') {
    const m = /\b(top|bot|bottom|mid|middle|end)\b\s*(?:of\s*)?(?:the\s*)?(\d{1,2})/.exec(s) ?? /\b(\d{1,2})(?:st|nd|rd|th)\b/.exec(s);
    if (!m) return null;
    const half = m.length === 3 ? m[1] : 'top';
    const inning = Number(m.length === 3 ? m[2] : m[1]);
    if (!(inning >= 1)) return null;
    if (inning > 9) return 1;
    const into = half === 'top' ? 0 : half === 'bot' || half === 'bottom' || half === 'mid' || half === 'middle' ? 0.5 : 1;
    return clamp01((inning - 1 + into) / 9);
  }
  if (spec.kind === 'soccer') {
    const m = /(\d{1,3})(?:\s*\+\s*\d+)?\s*['′’]/.exec(s) ?? /^(\d{1,3}):\d{2}$/.exec(s);
    if (!m) return null;
    return clamp01(Number(m[1]) / 90);
  }
  const periods = spec.periods!, secs = spec.secs!;
  const p = periodOf(s);
  if (p == null) return null;
  if (p > periods) return 1;
  const left = remainingSecs(s);
  const into = left == null ? 0.5 : clamp01(1 - left / secs);
  return clamp01(((p - 1) + into) / periods);
}

/** 0 (a blowout) to 1 (tied), by the sport's own idea of a one-score game; null without a score. */
export function closenessOf(sport: string, score: { away: number; home: number } | null | undefined): number | null {
  if (!score) return null;
  const cap = CLOSE_CAP[sport.toUpperCase()];
  if (!cap) return null;
  return clamp01(1 - Math.abs(score.away - score.home) / cap);
}

/** 0 for the first half of a game, rising to 1 at the end: a close game only gets urgent late. */
export const lateness = (progress: number | null): number => (progress == null ? 0 : clamp01((progress - 0.5) / 0.5));

// ---------------------------------------------------------------------------------------------------- live score

export const WEIGHTS = {
  /** A followed team or game: ahead of every unfollowed game, whatever the score. */
  follow: 1000,
  close: 60,
  late: 40,
  /** Close AND late: the strongest single reason, larger than close and late alone combined. */
  closeAndLate: 160,
  /** The better-ranked team's worth at #1 (scaled down the list), and the extra when both are ranked. */
  rank: 30,
  bothRanked: 25,
  rivalry: 20,
  postseason: 35,
} as const;

export interface Reason { why: string; points: number }
export interface Scored { score: number; reasons: Reason[] }

/** Why a live game ranks where it does, point by point. A pure function of the game and the follows: no clock, no randomness. */
export function liveScore(g: V3Game, f: FollowsLike): Scored {
  const reasons: Reason[] = [];
  const add = (why: string, points: number) => { if (points > 0) reasons.push({ why, points: Math.round(points * 100) / 100 }); };
  if (followsGame(g, f)) add('followed', WEIGHTS.follow);
  const c = closenessOf(g.sport, g.score);
  const l = lateness(progressOf(g.sport, g.score?.clock));
  if (c != null) {
    add('close', WEIGHTS.close * c);
    add('late', WEIGHTS.late * l);
    add('close and late', WEIGHTS.closeAndLate * c * l);
  }
  const ra = rankWeight(ranked(g.away)), rh = rankWeight(ranked(g.home));
  add('ranked', WEIGHTS.rank * Math.max(ra, rh));
  if (ra > 0 && rh > 0) add('ranked vs ranked', WEIGHTS.bothRanked * Math.min(ra, rh));
  if (g.significance?.rivalry) add('rivalry', WEIGHTS.rivalry);
  if (g.significance?.postseason) add('postseason', WEIGHTS.postseason);
  return { score: reasons.reduce((n, r) => n + r.points, 0), reasons };
}

// ---------------------------------------------------------------------------------------------------- tiers and hysteresis

/** Width of a tier in score points: the score must move a whole band to change tiers. */
export const TIER_BAND = 25;
/** A game keeps its previous tier until its score is this far outside it, so a score hovering on an edge does not flip back and forth. */
export const TIER_MARGIN = 6;

/** The tier of a score; with the tier the game had last time, the previous tier is kept while the score is within the margin of its band. */
export function settleTier(score: number, prev?: number): number {
  const fresh = Math.floor(score / TIER_BAND);
  if (prev == null || prev === fresh) return fresh;
  const lo = prev * TIER_BAND - TIER_MARGIN, hi = (prev + 1) * TIER_BAND + TIER_MARGIN;
  return score >= lo && score < hi ? prev : fresh;
}

export interface Ranked { game: V3Game; tier: number; score: number }

/**
 * The live games in priority order, and the memory to pass next time. Tier (highest first) decides; inside a tier the order the viewer
 * already saw is kept, and games new to the list slot in by score, then start time, then key (the stable tiebreak: every order is total).
 * Pass the previous `Memory` to keep small score changes from moving cards; pass nothing for the plain order.
 */
export function orderLive(games: readonly V3Game[], f: FollowsLike, prev?: Memory): { ordered: V3Game[]; memory: Memory; ranked: Ranked[] } {
  const fresh: Ranked[] = games.map((game) => {
    const score = liveScore(game, f).score;
    return { game, score, tier: settleTier(score, prev?.tier[game.key]) };
  });
  const byFresh = (a: Ranked, b: Ranked) => b.tier - a.tier || b.score - a.score || a.game.startMs - b.game.startMs || a.game.key.localeCompare(b.game.key);
  fresh.sort(byFresh);
  const rankOf = new Map(fresh.map((r, i) => [r.game.key, i]));
  const seen = new Map((prev?.order ?? []).map((k, i) => [k, i]));
  const out: Ranked[] = [];
  const tiers = [...new Set(fresh.map((r) => r.tier))]; // descending: `fresh` is sorted by tier
  for (const t of tiers) {
    const inTier = fresh.filter((r) => r.tier === t);
    const kept = inTier.filter((r) => seen.has(r.game.key)).sort((a, b) => seen.get(a.game.key)! - seen.get(b.game.key)!);
    for (const r of inTier) {
      if (seen.has(r.game.key)) continue;
      const at = kept.findIndex((k) => rankOf.get(k.game.key)! > rankOf.get(r.game.key)!);
      if (at < 0) kept.push(r); else kept.splice(at, 0, r);
    }
    out.push(...kept);
  }
  const memory: Memory = { order: out.map((r) => r.game.key), tier: Object.fromEntries(out.map((r) => [r.game.key, r.tier])) };
  return { ordered: out.map((r) => r.game), memory, ranked: out };
}

// ---------------------------------------------------------------------------------------------------- upcoming / final

/**
 * Lower is more important: 0 followed, 1 ranked vs ranked, 2 any ranked team, 3 a conference matchup, 4 the rest. Used inside one
 * kickoff window (the schedule is time-ordered first), so it never moves a late game ahead of an early one.
 */
export function upcomingTier(g: V3Game, f: FollowsLike): number {
  if (followsGame(g, f)) return 0;
  if (bothRanked(g)) return 1;
  if (anyRanked(g)) return 2;
  if (conferenceMatchup(g)) return 3;
  return 4;
}

const bestRank = (g: V3Game) => Math.min(ranked(g.away) ?? 99, ranked(g.home) ?? 99);

/** The games of one window in priority order: tier, then (inside the ranked tiers) the better rank, then start, then the key. */
export function orderUpcoming(games: readonly V3Game[], f: FollowsLike): V3Game[] {
  return games
    .map((g) => ({ g, t: upcomingTier(g, f) }))
    .sort((a, b) => a.t - b.t || (a.t >= 1 && a.t <= 2 ? bestRank(a.g) - bestRank(b.g) : 0) || a.g.startMs - b.g.startMs || a.g.key.localeCompare(b.g.key))
    .map((x) => x.g);
}

/** Finished games: followed first, then ranked, then the latest start first (the freshest result), key last. */
export function orderFinal(games: readonly V3Game[], f: FollowsLike): V3Game[] {
  return games
    .map((g) => ({ g, t: upcomingTier(g, f) }))
    .sort((a, b) => a.t - b.t || b.g.startMs - a.g.startMs || a.g.key.localeCompare(b.g.key))
    .map((x) => x.g);
}
