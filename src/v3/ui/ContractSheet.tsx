// The exact-contract sheet: `?sheet=contract&tk=TICKER`, opened by a <PriceTap>. Shared by every screen that shows a price (Player Research,
// and Prop Discovery later): a screen publishes what it knows about its contracts (`publishContracts`) and the sheet resolves the ticker.
//
// Prices go ONLY through data/quoteGate.ts. A price that may not be shown makes the sheet say exactly "Price unavailable right now" with a
// Retry control and hides every row derived from the price (ask, bid, implied, fee, break-even). A market that is POSITIVELY not tradable
// (closed, settled, suspended, not open yet, delisted) gets its own state instead: "Market closed" / "Market settled" / "Trading suspended"
// with no price rows and NO Retry (asking again cannot make it tradable); the screen's research stays outside the sheet. Nothing here prints an age, a time of
// observation, "stale", "last known" or any other freshness word. Opening the sheet asks the shared live-quote store for a forced refresh of
// this one ticker (QuoteStore.refreshNow), and Retry asks again.
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from '../../routing';
import { liveStore, useLiveQuotes, useNow } from '../../live/hooks';
import { gate } from '../data/quoteGate';
import { contractFacts, newerPrice, priceOfQuote } from '../model/contract';
import { fmtCents, showAsk } from '../model/format';
import { nonTradableNote, nonTradableTitle } from '../model/marketStatus';
import type { Price } from '../model/types';
import { withSheet } from '../nav/routes';
import { usePrefs } from '../state/prefs';
import { registerSheet } from './Sheet';
import './ContractSheet.css';

export interface ContractNeighbour { ticker: string; label: string; price: Price | null; note?: string | null }
export interface ContractInfo {
  ticker: string;
  /** "CeeDee Lamb: 7+ receptions". */
  title: string;
  /** "DAL at PHI · Mon 8:15 PM · Kalshi YES". */
  subtitle: string;
  /** The latest price the screen holds for this contract (the sheet uses a newer live observation when the store has one). */
  price: Price | null;
  /** The game's start (gate tier) and whether it is in play. */
  startMs: number | null;
  live: boolean;
  /** The other rungs of the same ladder. */
  neighbours?: ContractNeighbour[];
  /** Links under the numbers (Game Detail, Research). */
  actions?: { label: string; to: string; primary?: boolean }[];
  /** A line under the numbers, e.g. why the SIFT lane is empty. */
  note?: ReactNode;
}

// ---------------------------------------------------------------- what screens know about their contracts

const registry = new Map<string, ContractInfo>();
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** A screen tells the sheet about the contracts it shows (replaces earlier entries for the same tickers). */
export function publishContracts(list: ContractInfo[]): void {
  for (const c of list) registry.set(c.ticker, c);
  version++;
  listeners.forEach((l) => l());
}
export const contractInfo = (ticker: string): ContractInfo | undefined => registry.get(ticker);
export const clearContracts = (): void => { registry.clear(); version++; listeners.forEach((l) => l()); };

// ---------------------------------------------------------------- the sheet

const REFRESH_MS = 6_000;

function useForcedRefresh(tk: string | null) {
  const [busy, setBusy] = useState(false);
  const run = useMemo(() => async () => {
    if (!tk) return;
    setBusy(true);
    try { await liveStore().refreshNow([tk], { timeoutMs: REFRESH_MS }); } catch { /* the gate decides what is shown */ } finally { setBusy(false); }
  }, [tk]);
  // The seam for the separately reviewed quote branch (claude/quote-track): when it lands, a contract-context forced refresh
  // (its own freshest-quote request) replaces `refreshNow` here and nothing else in this file changes.
  useEffect(() => { void run(); }, [run]);
  return { busy, retry: run };
}

const KV = ({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) => <div className={`v3c-kv${strong ? ' is-strong' : ''}`}><span>{k}</span><b>{v}</b></div>;

function ContractBody({ tk }: { tk: string | null }) {
  useSyncExternalStore(subscribe, () => version, () => version);
  const info = tk ? contractInfo(tk) : undefined;
  const loc = useLocation();
  const nav = useNavigate();
  const fmt = usePrefs().priceFormat;
  const live = useLiveQuotes(tk ? [tk] : undefined, 'detail');
  const { busy, retry } = useForcedRefresh(tk);
  // The rungs listed under the numbers follow the live store too (bounded), so a neighbour's price is current or "—", never a capture.
  const nbTickers = useMemo(() => (info?.neighbours ?? []).map((n) => n.ticker).filter((t) => t !== tk).slice(0, 40), [info, tk]);
  useLiveQuotes(nbTickers.length ? nbTickers : undefined, 'game');
  const now = useNow(5_000);
  if (!tk) return <p className="v3c-note">No contract is named in this address.</p>;

  // The newest observation wins: the live store's quote when it has one newer than the screen's own price.
  const price = newerPrice(info?.price, priceOfQuote(live.quote(tk), info?.title ?? ''));
  const ctx = { kind: 'contract' as const, startMs: info?.startMs ?? null, live: info?.live ?? false };
  const g = gate(price, ctx, now);
  const f = g.price ? contractFacts(g.price) : null;
  const open = (to: string) => nav({ pathname: loc.pathname, search: withSheet(loc.search, { kind: 'contract', tk: to }) }, { replace: true, state: loc.state, preventScrollReset: true });

  return (
    <div className="v3c" data-contract={tk}>
      <header className="v3c-head">
        <b>{info?.title ?? live.quote(tk)?.title ?? 'Contract'}</b>
        {info?.subtitle && <span>{info.subtitle}</span>}
      </header>
      <div className="v3c-tick" aria-label="Contract ticker"><code>{tk}</code></div>

      {f ? (
        <>
          <div className="v3c-grid" data-state="price">
            <div><small>Ask</small><b className="num v3c-m">{fmtCents(f.ask)}</b></div>
            <div><small>Bid</small><b className="num">{fmtCents(f.bid)}</b></div>
            <div><small>Implied</small><b className="num v3c-m">{f.implied}%</b><em>pre-fee</em></div>
            {f.volume != null && <div><small>Volume</small><b className="num">{Math.round(f.volume).toLocaleString()}</b></div>}
          </div>
          <div className="v3c-fee" data-state="fee">
            {fmt !== 'cents' && <KV k={fmt === 'american' ? 'American odds' : 'Decimal odds'} v={showAsk(f.ask, fmt)} />}
            <KV k={`Taker fee at ${f.ask}¢`} v={`${f.fee}¢`} />
            <KV k="Fee-aware break-even" v={`${f.breakEven}¢ · ${f.breakEven}%`} strong />
          </div>
          <p className="v3c-foot">Prices are Kalshi YES asks before fees. SIFT shows no bet buttons.</p>
        </>
      ) : g.reason === 'not-tradable' ? (
        <div className="v3c-none" role="status" data-state="not-tradable" data-market-status={g.marketStatus ?? undefined}>
          <b>{nonTradableTitle(g.marketStatus ?? 'unknown') ?? 'Not tradable'}</b>
          <span>{nonTradableNote(g.marketStatus ?? 'unknown')}</span>
        </div>
      ) : (
        <div className="v3c-none" role="status" data-state="unavailable">
          <b>Price unavailable right now</b>
          <span>No reliable quote could be obtained. Nothing is estimated.</span>
          <button type="button" className="v3c-btn is-pri" onClick={() => void retry()} disabled={busy}>{busy ? 'Retrying' : 'Retry'}</button>
        </div>
      )}

      {info?.note && <p className="v3c-foot">{info.note}</p>}

      {info?.neighbours && info.neighbours.length > 1 && (
        <section className="v3c-nb" aria-label="Neighbouring rungs">
          <div className="v3c-eyebrow">Neighbouring rungs</div>
          {info.neighbours.map((n) => {
            const np = gate(newerPrice(n.price, priceOfQuote(live.quote(n.ticker))), { kind: 'list', startMs: ctx.startMs, live: ctx.live }, now).price;
            return (
              <button key={n.ticker} type="button" className="v3c-nr" aria-pressed={n.ticker === tk} onClick={() => open(n.ticker)}>
                <b>{n.label}</b><span className="num v3c-m">{np?.ask != null ? fmtCents(np.ask) : '—'}</span>{n.note && <small>{n.note}</small>}
              </button>
            );
          })}
        </section>
      )}

      {info?.actions && info.actions.length > 0 && (
        <div className="v3c-acts">
          {info.actions.map((a) => <Link key={a.to} to={a.to} className={`v3c-btn${a.primary ? ' is-pri' : ''}`}>{a.label}</Link>)}
        </div>
      )}
    </div>
  );
}

registerSheet('contract', { title: () => 'Exact contract', tall: false, render: (tk) => <ContractBody tk={tk} key={tk ?? 'none'} /> });
