// The Game Switcher (references 08/09/10/11): a fixed-height horizontal rail of miniature game tiles under the hero and above the tabs,
// favourites pinned first, and a searchable full-height picker sheet (favourites section, then Live / Today / Upcoming / Final).
// A tile's star toggles the favourite WITHOUT switching games; tapping the tile switches in one tap and the tab is kept.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '../../routing';
import { clockTime } from '../model/format';
import { isFavorite, switcherGames } from '../model/switcher';
import { useFollows } from '../state/prefs';
import type { V3Game } from '../model/types';
import { AlertBell, FollowStar } from './Controls';
import { Icon } from './Icon';
import { useSheet } from './Sheet';
import { TeamLogo } from './TeamLogo';
import { gameHref, statusWord } from './gamebits';

const tileLine = (g: V3Game) => (g.phase === 'live' ? g.score?.clock ?? 'In play' : g.phase === 'final' ? 'Final' : clockTime(g.startMs));

function Tile({ g, current, fav, onPick }: { g: V3Game; current: boolean; fav: boolean; onPick: () => void }) {
  const scored = g.score != null;
  return (
    <div className={`v3-sw__tile${current ? ' is-cur' : ''}${g.phase === 'live' ? ' is-live' : ''}`} data-current={current || undefined}>
      <button type="button" className="v3-sw__hit" onClick={onPick} aria-current={current ? 'true' : undefined}
        aria-label={`${g.away.name} at ${g.home.name}, ${scored ? `${g.score!.away} to ${g.score!.home}, ` : ''}${statusWord(g)}${current ? ', current game' : ''}. ${current ? '' : 'Switch to this game'}`}>
        {([g.away, g.home] as const).map((t, i) => (
          <span key={t.id} className="v3-sw__r"><TeamLogo team={t} size={20} /><b>{t.abbr}</b>{scored && <em className="num">{i === 0 ? g.score!.away : g.score!.home}</em>}</span>
        ))}
        <small>{tileLine(g)}</small>
      </button>
      {fav && <FollowStar kind="games" id={g.key} label={`${g.away.nick} at ${g.home.nick}`} className="v3-sw__star" />}
    </div>
  );
}

export function SwitcherRail({ current, games, tab }: { current: V3Game; games: V3Game[]; tab: string }) {
  const f = useFollows();
  const nav = useNavigate();
  const sheet = useSheet();
  const list = useMemo(() => switcherGames(games, current, f), [games, current, f]);
  const rail = useRef<HTMLDivElement>(null);
  // Keep the selected tile in view when the game changes; scrolls the rail only, never the page.
  useEffect(() => {
    const el = rail.current?.querySelector<HTMLElement>('[data-current]');
    if (el && rail.current) rail.current.scrollLeft = Math.max(0, el.offsetLeft - 10);
  }, [current.key]);
  const go = (g: V3Game) => { if (g.key !== current.key) nav(gameHref(g, tab)); };
  return (
    <nav className="v3-sw" aria-label="Switch game">
      <div className="v3-sw__rail" ref={rail}>
        {list.map((g) => <Tile key={g.key} g={g} current={g.key === current.key} fav={isFavorite(g, f)} onPick={() => go(g)} />)}
      </div>
      <button type="button" className="v3-sw__all" aria-label={`All games, ${list.length}`} onClick={() => sheet.open('Switch Game', <Picker current={current} games={games} tab={tab} />, { tall: true })}>
        <Icon name="chevR" size={22} />
      </button>
    </nav>
  );
}

type Seg = 'live' | 'today' | 'upcoming' | 'final';

function PickRow({ g, current, onPick }: { g: V3Game; current: boolean; onPick: () => void }) {
  const scored = g.score != null;
  return (
    <li className={`v3-pk__row${current ? ' is-cur' : ''}`}>
      <button type="button" className="v3-pk__main" onClick={onPick} aria-current={current ? 'true' : undefined}
        aria-label={`${g.away.name} at ${g.home.name}, ${scored ? `${g.score!.away} to ${g.score!.home}, ` : ''}${statusWord(g)}${current ? ', current game' : ''}`}>
        <TeamLogo team={g.away} size={36} />
        <span className="v3-pk__t"><b>{g.away.abbr} <span>at</span> {g.home.abbr}</b><small>{g.phase === 'live' ? <><span className="v3-pk__live">{g.score?.clock ?? 'In play'}</span>{g.network ? ` · ${g.network}` : ''}</> : `${tileLine(g)}${g.network ? ` · ${g.network}` : ''}`}</small></span>
        {scored ? <span className="v3-pk__sc num">{g.score!.away} <i>–</i> {g.score!.home}</span> : <span className="v3-pk__sc v3-pk__sc--at">at</span>}
        <TeamLogo team={g.home} size={36} />
      </button>
      <span className="v3-pk__act">
        <FollowStar kind="games" id={g.key} label={`${g.away.nick} at ${g.home.nick}`} />
        <AlertBell id={g.key} label={`${g.away.nick} at ${g.home.nick}`} />
      </span>
    </li>
  );
}

/** The full picker: searchable, favourites first, segmented by Live / Today / Upcoming / Final. Handles 25+ simultaneous games as one scrolling list. */
export function Picker({ current, games, tab }: { current: V3Game; games: V3Game[]; tab: string }) {
  const f = useFollows();
  const nav = useNavigate();
  const list = useMemo(() => switcherGames(games, current, f), [games, current, f]);
  const counts = { live: list.filter((g) => g.phase === 'live').length, upcoming: list.filter((g) => g.phase === 'pregame').length, final: list.filter((g) => g.phase === 'final').length };
  const [seg, setSeg] = useState<Seg>(counts.live ? 'live' : 'today');
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const matches = (g: V3Game) => !query || [g.away.name, g.home.name, g.away.abbr, g.home.abbr, g.away.nick, g.home.nick].some((s) => s.toLowerCase().includes(query));
  const bySeg = (g: V3Game) => (seg === 'today' ? true : seg === 'live' ? g.phase === 'live' : seg === 'upcoming' ? g.phase === 'pregame' : g.phase === 'final');
  const shown = list.filter((g) => matches(g) && (query ? true : bySeg(g)));
  const favs = shown.filter((g) => isFavorite(g, f));
  const rest = shown.filter((g) => !isFavorite(g, f));
  const go = (g: V3Game) => nav(gameHref(g, tab));
  const SEGS: [Seg, string][] = [['live', `Live (${counts.live})`], ['today', 'Today'], ['upcoming', 'Upcoming'], ['final', 'Final']];
  return (
    <div className="v3-pk">
      <label className="v3-pk__search">
        <Icon name="search" size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams" aria-label="Search games by team" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false} />
        {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')}><Icon name="close" size={16} /></button>}
      </label>
      <div className="v3-pk__seg" role="tablist" aria-label="Game state">
        {SEGS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={!query && seg === k} onClick={() => { setQ(''); setSeg(k); }}>{label}</button>)}
      </div>
      <div className="v3-pk__list" role="region" aria-label="Games" aria-live="polite">
        {favs.length > 0 && <><h3 className="v3-pk__h"><Icon name="star" size={14} fill /> Favorites</h3><ul>{favs.map((g) => <PickRow key={g.key} g={g} current={g.key === current.key} onPick={() => go(g)} />)}</ul></>}
        {rest.length > 0 && <>{favs.length > 0 && <h3 className="v3-pk__h">{query ? 'All games' : seg === 'live' ? 'Live' : seg === 'upcoming' ? 'Upcoming' : seg === 'final' ? 'Final' : 'All games'}</h3>}<ul>{rest.map((g) => <PickRow key={g.key} g={g} current={g.key === current.key} onPick={() => go(g)} />)}</ul></>}
        {shown.length === 0 && <div className="v3-state"><Icon name="search" size={20} /><div><b>{query ? 'No matching games' : `No ${seg === 'today' ? '' : seg} games`}</b>{query ? `Nothing matches “${q}”. ` : 'Try another list. '}{query && <button type="button" onClick={() => setQ('')}>Clear search</button>}</div></div>}
      </div>
    </div>
  );
}
