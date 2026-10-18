// The coming NFL slate's player props, read once and shared by /props (TopProps) and Home (Top Props): which games
// count as upcoming, every pregame game's prop board, the explorer deep link for one prop, and saving props to My
// Board as the same MARKET item a single Save makes (games that have kicked off are refused by the tray itself).
import type { BoardItem } from '../../contract/types';
import { useAsync } from '../../data/hooks';
import type { SportRepo } from '../../data/repo';
import { propBoard, type PropRow } from '../../insights/propBoard';
import { loadAuthority } from '../../data/projections';
import { routes } from '../../lib/routes';
import type { useTray } from '../../state/tray';
import type { DiscoveryRow } from './model';

type TrayApi = ReturnType<typeof useTray>;

export const cents = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}¢`);
export const rowKey = (d: Pick<DiscoveryRow, 'eventId'> & { row: Pick<PropRow, 'id'> }) => `${d.eventId}|${d.row.id}`;

/** Games that have not started (and are not final, cancelled or postponed) within `days`, soonest first. */
export function upcomingGames(items: BoardItem[] | undefined, now: number, days: number): BoardItem[] {
  return (items ?? [])
    .filter((b) => Date.parse(b.start_time_utc) > now && Date.parse(b.start_time_utc) < now + days * 86_400_000 && !/FINAL|CANCEL|POSTPON/i.test(b.status))
    .sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc));
}

export function gameName(b: BoardItem) {
  const a = b.participants.find((p) => p.participant_id === b.away_participant)?.short_name;
  const h = b.participants.find((p) => p.participant_id === b.home_participant)?.short_name;
  return `${a} @ ${h}`;
}

/**
 * Every pregame game's prop board, read once for the slate. A game whose research cannot be read is skipped and
 * counted. `revalidate`: a screen that stays open re-reads the slate on the research clock (data/hooks.ts), so a
 * newer publication replaces what is on screen without a reload.
 */
export function useSlateProps(repo: SportRepo | undefined, games: BoardItem[], opts: { revalidate?: boolean } = {}) {
  const key = games.map((g) => g.event_id).join(',');
  return useAsync(repo && key ? `props:slate:${repo.source.root}:${key}` : null, async () => {
    // one feed read for the slate: every game resolves against the same projections, so a stat has one value everywhere
    const authority = await loadAuthority('NFL');
    const out = await Promise.all(games.map(async (g) => {
      try {
        const [r, d] = await Promise.all([repo!.eventResearch(g.event_id), repo!.eventDetail(g.event_id)]);
        return propBoard(r, d, undefined, authority).rows.map((row): DiscoveryRow => ({ row, eventId: g.event_id, kickoff: g.start_time_utc, game: gameName(g), publishedAt: r.generated_at ?? null }));
      } catch {
        return null;
      }
    }));
    return { rows: out.flatMap((x) => x ?? []), unreadable: out.filter((x) => x == null).length };
  }, opts);
}

/** The explorer with this game open and this prop selected (/nfl/props?game=…&prop=…). */
export const propHref = (slug: string, d: Pick<DiscoveryRow, 'eventId'> & { row: Pick<PropRow, 'id'> }) => `${routes.props(slug, { game: d.eventId })}&prop=${encodeURIComponent(d.row.id)}`;

/** True when this prop's main contract is already on My Board. */
export const onBoard = (tray: Pick<TrayApi, 'has'>, d: DiscoveryRow) => !!d.row.main && tray.has('MARKET', d.row.main.market.market_id, { market_id: d.row.main.market.market_id, event_id: d.eventId });

/**
 * Save props to My Board: one MARKET item per prop's main contract, the same item a single Save makes. The tray
 * refuses a game that has kicked off; those are counted, never forced in.
 */
export function addPropsToBoard(tray: Pick<TrayApi, 'add'>, rows: DiscoveryRow[], sportCode: string, slug: string): { ok: number; refused: number } {
  let ok = 0;
  let refused = 0;
  for (const d of rows) {
    const m = d.row.main;
    if (!m) continue;
    const item = tray.add({
      ref_kind: 'MARKET', sport: sportCode, id: m.market.market_id, extra: { market_id: m.market.market_id, event_id: d.eventId }, kickoff: d.kickoff,
      label: { label: `${d.row.name} ${d.row.def.label.toLowerCase()} ${d.row.line ?? ''}`.trim(), sub: `Over ${cents(m.yesAsk)} · under ${cents(m.noAsk)}`, href: propHref(slug, d), kickoff: d.kickoff },
    });
    if (item) ok++;
    else refused++;
  }
  return { ok, refused };
}

export const addedNotice = ({ ok, refused }: { ok: number; refused: number }) =>
  `Added ${ok} prop${ok === 1 ? '' : 's'} to My Board${refused ? ` · ${refused} not saved: the game has kicked off` : ''}.`;
