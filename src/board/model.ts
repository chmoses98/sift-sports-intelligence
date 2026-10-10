// MY BOARD — the consumer face of the research tray. Saved items stay contract research_tray items underneath
// (the packet builder reads them unchanged); the Board organises them by game and answers "what changed since I
// saved this?" from evidence Sift actually has:
//   * a saved market's own contract (same ticker) priced again now — never a different threshold or contract;
//   * the game's lifecycle (started, final, postponed) from its publication's board;
//   * the publication's research run being newer than the save (the thesis may need a fresh look).
// No recalculated edge is ever implied: a price move is a price move.
import type { BoardItem } from '../contract/types';
import type { TrayItem } from '../packet/tray';
import type { MarketSnapshot, TrayLabel } from '../state/tray';
import type { LiveQuote } from '../live/types';
import { eventPhase, type EventPhase } from '../opportunity/lifecycle';

export type BoardGroupKey = 'thesis' | 'players' | 'props' | 'markets' | 'scripts' | 'findings' | 'other';

export const GROUP_WORD: Record<BoardGroupKey, string> = {
  thesis: 'Game thesis', players: 'Players', props: 'Props', markets: 'Markets', scripts: 'Game scripts', findings: 'Research findings', other: 'Other research',
};

export interface BoardEntry {
  item: TrayItem;
  label: TrayLabel | undefined;
  eventId: string | null;
  group: BoardGroupKey;
  savedAt: string;
}

export interface GameGroup {
  key: string;
  eventId: string | null;
  sport: string;
  /** "BUF @ LA" from the publication's board, else the best label the saves carry. */
  title: string;
  start: string | null;
  phase: EventPhase | null;
  href: string | null;
  entries: BoardEntry[];
}

/** The game a saved item belongs to: its own reference, the market's event, or the game in its address. */
export function eventIdOf(item: TrayItem, label: TrayLabel | undefined): string | null {
  if (item.ref_kind === 'EVENT') return item.id;
  if (item.extra?.event_id) return item.extra.event_id;
  const href = label?.href ?? '';
  const m = href.match(/\/game\/(evt_[A-Za-z0-9]+)/) ?? href.match(/[?&]event=(evt_[A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

export function groupOf(item: TrayItem, label: TrayLabel | undefined): BoardGroupKey {
  const f = label?.finding;
  if (f === 'script') return 'scripts';
  if (f === 'prop' || f === 'projection') return 'props';
  if (f === 'market') return 'markets';
  if (f) return 'findings';
  if (item.ref_kind === 'EVENT') return 'thesis';
  if (item.ref_kind === 'PLAYER') return 'players';
  if (item.ref_kind === 'MARKET') return /prop|yards|receptions|points|shots|saves|strikeouts|bases|goals|assists/i.test(label?.label ?? '') ? 'props' : 'markets';
  if (item.ref_kind === 'PROJECTION') return 'props';
  return 'other';
}

const GROUP_ORDER: BoardGroupKey[] = ['thesis', 'players', 'props', 'markets', 'scripts', 'findings', 'other'];

/** Every saved item, by game (soonest first, games without a start last), each game's items in a fixed group order. */
export function boardGroups(items: TrayItem[], labels: Record<string, TrayLabel>, boards: Map<string, BoardItem>, now: number): GameGroup[] {
  const groups = new Map<string, GameGroup>();
  for (const item of items) {
    const label = labels[item.item_id];
    const eventId = eventIdOf(item, label);
    const key = eventId ? `${item.sport}:${eventId}` : `${item.sport}:none`;
    let g = groups.get(key);
    if (!g) {
      const b = eventId ? boards.get(eventId) : undefined;
      const title = b ? boardTitle(b, item.sport) : item.ref_kind === 'EVENT' && label ? label.label : eventId ? 'Saved game' : `${item.sport} research`;
      g = { key, eventId, sport: item.sport, title, start: b?.start_time_utc ?? label?.kickoff ?? null, phase: b ? eventPhase(b, now).phase : null, href: eventId ? `/${item.sport.toLowerCase()}/game/${eventId}` : null, entries: [] };
      groups.set(key, g);
    }
    g.entries.push({ item, label, eventId, group: groupOf(item, label), savedAt: label?.savedAt ?? item.added_at });
  }
  for (const g of groups.values()) g.entries.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || b.savedAt.localeCompare(a.savedAt));
  return [...groups.values()].sort((a, b) => (a.eventId ? 0 : 1) - (b.eventId ? 0 : 1) || (a.start ?? '9').localeCompare(b.start ?? '9'));
}

export function boardTitle(b: BoardItem, sport: string): string {
  const away = b.participants.find((p) => p.participant_id === b.away_participant);
  const home = b.participants.find((p) => p.participant_id === b.home_participant);
  if (!away || !home) return b.participants.map((p) => p.display_name).join(' v ');
  return sport === 'SOCCER' ? `${home.display_name} v ${away.display_name}` : sport === 'TENNIS' ? `${away.display_name} v ${home.display_name}` : `${away.short_name ?? away.display_name} @ ${home.short_name ?? home.display_name}`;
}

export type ChangeKind = 'price' | 'status' | 'research' | 'unpriced';

export interface Change {
  kind: ChangeKind;
  text: string;
  /** True when the change may call for reassessing the saved thesis. */
  reassess: boolean;
}

/** Cents moved at or beyond which a saved market's price change is called out. */
export const PRICE_MOVE_CENTS = 2;

/**
 * The saved market's own contract, then and now. Only the same ticker is compared; with no quote at save time
 * or no quote now, it says so instead of guessing.
 */
export function marketChange(snap: MarketSnapshot | null | undefined, now: LiveQuote | undefined): Change | null {
  if (!snap) return null;
  if (now && now.ticker !== snap.ticker) return null;
  if (snap.yesAsk == null) return { kind: 'unpriced', text: 'No quote was on screen when you saved this, so there is no saved price to compare.', reassess: false };
  if (!now || now.yesAsk == null) return { kind: 'unpriced', text: `Saved at YES ${c(snap.yesAsk)}; no current quote for this contract yet.`, reassess: false };
  const d = Math.round((now.yesAsk - snap.yesAsk) * 100);
  if (Math.abs(d) < PRICE_MOVE_CENTS) return { kind: 'price', text: `YES ask ${c(now.yesAsk)}, unchanged since saved (${c(snap.yesAsk)}).`, reassess: false };
  return { kind: 'price', text: `YES ask ${d > 0 ? 'up' : 'down'} ${Math.abs(d)}¢ since saved: ${c(snap.yesAsk)} → ${c(now.yesAsk)}.`, reassess: Math.abs(d) >= 5 };
}

/** The game's own lifecycle since the save, and whether the publication's research run is newer than the save. */
export function gameChanges(g: GameGroup, board: BoardItem | undefined, oldestSave: string): Change[] {
  const out: Change[] = [];
  if (g.phase === 'FINAL') out.push({ kind: 'status', text: 'The game is final: saved pregame research is now a review.', reassess: false });
  else if (g.phase === 'STARTED') out.push({ kind: 'status', text: 'The game has started: pregame research is frozen.', reassess: false });
  else if (g.phase === 'POSTPONED' || g.phase === 'CANCELLED' || g.phase === 'SUSPENDED') out.push({ kind: 'status', text: `The publication lists the game as ${g.phase.toLowerCase()}.`, reassess: true });
  const run = board?.model_generated_at ?? null;
  if (run && Date.parse(run) > Date.parse(oldestSave) && g.phase !== 'FINAL') out.push({ kind: 'research', text: 'The publication has a newer research run than your oldest save on this game: the thesis may need a fresh look.', reassess: true });
  return out;
}

const c = (v: number) => `${Math.round(v * 100)}¢`;
