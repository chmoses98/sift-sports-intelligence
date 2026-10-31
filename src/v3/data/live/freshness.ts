// How old a live detail answer is, and what that allows on screen. The same clock as the score store (src/live/scores/freshness.ts), so a score on
// the hero and a score in the live block can never disagree about whether they are "Delayed":
//   live     age < 60 s                  printed as is
//   delayed  60 s <= age <= 5 min        printed, with the one muted word "Delayed" (DelayedMark), no age
//   stale    age > 5 min                 withheld: the state (score, outs, clock) is not printed as current; the screen says the feed stopped
// Age runs from the provider's own state time when it gives one, else from when this device received the answer. A failed refresh keeps the
// last answer with its REAL age: nothing here ever makes data younger. A final is a fact and does not age.
import { SCORE_LIVE_BEFORE_MS, SCORE_STALE_AFTER_MS } from '../../../live/scores/freshness';
import type { DetailSituation, Freshness, LiveDetail } from './types';

/** A provider time this far ahead of the device clock is distrusted (skew vs bad data); the receive time stands in. */
const FUTURE_SKEW_MS = 2 * 60_000;

export function detailAgeMs(d: Pick<LiveDetail, 'fetchedAt' | 'providerAt'>, now: number): number {
  const p = d.providerAt;
  const t = p != null && p <= d.fetchedAt + FUTURE_SKEW_MS ? Math.min(p, d.fetchedAt) : d.fetchedAt;
  return Math.max(0, now - t);
}

export function detailFreshness(d: Pick<LiveDetail, 'fetchedAt' | 'providerAt' | 'phase'>, now: number): Freshness {
  if (d.phase === 'final') return 'live';
  const age = detailAgeMs(d, now);
  if (age < SCORE_LIVE_BEFORE_MS) return 'live';
  return age <= SCORE_STALE_AFTER_MS ? 'delayed' : 'withheld';
}

const ordinalWord = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/** One line for a situation, only from fields the feed stated: "2 outs, 1-2 count, runners on 1st and 3rd". */
export function situationText(s: DetailSituation | null): string | null {
  if (!s) return null;
  if (s.kind === 'football') return [s.downDistance, s.yardLine].filter(Boolean).join(' · ') || null;
  if (s.kind === 'hockey') return s.powerPlay ? `Power play${s.powerPlay.remaining ? `, ${s.powerPlay.remaining} left` : ''}` : null;
  const parts: string[] = [];
  if (s.outs != null) parts.push(`${s.outs} ${s.outs === 1 ? 'out' : 'outs'}`);
  if (s.balls != null && s.strikes != null) parts.push(`${s.balls}-${s.strikes} count`);
  if (s.bases) {
    const on = s.bases.map((b, i) => (b ? ordinalWord(i + 1) : null)).filter(Boolean);
    parts.push(on.length ? `runners on ${on.join(' and ')}` : 'bases empty');
  }
  return parts.join(', ') || null;
}
