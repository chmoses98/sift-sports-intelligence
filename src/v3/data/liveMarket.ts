// A research market row with the newer live observation laid over it, keeping the provider's OWN status word.
// src/live/overlay.ts replaces `market_status` with the normalised availability, which folds words it does not know (expired, halted, ...)
// into UNKNOWN. v3 decides tradability from the raw word (model/marketStatus.ts), so every v3 overlay goes through here. A newer quote that
// sent NO status (rawStatus null, availability UNKNOWN) says nothing about the status, so the publication's word stands (a terminal state never reverts).
import type { Market } from '../../contract/types';
import { liveWins, overlayMarket } from '../../live/overlay';
import type { LiveQuote } from '../../live/types';
import { liveStatusWord } from '../model/marketStatus';
import { guardLiveQuote } from './validate';

export function overlayLive<M extends Parameters<typeof overlayMarket>[0]>(m: M, q: LiveQuote | undefined): M {
  if (q && !guardLiveQuote(q).ok) return m; // a quote that is not a price (data/validate.ts) changes nothing
  const o = overlayMarket(m, q);
  if (!q || !liveWins(m, q)) return o;
  return { ...o, market_status: liveStatusWord(q) ?? m.market_status } as M & Pick<Market, 'market_status'>;
}
