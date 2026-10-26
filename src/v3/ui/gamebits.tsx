import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from '../../routing';
import { ago, breakEvenPct, clockTime, dayWord, fmtCents, quoteState, showAsk, takerFeeCents } from '../model/format';
import { routes } from '../nav/routes';
import { GAME_TABS, type GameTab } from '../nav/schemas';
import { usePrefs } from '../state/prefs';
import type { MarketLine, Price, V3Game } from '../model/types';
import { Icon } from './Icon';
import { useSheet } from './Sheet';

/** A game's address, built by the one route builder. A tab this vocabulary does not know (or the default one) is left out. */
export const gameHref = (g: Pick<V3Game, 'slug' | 'eventId'>, tab?: string) => routes.game({ slug: g.slug, eventId: g.eventId }, tab && (GAME_TABS as readonly string[]).includes(tab) ? { tab: tab as GameTab } : {});
export const teamHref = (t: { slug: string; id: string }) => `/v3/team/${t.slug}/${encodeURIComponent(t.id)}`;

export const leagueLabel = (g: Pick<V3Game, 'sport'>) => (g.sport === 'CFB' ? 'NCAAF' : g.sport === 'CBB' ? 'NCAAB' : g.sport);

/** True once the element has been on screen (stays true): rows fetch their extras only when actually seen. */
export function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** "Q3 6:24" / "Final" / "7:30 PM". The clock is only printed when a source stated it. */
export function statusWord(g: V3Game): string {
  if (g.phase === 'live') return g.score?.clock ?? 'In play';
  if (g.phase === 'final') return 'Final';
  if (g.phase === 'other') return 'Awaiting result';
  return clockTime(g.startMs);
}

/** How a score is sourced, in words the viewer can see. Anything but a publication result says where it came from. */
export function scoreSourceWord(g: V3Game): string | null {
  const s = g.score;
  if (!s) return g.phase === 'live' ? 'Score unavailable' : g.phase === 'final' ? 'Score unavailable' : null;
  if (s.source === 'demo') return null;
  if (s.source === 'score-feed') return s.stale ? 'Last known score' : null;
  return null;
}

// ------------------------------------------------------------------ prices

/** A price printed the prediction-market way: "54¢" with the market's own implied percentage beside it. */
export function PriceText({ p, compact = false }: { p: Price; compact?: boolean }) {
  const fmt = usePrefs().priceFormat;
  if (p.ask == null) return <span>—</span>;
  if (fmt !== 'cents') return <span>{showAsk(p.ask, fmt)}</span>;
  return compact ? <span>{p.ask}¢</span> : <span>{p.ask}¢ <span className="v3-dim">· {Math.round(p.implied ?? p.ask)}% implied</span></span>;
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="v3-kv"><span>{k}</span><b>{v}</b></div>;
}

const STATE_WORD = { fresh: 'Fresh', aging: 'Aging', stale: 'Stale', unknown: 'Time unknown' } as const;

/** The exact contract behind a chip: ticker, side, line, bid/ask, fee-aware break-even and the quote's true age. */
export function MarketDetail({ g, line }: { g: V3Game; line: MarketLine }) {
  const fmt = usePrefs().priceFormat;
  const [sel, setSel] = useState<Price>(line.price);
  const q = quoteState(sel.observedAt);
  const demo = sel.source === 'Sample';
  const fee = sel.ask != null ? takerFeeCents(sel.ask) : null;
  const be = sel.ask != null ? breakEvenPct(sel.ask) : null;
  const usable = sel.ask != null && (q === 'fresh' || q === 'aging' || demo);
  return (
    <div className="v3-mkt">
      <p className="v3-mkt__q">{sel.description.replace(/^SAMPLE: /, '')}</p>
      <div className="v3-mkt__big">
        {usable ? <><span className="num">{sel.ask}¢</span><small>{Math.round(sel.implied ?? sel.ask!)}% implied · pre-fee</small></> : <small>No current price: {sel.ask == null ? 'no executable ask is listed' : 'the last quote is stale'}</small>}
      </div>
      <p className="v3-note">Market-implied probability from the venue's own price. It is not a SIFT model probability.</p>
      <div className="v3-kvs">
        <Row k="Side" v={`${sel.side} (buy)`} />
        <Row k="Bid / ask" v={`${fmtCents(sel.bid)} / ${fmtCents(sel.ask)}`} />
        {fmt !== 'cents' && <Row k={fmt === 'american' ? 'American' : 'Decimal'} v={showAsk(sel.ask, fmt)} />}
        <Row k="Taker fee" v={fee != null ? `≈ ${fee}¢ / contract` : '—'} />
        <Row k="Break-even after fee" v={be != null ? `≈ ${be}%` : '—'} />
        <Row k="Venue" v={`${sel.source}${demo ? ' (sample)' : ''}`} />
        <Row k="Ticker" v={<code>{sel.ticker}</code>} />
        <Row k="Quote" v={demo ? 'Sample quote' : <>{ago(sel.observedAt)} · <span className={`v3-fresh v3-fresh--${q}`}>{STATE_WORD[q]}</span></>} />
        {sel.volume != null && <Row k="Volume" v={Math.round(sel.volume).toLocaleString()} />}
      </div>
      {!usable && !demo && <div className="v3-state v3-state--warn" style={{ marginTop: 12 }}><Icon name="clock" size={18} /><div><b>Not a current price</b>This quote is too old to show as a price. Research stays available; SIFT shows nothing as actionable without a fresh quote.</div></div>}
      {line.alternates && line.alternates.length > 1 && (
        <>
          <h3 className="v3-mkt__h">{line.kind === 'spread' ? 'Spread ladder' : line.kind === 'total' ? 'Total ladder' : 'Both sides'}</h3>
          <ul className="v3-ladder">
            {line.alternates.map((a) => (
              <li key={a.ticker}>
                <button type="button" aria-pressed={a.ticker === sel.ticker} onClick={() => setSel(a)}>
                  <span>{a.description.replace(/^SAMPLE: /, '').replace(/^YES iff /, '')}</span><b>{a.ask != null ? `${a.ask}¢` : '—'}</b>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="v3-note v3-note--dim">{g.away.abbr} at {g.home.abbr} · {dayWord(g.startMs)} {clockTime(g.startMs)}. SIFT is research: it does not place bets or recommend a price.</p>
    </div>
  );
}

export function useOpenLine() {
  const sheet = useSheet();
  return (g: V3Game, line: MarketLine) => sheet.open(`${line.kind === 'spread' ? 'Spread' : line.kind === 'total' ? 'Total' : 'Win'} · ${line.label}`, <MarketDetail g={g} line={line} />, { tall: true });
}

/** The compact line box on a game row: the main Kalshi spread and total (labelled as Kalshi, never as a sportsbook line). */
export function LinesBox({ g, loading }: { g: V3Game; loading?: boolean }) {
  const open = useOpenLine();
  const sp = g.lines.find((l) => l.kind === 'spread');
  const to = g.lines.find((l) => l.kind === 'total');
  const ml = g.lines.find((l) => l.kind === 'moneyline');
  const shown = [sp, to].filter(Boolean) as MarketLine[];
  if (!shown.length && ml) shown.push(ml);
  if (!shown.length) {
    return <div className="v3-lines v3-lines--empty" aria-label={loading ? 'Loading lines' : 'No lines listed'}>{loading ? <i className="v3-skel" /> : <span>No lines<br />listed</span>}</div>;
  }
  const first = shown[0];
  return (
    <button type="button" className="v3-lines" aria-label={`${shown.map((l) => `${l.label} at ${l.price.ask ?? 'no'} cents`).join(', ')}. Kalshi market prices. Open market detail`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); open(g, first); }}>
      {shown.map((l) => (
        <span key={l.kind} className={`v3-lines__r${quoteState(l.price.observedAt) === 'stale' ? ' is-stale' : ''}`}><b>{l.label}</b><em><PriceText p={l.price} compact /></em></span>
      ))}
    </button>
  );
}

/** Time / state label with the live badge. */
export function StateChip({ g }: { g: V3Game }) {
  if (g.phase === 'live') return <span className="v3-state-live"><span className="v3-livebadge v3-livebadge--sm">LIVE</span>{g.score?.clock ?? ''}</span>;
  return <span>{statusWord(g)}</span>;
}

export { Link };
