// Discover, "Game & team" scope: the upcoming games that list moneyline, spread, total, team-total and period markets. Opening a game expands the SAME
// research panel the Game page shows (screens/markets/GameMarkets): pick a market and a line, see the chart, the price and the exact contract change
// together, without leaving Discover. The expanded game and the market live in the address, so Back restores them.
import { useMemo } from 'react';
import { Link } from '../../../routing';
import { useEventDetail } from '../../data/useGameExtras';
import { useGameStart } from '../../data/research/gameHooks';
import { useSlate } from '../../data/useSlate';
import { eligibleGames } from '../../data/props/load';
import { HORIZON_MS } from '../../data/props/horizon';
import { routes } from '../../nav/routes';
import { propsSchema } from '../../nav/schemas';
import { useRouteState } from '../../state/url';
import { clockTime, dayWord } from '../../model/time';
import type { V3Game } from '../../model/types';
import { Icon } from '../../ui/Icon';
import { TeamLogo } from '../../ui/TeamLogo';
import { gameHref } from '../../ui/gamebits';
import { GameMarkets } from '../markets/GameMarkets';

function GameRow({ g, open, onToggle }: { g: V3Game; open: boolean; onToggle: () => void }) {
  const startMs = useGameStart(open ? g : null) ?? g.startMs;
  const detail = useEventDetail(g.slug, g.eventId, open);
  return (
    <li className={`gs-row${open ? ' is-open' : ''}`} data-game={g.key}>
      <button type="button" className="gs-row__h" aria-expanded={open} onClick={onToggle}>
        <span className="gs-row__t"><TeamLogo team={g.away} size={26} /><b>{g.away.nick}</b><em>at</em><TeamLogo team={g.home} size={26} /><b>{g.home.nick}</b></span>
        <span className="gs-row__m"><small>{g.sport} · {dayWord(g.startMs)} {clockTime(g.startMs)}</small><small>{g.item?.markets_available ?? 0} markets</small></span>
        <Icon name={open ? 'chevU' : 'chevD'} size={18} />
      </button>
      {open && (
        <div className="gs-row__b">
          <GameMarkets g={g} startMs={startMs} detail={detail.data} loadingDetail={detail.loading} />
          <Link className="gs-open" to={gameHref(g, 'props')}>Open the full game page<Icon name="chevR" size={14} /></Link>
        </div>
      )}
    </li>
  );
}

export function GamesScope() {
  const [st, set] = useRouteState(propsSchema);
  const slate = useSlate();
  const all = useMemo(() => eligibleGames(slate.games).filter((g) => g.startMs - slate.now <= HORIZON_MS['7d']), [slate.games, slate.now]);
  const sports = useMemo(() => [...new Set(all.map((g) => g.slug))], [all]);
  const games = useMemo(() => all.filter((g) => st.sport === 'all' || g.slug === st.sport || g.key === st.gk).slice(0, 40), [all, st.sport, st.gk]);
  const first = games[0]?.key ?? null;
  const openKey = st.gk === 'none' ? null : st.gk ?? first;
  return (
    <div className="pd gs" data-view="games">
      <header className="pd-h">
        <div className="pd-h__tt"><h1>Discover</h1></div>
        <div className="pd-h__sub">Game &amp; team markets · {all.length} upcoming game{all.length === 1 ? '' : 's'} in the next 7 days</div>
      </header>
      <div className="v3-seg" role="group" aria-label="Discover scope">
        <button type="button" aria-pressed={false} onClick={() => set({ scope: 'players', gk: null })}>Player props</button>
        <button type="button" aria-pressed onClick={() => undefined}>Game &amp; team</button>
      </div>
      {sports.length > 1 && (
        <div className="gs-sports" role="group" aria-label="Sport">
          <button type="button" aria-pressed={st.sport === 'all'} onClick={() => set({ sport: 'all', gk: null })}>All</button>
          {sports.map((x) => <button key={x} type="button" aria-pressed={st.sport === x} onClick={() => set({ sport: x, gk: null })}>{x.toUpperCase()}</button>)}
        </div>
      )}
      {slate.loading && !games.length ? <div className="v3-skel" style={{ height: 120, margin: '12px 16px' }} role="status" aria-label="Loading games" />
        : !games.length ? <div className="v3-state"><Icon name="info" size={20} /><div><b>No upcoming games list markets</b>Games appear here when Kalshi lists contracts for them.</div></div>
        : <ul className="gs-list">{games.map((g) => <GameRow key={g.key} g={g} open={openKey === g.key} onToggle={() => set({ gk: openKey === g.key ? 'none' : g.key })} />)}</ul>}
      <p className="pd-scope">Player props: <Link to={routes.props({})}>switch back</Link>. Each market opens its own evidence and the exact Kalshi contract; period markets show price only where no period history is published.</p>
    </div>
  );
}
