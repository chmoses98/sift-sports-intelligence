// My SIFT's lists beside Following: Saved research, Recent, and the contract Watchlist. Each row opens its exact address in one tap and has its own
// Remove; every removal can be undone for a few seconds. The Watchlist reads each contract's CURRENT price through the quote gate (data/quoteGate.ts),
// the same rule as everywhere: a price that may not be shown is withheld and the reason is printed, never a bare dash. Watching sends nothing:
// SIFT has no alert delivery, and this screen says so.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from '../../routing';
import { useNow } from '../../live/hooks';
import { explainGate, gate, type QuoteContext } from '../data/quoteGate';
import { useRowGroups } from '../data/liveQuotes';
import { newerPrice, priceOfQuote } from '../model/contract';
import { fmtCents, showAsk } from '../model/format';
import { clockTime } from '../model/time';
import { visitKey, type Visit, type WatchItem } from '../model/workspace';
import { clearVisits, dropVisit, removeSaved, restoreVisits, rewatch, saveResearch, unwatchContract, usePrefs, type SavedResearch } from '../state/prefs';
import { contractInfo } from '../ui/ContractSheet';
import { Icon } from '../ui/Icon';

const KIND_WORD = { player: 'Player', team: 'Team', stat: 'Statistic', game: 'Game', props: 'Props', other: 'Research' } as const;
const VISIT_WORD: Record<Visit['kind'], string> = { player: 'Player', team: 'Team', game: 'Game', stat: 'Statistic', research: 'Research' };

// ---------------------------------------------------------------- undo

/** "Removed X. Undo" for a few seconds after a removal. */
function UndoBar({ undo, onClear }: { undo: { msg: string; run: () => void } | null; onClear: () => void }) {
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(onClear, 8000);
    return () => window.clearTimeout(t);
  }, [undo, onClear]);
  if (!undo) return null;
  return (
    <div className="v3-undo" role="status">
      <span>{undo.msg}</span>
      <button type="button" onClick={() => { undo.run(); onClear(); }}>Undo</button>
    </div>
  );
}

function useUndo() {
  const [undo, setUndo] = useState<{ msg: string; run: () => void } | null>(null);
  return { undo, offer: (msg: string, run: () => void) => setUndo({ msg, run }), clear: () => setUndo(null) };
}

const RemoveBtn = ({ label, word = 'Remove', onClick }: { label: string; word?: string; onClick: () => void }) => (
  <button type="button" className="v3-rm" aria-label={label} onClick={onClick}><Icon name="close" size={16} />{word}</button>
);

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="v3-wempty"><h2>{title}</h2><p className="v3-note">{children}</p></div>;
}

// ---------------------------------------------------------------- saved

export function SavedPanel({ saved, all, sport }: { saved: SavedResearch[]; all: number; sport: string | null }) {
  const u = useUndo();
  const restore = (s: SavedResearch) => saveResearch({ title: s.title, subtitle: s.subtitle, route: s.route, chips: s.chips, snapshot: s.snapshot, kind: s.kind, sport: s.sport });
  return (
    <section aria-label="Saved research">
      <div className="v3-sechead"><h2>Saved research{saved.length > 0 && <span className="v3-fcount"> · {saved.length}</span>}</h2></div>
      <UndoBar undo={u.undo} onClear={u.clear} />
      {saved.length ? (
        <ul className="v3-hits">{saved.map((s) => (
          <li key={s.id} className="v3-hit v3-hit--saved">
            <Link to={s.route} className="v3-hit__l" aria-label={`Reopen ${s.title}: ${s.subtitle}`}>
              <span className="v3-hit__t">
                <span className="v3-kind">{KIND_WORD[s.kind]}{s.sport ? ` · ${s.sport.toUpperCase()}` : ''}</span>
                <b>{s.title}</b><small>{s.subtitle}</small>
                {s.chips.length > 0 && <span className="v3-chiplist" aria-label="Saved setup">{s.chips.map((c) => <i key={c} className="v3-chipx">{c}</i>)}</span>}
                {s.snapshot && <span className="v3-snap">Saved values: {s.snapshot.map((x) => `${x.label} ${x.value}`).join(' · ')}</span>}
              </span>
              <Icon name="chevR" size={20} />
            </Link>
            <RemoveBtn label={`Remove saved ${s.title}`} onClick={() => { removeSaved(s.id); u.offer(`Removed ${s.title}`, () => restore(s)); }} />
          </li>
        ))}</ul>
      ) : sport && all > 0 ? <p className="v3-note">No saved research in {sport.toUpperCase()}.</p>
        : <Empty title="Nothing saved yet">Tap the bookmark on a player, a statistic or a Discover prop to save the exact setup: stat, line, window and filters come back as you left them. Saved items keep no price; open one to see the current numbers.</Empty>}
      {saved.length === 0 && all === 0 && <Link to="/v3/props" className="v3-btn"><Icon name="search" size={18} /> Browse Discover</Link>}
    </section>
  );
}

// ---------------------------------------------------------------- recent

export function RecentPanel({ visits, all, sport }: { visits: Visit[]; all: Visit[]; sport: string | null }) {
  const u = useUndo();
  return (
    <section aria-label="Recently viewed">
      <div className="v3-sechead">
        <h2>Recently viewed{visits.length > 0 && <span className="v3-fcount"> · {visits.length}</span>}</h2>
        {all.length > 0 && <button type="button" className="v3-link" onClick={() => { const before = all; clearVisits(); u.offer('Cleared recently viewed', () => restoreVisits(before)); }}>Clear all</button>}
      </div>
      <UndoBar undo={u.undo} onClear={u.clear} />
      {visits.length ? (
        <ul className="v3-hits">{visits.map((v) => (
          <li key={visitKey(v)} className="v3-hit v3-hit--recent">
            <Link to={v.route} className="v3-hit__l" aria-label={`Open ${v.title}`}>
              <span className="v3-av">{v.logo ? <img src={v.logo} alt="" width="40" height="40" /> : <Icon name={v.kind === 'stat' ? 'trend' : v.kind === 'game' ? 'ball' : v.kind === 'research' ? 'list' : 'user'} size={22} />}</span>
              <span className="v3-hit__t"><span className="v3-kind">{VISIT_WORD[v.kind]}{v.slug ? ` · ${v.slug.toUpperCase()}` : ''}</span><b>{v.title}</b><small>{v.subtitle}</small></span>
              <Icon name="chevR" size={20} />
            </Link>
            <RemoveBtn word="" label={`Remove ${v.title} from recently viewed`} onClick={() => { const before = all; dropVisit(visitKey(v)); u.offer(`Removed ${v.title}`, () => restoreVisits(before)); }} />
          </li>
        ))}</ul>
      ) : sport && all.length ? <p className="v3-note">Nothing recently viewed in {sport.toUpperCase()}.</p>
        : <Empty title="Nothing viewed yet">Games, teams, players, statistics and Discover props you open are listed here, newest first, so you can get back to them in one tap. The list stays on this device.</Empty>}
    </section>
  );
}

// ---------------------------------------------------------------- watchlist

function WatchRow({ w, q, now, onRemove }: { w: WatchItem; q: ReturnType<typeof useRowGroups>; now: number; onRemove: () => void }) {
  const fmt = usePrefs().priceFormat;
  const info = contractInfo(w.ticker);
  const ctx: QuoteContext = { kind: 'list', startMs: w.startMs, live: false };
  // The newest observation wins (the live store's quote, else what a screen opened this visit knows); then the one quote gate decides if it may be printed.
  const price = newerPrice(info?.price, priceOfQuote(q.quote(w.ticker), w.title));
  const g = gate(price, ctx, now);
  const why = g.price ? null : explainGate(g, ctx, now, (ms) => clockTime(ms));
  return (
    <li className="v3-hit v3-hit--watch" data-ticker={w.ticker}>
      <Link to={w.route} className="v3-hit__l" aria-label={`Open contract ${w.title}`}>
        <span className="v3-hit__t">
          <span className="v3-kind">Kalshi · {w.ticker}</span>
          <b>{w.title}</b><small>{w.subtitle}</small>
        </span>
        <Icon name="chevR" size={20} />
      </Link>
      <div className="v3-wfoot">
        <div className="v3-wpx" data-state={g.price ? 'price' : 'withheld'}>
          {g.price?.ask != null
            ? <><span className="v3-wpx__k">Current ask</span><b className="num">{fmt === 'cents' ? fmtCents(g.price.ask) : showAsk(g.price.ask, fmt)}</b></>
            : <><span className="v3-wpx__k">Price not shown</span>{why && <span className="v3-wwhy" data-why={why.short}><span>{why.short}.</span> {why.detail}</span>}</>}
        </div>
        <RemoveBtn label={`Stop watching ${w.title}`} word="Unwatch" onClick={onRemove} />
      </div>
    </li>
  );
}

export function WatchlistPanel({ items }: { items: WatchItem[] }) {
  const u = useUndo();
  const now = useNow(5_000);
  // One rows scope per game start (the start tiers how current a price must be); the same hook every list screen uses.
  const groups = useMemo(() => {
    const by = new Map<number | null, string[]>();
    for (const w of items) by.set(w.startMs, [...(by.get(w.startMs) ?? []), w.ticker]);
    return [...by].map(([startMs, tickers]) => ({ startMs, live: false, tickers }));
  }, [items]);
  const q = useRowGroups(groups);
  const last = useRef(items);
  last.current = items;
  return (
    <section aria-label="Watchlist">
      <div className="v3-sechead"><h2>Watchlist{items.length > 0 && <span className="v3-fcount"> · {items.length}</span>}</h2></div>
      <p className="v3-note v3-note--dim v3-wnote">A list to check, not an alert. SIFT does not send notifications yet: prices update here while this tab is open.</p>
      <UndoBar undo={u.undo} onClear={u.clear} />
      {items.length ? (
        <ul className="v3-hits">{items.map((w) => <WatchRow key={w.ticker} w={w} q={q} now={now} onRemove={() => { unwatchContract(w.ticker); u.offer(`Stopped watching ${w.title}`, () => rewatch(w)); }} />)}</ul>
      ) : <Empty title="No contracts watched">Open a contract (tap any Kalshi price in Discover, a player page or a game) and press Watch. It is listed here with its current price, or the reason the price is not shown.</Empty>}
      {items.length === 0 && <Link to="/v3/props" className="v3-btn"><Icon name="search" size={18} /> Find contracts in Discover</Link>}
    </section>
  );
}
