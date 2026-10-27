// What Prop Discovery tells the exact-contract sheet (ui/ContractSheet.tsx) about the contracts it shows: the title and subtitle, the
// rungs of the ladder with the History of each, the prop's own SIFT-model note, and where "Research" and "Back to list" lead. The price
// handed over is the publication's (or the live store's) UNGATED price: the sheet applies the contract-context gate and shows
// "Price unavailable right now" with Retry, and hides the fee and break-even rows, when it may not print one.
import { useEffect, useMemo } from 'react';
import { useLocation } from '../../../routing';
import type { BankEntry } from '../../data/props/bank';
import { hitCount } from '../../data/props/history';
import { historyStateOf, rawPrice } from '../../data/props/hooks';
import type { Prop } from '../../data/props/types';
import { weekdayClock } from '../../model/time';
import { routes } from '../../nav/routes';
import { publishContracts, type ContractInfo } from '../../ui/ContractSheet';
import { playerRef, playerState } from './parts';

const when = (ms: number) => weekdayClock(ms);

/** The same address with the sheet closed (a link to it replaces the sheet's entry, so Back lands on the screen underneath). */
export function addressWithoutSheet(pathname: string, search: string): string {
  const q = new URLSearchParams(search);
  q.delete('sheet'); q.delete('tk');
  const s = q.toString();
  return `${pathname}${s ? `?${s}` : ''}`;
}

export function contractsOf(p: Prop, get: (key: string) => BankEntry | undefined, back: string): ContractInfo[] {
  const hs = historyStateOf(p, get);
  const word = p.label.toLowerCase();
  const neighbours = p.rungs.map((x) => {
    const h = hs.state === 'ready' ? hitCount(hs.values, x.k) : null;
    return { ticker: x.ticker, label: `${x.k}+ ${word}`, price: rawPrice(p, x, undefined), note: h ? `${h.h}/${h.n} history` : null };
  });
  const ref = playerRef(p);
  const note = p.model.state === 'none' ? `${p.model.reason}. SIFT shows no bet buttons.` : null;
  return p.rungs.map((r) => ({
    ticker: r.ticker,
    title: `${p.name}: ${r.k}+ ${word}`,
    subtitle: `${p.away.abbr} at ${p.home.abbr}${when(p.startMs) ? ` · ${when(p.startMs)}` : ''} · Kalshi YES`,
    price: rawPrice(p, r, undefined),
    startMs: p.startMs, live: false, neighbours, note,
    actions: [
      ...(ref ? [{ label: `Research ${p.name.split(' ')[0]}`, to: routes.player(ref, playerState(p, r.k) ?? {}), primary: true }] : []),
      { label: 'Back to list', to: back },
    ],
  }));
}

/** Publish the contracts of these props (the ones on screen, the expanded one, the compare columns) for the sheet to resolve. */
export function usePublishContracts(props: (Prop | null | undefined)[], get: (key: string) => BankEntry | undefined, version: number, fallbackBack?: string) {
  const loc = useLocation();
  const back = fallbackBack ?? addressWithoutSheet(loc.pathname, loc.search);
  const sig = props.map((p) => p?.id ?? '').join('|');
  const list = useMemo(() => props.filter((p): p is Prop => !!p), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const out: ContractInfo[] = [];
    for (const p of list) out.push(...contractsOf(p, get, back));
    if (out.length) publishContracts(out);
  }, [list, back, version]); // eslint-disable-line react-hooks/exhaustive-deps
}
