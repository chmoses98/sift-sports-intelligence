// LIVE REPRICING — an opportunity's price is the publication's at its research run until a newer live quote exists
// for the same contract; then the executable ask of the selected side comes from the quote, the fee from Kalshi's
// schedule (a published fee belongs to the published ask), freshness from the quote's own clock (the publication's
// own freshness word described ITS price, not the newer quote), and every number that depends on the price is either
// recomputed or withdrawn:
//
//   break-even, edge after fee   recomputed from the publication's fair probability at the live ask
//   worst-case edge              re-based exactly: the publication defines it as a worst-case probability minus the
//                                break-even, so the live figure is that probability minus the live break-even
//   posterior edge share         withdrawn: it needs the model's draws, which Sift does not have
//
// Then the status is revalidated: a closed, settled or unopened contract is a PASS whatever the research said; a live
// ask above the publication's bet-up-to, or one at which the edge after fee is gone, eliminates the opportunity; an
// actionable row also needs a current executable quote. The tier is recomputed by the same rule as at load.
import { quoteFreshness } from '../live/freshness';
import { liveWins } from '../live/overlay';
import type { LiveQuote } from '../live/types';
import { priceIntel } from './pricing';
import { tierOf, tierWord } from './rank';
import type { Opportunity } from './types';

const cents = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}¢`);

export function repriceWithLive(o: Opportunity, q: LiveQuote | undefined, now: number): Opportunity {
  if (!q || !liveWins({ captured_at: o.price.observedAt }, q)) return o;
  // Only an OPEN contract has an executable ask: paused (SUSPENDED) or unrecognised (UNKNOWN) is not tradable either.
  const closed = q.availability !== 'OPEN';
  // A quote observed at or after the start is an in-play price, never a pregame one (tennis start times are nominal:
  // its publication's verified-upcoming word governs there, see lifecycle.ts).
  const kickoff = Date.parse(o.startTime);
  const inPlay = o.sport !== 'TENNIS' && Number.isFinite(kickoff) && Date.parse(q.observedAt) >= kickoff;
  const ask = closed ? null : o.what.side === 'YES' ? q.yesAsk : q.noAsk;
  const bid = closed ? null : o.what.side === 'YES' ? q.yesBid : q.noBid;
  const same = ask != null && o.price.ask != null && Math.abs(ask - o.price.ask) < 1e-9;
  const price = priceIntel({
    ...o.reprice, ask, bid, observedAt: q.observedAt, source: 'live', now, publishedPriceState: null,
    publishedFee: same ? o.reprice.publishedFee : null, publishedEv: same ? o.reprice.publishedEv : null,
    // The publication's depth belongs to its own ask and time; the live provider publishes no depth.
    availableSize: null,
  });
  // Worst case = (publication's worst-case probability) − break-even; carry the probability, swap the break-even.
  const worstCaseEdge = same || o.rank.worstCaseEdge == null ? o.rank.worstCaseEdge
    : o.price.breakEven != null && price.breakEven != null ? Math.round((o.rank.worstCaseEdge + o.price.breakEven - price.breakEven) * 1e6) / 1e6 : null;
  const edgeShare = same ? o.rank.edgeShare : null;
  let status = o.status;
  let statusReason = o.statusReason;
  if (closed && status !== 'PASS') {
    status = 'PASS';
    statusReason = `The contract is ${q.availability === 'UNKNOWN' ? 'in an unrecognised state' : q.availability.toLowerCase()} on the live market (observed ${q.observedAt}): no executable price.`;
  } else if (inPlay && status !== 'PASS') {
    status = 'PASS';
    statusReason = `The live quote was observed after the start (${q.observedAt}): it is an in-play price, and the pregame research does not apply to it.`;
  } else if (status !== 'PASS' && price.state === 'EXPIRED') {
    status = 'PASS';
    statusReason = 'The publication’s validity window for this price has passed.';
  } else if (status !== 'PASS' && price.state === 'ABOVE_BET_UP_TO') {
    status = 'PASS';
    statusReason = `The live ask (${cents(ask)}) is above the publication’s bet-up-to price (${cents(price.betUpTo)}): the price moved past what its model supports.`;
  } else if ((status === 'RESEARCH_CANDIDATE' || status === 'ACTIONABLE') && !same && price.evPerContract != null && price.evPerContract <= 0) {
    status = 'PASS';
    statusReason = `At the live ask (${cents(ask)}) the edge after fee is gone: break-even ${cents(price.breakEven)} against a fair ${Math.round((price.fair ?? 0) * 100)}%.`;
  } else if (status === 'ACTIONABLE' && (price.state !== 'CURRENT' || quoteFreshness(q.observedAt, now) !== 'FRESH')) {
    // Acting needs a fresh executable quote (under 15 minutes), not merely one that is not yet stale.
    status = 'PASS';
    statusReason = price.state === 'NO_QUOTE' ? 'No executable live quote for this side.' : price.state === 'CURRENT' ? 'The live quote is no longer fresh (over 15 minutes old): refresh before acting.' : 'The live quote is stale.';
  }
  const priceNote = same || ask == null ? null
    : `Repriced on the live ask: ${cents(o.price.ask)} at the research run → ${cents(ask)} now. Break-even and edge after fee are recomputed from the publication’s fair probability${o.rank.worstCaseEdge != null ? ', and the worst case is re-based on the new break-even' : ''}${o.rank.edgeShare != null ? '; the posterior edge share is withdrawn (it needs the model’s draws at the new price)' : ''}.`;
  const tier = tierOf({ status, support: o.confidence.support, worstCaseEdge, highVariance: o.rank.highVariance, priceCurrent: price.state === 'CURRENT', calibration: o.confidence.calibration });
  return {
    ...o, price, status, statusReason, priceNote,
    confidence: { ...o.confidence, edgeShare },
    rank: { ...o.rank, tier, tierWord: tierWord(tier, status), priceCurrent: price.state === 'CURRENT', evPerContract: price.evPerContract, worstCaseEdge, edgeShare },
  };
}

/** Every opportunity repriced where a live quote exists; untouched where none does. */
export function repriceAll(opps: Opportunity[], quote: (ticker: string) => LiveQuote | undefined, now: number): Opportunity[] {
  return opps.map((o) => (o.ticker ? repriceWithLive(o, quote(o.ticker), now) : o));
}
