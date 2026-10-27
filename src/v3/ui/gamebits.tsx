import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../../routing';
import { useNow } from '../../live/hooks';
import { usablePrice } from '../data/quoteGate';
import { showAsk } from '../model/format';
import { clockTime } from '../model/time';
import { routes } from '../nav/routes';
import { GAME_TABS, type GameTab } from '../nav/schemas';
import { usePrefs } from '../state/prefs';
import type { MarketLine, Price, V3Game } from '../model/types';
import { useSheet } from './Sheet';
import { publishLine, type GameFacts } from './gameContracts';

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

/** A score the app cannot show says so. (A score feed that has gone quiet is withheld upstream, in the slate: no old score is dressed up as current.) */
export function scoreSourceWord(g: V3Game): string | null {
  if (g.score) return null;
  return g.phase === 'live' || g.phase === 'final' ? 'Score unavailable' : null;
}

// ------------------------------------------------------------------ prices

/**
 * The list-context quote gate for one game: returns the price only if its observation is within the approved maximum for a list row
 * (180/90/60 s by start tier), else null. `startMs` is the schedule authority's start (never Kalshi metadata); `live` is the game phase.
 * Nothing about the decision is ever printed: a withheld price is "—" in the same slot.
 */
export function useListGate(g: Pick<V3Game, 'phase'>, startMs: number | null | undefined): (p: Price | null | undefined) => Price | null {
  const now = useNow(5_000);
  const live = g.phase === 'live';
  return useCallback((p) => usablePrice(p, { kind: 'list', startMs: startMs ?? null, live }, now), [startMs, live, now]);
}

/** A gated price slot: "54¢" (or the viewer's chosen format), or "—" when the gate withheld the price. Same slot either way. */
export function PriceText({ p }: { p: Price | null }) {
  const fmt = usePrefs().priceFormat;
  return <span>{p && p.ask != null ? showAsk(p.ask, fmt) : '—'}</span>;
}

/**
 * Open the shared exact-contract sheet for a line (or one of its rungs): publishes what this screen knows about the line's contracts,
 * then pushes `?sheet=contract&tk=…`. The sheet applies the contract gate and shows "Price unavailable right now" when it must.
 */
export function useOpenContract() {
  const sheet = useSheet();
  return useCallback((f: GameFacts, line: MarketLine) => sheet.openAddressed('contract', publishLine(f, line)), [sheet]);
}

/** The compact line box on a game row: the main Kalshi spread and total (labelled as Kalshi, never as a sportsbook line). */
export function LinesBox({ g, loading, startMs, gate }: { g: V3Game; loading?: boolean; startMs: number | null; gate: (p: Price | null | undefined) => Price | null }) {
  const open = useOpenContract();
  const sp = g.lines.find((l) => l.kind === 'spread');
  const to = g.lines.find((l) => l.kind === 'total');
  const ml = g.lines.find((l) => l.kind === 'moneyline');
  const shown = [sp, to].filter(Boolean) as MarketLine[];
  if (!shown.length && ml) shown.push(ml);
  if (!shown.length) {
    return <div className="v3-lines v3-lines--empty" aria-label={loading ? 'Loading lines' : 'No lines listed'}>{loading ? <i className="v3-skel" /> : <span>No lines<br />listed</span>}</div>;
  }
  const first = shown[0];
  const priced = shown.map((l) => ({ l, p: gate(l.price) }));
  return (
    <button type="button" className="v3-lines" aria-label={`${priced.map(({ l, p }) => `${l.label} at ${p?.ask != null ? `${p.ask} cents` : 'no price available'}`).join(', ')}. Kalshi market prices. Open market detail`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); open({ g, startMs, detailHref: gameHref(g) }, first); }}>
      {priced.map(({ l, p }) => (
        <span key={l.kind} className="v3-lines__r"><b>{l.label}</b><em><PriceText p={p} /></em></span>
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
