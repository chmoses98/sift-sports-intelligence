import { useMemo } from 'react';
import { Link, useSearchParams } from '../../routing';
import { useQueryPatch } from '../state/url';
import { useSearchIndex } from '../data/useSearch';
import { useSlate } from '../data/useSlate';
import { heroTeam } from '../../lib/hero/input';
import { demoOn, removeSaved, useAlerts, useFollows, useSaved } from '../state/prefs';
import type { V3Game, V3Team } from '../model/types';
import { AlertBell, FollowStar } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { TeamLogo } from '../ui/TeamLogo';
import { DelayedMark, gameHref, leagueLabel, statusWord, teamHref } from '../ui/gamebits';
import { followsGame } from './Games';

type Seg = 'all' | 'teams' | 'players' | 'games';
const SEGS: [Seg, string][] = [['all', 'All'], ['teams', 'Teams'], ['players', 'Players'], ['games', 'Games']];

function teamOf(key: string, games: V3Game[]): V3Team {
  const [slug, ...r] = key.split(':'); const id = r.join(':');
  for (const g of games) for (const t of [g.away, g.home]) if (t.slug === slug && t.id === id) return t;
  const h = heroTeam(slug.toUpperCase(), id, id);
  return { id, slug, sport: slug.toUpperCase(), name: h?.name ?? id, nick: h?.short ?? id, abbr: id, logo: h?.logo ?? null, colors: h?.colors ?? ['#1d2d52', '#3f5079'] };
}

function GameRow({ g }: { g: V3Game }) {
  return (
    <li className="v3-fg">
      <Link to={gameHref(g)} className="v3-fg__l" aria-label={`${g.away.name} at ${g.home.name}, ${statusWord(g)}. Open game`}>
        <span className="v3-av v3-av--pair"><TeamLogo team={g.away} size={30} /><TeamLogo team={g.home} size={30} /></span>
        <span className="v3-hit__t"><b>{g.away.abbr} @ {g.home.abbr}{g.score ? ` · ${g.score.away}–${g.score.home}` : ''}</b><small>{g.phase === 'live' ? <><span className="v3-pk__live">{g.score?.clock ?? 'In play'}</span><DelayedMark g={g} /></> : statusWord(g)} · {leagueLabel(g)}</small></span>
      </Link>
      <FollowStar kind="games" id={g.key} label={`${g.away.nick} at ${g.home.nick}`} />
      <AlertBell id={g.key} label={`${g.away.nick} at ${g.home.nick}`} />
    </li>
  );
}

const KIND_WORD = { player: 'Player', team: 'Team', stat: 'Statistic', game: 'Game', props: 'Props', other: 'Research' } as const;

export function Following() {
  const f = useFollows();
  const { games } = useSlate();
  const saved = useSaved();
  const alerts = useAlerts();
  const [sp] = useSearchParams();
  const setSp = useQueryPatch();
  const seg = (SEGS.some(([k]) => k === sp.get('seg')) ? sp.get('seg') : 'all') as Seg;
  const demo = demoOn();
  // A sport's search index (up to 450 KB with the explorer index it is found through) is read only to name a player this device follows in it.
  const playerSports = new Set(f.players.map((k) => k.split(':')[0]));
  const idx = { nfl: useSearchIndex('nfl', !demo && playerSports.has('nfl')), nba: useSearchIndex('nba', !demo && playerSports.has('nba')), nhl: useSearchIndex('nhl', !demo && playerSports.has('nhl')), mlb: useSearchIndex('mlb', !demo && playerSports.has('mlb')) };
  const teams = f.teams.map((k) => ({ k, t: teamOf(k, games) }));
  const players = f.players.map((k) => {
    const [slug, ...r] = k.split(':'); const id = r.join(':');
    const e = (idx[slug as keyof typeof idx]?.data?.items ?? []).find((x) => x.id === id);
    return { k, slug, id, name: e?.label ?? (id === 'sample-guard' ? 'Sample Guard' : id), sub: e ? `${slug.toUpperCase()} · ${e.secondary ?? ''}` : slug.toUpperCase() };
  });
  const followedGames = useMemo(() => games.filter((g) => f.games.includes(g.key)), [games, f.games]);
  const teamGames = useMemo(() => games.filter((g) => !f.games.includes(g.key) && followsGame(g, { teams: f.teams, games: [] })), [games, f]);
  const live = [...followedGames, ...teamGames].filter((g) => g.phase === 'live');
  const upcoming = [...followedGames, ...teamGames].filter((g) => g.phase === 'pregame').slice(0, 12);
  const empty = !f.teams.length && !f.players.length && !f.games.length;
  const show = (s: Seg) => seg === 'all' || seg === s;

  return (
    <div className="v3-page v3-following">
      <header className="v3-top"><h1 className="v3-pgtitle" style={{ margin: 0 }}>Following</h1><span className="v3-top__sp" /><Link to="/v3/settings" className="v3-iconbtn" aria-label="Settings"><Icon name="sliders" size={24} /></Link></header>
      <div className="v3-seg v3-seg--box" role="tablist" aria-label="Following sections">
        {SEGS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={seg === k} onClick={() => setSp((p) => { const n = new URLSearchParams(p); if (k === 'all') n.delete('seg'); else n.set('seg', k); return n; })}>{label}</button>)}
      </div>

      {empty && (
        <div className="v3-empty">
          <span className="v3-empty__ic"><Icon name="star" size={34} /></span>
          <h2>Nothing followed yet</h2>
          <p>Star a team, player or game and it appears here first, and its games lead the Game Switcher. Starring never turns on alerts.</p>
          <Link to="/v3/explore" className="v3-btn">Find teams and players</Link>
        </div>
      )}

      {live.length > 0 && show('games') && (
        <section aria-label="Live now"><div className="v3-sechead"><h2><i className="v3-livedot" aria-hidden="true" />Live now</h2></div><ul className="v3-fgs">{live.map((g) => <GameRow key={g.key} g={g} />)}</ul></section>
      )}
      {f.teams.length > 0 && show('teams') && (
        <section aria-label="Favorited teams">
          <div className="v3-sechead"><h2>Favorited Teams</h2><Link to="/v3/explore?cat=team">Add</Link></div>
          <div className="v3-teams v3-teams--wrap">{teams.map(({ k, t }) => (
            <div key={k} className="v3-tm"><Link to={teamHref(t)} className="v3-tm__l" aria-label={`${t.name}, team page`}><TeamLogo team={t} size={46} /><b>{t.nick}</b><small>{leagueLabel({ sport: t.sport })}</small></Link><FollowStar kind="teams" id={k} label={t.name} className="v3-tm__star" /></div>
          ))}<Link to="/v3/explore?cat=team" className="v3-tm v3-tm--add" aria-label="Add teams"><Icon name="plus" size={26} /><small>Add</small></Link></div>
        </section>
      )}
      {f.players.length > 0 && show('players') && (
        <section aria-label="Favorited players">
          <div className="v3-sechead"><h2>Favorited Players</h2><Link to="/v3/explore?cat=player">Add</Link></div>
          <ul className="v3-hits">{players.map((p) => (
            <li key={p.k} className="v3-hit"><Link to={`/v3/player/${p.slug}/${encodeURIComponent(p.id)}`} className="v3-hit__l"><span className="v3-av"><Icon name="user" size={22} /></span><span className="v3-hit__t"><b>{p.name}</b><small>{p.sub}</small></span></Link><FollowStar kind="players" id={p.k} label={p.name} /></li>
          ))}</ul>
        </section>
      )}
      {show('games') && (upcoming.length > 0 || (seg === 'games' && f.games.length > 0)) && (
        <section aria-label="Tracked games">
          <div className="v3-sechead"><h2>Tracked Games</h2><Link to="/v3/games?state=following">Open in Games</Link></div>
          <ul className="v3-fgs">{upcoming.map((g) => <GameRow key={g.key} g={g} />)}</ul>
          {upcoming.length === 0 && <p className="v3-note">No followed game is still to come on the published slate.</p>}
        </section>
      )}
      {seg === 'all' && !empty && Object.keys(alerts).length === 0 && <p className="v3-note v3-note--dim">Alerts are off. Tap a bell on a game or team to opt in, one at a time.</p>}

      <section aria-label="Saved research">
        <div className="v3-sechead"><h2>Saved Research</h2></div>
        {saved.length ? (
          <ul className="v3-hits">{saved.map((s) => (
            <li key={s.id} className="v3-hit v3-hit--saved">
              <Link to={s.route} className="v3-hit__l" aria-label={`Reopen ${s.title}: ${s.subtitle}`}>
                <span className="v3-hit__t">
                  <span className="v3-kind">{KIND_WORD[s.kind]}{s.sport ? ` · ${s.sport.toUpperCase()}` : ''}</span>
                  <b>{s.title}</b><small>{s.subtitle}</small>
                  {s.chips.length > 0 && <span className="v3-chiplist" aria-label="Saved setup">{s.chips.map((c) => <i key={c} className="v3-chipx">{c}</i>)}</span>}
                  {s.snapshot && <span className="v3-snap">Saved values: {s.snapshot.map((x) => `${x.label} ${x.value}`).join(' · ')}</span>}
                </span>
                <Icon name="chevR" size={20} />
              </Link>
              <button type="button" className="v3-iconbtn v3-star is-on" aria-label={`Remove saved ${s.title}`} onClick={() => removeSaved(s.id)}><Icon name="bookmark" size={22} fill /></button>
            </li>
          ))}</ul>
        ) : <p className="v3-note">Tap the bookmark on a player or statistic to save the exact setup: stat, line, window and filters come back as you left them. The numbers shown on a saved item are the frozen snapshot; open it to see the current ones.</p>}
      </section>
    </div>
  );
}
