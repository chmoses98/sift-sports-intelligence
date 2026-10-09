// LIVE REPRICING — an opportunity's price is the publication's at its research run until a newer live quote exists
// for the same contract; then the executable ask of the selected side comes from the quote, the fee from Kalshi's
// schedule (a published fee belongs to the published ask), freshness from the quote's own clock, and the status is
// revalidated: an actionable row needs a current executable quote at or under the bet-up-to; a closed, settled or
// unopened contract is a PASS whatever the research said. Research candidates keep their status and show the quote.
import { liveWins } from '../live/overlay';
import type { LiveQuote } from '../live/types';
import { priceIntel } from './pricing';
import type { Opportunity } from './types';

export function repriceWithLive(o: Opportunity, q: LiveQuote | undefined, now: number): Opportunity {
  if (!q || !liveWins({ captured_at: o.price.observedAt }, q)) return o;
  const closed = q.availability === 'CLOSED' || q.availability === 'SETTLED' || q.availability === 'UNOPENED';
  const ask = closed ? null : o.what.side === 'YES' ? q.yesAsk : q.noAsk;
  const bid = closed ? null : o.what.side === 'YES' ? q.yesBid : q.noBid;
  const same = ask != null && o.price.ask != null && Math.abs(ask - o.price.ask) < 1e-9;
  const price = priceIntel({
    ...o.reprice, ask, bid, observedAt: q.observedAt, source: 'live', now,
    publishedFee: same ? o.reprice.publishedFee : null, publishedEv: same ? o.reprice.publishedEv : null,
  });
  let status = o.status;
  let statusReason = o.statusReason;
  if (closed && status !== 'PASS') {
    status = 'PASS';
    statusReason = `The contract is ${q.availability.toLowerCase()} on the live market (observed ${q.observedAt}).`;
  } else if (status !== 'PASS' && price.state === 'EXPIRED') {
    status = 'PASS';
    statusReason = 'The publication’s validity window for this price has passed.';
  } else if (status === 'ACTIONABLE' && price.state !== 'CURRENT') {
    status = 'PASS';
    statusReason = price.state === 'ABOVE_BET_UP_TO' ? 'The live ask is above the publication’s bet-up-to price.' : price.state === 'NO_QUOTE' ? 'No executable live quote for this side.' : 'The live quote is stale.';
  }
  const tier = status === 'PASS' ? 5 : o.rank.tier;
  return {
    ...o, price, status, statusReason,
    rank: { ...o.rank, tier, tierWord: tier === 5 ? 'Pass' : o.rank.tierWord, priceCurrent: price.state === 'CURRENT', evPerContract: price.evPerContract },
  };
}

/** Every opportunity repriced where a live quote exists; untouched where none does. */
export function repriceAll(opps: Opportunity[], quote: (ticker: string) => LiveQuote | undefined, now: number): Opportunity[] {
  return opps.map((o) => (o.ticker ? repriceWithLive(o, quote(o.ticker), now) : o));
}
