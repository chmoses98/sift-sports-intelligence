// The v4 Board's pure view-model. The Board is the face of the research tray (src/state/tray.tsx): saved items stay exactly
// the contract tray items, and the grouping by game, the game-lifecycle and research-run changes come from src/board/model.ts.
// This file adds only what v4 must say that the classic Board does not: which side is being compared, whether the latest
// quote is current enough to compare at all, where a saved contract stands with the publication now, and where a saved item
// opens in v4. It never recalculates an edge, never treats a missing or stale quote as a price, and never reads a favourable
// move as profit: a price move is a price move.
import type { BoardItem } from '../contract/types';
import { gameChanges, type BoardEntry, type Change, type GameGroup } from '../board/model';
import { isFrozen } from '../lib/lifecycle';
import { quoteAgeMs, quoteFreshness, type QuoteFreshness } from '../live/freshness';
import type { LiveQuote } from '../live/types';
import type { Opportunity, Side } from '../opportunity/types';
import { tickerOfMarketId } from '../state/tray';
import { matchSignal, type SignalMatch } from './signal';
import { signalsHref, standingOf, type Standing } from './signalsModel';

/** A price move (in cents) at or beyond which the Board says a saved contract is worth another look. The classic Board's own threshold. */
export const LOOK_AGAIN_CENTS = 5;
export const MOVE_CENTS = 2;

export type PriceState =
  /** Both asks exist and the latest quote is current: the move is stated. */
  | 'compared'
  /** The latest quote exists but is stale or undated: shown as context, never compared. */
  | 'stale'
  /** The contract is not open for trading on the live market. */
  | 'closed'
  /** No current quote for this contract and side. */
  | 'noQuote'
  /** No quote was on screen when it was saved: there is no saved price to compare. */
  | 'noSaved'
  /** Not a market save, or its contract cannot be identified. */
  | 'none';

export interface PriceLine {
  state: PriceState;
  side: Side;
  /** The side's ask when saved (dollars), and when that quote was captured. */
  savedAsk: number | null;
  savedAt: string | null;
  /** The side's latest ask, its own capture time and freshness. Present for 'compared' and 'stale'. */
  nowAsk: number | null;
  nowAt: string | null;
  freshness: QuoteFreshness;
  ageMs: number | null;
  /** Latest minus saved, in whole cents; only for 'compared'. */
  moveCents: number | null;
}

const NONE: Omit<PriceLine, 'state' | 'side'> = { savedAsk: null, savedAt: null, nowAsk: null, nowAt: null, freshness: 'UNKNOWN', ageMs: null, moveCents: null };

/** The saved price against the same contract's latest quote, on the SAVED side. A quote that is not current is context, never a comparison. */
export function priceLine(e: BoardEntry, side: Side, quote: (ticker: string) => LiveQuote | undefined, now: number): PriceLine {
  const snap = e.label?.market ?? null;
  const ticker = snap?.ticker ?? tickerOfMarketId(e.item.extra?.market_id ?? (e.item.ref_kind === 'MARKET' ? e.item.id : null));
  if (e.item.ref_kind !== 'MARKET' || !ticker) return { ...NONE, state: 'none', side };
  const savedAsk = snap ? (side === 'NO' ? snap.noAsk : snap.yesAsk) : null;
  const savedAt = snap?.observedAt ?? null;
  const q = quote(ticker);
  const nowAsk = q ? (side === 'NO' ? q.noAsk : q.yesAsk) : null;
  const base = { ...NONE, savedAsk, savedAt, side };
  if (!snap || savedAsk == null) return { ...base, state: 'noSaved', ...(q && nowAsk != null ? { nowAsk, nowAt: q.observedAt, freshness: quoteFreshness(q.observedAt, now), ageMs: quoteAgeMs(q.observedAt, now) } : {}) };
  if (!q) return { ...base, state: 'noQuote' };
  if (q.availability !== 'OPEN') return { ...base, state: 'closed', nowAt: q.observedAt };
  if (nowAsk == null) return { ...base, state: 'noQuote' };
  const freshness = quoteFreshness(q.observedAt, now);
  const ageMs = quoteAgeMs(q.observedAt, now);
  const current = freshness === 'FRESH' || freshness === 'AGING';
  return { ...base, state: current ? 'compared' : 'stale', nowAsk, nowAt: q.observedAt, freshness, ageMs, moveCents: current ? Math.round((nowAsk - savedAsk) * 100) : null };
}

// ------------------------------------------------------------------ where a saved item opens in v4

export type Target =
  | { kind: 'prop' | 'game' | 'signals' | 'players' | 'markets'; to: string; label: string }
  /** No native v4 screen for it yet: the SIFT 2.0 address it was saved with. */
  | { kind: 'classic'; to: string; label: string }
  | { kind: 'none' };

const slugOf = (sport: string) => sport.toLowerCase();

/** The v4 address of a saved item, keeping sport, game, market and side. Items with no v4 screen open the SIFT 2.0 page they were saved from. */
export function targetOf(e: BoardEntry, side: Side, hasSignal: boolean): Target {
  const { item, label } = e;
  const slug = slugOf(item.sport);
  const eventId = e.eventId;
  const href = label?.href ?? '';
  if (item.ref_kind === 'MARKET') {
    const market = item.extra?.market_id ?? item.id;
    const prop = /[?&]prop=([^&]+)/.exec(href);
    if (prop && slug === 'nfl' && eventId) {
      const [playerId, stat] = decodeURIComponent(prop[1]).split('|');
      if (playerId && stat) return { kind: 'prop', label: 'Open prop', to: `/v4/props/${slug}/${encodeURIComponent(eventId)}/${encodeURIComponent(playerId)}?stat=${encodeURIComponent(stat)}${side === 'NO' ? '&side=under' : ''}` };
    }
    if (hasSignal) return { kind: 'signals', label: 'Open signals', to: signalsHref({ sport: slug, game: eventId, market, side }) };
    if (eventId) return { kind: 'markets', label: 'Open game markets', to: `/v4/game/${slug}/${encodeURIComponent(eventId)}?tab=markets` };
  } else if (item.ref_kind === 'EVENT' && eventId) {
    return { kind: 'game', label: 'Open game', to: `/v4/game/${slug}/${encodeURIComponent(eventId)}` };
  } else if (item.ref_kind === 'PLAYER' && eventId) {
    return { kind: 'players', label: 'Open game players', to: `/v4/game/${slug}/${encodeURIComponent(eventId)}?tab=players` };
  } else if (eventId && (e.group === 'thesis' || e.group === 'scripts' || e.group === 'findings')) {
    return { kind: 'game', label: 'Open game', to: `/v4/game/${slug}/${encodeURIComponent(eventId)}` };
  }
  return href ? { kind: 'classic', to: href, label: 'Open in SIFT 2.0' } : { kind: 'none' };
}

// ------------------------------------------------------------------ one saved item, as the Board shows it

export interface BoardCtx {
  now: number;
  quote: (ticker: string) => LiveQuote | undefined;
  opps: readonly Opportunity[];
  /** Whether a sport's publication was read: true, false (it could not be), or null while loading. */
  sportRead: (sport: string) => boolean | null;
}

export interface EntryView {
  entry: BoardEntry;
  /** The selected side. A save made before sides were recorded carries none and has always meant YES. */
  side: Side;
  sideRecorded: boolean;
  price: PriceLine;
  /** The exact-side published signal match for a saved market, and where it stands now; null for items that are not markets. */
  signal: SignalMatch | null;
  standing: Standing | null;
  /** Pregame research is frozen for this item's game: it started, ended or is no longer scheduled. */
  frozen: boolean;
  target: Target;
}

export function entryView(e: BoardEntry, g: GameGroup, board: BoardItem | undefined, ctx: BoardCtx): EntryView {
  const side: Side = e.label?.side ?? 'YES';
  const market = e.item.ref_kind === 'MARKET' ? e.item.extra?.market_id ?? e.item.id : null;
  const signal = market ? matchSignal(ctx.opps, market, side, ctx.now, e.item.sport) : null;
  const opp = signal && (signal.kind === 'valid' || signal.kind === 'ineligible' || signal.kind === 'passed' || signal.kind === 'watch') ? signal.opp : null;
  const kickoff = g.start ?? e.label?.kickoff ?? null;
  const frozen = (kickoff != null || board?.status != null) && isFrozen(kickoff, ctx.now, board?.status ?? null);
  return {
    entry: e, side, sideRecorded: !!e.label?.side,
    price: priceLine(e, side, ctx.quote, ctx.now),
    signal, standing: opp ? standingOf(opp, ctx.now) : null,
    frozen,
    target: targetOf(e, side, !!signal && signal.kind !== 'none'),
  };
}

/** Why a saved game has no live detail: its publication could not be read (missing data), or it is no longer on the board it was saved from. */
export function gameState(g: GameGroup, board: BoardItem | undefined, ctx: BoardCtx): { kind: 'ok' } | { kind: 'unreadable'; why: string } | { kind: 'gone'; why: string } {
  if (!g.eventId || board) return { kind: 'ok' };
  const read = ctx.sportRead(g.sport);
  if (read === false) return { kind: 'unreadable', why: `The ${g.sport} publication could not be read, so this game's status and research updates are unavailable. Nothing here says it changed.` };
  if (read === true) return { kind: 'gone', why: 'This game is no longer on the publication’s board (finished and removed, or not published). Your saved research is kept; it cannot be compared with anything newer.' };
  return { kind: 'ok' };
}

// ------------------------------------------------------------------ what deserves another look

export interface LookReason {
  key: string;
  entry: BoardEntry;
  game: GameGroup;
  /** price: a move on the saved side; game: the lifecycle or a newer research run; signal: the publication's current word on the contract. */
  kind: 'price' | 'game' | 'signal';
  text: string;
}

/** Plain, neutral reasons a saved item or game deserves another look, from evidence the Board holds: nothing here says to act. */
export function lookAgain(groups: readonly GameGroup[], views: ReadonlyMap<string, EntryView>, boards: ReadonlyMap<string, BoardItem>): LookReason[] {
  const out: LookReason[] = [];
  for (const g of groups) {
    const board = g.eventId ? boards.get(g.eventId) : undefined;
    const oldest = g.entries.reduce((m, e) => (e.savedAt < m ? e.savedAt : m), g.entries[0]?.savedAt ?? new Date(0).toISOString());
    const first = g.entries[0];
    if (first) {
      const changes: Change[] = gameChanges(g, board, oldest).filter((c) => c.reassess);
      changes.forEach((c, i) => out.push({ key: `${g.key}:g${i}`, entry: first, game: g, kind: 'game', text: c.text }));
    }
    for (const e of g.entries) {
      const v = views.get(e.item.item_id);
      if (!v) continue;
      const p = v.price;
      if (p.state === 'compared' && p.moveCents != null && Math.abs(p.moveCents) >= LOOK_AGAIN_CENTS && p.savedAsk != null && p.nowAsk != null) {
        out.push({ key: `${e.item.item_id}:p`, entry: e, game: g, kind: 'price', text: `${v.side} ask ${p.moveCents > 0 ? 'up' : 'down'} ${Math.abs(p.moveCents)}¢ since saved (${Math.round(p.savedAsk * 100)}¢ → ${Math.round(p.nowAsk * 100)}¢). A price move is not a profit or a loss.` });
      }
      if (v.signal?.kind === 'valid') out.push({ key: `${e.item.item_id}:s`, entry: e, game: g, kind: 'signal', text: `A published research signal currently covers this contract on the ${v.side} side.` });
      else if (v.signal?.kind === 'passed') out.push({ key: `${e.item.item_id}:s`, entry: e, game: g, kind: 'signal', text: `The publication reviewed this contract and passed: ${v.signal.opp.statusReason}` });
    }
  }
  return out;
}
