// MATCHUP QUALITY: one 0-100 number per player and statistic, built from four transparent components, each 0-100 with 50 = neutral:
//
//   talent    the player's per-game level against his position peers (published position ranking: rank of N)
//   recent    his last five games against his season average for the statistic (the trend)
//   usage     his role: target share (receiving stats) or snap share (everything else); minutes where a sport logs them
//   matchup   the opposing unit's rank among the league (an elite defense lowers it; a bad one raises it)
//
// 100 reads "everything points toward a productive game", 0 the reverse. It describes the SETUP behind a player's number; it is not a
// probability, not a projection and not a recommendation, and it never touches a price (SIFT does not blend lanes).
//
// Rules the code enforces:
//  * Every input is a published number (game log, position ranking, snap/target share, opponent unit rank + the opponent's sample).
//    A missing input makes that COMPONENT unavailable with a reason; nothing is guessed, defaulted or borrowed from another stat.
//  * A small sample is shrunk toward neutral: score = 50 + (raw - 50) * n / (n + k). n and k are reported with each component.
//  * The headline is the weighted mean of the AVAILABLE components (weights renormalised); it needs at least MIN_COMPONENTS of them.
//  * The weights and shrinkage constants below are EDITORIAL PRIORS, not fitted or backtested. They are constants so the UI can print them.
//
// Pure: no React, no clock, no fetching.
import { sliceWindow, type Obs } from './research';

export type ComponentId = 'talent' | 'recent' | 'usage' | 'matchup';
export const COMPONENT_ORDER: ComponentId[] = ['talent', 'recent', 'usage', 'matchup'];
export const COMPONENT_LABEL: Record<ComponentId, string> = { talent: 'Talent', recent: 'Recent form', usage: 'Usage', matchup: 'Matchup' };

/**
 * Weights (sum 1). Usage leads because opportunity (snaps, targets, minutes) is the most direct driver of a counting stat and is observed,
 * not modelled. Talent and recent form tell how efficiently he turns opportunity into output; recent form is a five-game sample so it gets
 * less than talent (a full-season-per-game ranking). The opposing unit gets the smallest share: a single team's unit rating moves a
 * player's outcome less than the player's own role does, and it is the noisiest input (it is itself a sample of the opponent's games).
 */
export const WEIGHTS: Record<ComponentId, number> = { usage: 0.35, talent: 0.25, recent: 0.2, matchup: 0.2 };

/** Shrinkage constants k in n / (n + k): the n at which an input counts for half of its raw distance from neutral. */
export const SHRINK_K = {
  /** n = games behind the player's per-game ranking (the publication ranks only players with half the leader's games). */
  talent: 3,
  /** n = games in the last-five window (at most 5). */
  recent: 2,
  /** n = games with a usage figure in the last five. */
  usage: 2,
  /** n = games the OPPONENT has played in the ranking window; each unit is shrunk by its own sample. */
  matchup: 4,
} as const;

/** Fewest games for the trend: the last five need at least 2 games, and the baseline average needs at least 5 games. */
export const MIN_RECENT_GAMES = 2;
export const MIN_BASELINE_GAMES = 5;
/** Recent form is 100 when the last-five average is 50% above his baseline average, 0 when 50% below, 50 when equal. */
export const TREND_FULL_SCALE = 0.5;

/** Usage anchors: the share at which the score is 0 and 100 (linear between, clamped). Round numbers read from NFL roles, not fitted. */
export const USAGE_ANCHORS = {
  /** 5% of team targets is a depth piece; 25% is a lead receiver. */
  'target share': { lo: 0.05, hi: 0.25 },
  /** 40% of snaps is a rotational role; 90% is an every-down player. */
  'snap share': { lo: 0.4, hi: 0.9 },
  /** 12 minutes is a bench role; 36 minutes is a heavy starter load. */
  minutes: { lo: 12, hi: 36 },
} as const;
export type UsageMetric = keyof typeof USAGE_ANCHORS;

/** Fewest components the headline needs. With one input there is nothing to combine. */
export const MIN_COMPONENTS = 2;
/** Words for the headline: 65 and up, 35 and below, between. */
export const FAVORABLE_AT = 65;
export const TOUGH_AT = 35;

// ------------------------------------------------------------------------------------------------ inputs

/** An input, or the reason it is missing. */
export type Input<T> = T | { missing: string };
function isMissing<T>(x: Input<T>): x is { missing: string } { return typeof x === 'object' && x != null && 'missing' in x; }

export interface TalentInput { rank: number; of: number; games: number; position: string; season: number }
export interface RecentInput { recent: number[]; baseline: number[]; recentLabel: string; baselineLabel: string }
export interface UsageInput { metric: UsageMetric; recent: number[] }
export interface UnitInput { label: string; rank: number | null; n: number | null; /** Games the opponent has played in the window. */ sample: number | null }
export interface QualityInputs { talent: Input<TalentInput>; recent: Input<RecentInput>; usage: Input<UsageInput>; matchup: Input<UnitInput[]> }

// ------------------------------------------------------------------------------------------------ outputs

export interface QualityComponent {
  id: ComponentId;
  label: string;
  weight: number;
  /** 0 to 100 after shrinkage; null when the input is missing. */
  score: number | null;
  /** 0 to 100 before shrinkage. */
  raw: number | null;
  /** The sample the score stands on (games), and the shrink factor n/(n+k) applied. */
  n: number | null;
  reliability: number | null;
  /** The fact behind the bar, in a few words ("#12 of 149 WRs · per game"). */
  detail: string | null;
  /** Why the component is unavailable. */
  why: string | null;
}
export interface MatchupQuality {
  /** 0 to 100, rounded; null when fewer than MIN_COMPONENTS components are available. */
  score: number | null;
  word: 'Favorable' | 'Neutral' | 'Tough' | null;
  components: QualityComponent[];
  available: number;
  /** Why there is no headline. */
  why: string | null;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Pull a raw 0-100 score toward 50 by n / (n + k). */
export function shrink(raw: number, n: number, k: number): number {
  if (!(n > 0)) return 50;
  return 50 + (raw - 50) * (n / (n + k));
}
const reliabilityOf = (n: number, k: number) => (n > 0 ? n / (n + k) : 0);

const unavailable = (id: ComponentId, why: string): QualityComponent => ({ id, label: COMPONENT_LABEL[id], weight: WEIGHTS[id], score: null, raw: null, n: null, reliability: null, detail: null, why });
const available = (id: ComponentId, raw: number, n: number, rel: number, score: number, detail: string): QualityComponent =>
  ({ id, label: COMPONENT_LABEL[id], weight: WEIGHTS[id], score: r1(score), raw: r1(raw), n, reliability: r1(rel * 100) / 100, detail, why: null });

// ------------------------------------------------------------------------------------------------ components

/** Talent: percentile of the player's per-game rank among position peers (rank 1 = 100, last = 0). */
export function talentComponent(x: Input<TalentInput>): QualityComponent {
  if (isMissing(x)) return unavailable('talent', x.missing);
  if (!(x.of >= 2) || !(x.rank >= 1) || x.rank > x.of) return unavailable('talent', 'the published position ranking is malformed');
  if (!(x.games > 0)) return unavailable('talent', 'the ranking carries no games played');
  const raw = ((x.of - x.rank) / (x.of - 1)) * 100;
  const k = SHRINK_K.talent;
  return available('talent', raw, x.games, reliabilityOf(x.games, k), shrink(raw, x.games, k), `#${x.rank} of ${x.of} ${x.position}s per game · ${x.games} games · ${x.season}`);
}

/** Recent form: last-five average against his baseline average. */
export function recentComponent(x: Input<RecentInput>): QualityComponent {
  if (isMissing(x)) return unavailable('recent', x.missing);
  if (x.recent.length < MIN_RECENT_GAMES) return unavailable('recent', `needs at least ${MIN_RECENT_GAMES} recent games (has ${x.recent.length})`);
  if (x.baseline.length < MIN_BASELINE_GAMES) return unavailable('recent', `needs at least ${MIN_BASELINE_GAMES} games for the ${x.baselineLabel} average (has ${x.baseline.length})`);
  const b = mean(x.baseline);
  if (!(b > 0)) return unavailable('recent', `his ${x.baselineLabel} average is ${r1(b)}, so there is no trend to measure`);
  const l = mean(x.recent);
  const raw = 50 + 50 * clamp((l / b - 1) / TREND_FULL_SCALE, -1, 1);
  const n = x.recent.length, k = SHRINK_K.recent;
  const pct = Math.round((l / b - 1) * 100);
  return available('recent', raw, n, reliabilityOf(n, k), shrink(raw, n, k), `${x.recentLabel} ${r1(l)} vs ${x.baselineLabel} ${r1(b)} (${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%)`);
}

/** Usage: his recent share of the team's snaps / targets (or minutes), linear between the anchors. */
export function usageComponent(x: Input<UsageInput>): QualityComponent {
  if (isMissing(x)) return unavailable('usage', x.missing);
  if (!x.recent.length) return unavailable('usage', `no ${x.metric} in his recent games`);
  const { lo, hi } = USAGE_ANCHORS[x.metric];
  const m = mean(x.recent);
  const raw = clamp((m - lo) / (hi - lo), 0, 1) * 100;
  const n = x.recent.length, k = SHRINK_K.usage;
  const shown = x.metric === 'minutes' ? `${r1(m)} min` : `${Math.round(m * 100)}%`;
  return available('usage', raw, n, reliabilityOf(n, k), shrink(raw, n, k), `${x.metric} ${shown} · last ${n} game${n === 1 ? '' : 's'}`);
}

/**
 * Matchup: each published opposing unit contributes its ease (rank 1 = best defense = 0, last = 100), shrunk by the opponent's own sample;
 * the component is the mean over units. A unit without a rank, a universe or an opponent sample is left out and named.
 */
export function matchupComponent(x: Input<UnitInput[]>): QualityComponent {
  if (isMissing(x)) return unavailable('matchup', x.missing);
  const usable: { u: UnitInput; ease: number; rel: number }[] = [];
  const skipped: string[] = [];
  for (const u of x) {
    if (u.rank == null || u.n == null || !(u.n >= 2) || u.rank < 1 || u.rank > u.n) { skipped.push(`${u.label} (rank not published)`); continue; }
    if (u.sample == null || !(u.sample > 0)) { skipped.push(`${u.label} (opponent sample not published)`); continue; }
    usable.push({ u, ease: ((u.rank - 1) / (u.n - 1)) * 100, rel: reliabilityOf(u.sample, SHRINK_K.matchup) });
  }
  if (!usable.length) return unavailable('matchup', skipped.length ? `${skipped.join('; ')}` : 'no opposing-unit rank is published');
  const raw = mean(usable.map((e) => e.ease));
  const score = 50 + mean(usable.map((e) => (e.ease - 50) * e.rel));
  const n = Math.min(...usable.map((e) => e.u.sample!));
  const rel = mean(usable.map((e) => e.rel));
  const ranks = usable.map((e) => `${e.u.label} #${e.u.rank}/${e.u.n}`).join(' · ');
  return available('matchup', raw, n, rel, score, `${ranks} · opponent ${new Set(usable.map((e) => e.u.sample)).size === 1 ? `${n} games` : `${n}+ games`}${skipped.length ? ` · left out: ${skipped.join(', ')}` : ''}`);
}

// ------------------------------------------------------------------------------------------------ the headline

export function wordOf(score: number): 'Favorable' | 'Neutral' | 'Tough' {
  return score >= FAVORABLE_AT ? 'Favorable' : score <= TOUGH_AT ? 'Tough' : 'Neutral';
}

export function matchupQuality(inputs: QualityInputs): MatchupQuality {
  const components = [talentComponent(inputs.talent), recentComponent(inputs.recent), usageComponent(inputs.usage), matchupComponent(inputs.matchup)];
  const have = components.filter((c) => c.score != null);
  if (have.length < MIN_COMPONENTS) {
    return { score: null, word: null, components, available: have.length, why: `needs at least ${MIN_COMPONENTS} of 4 inputs (${have.length} published)` };
  }
  const total = have.reduce((a, c) => a + c.weight, 0);
  const score = have.reduce((a, c) => a + c.weight * c.score!, 0) / total;
  const rounded = Math.round(score);
  return { score: rounded, word: wordOf(rounded), components, available: have.length, why: null };
}

// ------------------------------------------------------------------------------------------------ from the published documents

const RECEIVING = new Set(['receptions', 'targets', 'receiving_yards', 'longest_reception']);
const PASSING = new Set(['passing_yards', 'attempts', 'completions', 'passing_tds', 'interceptions']);

export interface QualityArgs {
  sport: string;
  stat: string;
  statLabel: string;
  obs: Obs[];
  /** The current season key as the Obs carry it ("2026"); the baseline is this season, or every logged game when it holds fewer than MIN_BASELINE_GAMES. */
  season: string | null;
  /** The player's published position ranking for the stat (history `ranks`), or null. */
  rank: { rank: number; of: number; games: number; position: string; season: number } | null;
  /** The opposing units the opponent's profile publishes for this stat, with the opponent's sample; or the reason there are none. */
  units: Input<UnitInput[]>;
}

/** Assemble the four inputs from the logged games and published rankings, naming what each missing one lacks. */
export function inputsFrom(a: QualityArgs): QualityInputs {
  const played = a.obs.filter((o) => o.v[a.stat] != null);
  const val = (o: Obs) => o.v[a.stat] as number;

  const talent: Input<TalentInput> = a.rank
    ? { rank: a.rank.rank, of: a.rank.of, games: a.rank.games, position: a.rank.position, season: a.rank.season }
    : { missing: a.sport === 'NFL' ? `no ${a.statLabel.toLowerCase()} position ranking is published for him` : `no position ranking is published for ${a.sport} players` };

  let recent: Input<RecentInput>;
  if (!played.length) recent = { missing: `no logged games with ${a.statLabel.toLowerCase()}` };
  else {
    const l5 = sliceWindow(played, 'L5', null, null);
    const season = sliceWindow(played, 'SEASON', null, a.season);
    const useSeason = season.length >= MIN_BASELINE_GAMES;
    recent = { recent: l5.map(val), baseline: (useSeason ? season : sliceWindow(played, 'ALL', null, null)).map(val), recentLabel: 'L5', baselineLabel: useSeason ? 'season' : 'all-games' };
  }

  let usage: Input<UsageInput>;
  if (a.sport === 'NFL' && PASSING.has(a.stat)) usage = { missing: 'quarterbacks play nearly every snap, so snap share does not separate roles' };
  else {
    const recentRows = sliceWindow(played, 'L5', null, null);
    if (a.sport === 'NFL') {
      const metric: UsageMetric = RECEIVING.has(a.stat) ? 'target share' : 'snap share';
      const get = (o: Obs) => (metric === 'target share' ? o.tgtShare : o.snap);
      const vals = recentRows.map(get).filter((x): x is number => x != null);
      usage = vals.length ? { metric, recent: vals } : { missing: `${metric} is not published for his recent games` };
    } else {
      const vals = recentRows.map((o) => o.min).filter((x): x is number => x != null);
      usage = vals.length ? { metric: 'minutes', recent: vals } : { missing: `no usage figure (snaps, targets or minutes) is published for ${a.sport} players` };
    }
  }

  return { talent, recent, usage, matchup: a.units };
}

export const qualityFor = (a: QualityArgs): MatchupQuality => matchupQuality(inputsFrom(a));
