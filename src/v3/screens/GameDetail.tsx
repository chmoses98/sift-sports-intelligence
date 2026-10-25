import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from '../../routing';
import { useGameByKey } from '../data/useSlate';
import { useGameExtras, useEventDetail } from '../data/useGameExtras';
import { useGameResearch } from '../../views/broadcast/parts';
import { demoLens, lensFromResearch } from '../data/lens';
import { switcherGames } from '../model/switcher';
import { clockTime, dayWord } from '../model/format';
import { pushVisit, useFollows } from '../state/prefs';
import type { V3Game } from '../model/types';
import { AlertBell, FollowStar } from '../ui/Controls';
import { HeroBg } from '../ui/HeroBg';
import { Icon } from '../ui/Icon';
import { useSheet } from '../ui/Sheet';
import { SwitcherRail } from '../ui/Switcher';
import { TeamLogo } from '../ui/TeamLogo';
import { gameHref, leagueLabel, scoreSourceWord, teamHref } from '../ui/gamebits';
import { GameTabBody } from './GameTabs';
import { Brand } from '../ui/Brand';

export type TabKey = 'main' | 'script' | 'matchup' | 'props' | 'stats';
const TAB_KEYS: TabKey[] = ['main', 'script', 'matchup', 'props', 'stats'];
const mainLabel = (g: V3Game) => (g.phase === 'live' ? 'Live' : g.phase === 'final' ? 'Recap' : 'Overview');
const TAB_LABEL: Record<Exclude<TabKey, 'main'>, string> = { script: 'Game Script', matchup: 'Matchup', props: 'Props', stats: 'Stats' };

/** Back goes to the screen this game was opened from; with no in-app history (a deep link) it goes to Games. */
function useBack() {
  const nav = useNavigate();
  const loc = useLocation();
  return () => { if (loc.key !== 'default') nav(-1); else nav('/v3/games', { replace: true }); };
}

function MoreSheet({ g }: { g: V3Game }) {
  const [done, setDone] = useState('');
  const url = typeof location !== 'undefined' ? location.href : '';
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  return (
    <ul className="v3-list">
      {canShare && <li><button type="button" className="v3-menu" onClick={() => { navigator.share({ title: `${g.away.name} at ${g.home.name}`, url }).catch(() => {}); }}><Icon name="share" size={20} />Share this game</button></li>}
      <li><button type="button" className="v3-menu" onClick={() => { navigator.clipboard?.writeText(url).then(() => setDone('Link copied'), () => setDone('Could not copy')); }}><Icon name="bookmark" size={20} />Copy link<small>{done}</small></button></li>
      <li><Link to={teamHref(g.away)} className="v3-menu"><TeamLogo team={g.away} size={22} />{g.away.name}</Link></li>
      <li><Link to={teamHref(g.home)} className="v3-menu"><TeamLogo team={g.home} size={22} />{g.home.name}</Link></li>
    </ul>
  );
}

function Hero({ g, back }: { g: V3Game; back: () => void }) {
  const sheet = useSheet();
  const live = g.phase === 'live';
  const src = scoreSourceWord(g);
  const rankName = (t: V3Game['away']) => <span className="v3-gh__n">{t.rank ? <small>#{t.rank}</small> : null}{t.nick}</span>;
  return (
    <header className={`v3-gh${live ? ' is-live' : ''}`}>
      <HeroBg g={g} cover />
      <div className="v3-gh__bar">
        <button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={26} /></button>
        <span className="v3-top__sp" />
        <FollowStar kind="games" id={g.key} label={`${g.away.nick} at ${g.home.nick}`} />
        <AlertBell id={g.key} label={`${g.away.nick} at ${g.home.nick}`} />
        <button type="button" className="v3-iconbtn" aria-label="More" onClick={() => sheet.open('Game', <MoreSheet g={g} />)}><Icon name="more" size={24} /></button>
      </div>
      <div className="v3-gh__meta">
        <span className="v3-gh__lg">{leagueLabel(g)}</span>
        {live ? (
          <span className="v3-gh__st"><span className="v3-livebadge">LIVE</span><span className="v3-gh__clk">{g.score?.clock ?? 'In play'}{g.network ? ` · ${g.network}` : ''}</span></span>
        ) : g.phase === 'final' ? (
          <span className="v3-gh__st"><span className="v3-gh__fin">FINAL</span>{g.network ? <span className="v3-gh__clk"> · {g.network}</span> : null}</span>
        ) : (
          <span className="v3-gh__st v3-gh__when">{dayWord(g.startMs)} · {clockTime(g.startMs)}{g.network ? ` · ${g.network}` : ''}</span>
        )}
      </div>
      <div className="v3-gh__grid">
        <Link to={teamHref(g.away)} className="v3-gh__logo" aria-label={`${g.away.name}, team page`}><TeamLogo team={g.away} size={76} /></Link>
        <div className="v3-gh__sc">
          {g.score ? <span className="num">{g.score.away}<i>–</i>{g.score.home}</span> : <span className="v3-gh__at">{g.phase === 'pregame' ? 'at' : '—'}</span>}
          {g.score?.source === 'demo' && <small className="v3-gh__tag">Sample score</small>}
        </div>
        <Link to={teamHref(g.home)} className="v3-gh__logo v3-gh__logo--h" aria-label={`${g.home.name}, team page`}><TeamLogo team={g.home} size={76} /></Link>
        <Link to={teamHref(g.away)} className="v3-gh__nm">{rankName(g.away)}{g.away.record && <em>({g.away.record})</em>}</Link>
        <div className="v3-gh__sit">{live ? (g.situation ? <>{g.situation.possession && <i className={`v3-gh__ball v3-gh__ball--${g.situation.possession}`} />}<span>{g.situation.text}</span></> : <span>{src ?? ''}</span>) : g.phase === 'final' ? <span>{src ?? ''}</span> : null}</div>
        <Link to={teamHref(g.home)} className="v3-gh__nm v3-gh__nm--h">{rankName(g.home)}{g.home.record && <em>({g.home.record})</em>}</Link>
      </div>
    </header>
  );
}

function CompactBar({ g, list, show }: { g: V3Game; list: V3Game[]; show: boolean }) {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const i = list.findIndex((x) => x.key === g.key);
  const go = (o: V3Game | undefined) => { if (o) nav(`${gameHref(o)}${sp.get('tab') ? `?tab=${sp.get('tab')}` : ''}`); };
  const prev = list[i - 1], next = list[i + 1];
  return (
    <div className={`v3-cb${show ? ' is-on' : ''}`} aria-hidden={!show}>
      <button type="button" className="v3-iconbtn" tabIndex={show ? 0 : -1} disabled={!prev} aria-label={prev ? `Previous game: ${prev.away.abbr} at ${prev.home.abbr}` : 'No previous game'} onClick={() => go(prev)}><Icon name="back" size={22} /></button>
      <button type="button" className="v3-cb__mid" tabIndex={show ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Scroll to top of game">
        <TeamLogo team={g.away} size={30} />
        <span className="v3-cb__sc">{g.score ? <b className="num">{g.score.away} – {g.score.home}</b> : <b>{g.away.abbr} at {g.home.abbr}</b>}<small>{g.phase === 'live' ? g.score?.clock ?? 'In play' : g.phase === 'final' ? 'Final' : clockTime(g.startMs)}</small></span>
        <TeamLogo team={g.home} size={30} />
      </button>
      <button type="button" className="v3-iconbtn" tabIndex={show ? 0 : -1} disabled={!next} aria-label={next ? `Next game: ${next.away.abbr} at ${next.home.abbr}` : 'No next game'} onClick={() => go(next)}><Icon name="chevR" size={22} /></button>
    </div>
  );
}

export function GameDetail() {
  const { slug = '', eventId = '' } = useParams();
  const key = `${slug}:${decodeURIComponent(eventId)}`;
  const { game, games, loading } = useGameByKey(key);
  const x = useGameExtras(game, 'full');
  const g = x?.game ?? game;
  const back = useBack();
  const follows = useFollows();
  const [sp, setSp] = useSearchParams();
  const tab = (TAB_KEYS.includes(sp.get('tab') as TabKey) ? sp.get('tab') : 'main') as TabKey;
  const detail = useEventDetail(g?.slug ?? '', g?.eventId ?? '', !!g && g.provenance === 'publication');
  const research = useGameResearch(g && g.provenance === 'publication' ? g.slug : null, g && g.provenance === 'publication' ? g.eventId : null);
  const lens = useMemo(() => (!g ? null : g.provenance === 'demo' ? demoLens(g) : lensFromResearch(research.data, g)), [g, research.data]);
  const list = useMemo(() => (g ? switcherGames(games, g, follows) : []), [g, games, follows]);

  useEffect(() => { if (g) pushVisit({ route: gameHref(g), title: `${g.away.nick} at ${g.home.nick}`, subtitle: `${leagueLabel(g)} · ${g.phase === 'live' ? 'Live' : g.phase === 'final' ? 'Final' : dayWord(g.startMs)}`, kind: 'game', slug: g.slug, logo: g.home.logo }); }, [g?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // collapse: the compact scoreboard appears once the hero and the rail have scrolled away
  const sentinel = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-60px 0px 0px 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [g?.key]);
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && tabsRef.current) tabsRef.current.scrollLeft = Math.max(0, el.offsetLeft - 24);
  }, [tab, g?.key]);

  if (!g) {
    return (
      <div className="v3-page">
        <header className="v3-top"><button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={26} /></button><Brand /></header>
        {loading ? <div className="v3-skel" style={{ height: 240 }} role="status" aria-label="Loading game" /> : (
          <div className="v3-state"><Icon name="info" size={20} /><div><b>This game is not on the published slate</b>It may have been removed, or the publication has not listed it yet.<br /><Link to="/v3/games" style={{ color: 'var(--sift-cyan)' }}>Browse games</Link></div></div>
        )}
      </div>
    );
  }
  const setTab = (t: TabKey) => setSp((p) => { const n = new URLSearchParams(p); if (t === 'main') n.delete('tab'); else n.set('tab', t); return n; }, { replace: true });
  return (
    <div className="v3-gd">
      <Hero g={g} back={back} />
      <div className="v3-gd__rail"><SwitcherRail current={g} games={games} tab={tab} /></div>
      <div ref={sentinel} className="v3-gd__sentinel" aria-hidden="true" />
      <CompactBar g={g} list={list} show={collapsed} />
      <div className={`v3-tabs${collapsed ? ' is-stuck' : ''}`} ref={tabsRef} role="tablist" aria-label="Game sections">
        {TAB_KEYS.map((k) => (
          <button key={k} type="button" role="tab" id={`gt-${k}`} aria-selected={tab === k} aria-controls="gt-panel" onClick={() => setTab(k)}>{k === 'main' ? mainLabel(g) : TAB_LABEL[k]}</button>
        ))}
      </div>
      <div className="v3-gd__body" id="gt-panel" role="tabpanel" aria-labelledby={`gt-${tab}`}>
        <GameTabBody tab={tab} g={g} lens={lens} detail={detail.data ?? null} research={research.data ?? null} researchLoading={research.loading} onTab={setTab} />
      </div>
    </div>
  );
}
