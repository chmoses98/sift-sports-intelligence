import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from '../../routing';
import { useRouteState } from '../state/url';
import { useGameByKey } from '../data/useSlate';
import { useGameExtras, useEventDetail, useEventResearch } from '../data/useGameExtras';
import { useGameStart } from '../data/research/gameHooks';
import { weekOf } from '../data/research/gameMarkets';
import { unitsFor } from '../data/research/matchup';
import { isReady } from '../model/capabilities';
import { switcherGames } from '../model/switcher';
import { clockTime, dayClock, dayWord, weekdayClock } from '../model/time';
import { TeamLink } from '../nav/Targets';
import { useGameBack, useGameOriginMark, useSwitchGame } from '../nav/useGameNav';
import { gameSchema, type GameTab } from '../nav/schemas';
import { pushVisit, useFollows } from '../state/prefs';
import type { V3Game } from '../model/types';
import { AlertBell, FollowStar } from '../ui/Controls';
import { HeroBg } from '../ui/HeroBg';
import { Icon } from '../ui/Icon';
import { useSheet } from '../ui/Sheet';
import { SwitcherRail } from '../ui/Switcher';
import { usePublishGameContracts } from '../ui/gameContracts';
import { TeamLogo } from '../ui/TeamLogo';
import { DelayedMark, gameHref, leagueLabel, scoreSourceWord, teamHref } from '../ui/gamebits';
import { GameTabBody } from './GameTabs';
import type { GameCtx } from './GameShared';
import './matchup.css';
import { Brand } from '../ui/Brand';

const TAB_LABEL: Record<Exclude<GameTab, 'overview'>, string> = { script: 'Game Script', matchup: 'Matchup', props: 'Props', stats: 'Stats' };
const mainLabel = (g: V3Game) => (g.phase === 'live' ? 'Live' : g.phase === 'final' ? 'Recap' : 'Overview');
/** NFL (a sport whose unit matchup is ready) has all five tabs; every other sport has Overview and Props. */
export const tabsFor = (slug: string): GameTab[] => (isReady(slug, 'gameMatchup') ? ['overview', 'script', 'matchup', 'props', 'stats'] : ['overview', 'props']);

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

function Hero({ g, back, startMs }: { g: V3Game; back: () => void; startMs: number | null }) {
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
        <span className="v3-gh__lg">{leagueLabel(g)}{weekOf(g.item?.competition) ? ` · ${weekOf(g.item?.competition)}` : ''}</span>
        {live ? (
          <span className="v3-gh__st"><span className="v3-livebadge">LIVE</span><span className="v3-gh__clk">{g.score?.clock ?? 'In play'}<DelayedMark g={g} />{g.network ? ` · ${g.network}` : ''}</span></span>
        ) : g.phase === 'final' ? (
          <span className="v3-gh__st"><span className="v3-gh__fin">FINAL</span>{g.network ? <span className="v3-gh__clk"> · {g.network}</span> : null}</span>
        ) : (
          <span className="v3-gh__st v3-gh__when">{dayClock(startMs, Date.now(), undefined, ' · ')}{g.network ? ` · ${g.network}` : ''}</span>
        )}
      </div>
      <div className="v3-gh__grid">
        <TeamLink team={{ slug: g.slug, id: g.away.id }} className="v3-gh__logo" label={`${g.away.name}, team page`}><TeamLogo team={g.away} size={56} /></TeamLink>
        <div className="v3-gh__sc">
          {g.score ? <span className="num">{g.score.away}<i>–</i>{g.score.home}</span> : <span className="v3-gh__at">{g.phase === 'pregame' ? 'at' : '—'}</span>}
          {g.score?.source === 'demo' && <small className="v3-gh__tag">Sample score</small>}
        </div>
        <TeamLink team={{ slug: g.slug, id: g.home.id }} className="v3-gh__logo v3-gh__logo--h" label={`${g.home.name}, team page`}><TeamLogo team={g.home} size={56} /></TeamLink>
        <TeamLink team={{ slug: g.slug, id: g.away.id }} className="v3-gh__nm" label={`${g.away.name}, team page`}>{rankName(g.away)}{g.away.record && <em>({g.away.record})</em>}</TeamLink>
        <div className="v3-gh__sit">{live ? (g.situation ? <>{g.situation.possession && <i className={`v3-gh__ball v3-gh__ball--${g.situation.possession}`} />}<span>{g.situation.text}</span></> : <span>{src ?? ''}</span>) : g.phase === 'final' ? <span>{src ?? ''}</span> : null}</div>
        <TeamLink team={{ slug: g.slug, id: g.home.id }} className="v3-gh__nm v3-gh__nm--h" label={`${g.home.name}, team page`}>{rankName(g.home)}{g.home.record && <em>({g.home.record})</em>}</TeamLink>
      </div>
    </header>
  );
}

function CompactBar({ g, list, show, tab, startMs }: { g: V3Game; list: V3Game[]; show: boolean; tab: GameTab; startMs: number | null }) {
  const switchTo = useSwitchGame();
  const i = list.findIndex((x) => x.key === g.key);
  const go = (o: V3Game | undefined) => { if (o) switchTo(o, tab); };
  const prev = list[i - 1], next = list[i + 1];
  return (
    <div className={`v3-cb${show ? ' is-on' : ''}`} aria-hidden={!show}>
      <button type="button" className="v3-iconbtn" tabIndex={show ? 0 : -1} disabled={!prev} aria-label={prev ? `Previous game: ${prev.away.abbr} at ${prev.home.abbr}` : 'No previous game'} onClick={() => go(prev)}><Icon name="back" size={22} /></button>
      <button type="button" className="v3-cb__mid" tabIndex={show ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Scroll to top of game">
        <TeamLogo team={g.away} size={30} />
        <span className="v3-cb__sc">{g.score ? <b className="num">{g.score.away} – {g.score.home}</b> : <b>{g.away.abbr} at {g.home.abbr}</b>}<small>{g.phase === 'live' ? <>{g.score?.clock ?? 'In play'}<DelayedMark g={g} /></> : g.phase === 'final' ? 'Final' : clockTime(startMs)}</small></span>
        <TeamLogo team={g.home} size={30} />
      </button>
      <button type="button" className="v3-iconbtn" tabIndex={show ? 0 : -1} disabled={!next} aria-label={next ? `Next game: ${next.away.abbr} at ${next.home.abbr}` : 'No next game'} onClick={() => go(next)}><Icon name="chevR" size={22} /></button>
    </div>
  );
}

/** The compact bar of an expanded unit (locked G2): back, the two teams, the start, the alert. The hero and rail give way to the unit. */
function UnitBar({ g, back, startMs }: { g: V3Game; back: () => void; startMs: number | null }) {
  return (
    <div className="mx-ubar">
      <button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={24} /></button>
      <div className="mx-ubar__m">
        <TeamLink team={{ slug: g.slug, id: g.away.id }} className="mx-ubar__t" label={`${g.away.name}, team page`}><TeamLogo team={g.away} size={26} /><b>{g.away.abbr}</b></TeamLink>
        <span>at</span>
        <TeamLink team={{ slug: g.slug, id: g.home.id }} className="mx-ubar__t" label={`${g.home.name}, team page`}><b>{g.home.abbr}</b><TeamLogo team={g.home} size={26} /></TeamLink>
      </div>
      <span className="mx-ubar__s">{weekdayClock(startMs)}</span>
      <AlertBell id={g.key} label={`${g.away.nick} at ${g.home.nick}`} />
    </div>
  );
}

export function GameDetail() {
  const { slug = '', eventId = '' } = useParams();
  const key = `${slug}:${decodeURIComponent(eventId)}`;
  const { game, games, loading } = useGameByKey(key);
  const startMs = useGameStart(game);
  const x = useGameExtras(game, 'full', true, startMs);
  const g = x?.game ?? game;
  useGameOriginMark();
  const back = useGameBack();
  const nav = useNavigate();
  const loc = useLocation();
  const follows = useFollows();
  const [st, setSt] = useRouteState(gameSchema);
  const tabs = useMemo(() => tabsFor(g?.slug ?? slug), [g?.slug, slug]);
  // A tab this sport does not have (a shared link, a saved route, a game switched to) falls back to Overview.
  const tab: GameTab = tabs.includes(st.tab) ? st.tab : 'overview';
  const unitOpen = !!g && tab === 'matchup' && !!st.unit && unitsFor(g.slug).some((u) => u.id === st.unit);
  const detail = useEventDetail(g?.slug ?? '', g?.eventId ?? '', !!g && g.provenance === 'publication');
  const research = useEventResearch(g?.slug ?? '', g?.eventId ?? '', !!g && g.provenance === 'publication');
  const list = useMemo(() => (g ? switcherGames(games, g, follows) : []), [g, games, follows]);
  // Every price on this screen opens the one exact-contract sheet; tell it about the game's contracts (start from the schedule authority).
  usePublishGameContracts(g, startMs, detail.data);

  useEffect(() => { if (g) pushVisit({ route: gameHref(g), title: `${g.away.nick} at ${g.home.nick}`, subtitle: `${leagueLabel(g)} · ${g.phase === 'live' ? 'Live' : g.phase === 'final' ? 'Final' : dayWord(startMs ?? g.startMs)}`, kind: 'game', slug: g.slug, logo: g.home.logo }); }, [g?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // collapse: the compact scoreboard appears once the hero and the rail have scrolled away
  const sentinel = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-60px 0px 0px 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [g?.key, unitOpen]);
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Only scroll the tab strip when the selected tab is not fully in view (never to centre it: that clips the first tab for no reason).
    const el = tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    const box = tabsRef.current;
    if (el && box && (el.offsetLeft < box.scrollLeft || el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth)) box.scrollLeft = Math.max(0, el.offsetLeft - 16);
  }, [tab, g?.key]);

  if (!g) {
    return (
      <div className="v3-page">
        <header className="v3-top"><button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={26} /></button><Brand /></header>
        {loading ? <div className="v3-skel" style={{ height: 240 }} role="status" aria-label="Loading game" /> : (
          <div className="v3-state"><Icon name="info" size={20} /><div><b>This game is not on the published slate</b>It may have been removed, or the publication has not listed it yet.<br /><Link to="/v3" replace style={{ color: 'var(--sift-cyan)' }}>Browse games</Link></div></div>
        )}
      </div>
    );
  }
  // Switching tab is an in-place change (history replaced). Leaving the unit view is part of it; direction and Lens state are kept.
  const setTab = (t: GameTab) => setSt({ tab: t, unit: null });
  // Back out of an expanded unit: the list entry below is exactly as it was left. A shared link into a unit has none, so it closes the unit.
  const backFromUnit = () => { if (loc.key !== 'default') nav(-1); else setSt({ unit: null }); };
  const ctx: GameCtx = { g, startMs, detail: detail.data ?? null, research: research.data ?? null, researchLoading: research.loading, detailError: detail.error, detailRetry: detail.retry, researchError: research.error, researchRetry: research.retry };
  return (
    <div className="v3-gd">
      {unitOpen ? <UnitBar g={g} back={backFromUnit} startMs={startMs} /> : (
        <>
          <Hero g={g} back={back} startMs={startMs} />
          <div className="v3-gd__rail"><SwitcherRail current={g} games={games} tab={tab} /></div>
          <div ref={sentinel} className="v3-gd__sentinel" aria-hidden="true" />
          <CompactBar g={g} list={list} show={collapsed} tab={tab} startMs={startMs} />
        </>
      )}
      <div className={`v3-tabs${tabs.length > 2 ? ' v3-tabs--five' : ''}${collapsed || unitOpen ? ' is-stuck' : ''}`} ref={tabsRef} role="tablist" aria-label="Game sections">
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" id={`gt-${k}`} aria-selected={tab === k} aria-controls="gt-panel" onClick={() => setTab(k)}>{k === 'overview' ? mainLabel(g) : TAB_LABEL[k]}</button>
        ))}
      </div>
      <div className="v3-gd__body" id="gt-panel" role="tabpanel" aria-labelledby={`gt-${tab}`}>
        <GameTabBody tab={tab} ctx={ctx} detail={ctx.detail} research={ctx.research} researchLoading={ctx.researchLoading} onTab={setTab} />
      </div>
    </div>
  );
}
