import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from '../../routing';
import { useQueryPatch } from '../state/url';
import { heroTeam } from '../../lib/hero/input';
import { useSlate } from '../data/useSlate';
import { useGameExtras } from '../data/useGameExtras';
import { useGameResearch } from '../../views/broadcast/parts';
import { demoLens, lensFromResearch } from '../data/lens';
import { pickFeatured, stripGames } from '../model/feature';
import { clockTime, dayWord } from '../model/format';
import { setPrefs, toggleFollow, useAlerts, useFollows, usePrefs } from '../state/prefs';
import type { V3Game, V3Team } from '../model/types';
import { Brand } from '../ui/Brand';
import { HeroBg } from '../ui/HeroBg';
import { Icon } from '../ui/Icon';
import { LensSlot } from '../ui/Lens';
import { GameStories } from '../ui/Stories';
import { useSheet } from '../ui/Sheet';
import { TeamLogo } from '../ui/TeamLogo';
import { Welcome } from '../ui/Welcome';
import { gameHref, leagueLabel, scoreSourceWord, statusWord, teamHref } from '../ui/gamebits';
import { sportsIn } from './Games';

function BellSheet() {
  const a = useAlerts();
  const { games } = useSlate();
  const ids = Object.keys(a);
  const rows = ids.map((id) => ({ id, g: games.find((x) => x.key === id) }));
  return (
    <div>
      {ids.length === 0 ? <p className="v3-note">No alerts are on. Alerts are off by default; tap the bell on a game or team to opt in, one at a time. Following something does not turn alerts on.</p> : (
        <ul className="v3-list">
          {rows.map(({ id, g }) => (
            <li key={id}>{g ? <Link to={gameHref(g)} className="v3-story"><TeamLogo team={g.home} size={36} /><span className="v3-story__t"><b>{g.away.nick} at {g.home.nick}</b><small>{(a[id] ?? []).join(', ')}</small></span><Icon name="chevR" size={20} /></Link> : <span className="v3-note">{id}</span>}</li>
          ))}
        </ul>
      )}
      <p className="v3-note v3-note--dim">This build records alert choices on this device only. It does not request notification permission or send anything.</p>
    </div>
  );
}

function ScoreTile({ g }: { g: V3Game }) {
  const live = g.phase === 'live';
  const scored = g.score != null;
  return (
    <Link to={gameHref(g)} className={`v3-tile${live ? ' is-live' : ''}`} aria-label={`${g.away.name} at ${g.home.name}, ${scored ? `${g.score!.away} to ${g.score!.home}, ` : ''}${statusWord(g)}. Open game`}>
      <span className="v3-tile__h">{leagueLabel(g)}<i /> {live ? <b className="v3-tile__live">LIVE</b> : <span>{g.phase === 'final' ? 'FINAL' : clockTime(g.startMs)}</span>}</span>
      {([g.away, g.home] as V3Team[]).map((t, i) => (
        <span key={t.id} className="v3-tile__r"><TeamLogo team={t} size={20} /><b>{t.abbr}</b>{scored && <em className="num">{i === 0 ? g.score!.away : g.score!.home}</em>}</span>
      ))}
      {live && <span className="v3-tile__f">{g.score?.clock ?? 'In play'}</span>}
      {!live && g.phase === 'pregame' && <span className="v3-tile__f">{dayWord(g.startMs)}</span>}
    </Link>
  );
}

function Featured({ base }: { base: V3Game }) {
  const x = useGameExtras(base, 'full');
  const g = x?.game ?? base;
  const research = useGameResearch(g.provenance === 'publication' ? g.slug : null, g.provenance === 'publication' ? g.eventId : null);
  const lens = useMemo(() => (g.provenance === 'demo' ? demoLens(g) : lensFromResearch(research.data, g)), [g, research.data]);
  const live = g.phase === 'live';
  const src = scoreSourceWord(g);
  return (
    <article className={`v3-feat${live ? ' is-live' : ''}`}>
      <HeroBg g={g} />
      <Link to={gameHref(g)} className="v3-feat__hit" aria-label={`${g.away.name} ${g.phase === 'pregame' ? 'at' : 'versus'} ${g.home.name}. Open game`} />
      <header className="v3-feat__top">
        {live ? <span className="v3-livebadge">LIVE</span> : <span className="v3-feat__chip">{g.phase === 'final' ? 'FINAL' : dayWord(g.startMs).toUpperCase()}</span>}
        <span className="v3-feat__clock">{live ? g.score?.clock ?? 'In play' : g.phase === 'final' ? '' : clockTime(g.startMs)}</span>
        <span className="v3-feat__net">{g.network ?? leagueLabel(g)}</span>
      </header>
      <div className="v3-feat__mid">
        <Link to={teamHref(g.away)} className="v3-feat__team" aria-label={`${g.away.name}, team page`}><TeamLogo team={g.away} size={54} /><b>{g.away.nick}</b>{g.away.record && <small>{g.away.record}</small>}</Link>
        <div className="v3-feat__sc">
          {g.score ? <span className="num">{g.score.away}<i>–</i>{g.score.home}</span> : <span className="v3-feat__at">{g.phase === 'pregame' ? 'at' : 'vs'}</span>}
        </div>
        <Link to={teamHref(g.home)} className="v3-feat__team" aria-label={`${g.home.name}, team page`}><TeamLogo team={g.home} size={54} /><b>{g.home.nick}</b>{g.home.record && <small>{g.home.record}</small>}</Link>
      </div>
      <p className="v3-feat__status">{g.phase === 'live' ? (g.situation?.text ?? src ?? 'In play') : g.phase === 'final' ? (src ?? 'Final') : `${leagueLabel(g)}${g.network ? ` · ${g.network}` : ''}`}</p>
      <div className="v3-feat__lens"><LensSlot lens={lens} loading={g.provenance === 'publication' && research.loading} to={`${gameHref(g)}?tab=matchup`} /></div>
      <Link to={gameHref(g)} className="v3-btn v3-btn--glass">Game Center<Icon name="chevR" size={18} /></Link>
    </article>
  );
}

function teamOfKey(key: string, games: V3Game[]): V3Team {
  const [slug, ...rest] = key.split(':');
  const id = rest.join(':');
  for (const g of games) for (const t of [g.away, g.home]) if (t.slug === slug && t.id === id) return t;
  const sport = slug.toUpperCase();
  const h = heroTeam(sport, id, id);
  return { id, slug, sport, name: h?.name ?? id, nick: h?.short ?? id, abbr: id, logo: h?.logo ?? null, colors: h?.colors ?? ['#1d2d52', '#3f5079'] };
}

export function MyTeams({ games, limit = 4 }: { games: V3Game[]; limit?: number }) {
  const f = useFollows();
  const teams = f.teams.map((k) => teamOfKey(k, games));
  const suggest = useMemo(() => {
    if (teams.length) return [] as V3Team[];
    const seen = new Set<string>(); const out: V3Team[] = [];
    for (const g of games) for (const t of [g.home, g.away]) { if (!t.logo) continue; const k = `${t.slug}:${t.id}`; if (!seen.has(k) && out.length < limit) { seen.add(k); out.push(t); } }
    return out;
  }, [games, teams.length, limit]);
  return (
    <section aria-label="My Teams">
      <div className="v3-sechead"><h2>My Teams</h2><Link to="/v3/following">{teams.length ? 'Edit' : 'See all'}<Icon name="chevR" size={16} /></Link></div>
      {teams.length === 0 && <p className="v3-note" style={{ margin: '-4px 0 10px' }}>Follow teams to pin their games first. Starring a team never turns on alerts.</p>}
      <div className="v3-teams">
        {(teams.length ? teams.slice(0, limit) : suggest).map((t) => (
          <div key={`${t.slug}:${t.id}`} className="v3-tm">
            <Link to={teamHref(t)} className="v3-tm__l" aria-label={`${t.name}, team page`}><TeamLogo team={t} size={46} /><b>{t.nick}</b><small>{leagueLabel({ sport: t.sport })}</small></Link>
            {!teams.length && <button type="button" className="v3-tm__f" aria-label={`Follow ${t.name}`} onClick={() => toggleFollow('teams', `${t.slug}:${t.id}`)}><Icon name="plus" size={16} /></button>}
          </div>
        ))}
        <Link to="/v3/following" className="v3-tm v3-tm--more" aria-label="All followed teams and players"><Icon name="chevR" size={26} /></Link>
      </div>
    </section>
  );
}

const SAMPLE_STORIES = [
  { t: 'Sample: Knicks guard listed probable for tonight', s: 'Sample · NBA', team: ['NBA', 'NYK'] as const },
  { t: 'Sample: Alabama moves up in the latest rankings', s: 'Sample · NCAAF', team: ['CFB', 'ALA'] as const },
  { t: 'Sample: Dodgers name a Game 3 starter', s: 'Sample · MLB', team: ['MLB', 'LAD'] as const },
];

export function Home() {
  const { games, loading, unavailable, failed, saved, now, demo } = useSlate();
  const f = useFollows();
  const sheet = useSheet();
  const alerts = useAlerts();
  const [sp] = useSearchParams();
  const setSp = useQueryPatch();
  const sport = sp.get('sport') ?? 'foryou';
  const pool = useMemo(() => (sport === 'foryou' ? games : games.filter((g) => g.slug === sport)), [games, sport]);
  const featured = useMemo(() => pickFeatured(pool, f, now), [pool, f, now]);
  const strip = useMemo(() => stripGames(pool, f, featured), [pool, f, featured]);
  const sports = useMemo(() => sportsIn(games), [games]);
  const storyGames = useMemo(() => {
    const cand = pool.filter((g) => g.phase !== 'final' && g.key !== featured?.key && g.slug === 'nfl');
    return [...(featured && featured.slug === 'nfl' ? [featured] : []), ...cand].slice(0, 4);
  }, [pool, featured]);
  const setSport = (v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v === 'foryou') n.delete('sport'); else n.set('sport', v); return n; });
  const hasAlerts = Object.keys(alerts).length > 0;
  const prefs = usePrefs();
  // First run on real data only: a skippable welcome, shown once. It never appears over sample data (QA) or blocks Home.
  useEffect(() => {
    if (demo || prefs.onboarded || loading || games.length === 0) return;
    setPrefs({ onboarded: true });
    sheet.open('Welcome to SIFT', <Welcome games={games} />, { tall: true });
  }, [demo, prefs.onboarded, loading, games.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="v3-page v3-home">
      <header className="v3-top">
        <Brand />
        <span className="v3-top__sp" />
        <Link to="/v3/explore?focus=1" className="v3-iconbtn" aria-label="Search"><Icon name="search" size={24} /></Link>
        <button type="button" className="v3-iconbtn" aria-label={`Alerts${hasAlerts ? ', some on' : ', none on'}`} onClick={() => sheet.open('Alerts', <BellSheet />)}>
          <Icon name="bell" size={24} />{hasAlerts && <i className="v3-bell__dot" aria-hidden="true" />}
        </button>
      </header>

      <div className="v3-chips v3-chips--home" role="group" aria-label="Sport">
        <button type="button" className="v3-chip" aria-pressed={sport === 'foryou'} onClick={() => setSport('foryou')}>For You</button>
        {sports.map((s) => <button key={s.slug} type="button" className="v3-chip" aria-pressed={sport === s.slug} onClick={() => setSport(s.slug)}>{s.label}</button>)}
      </div>

      {unavailable && <div className="v3-state v3-state--warn" role="alert" style={{ marginTop: 12 }}><Icon name="wifiOff" size={20} /><div><b>Published games are unavailable</b>A failed publication does not mean there are no games.<br /><button type="button" onClick={() => location.reload()}>Retry</button></div></div>}
      {saved.length > 0 && <div className="v3-state v3-state--warn" role="status" style={{ marginTop: 12 }}><Icon name="info" size={20} /><div><b>Saved copy in use</b>{saved.map((x) => x.label).join(', ')} {saved.length === 1 ? 'is' : 'are'} showing the research saved with this app because the live publication could not be read. Prices appear only when a current Kalshi quote is available.</div></div>}
      {!unavailable && failed.length > 0 && <div className="v3-state" style={{ marginTop: 12 }}><Icon name="info" size={20} /><div><b>{failed.length} feed{failed.length === 1 ? '' : 's'} unavailable</b>{failed.join(', ')} could not be read; showing everything else.</div></div>}

      {loading && !games.length ? (
        <div role="status" aria-label="Loading games">
          <div className="v3-skel" style={{ height: 92, marginTop: 14 }} />
          <div className="v3-skel" style={{ height: 262, marginTop: 14 }} />
        </div>
      ) : (
        <>
          {strip.length > 0 && (
            <div className="v3-strip" role="list" aria-label="Scoreboard">
              {strip.map((g) => <div role="listitem" key={g.key}><ScoreTile g={g} /></div>)}
              <div role="listitem"><Link to="/v3/games" className="v3-tile v3-tile--more" aria-label="All games"><Icon name="chevR" size={22} /></Link></div>
            </div>
          )}
          {featured ? <Featured key={featured.key} base={featured} /> : !unavailable && <div className="v3-state" style={{ marginTop: 16 }}><Icon name="calendar" size={20} /><div><b>No games to feature</b>Nothing is published for {sport === 'foryou' ? 'today' : 'this sport'} yet. <Link to="/v3/games" style={{ color: 'var(--sift-cyan)' }}>Browse all games</Link></div></div>}
        </>
      )}

      <MyTeams games={games} />

      <section aria-label="What's happening">
        <div className="v3-sechead"><h2>What's happening</h2><Link to="/v3/games">See all<Icon name="chevR" size={16} /></Link></div>
        <ul className="v3-stories">
          {demo ? SAMPLE_STORIES.map((s) => {
            const t = games.flatMap((g) => [g.away, g.home]).find((x) => x.sport === s.team[0] && x.id === s.team[1]);
            return <li key={s.t}><Link to={t ? teamHref(t) : '/v3/games'} className="v3-story">{t && <TeamLogo team={t} size={44} />}<span className="v3-story__t"><b>{s.t}</b><small>{s.s}</small></span><Icon name="chevR" size={20} /></Link></li>;
          }) : storyGames.map((g) => <GameStories key={g.key} g={g} />)}
          <li>
            <Link to="/v3/games" className="v3-story">
              <span className="v3-story__ic"><Icon name="calendar" size={22} /></span>
              <span className="v3-story__t"><b>{games.filter((g) => g.phase === 'pregame' || g.phase === 'live').length} games on the published slate</b><small>{games.filter((g) => g.signals > 0).length} with published research signals</small></span>
              <Icon name="chevR" size={20} />
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
