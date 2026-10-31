// The price of a script row's contract SIDE, through the quote gate. A Script Engine expression is a contract side: the YES side is paid by the YES ask and the NO
// side by the NO ask (src/lib/scriptEngine.ts `sidePrice`), never 1 minus the other. The v3 Price is a YES ask in cents, so a NO side is built here from the market's
// own `no_ask`/`no_bid` and judged by the same gate (data/quoteGate.ts): the same observation rule, the same status rule, an executable ask of 1 to 99 cents.
// A newer live observation replaces the publication's capture exactly as on every other v3 price (overlayLive). Nothing is derived (no NO ask is computed from a
// YES bid): a side the publication does not quote is withheld ("—").
import { useCallback, useEffect, useMemo } from 'react';
import type { EventDetailDoc, Market } from '../../../contract/types';
import { useNow } from '../../../live/hooks';
import { expressionLabel, type Engine, type Expression } from '../../../lib/scriptEngine';
import { cents } from '../../model/format';
import type { Price, V3Game } from '../../model/types';
import { contractInfo, publishContracts, type ContractInfo } from '../../ui/ContractSheet';
import { cleanDescription } from '../../ui/gameContracts';
import { priceOf } from '../adapt';
import { overlayLive } from '../liveMarket';
import { useRowQuotes } from '../liveQuotes';
import { usablePrice } from '../quoteGate';

export type Side = 'YES' | 'NO';

/** The price of one side of a market: the YES ask for YES, the NO ask for NO. A market that cannot trade carries neither (priceOf). */
export function sidePriceOf(m: Market, side: Side): Price {
  const yes = priceOf(m);
  if (side === 'YES' || !yes.tradable) return yes;
  const ask = cents(m.no_ask), bid = cents(m.no_bid);
  return { ...yes, ask, bid, implied: ask, side: 'NO' };
}

/** Scripts name a contract side by ticker and side; the lookup the screens use. */
export interface SideRef { ticker: string; side: Side }

/**
 * `ask(ticker, side)`: the whole cents to print for that side (a current, executable, tradable quote), or null to print "—". The rows' tickers are registered
 * with the shared live-quote store as list rows of this game (game cadence), like every other list of prices on Game Detail.
 */
export function useSideAsks(g: V3Game | null, detail: EventDetailDoc | null | undefined, startMs: number | null, tickers: string[]): (ticker: string, side: Side) => number | null {
  const live = useRowQuotes(tickers.length ? tickers : undefined, { startMs, live: g?.phase === 'live' });
  const byTicker = useMemo(() => new Map<string, Market>((detail?.markets ?? []).map((m) => [m.kalshi_ticker, m])), [detail]);
  const now = useNow(15_000);
  return useCallback((ticker, side) => {
    const m = byTicker.get(ticker);
    if (!g || !m) return null;
    return usablePrice(sidePriceOf(overlayLive(m, live.quote(ticker)), side), { kind: 'list', startMs, live: g.phase === 'live' }, now)?.ask ?? null;
  }, [g, byTicker, live.version, startMs, now]); // eslint-disable-line react-hooks/exhaustive-deps
}

const NO_SIDE_NOTE = 'A script row can be either side of a contract. The numbers above are the YES side of this contract; a NO row prints its own NO ask on the row.';

/**
 * Tell the exact-contract sheet about the contracts the script rows name (the contract opens by ticker). Contracts the game's own list already published
 * (the lines, win prices, team totals) keep their entry and gain a note when a NO side is named; the others are published here. Called after
 * `usePublishGameContracts` in the same component, so this entry is the one that stands.
 */
export function usePublishScriptContracts(g: V3Game | null, startMs: number | null, detail: EventDetailDoc | null | undefined, engine: Engine | null): void {
  const named = useMemo(() => {
    if (!g || !detail || !engine) return [];
    const byTicker = new Map<string, Market>(detail.markets.map((m) => [m.kalshi_ticker, m]));
    const sides = new Map<string, { m: Market; no: boolean }>();
    for (const e of engine.expressions) {
      const m = byTicker.get(e.ticker);
      if (m) sides.set(e.ticker, { m, no: e.side === 'NO' || !!sides.get(e.ticker)?.no });
    }
    return [...sides.values()];
  }, [g, detail, engine]);
  useEffect(() => {
    if (!g || !named.length) return;
    const subtitle = `${g.away.abbr} at ${g.home.abbr} · Kalshi YES`;
    publishContracts(named.map(({ m, no }): ContractInfo => {
      const base = contractInfo(m.kalshi_ticker) ?? { ticker: m.kalshi_ticker, title: cleanDescription(m.yes_description) || m.kalshi_ticker, subtitle, price: priceOf(m), startMs, live: g.phase === 'live', actions: [] };
      return no ? { ...base, note: NO_SIDE_NOTE } : base;
    }));
  }, [g, startMs, named]);
}

/** The words of a script row's contract side ("No — Alabama wins by 8+"), from the published market row. */
export const sideLabel = (e: Expression, m: Market | undefined): string => cleanDescription(expressionLabel(e, m));
