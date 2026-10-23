// Data for the v4 Props screens. Nothing new is fetched or computed here: the slate is views/props/slate.ts
// (useSlateProps: every pregame game's prop board through insights/propBoard.ts and the projection authority), the
// per-game board is the same propBoard, and quotes are the app's live overlay (live/overlay.ts). One projection per
// metric, from lib/projectionAuthority.ts; a stat or sport the publication does not support is said so, never filled.
import { useMemo } from 'react';
import type { BoardItem, EventResearchDoc, Market, ModelPrice } from '../contract/types';
import { useAsync, useRepo } from '../data/hooks';
import { loadAuthority } from '../data/projections';
import { SportRepo } from '../data/repo';
import { resolveSource } from '../data/source';
import { sportBySlug } from '../data/sports';
import { propBoard, type PropBoard, type PropRow } from '../insights/propBoard';
import { isMlbPlayerMarket } from '../lib/mlb';
import { liveStore, useLiveQuotes, useNow } from '../live/hooks';
import { overlayMarket } from '../live/overlay';
import { upcomingGames, useSlateProps } from '../views/props/slate';
import type { DiscoveryRow } from '../views/props/model';
import type { ProjectionAuthority } from '../lib/projectionAuthority';

/** The sports the Prop Explorer lists, as the existing /props hub does: NFL has the full explorer; MLB and NHL carry props on each game's page. */
export interface PropSport { slug: 'nfl' | 'mlb' | 'nhl' | 'cfb' | 'nba'; label: string; icon: 'football' | 'basketball' | 'baseball' | 'hockey'; mode: 'explorer' | 'game' | 'projection'; horizonDays: number; note: string }
export const PROP_SPORTS: PropSport[] = [
  { slug: 'nfl', label: 'NFL', icon: 'football', mode: 'explorer', horizonDays: 8, note: 'Every player prop with the projection, the Kalshi ladder and the matchup.' },
  { slug: 'cfb', label: 'CFB', icon: 'football', mode: 'projection', horizonDays: 8, note: 'Approved projected team points, independent of whether a player prop is listed.' },
  { slug: 'nba', label: 'NBA', icon: 'basketball', mode: 'projection', horizonDays: 3, note: 'SIFT’s approved NBA player projections, one per player and stat. Projections are not bet recommendations.' },
  { slug: 'mlb', label: 'MLB', icon: 'baseball', mode: 'game', horizonDays: 3, note: 'Pitcher and hitter ladders are on each game. The MLB publication carries no simulated player projection, so none is shown.' },
  { slug: 'nhl', label: 'NHL', icon: 'hockey', mode: 'game', horizonDays: 3, note: 'Goal, assist and point contracts are on each game. The NHL publication carries no simulated player projection, so none is shown.' },
];
export const propSport = (slug: string | null | undefined) => PROP_SPORTS.find((s) => s.slug === slug) ?? PROP_SPORTS[0];

const askOf = (v: number | null | undefined) => (v == null || v <= 0 || v >= 1 ? null : v);

/** A prop row whose main contract carries the live quote where one is newer than the publication's capture. */
export function withLiveMain(d: DiscoveryRow, quote: (ticker: string) => Parameters<typeof overlayMarket>[1]): DiscoveryRow {
  const main = d.row.main;
  if (!main) return d;
  const m = overlayMarket(main.market as Market, quote(main.market.kalshi_ticker));
  if (m === main.market) return d;
  return { ...d, row: { ...d.row, main: { ...main, market: m, yesBid: m.yes_bid ?? null, yesAsk: askOf(m.yes_ask), noAsk: askOf(m.no_ask) } } };
}

/** The coming NFL slate's props (games not yet started, soonest first), each main line repriced by a newer live quote. */
export function useNflPropsSlate() {
  const sport = sportBySlug('nfl')!;
  const repo = useRepo(sport);
  const now = useNow(60_000);
  const board = useAsync(repo.data ? `props:board:${repo.data.source.root}` : null, () => repo.data!.board());
  const games = useMemo(() => upcomingGames(board.data?.items, now, 8), [board.data, now]);
  const slate = useSlateProps(repo.data, games, { revalidate: true });
  const base = useMemo(() => slate.data?.rows ?? [], [slate.data]);
  const tickers = useMemo(() => base.map((d) => d.row.main?.market.kalshi_ticker).filter((t): t is string => !!t), [base]);
  const live = useLiveQuotes(tickers, 'slate');
  // the version is the dependency: the store's quotes change under a stable lookup function
  const rows = useMemo(() => base.map((d) => withLiveMain(d, live.quote)), [base, live.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const publishedAt = useMemo(() => base.map((d) => d.publishedAt).filter((x): x is string => !!x).sort().pop() ?? null, [base]);
  return {
    now, games, rows, publishedAt, unreadable: slate.data?.unreadable ?? 0,
    loading: repo.loading || board.loading || (games.length > 0 && slate.loading && !slate.data),
    error: repo.error || board.error || (slate.error && !slate.data ? slate.error : undefined),
  };
}

/** MLB / NHL: upcoming games with the number of player markets each lists (the hub's "props on game pages" view). */
export function useGamePropSport(slug: 'mlb' | 'nhl') {
  const s = propSport(slug);
  const sport = sportBySlug(slug)!;
  const repo = useRepo(sport);
  const now = useNow(60_000);
  const board = useAsync(repo.data ? `props:board:${repo.data.source.root}` : null, () => repo.data!.board());
  const games = useMemo(() => upcomingGames(board.data?.items, now, s.horizonDays).slice(0, 12), [board.data, now, s.horizonDays]);
  const counts = useAsync(repo.data && games.length ? `v4props:counts:${sport.code}:${games.map((g) => g.event_id).join(',')}` : null, async () => {
    const out = await Promise.all(games.map((g) => repo.data!.eventDetail(g.event_id).then((d) => d.markets.filter((m) => (sport.code === 'MLB' ? isMlbPlayerMarket(m as Market) : !!m.player_id || /^player/i.test(m.market_family ?? ''))).length).catch(() => null)));
    return new Map(games.map((g, i) => [g.event_id, out[i]]));
  });
  return { sport: s, games, counts: counts.data, countsLoading: counts.loading, loading: repo.loading || board.loading, error: repo.error || board.error };
}

export type PropGameData =
  | { kind: 'unsupported' }
  | { kind: 'ok'; r: EventResearchDoc; markets: Market[]; modelPrices: ModelPrice[]; authority: ProjectionAuthority | null };

/** One NFL game's research, markets and the projection authority (one feed read), refreshed on the research clock. */
export function usePropGame(slug: string, eventId: string) {
  return useAsync<PropGameData>(`v4pg:${slug}:${eventId}`, async () => {
    const sport = sportBySlug(slug);
    if (!sport || sport.code !== 'NFL') return { kind: 'unsupported' };
    const repo = new SportRepo(await resolveSource(sport));
    if (!repo.hasExplorer) return { kind: 'unsupported' };
    const [r, d, authority] = await Promise.all([repo.eventResearch(eventId), repo.eventDetail(eventId), loadAuthority(sport.code)]);
    return { kind: 'ok', r, markets: d.markets as Market[], modelPrices: d.model_prices ?? [], authority };
  }, { revalidate: true });
}

/** The game's prop board with every player contract repriced by the live quote where it is newer than the capture. */
export function usePropBoard(data: PropGameData | undefined): { board: PropBoard | null; liveAt: number } {
  const markets = data?.kind === 'ok' ? data.markets : undefined;
  const tickers = useMemo(() => (markets ?? []).filter((m) => m.market_family === 'player_stat').map((m) => m.kalshi_ticker), [markets]);
  const live = useLiveQuotes(tickers, 'game');
  const board = useMemo(() => {
    if (data?.kind !== 'ok') return null;
    const quoted = data.markets.map((m) => overlayMarket(m, liveStore().quote(m.kalshi_ticker)));
    return propBoard(data.r, { markets: quoted, model_prices: data.modelPrices }, undefined, data.authority);
  }, [data, live.version]); // eslint-disable-line react-hooks/exhaustive-deps
  return { board, liveAt: live.version };
}

export const rowFor = (board: PropBoard | null, playerId: string, stat: string | null): { rows: PropRow[]; sel: PropRow | null } => {
  const rows = (board?.rows ?? []).filter((r) => r.playerId === playerId);
  const sel = rows.find((r) => r.def.stat === stat) ?? rows.find((r) => r.main) ?? rows[0] ?? null;
  return { rows, sel };
};

export type { BoardItem };
