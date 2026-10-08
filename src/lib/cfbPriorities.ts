// CFB SLATE PRIORITIES — where to look first on a college football slate. Decision compression over the CFB
// research-signals contract (cfb_research_signals/1.x), not a new model and not a score.
//
// Every item is chosen by a fixed rule from fields the CFB home already reads (lib/cfbSignals.ts SlateGame):
//
//   board.json item          status, start_time_utc                 who is still to play
//   signals game             status, claims (control / closeness /   the football read
//                            pace / scoring / defensive_suppression /
//                            disruption), data_quality, historical
//   signals game .market     the CONTROL side's own game-winner       the price, and when it was observed
//                            YES ask (or a newer live quote)
//   signals.moderate_control status (VALUE_WATCH), label, short      whether Moderate CONTROL is a value signal now
//   signals.strong_control   status (NO_EDGE), market_summary         a football read the market already prices
//   signals.market_disagreement rule.below_cents, status            the Market Disagreement flag
//
// The one hard line: VALUE is what the contract's value framework says (Value Watch: Moderate CONTROL while the
// contract's status is VALUE_WATCH, on a fresh executable price). A strong football read (Strong CONTROL) is never
// called value, and a market disagreement is never called a bet: the contract says Strong CONTROL is approximately
// efficient (NO_EDGE) and the disagreement cut is exploratory (INSUFFICIENT_DATA).
//
// Orderings are PRESENTATION ONLY (deterministic, documented in docs/CFB_SLATE_PRIORITIES.md): they decide which
// qualifying game is shown first, never whether a game qualifies, and are never shown as a number.
import { quoteFreshness } from '../live/freshness';
import { environmentCount, isClose, isStrong, valueWatchActive, type SignalGame, type SignalsDoc, type SlateGame } from './cfbSignals';

/** A CFB price can be acted on only when it is FRESH (< 15 min) or AGING (≤ 30 min) — the app's market-quote policy. */
const USABLE = new Set(['FRESH', 'AGING']);
/** Game to Watch needs at least this many research claims (closeness plus at least one more). */
export const WATCH_MIN_CLAIMS = 2;
/** Data quality, best first (the contract's own grade); a missing grade sorts last. */
const DQ: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export type CfbPriorityKind = 'value' | 'read' | 'disagreement' | 'watch' | 'look';

export interface CfbPick {
  kind: CfbPriorityKind;
  x: SlateGame;
  /** The team the item is about (the CONTROL side), when there is one. */
  team: string | null;
}

export type ValueState =
  | { kind: 'pick'; pick: CfbPick; of: number }
  | { kind: 'none'; title: string; text: string }
  | { kind: 'stale'; title: string; text: string };

export type DisagreementState = { kind: 'pick'; pick: CfbPick; gap: number } | { kind: 'stale' } | { kind: 'none' };

export interface CfbPriorities {
  value: ValueState;
  read: CfbPick | null;
  disagreement: DisagreementState;
  watch: (CfbPick & { reason: string }) | null;
  look: (CfbPick & { tag: string }) | null;
  /** Upcoming, not-kicked-off games on this slate (with a known start time). */
  upcoming: number;
  /** Of those, games with a published SIFT read (CLAIMS_PUBLISHED). */
  withRead: number;
}

const dq = (g: SignalGame | null) => DQ[g?.data_quality ?? ''] ?? 3;
const kickoff = (x: SlateGame) => x.item.start_time_utc;
const byDqKick = (a: SlateGame, b: SlateGame) => dq(a.g) - dq(b.g) || kickoff(a).localeCompare(kickoff(b)) || a.item.event_id.localeCompare(b.item.event_id);

/** Still to play on the app clock: SCHEDULED, with a known start in the future. Live, final and unknown-time games never qualify. */
export function isUpcoming(x: SlateGame, now: number): boolean {
  if (x.item.status !== 'SCHEDULED') return false;
  const t = Date.parse(x.item.start_time_utc);
  return Number.isFinite(t) && t > now;
}

/** The CONTROL side's price can be acted on: executable and observed within 30 minutes. */
export function usablePrice(x: SlateGame, now: number): boolean {
  return x.price.kind === 'EXECUTABLE' && USABLE.has(quoteFreshness(x.price.observedAt, now));
}

const hasRead = (x: SlateGame) => !!x.g && x.g.status === 'CLAIMS_PUBLISHED' && !!x.g.claims;
const teamOf = (x: SlateGame) => x.g?.claims?.control?.team ?? null;

/** Every claim the game carries: closeness, pace, scoring, defensive suppression and each disruption edge. */
export function claimCount(g: SignalGame | null | undefined): number {
  const c = g?.claims;
  if (!c) return 0;
  return (c.closeness ? 1 : 0) + environmentCount(g) + c.disruption.length;
}

/** "Profiles as a close game, with a fast pace and elevated scoring." — the game's claims, in words. */
export function watchReason(g: SignalGame): string {
  const c = g.claims!;
  const more = [
    c.pace === 'HIGH' && 'a fast pace',
    c.pace === 'LOW' && 'a slow pace',
    c.scoring?.level === 'ELEVATED' && 'elevated scoring',
    c.scoring?.level === 'SUPPRESSED' && 'lower scoring',
    c.defensive_suppression && 'both defenses suppressing the offenses they face',
    ...c.disruption.map((d) => `${d.team} owning the disruption edge`),
  ].filter((s): s is string => !!s);
  const list = more.length <= 1 ? more.join('') : `${more.slice(0, -1).join(', ')} and ${more[more.length - 1]}`;
  return `Profiles as a close game${list ? `, with ${list}` : ''}.`;
}

export function cfbPriorities(games: SlateGame[], doc: SignalsDoc, now: number): CfbPriorities {
  const upcoming = games.filter((x) => isUpcoming(x, now));
  const pool = upcoming.filter(hasRead);
  const taken = new Set<string>();
  const take = (x: SlateGame) => taken.add(x.item.event_id);
  const free = (x: SlateGame) => !taken.has(x.item.event_id);

  // ⭐ Top Value Signal — only the contract's own value framework: Value Watch, on a fresh executable price.
  const vwOn = valueWatchActive(doc);
  const vwAll = vwOn ? pool.filter((x) => x.valueWatch) : [];
  const vwUsable = vwAll.filter((x) => usablePrice(x, now)).sort(byDqKick);
  let value: ValueState;
  if (vwUsable.length) {
    value = { kind: 'pick', pick: { kind: 'value', x: vwUsable[0], team: teamOf(vwUsable[0]) }, of: vwUsable.length };
    take(vwUsable[0]);
  } else if (vwAll.some((x) => x.price.kind === 'EXECUTABLE')) {
    value = { kind: 'stale', title: 'Waiting for updated prices', text: 'SIFT has Value Watch games on this slate, but their latest market quotes are stale. A value signal shows again once a fresh price arrives.' };
  } else if (!vwOn) {
    value = { kind: 'none', title: 'No strong value signal yet', text: 'SIFT’s value framework has no active value signal right now. The football reads below are not bets.' };
  } else if (vwAll.length) {
    value = { kind: 'none', title: 'No strong value signal yet', text: 'This slate’s Value Watch games have no executable price right now, so nothing is called value.' };
  } else {
    value = { kind: 'none', title: 'No strong value signal yet', text: 'No game still to play on this slate carries a Value Watch signal, so SIFT does not see enough market separation to call value.' };
  }

  // ⚠️ Biggest Market Disagreement — the contract's own flag (Strong CONTROL priced below its line), on a fresh price.
  // Ordered by how far below the line the price sits, then data quality, kickoff, event id.
  const below = doc.signals.market_disagreement.rule.below_cents;
  const dAll = pool.filter((x) => x.disagreement && free(x));
  const dUsable = dAll.filter((x) => usablePrice(x, now)).sort((a, b) => (a.price.cents ?? 0) - (b.price.cents ?? 0) || byDqKick(a, b));
  let disagreement: DisagreementState;
  if (dUsable.length) {
    disagreement = { kind: 'pick', pick: { kind: 'disagreement', x: dUsable[0], team: teamOf(dUsable[0]) }, gap: below - (dUsable[0].price.cents ?? below) };
    take(dUsable[0]);
  } else disagreement = dAll.length ? { kind: 'stale' } : { kind: 'none' };

  // 🏈 Strongest Game Read — Strong CONTROL with the widest historical margin for its tier, then data quality,
  // kickoff, event id. Needs no price: it is a football read, never a bet.
  const reads = pool.filter((x) => isStrong(x.g) && free(x)).sort((a, b) => (b.g!.historical?.median ?? -Infinity) - (a.g!.historical?.median ?? -Infinity) || byDqKick(a, b));
  const read = reads.length ? { kind: 'read' as const, x: reads[0], team: teamOf(reads[0]) } : null;
  if (read) take(read.x);

  // 🔥 Game to Watch — a close-game profile carrying the most other research claims (at least WATCH_MIN_CLAIMS in
  // all), then data quality, kickoff, event id. Interesting, not a bet.
  const watches = pool
    .filter((x) => isClose(x.g) && claimCount(x.g) >= WATCH_MIN_CLAIMS && free(x))
    .sort((a, b) => claimCount(b.g) - claimCount(a.g) || byDqKick(a, b));
  const watch = watches.length ? { kind: 'watch' as const, x: watches[0], team: null, reason: watchReason(watches[0].g!) } : null;
  if (watch) take(watch.x);

  // 👀 Worth a Look — one more, only when there is one: the next Value Watch game on a fresh price, else the next
  // Strong CONTROL read. Never filler.
  const nextValue = vwUsable.find(free);
  const nextRead = reads.find(free);
  const look = nextValue
    ? { kind: 'look' as const, x: nextValue, team: teamOf(nextValue), tag: 'Also on Value Watch' }
    : nextRead
      ? { kind: 'look' as const, x: nextRead, team: teamOf(nextRead), tag: 'Another strong football read' }
      : null;

  return { value, read, disagreement, watch, look, upcoming: upcoming.length, withRead: pool.length };
}
