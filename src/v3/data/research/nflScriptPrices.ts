// Tell the exact-contract sheet about the contracts the NFL Game Script tab names. A script row is a contract SIDE (YES or NO) of a published market; the screen
// prints each side's ask through the quote gate (`useSideQuotes`, data/research/scriptPrices.ts), and a tap opens the addressed sheet, which needs the contract's words.
// Contracts the game's own list already published (the lines, win prices, main prop rungs) keep their entry and gain a note when a NO side is named; the others
// (other spread rungs, other props) are published here with the row's own label. Called after `usePublishGameContracts` in the same screen, so this entry stands.
import { useEffect, useMemo } from 'react';
import type { Market } from '../../../contract/types';
import { contractInfo, publishContracts, type ContractInfo } from '../../ui/ContractSheet';
import type { V3Game } from '../../model/types';
import { priceOf } from '../adapt';
import { NO_SIDE_NOTE } from './scriptPrices';

export interface NamedSide { m: Market; label: string; side: 'YES' | 'NO' }

export function usePublishNflScriptContracts(g: V3Game | null, startMs: number | null, named: readonly NamedSide[]): void {
  const key = useMemo(() => named.map((n) => `${n.m.kalshi_ticker}:${n.side}`).sort().join('|'), [named]);
  useEffect(() => {
    if (!g || !named.length) return;
    const subtitle = `${g.away.abbr} at ${g.home.abbr} · Kalshi YES`;
    const by = new Map<string, NamedSide & { no: boolean }>();
    for (const n of named) by.set(n.m.kalshi_ticker, { ...n, no: n.side === 'NO' || !!by.get(n.m.kalshi_ticker)?.no });
    publishContracts([...by.values()].map(({ m, label, no }): ContractInfo => {
      const base = contractInfo(m.kalshi_ticker) ?? { ticker: m.kalshi_ticker, title: label, subtitle, price: priceOf(m), startMs, live: g.phase === 'live', actions: [] };
      return no ? { ...base, note: NO_SIDE_NOTE } : base;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, startMs, key]);
}
