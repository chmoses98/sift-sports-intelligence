// The research tray: contract research_tray items (references, never payloads) persisted in local
// storage, plus a small label cache so the tray can render before any document is fetched.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isFrozen } from '../lib/lifecycle';
import { makeTray, makeTrayItem, type RefKind, type TrayDoc, type TrayExtra, type TrayItem } from '../packet/tray';
import { liveStore } from '../live/hooks';

export const TRAY_KEY = 'sift.researchTray.v1';

export interface TrayLabel {
  label: string;
  sub?: string;
  href: string;
  /** The game's scheduled kickoff (UTC) for game-scoped items: lets the tray mark them as pregame research. */
  kickoff?: string | null;
  /** Set when the item is a research finding (research/findings.ts): what kind of thing it is. */
  finding?: string;
  /**
   * For a saved market: the exact contract and the quote seen when it was saved (My Board's "what changed since
   * saved" compares this same ticker only — a different threshold is a different contract, never a price move).
   */
  market?: MarketSnapshot | null;
  /** When the item was saved (ISO); older saves fall back to the tray item's added_at. */
  savedAt?: string;
}

export interface MarketSnapshot {
  ticker: string;
  yesAsk: number | null;
  yesBid: number | null;
  noAsk: number | null;
  noBid: number | null;
  /** The quote's own observation time (never the save time); null when no quote was on screen. */
  observedAt: string | null;
  source: string | null;
}

/** The Kalshi ticker a Sift market id carries ("mkt_kalshi_<TICKER>"), or null. */
export const tickerOfMarketId = (id: string | null | undefined): string | null => (id && id.startsWith('mkt_kalshi_') ? id.slice('mkt_kalshi_'.length) : null);

/** The quote on screen for a ticker when it is saved (the live store holds whatever the page subscribed to). */
export function snapshotOf(ticker: string | null): MarketSnapshot | null {
  if (!ticker) return null;
  const q = liveStore().quote(ticker);
  return { ticker, yesAsk: q?.yesAsk ?? null, yesBid: q?.yesBid ?? null, noAsk: q?.noAsk ?? null, noBid: q?.noBid ?? null, observedAt: q?.observedAt ?? null, source: q?.source ?? null };
}

interface Stored {
  tray: TrayDoc;
  labels: Record<string, TrayLabel>;
}

export interface TrayAdd {
  ref_kind: RefKind;
  sport: string;
  id: string;
  extra?: Partial<TrayExtra> | null;
  note?: string | null;
  label: TrayLabel;
  /**
   * The scheduled kickoff of the game this item belongs to (game-scoped items only). Once it has passed,
   * the item is refused: new pregame research can't be saved after kickoff (lib/lifecycle.ts).
   */
  kickoff?: string | null;
  eventStatus?: string | null;
}

interface TrayApi {
  tray: TrayDoc;
  labels: Record<string, TrayLabel>;
  open: boolean;
  setOpen: (o: boolean) => void;
  /** null when refused (the game has kicked off and the item is not already saved). */
  add: (a: TrayAdd) => TrayItem | null;
  remove: (itemId: string) => void;
  clear: () => void;
  has: (ref_kind: RefKind, id: string, extra?: Partial<TrayExtra> | null) => boolean;
  setNote: (itemId: string, note: string) => void;
  lastAdded: string | null;
}

export function loadStored(storage: Storage | undefined = globalThis.localStorage): Stored {
  try {
    const raw = storage?.getItem(TRAY_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Stored;
      if (s?.tray?.kind === 'research_tray' && Array.isArray(s.tray.items)) return { tray: s.tray, labels: s.labels ?? {} };
    }
  } catch {
    /* a corrupt or unavailable store starts an empty tray */
  }
  return { tray: makeTray([], new Date()), labels: {} };
}

export function saveStored(s: Stored, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(TRAY_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the tray still works for this session */
  }
}

const Ctx = createContext<TrayApi | null>(null);

export function TrayProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Stored>(() => loadStored());
  const [open, setOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  useEffect(() => saveStored(stored), [stored]);

  // Another tab changed the tray.
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key === TRAY_KEY) setStored(loadStored());
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  const add = useCallback((a: TrayAdd) => {
    if (isFrozen(a.kickoff, Date.now(), a.eventStatus)) return null;
    const item = makeTrayItem({ ref_kind: a.ref_kind, sport: a.sport, id: a.id, extra: a.extra, note: a.note, added_at: new Date() });
    setStored((s) => {
      if (s.tray.items.some((i) => i.item_id === item.item_id)) return s;
      const market = a.label.market ?? (a.ref_kind === 'MARKET' ? snapshotOf(tickerOfMarketId(a.extra?.market_id ?? a.id)) : null);
      const label: TrayLabel = { ...a.label, ...(a.kickoff ? { kickoff: a.kickoff } : {}), ...(market ? { market } : {}), savedAt: new Date().toISOString() };
      return { tray: makeTray([...s.tray.items, item], new Date()), labels: { ...s.labels, [item.item_id]: label } };
    });
    setLastAdded(item.item_id);
    return item;
  }, []);

  const remove = useCallback((itemId: string) => {
    setStored((s) => {
      const labels = { ...s.labels };
      delete labels[itemId];
      return { tray: makeTray(s.tray.items.filter((i) => i.item_id !== itemId), new Date()), labels };
    });
  }, []);

  const clear = useCallback(() => setStored({ tray: makeTray([], new Date()), labels: {} }), []);

  const setNote = useCallback((itemId: string, note: string) => {
    setStored((s) => ({
      ...s,
      tray: makeTray(s.tray.items.map((i) => (i.item_id === itemId ? { ...i, note: note.trim() ? note : null } : i)), new Date()),
    }));
  }, []);

  const has = useCallback(
    (ref_kind: RefKind, id: string, extra?: Partial<TrayExtra> | null) => {
      const probe = makeTrayItem({ ref_kind, sport: 'NFL', id, extra, added_at: new Date(0) });
      return stored.tray.items.some((i) => i.item_id === probe.item_id);
    },
    [stored],
  );

  const api = useMemo<TrayApi>(
    () => ({ tray: stored.tray, labels: stored.labels, open, setOpen, add, remove, clear, has, setNote, lastAdded }),
    [stored, open, add, remove, clear, has, setNote, lastAdded],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useTray(): TrayApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTray outside TrayProvider');
  return v;
}
