// /props — the Player Prop Explorer's front door. Pick a sport that publishes player props:
//   NFL  the full Combined Prop Explorer (/nfl/props) and the slate's top-props board, with multi-select to My Board
//   MLB  pitcher and hitter prop ladders live on each game's Player props tab — listed here game by game
//   NHL  goal-scorer and assist markets live on each game's Markets tab — listed here game by game
// MLB and NHL are entry points, clearly labelled: their publications carry no simulated player distributions or
// per-prop opponent ranks, so Sift does not build an explorer it would have to fill with invented numbers.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BoardItem, Market } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { Skeleton, TeamMark } from '../../components/ui';
import { CapabilityState } from '../../components/fxResearch';
import { useAsync, useRepo } from '../../data/hooks';
import { sportBySlug } from '../../data/sports';
import { isMlbPlayerMarket } from '../../lib/mlb';
import { routes } from '../../lib/routes';
import { useNow } from '../../live/hooks';
import { useVisit } from '../../state/trail';
import { upcomingGames } from './slate';
import { TopProps } from './TopProps';
import '../../styles/lane-b-props.css';

interface HubSport {
  slug: 'nfl' | 'mlb' | 'nhl';
  icon: string;
  mode: 'explorer' | 'game';
  blurb: string;
  /** Game-page tab that holds the props. */
  tab: string | null;
  horizonDays: number;
}
export const HUB_SPORTS: HubSport[] = [
  { slug: 'nfl', icon: 'football', mode: 'explorer', blurb: 'Every player prop with projection, game logs and matchup', tab: 'props', horizonDays: 8 },
  { slug: 'mlb', icon: 'baseball', mode: 'game', blurb: 'Pitcher and hitter ladders on each game page', tab: 'props', horizonDays: 3 },
  { slug: 'nhl', icon: 'hockey', mode: 'game', blurb: 'Goal, assist and point contracts; player pages add his games against each count', tab: 'markets', horizonDays: 3 },
];

/** A market about one player, for any sport: MLB's own reader, else a player id or a player_* family. */
export function isPlayerMarket(sportCode: string, m: Pick<Market, 'market_family' | 'player_id' | 'kalshi_ticker' | 'extensions'>): boolean {
  if (sportCode === 'MLB') return isMlbPlayerMarket(m as Market);
  return !!m.player_id || /^player/i.test(m.market_family ?? '');
}

const upcoming = upcomingGames;
const sideOf = (b: BoardItem, id: string | null) => b.participants.find((p) => p.participant_id === id)?.short_name ?? '—';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function PropsHubView() {
  useVisit('Player props', 'explore');
  const [sp, setSp] = useSearchParams();
  const pick = HUB_SPORTS.find((s) => s.slug === sp.get('sport')) ?? HUB_SPORTS[0];
  return (
    <div className="page pexp phub">
      <header className="bhome__mast phub__mast">
        <div><span className="eyebrow2">Player props</span><h1 className="bhome__h">Player prop explorer</h1></div>
        <p className="bhome__sum">Pick a sport, then a player: every market, his game logs against today’s line and the matchup</p>
      </header>
      <div className="phub__sports" role="group" aria-label="Sport">
        {HUB_SPORTS.map((s) => <SportCard key={s.slug} s={s} on={s.slug === pick.slug} onPick={() => setSp((p) => { const n = new URLSearchParams(p); if (s.slug === 'nfl') n.delete('sport'); else n.set('sport', s.slug); return n; }, { replace: true })} />)}
      </div>
      {pick.mode === 'explorer' ? <NflHub /> : <GamePageProps s={pick} />}
    </div>
  );
}

function SportCard({ s, on, onPick }: { s: HubSport; on: boolean; onPick: () => void }) {
  const sport = sportBySlug(s.slug)!;
  return (
    <button type="button" className={`phub__sport${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onPick}>
      <span className="phub__sic"><Icon name={s.icon} size={22} /></span>
      <span className="phub__sb"><b>{sport.label}</b><small>{s.blurb}</small></span>
      <span className={`phub__mode phub__mode--${s.mode}`}>{s.mode === 'explorer' ? 'Full explorer' : 'Props on game pages'}</span>
    </button>
  );
}

function NflHub() {
  const sport = sportBySlug('nfl')!;
  const repo = useRepo(sport);
  const now = useNow(60_000);
  const board = useAsync(repo.data ? `props:board:${repo.data.source.root}` : null, () => repo.data!.board());
  const games = useMemo(() => upcoming(board.data?.items, now, 8), [board.data, now]);
  if (repo.loading || board.loading) return <Skeleton lines={8} tall />;
  if (!repo.data || board.error) return <CapabilityState title="NFL props are unavailable right now" tone="gold">The NFL publication could not be read, so there are no props to explore. Try again shortly.</CapabilityState>;
  return (
    <>
      <section className="phub__games" aria-labelledby="phub-g">
        <div className="phub__gh">
          <h2 className="phub__k" id="phub-g">Open a game in the explorer</h2>
          <Link to={routes.props('nfl')} className="phub__all">Prop explorer <Icon name="arrowRight" size={14} /></Link>
        </div>
        {games.length ? (
          <ul className="phub__gl">
            {games.map((g) => (
              <li key={g.event_id}>
                <Link to={routes.props('nfl', { game: g.event_id })} className="phub__g">
                  <span className="phub__gt"><TeamMark sport="NFL" abbr={sideOf(g, g.away_participant)} size="sm" /><b>{sideOf(g, g.away_participant)}</b><span className="phub__at">@</span><TeamMark sport="NFL" abbr={sideOf(g, g.home_participant)} size="sm" /><b>{sideOf(g, g.home_participant)}</b></span>
                  <small>{when(g.start_time_utc)}</small>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="fr-note">No upcoming NFL games are listed in the publication.</p>}
      </section>
      {games.length > 0 && <TopProps repo={repo.data} games={games} slug="nfl" sportCode="NFL" />}
    </>
  );
}

function GamePageProps({ s }: { s: HubSport }) {
  const sport = sportBySlug(s.slug)!;
  const repo = useRepo(sport);
  const now = useNow(60_000);
  const board = useAsync(repo.data ? `props:board:${repo.data.source.root}` : null, () => repo.data!.board());
  const games = useMemo(() => upcoming(board.data?.items, now, s.horizonDays).slice(0, 12), [board.data, now, s.horizonDays]);
  const counts = useAsync(repo.data && games.length ? `props:counts:${sport.code}:${games.map((g) => g.event_id).join(',')}` : null, async () => {
    const out = await Promise.all(games.map((g) => repo.data!.eventDetail(g.event_id).then((d) => d.markets.filter((m) => isPlayerMarket(sport.code, m)).length).catch(() => null)));
    return new Map(games.map((g, i) => [g.event_id, out[i]]));
  });
  return (
    <section className="phub__gp" aria-labelledby="phub-gp">
      <CapabilityState title={<span id="phub-gp">{sport.label} props live on each game page</span>} tone="cyan" icon="info">
        {sport.code === 'MLB'
          ? 'Pitcher and hitter prop ladders, with the market’s price and the publication’s projection where it releases one, are on every game’s Player props tab. The MLB publication carries no simulated player distributions or per-prop opponent ranks, so there is no combined explorer to fill.'
          : 'Goal, assist and point contracts are on every game’s Markets tab, with skater research on the Players tab. Each player page lists the contracts that name him, how many of his last 5, last 10 and this season’s games reached each count (history against today’s line, not a probability), and the NHL joint simulation’s research P(YES) where it prices the contract. The publication carries no ladder of player-stat lines with simulated distributions, so there is no combined explorer to fill.'}
      </CapabilityState>
      {repo.loading || board.loading ? <Skeleton lines={6} /> : !games.length ? (
        <p className="fr-note">No {sport.label} games in the next {s.horizonDays} days are listed in the publication.</p>
      ) : (
        <ul className="phub__gl phub__gl--cards">
          {games.map((g) => {
            const n = counts.data?.get(g.event_id);
            return (
              <li key={g.event_id}>
                <Link to={routes.game(s.slug, g.event_id, { tab: s.tab })} className="phub__g phub__g--card">
                  <span className="phub__gt"><TeamMark sport={sport.code} abbr={sideOf(g, g.away_participant)} size="sm" /><b>{sideOf(g, g.away_participant)}</b><span className="phub__at">@</span><TeamMark sport={sport.code} abbr={sideOf(g, g.home_participant)} size="sm" /><b>{sideOf(g, g.home_participant)}</b></span>
                  <small>{when(g.start_time_utc)}</small>
                  <span className="phub__n">{counts.loading ? 'Counting player markets…' : n == null ? 'Markets could not be read' : n ? <><b className="num">{n}</b> player market{n === 1 ? '' : 's'}</> : 'No player markets listed yet'}</span>
                  <span className="phub__cta">{s.tab === 'props' ? 'Player props' : 'Markets'} <Icon name="arrowRight" size={14} /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
