// Following: everything the viewer follows, across every sport, in one place. Nothing needs picking: teams, players and games of every sport
// are read together, and the optional sport chips (only sports followed) merely filter, kept in the address (?sport=nba).
// Order: live now, player updates, upcoming (by day), recent finals, then what is followed (unfollow, alerts) and saved research.
// Follow (star) and alerts (bell) stay separate stores. Every number shown comes from the slate, the player's published game log or a
// published Kalshi line: where there is none the card says so.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from '../../routing';
import { useQueryPatch } from '../state/url';
import { useSearchIndex } from '../data/useSearch';
import { useSlate } from '../data/useSlate';
import { demoPlayerTeamKey, DEMO_PLAYER_ID, usePlayerVM, type PlayerVM } from '../data/usePlayer';
import { heroTeam } from '../../lib/hero/input';
import { demoOn, removeSaved, useAlerts, useFollows, useSaved } from '../state/prefs';
import { filterFollows, followedSports, isEmptyFollows, keyId, keySlug, meanOf, recentRows, selectFollowing, suggestTeams, validSport, type FollowedGame, type Why } from '../model/following';
import { dayWord, keyLabel } from '../model/time';
import type { V3Game, V3Team } from '../model/types';
import { AlertBell, FollowStar } from '../ui/Controls';
import { ChipRail } from '../ui/ChipRail';
import { GameCard } from '../ui/GameCard';
import { Icon } from '../ui/Icon';
import { TeamLogo } from '../ui/TeamLogo';
import { DelayedMark, gameHref, leagueLabel, statusWord, teamHref, useSeen } from '../ui/gamebits';
import './following.css';

function teamOf(key: string, games: readonly V3Game[]): V3Team {
  const slug = keySlug(key); const id = keyId(key);
  for (const g of games) for (const t of [g.away, g.home]) if (t.slug === slug && t.id === id) return t;
  const h = heroTeam(slug.toUpperCase(), id, id);
  return { id, slug, sport: slug.toUpperCase(), name: h?.name ?? id, nick: h?.short ?? id, abbr: id, logo: h?.logo ?? null, colors: h?.colors ?? ['#1d2d52', '#3f5079'] };
}

const sportWord = (slug: string) => leagueLabel({ sport: slug.toUpperCase() });

interface PlayerInfo { key: string; slug: string; id: string; name: string; position: string | null; teamKey: string | null; team: V3Team | null }

// ---------------------------------------------------------------- game rows

/** A compact row (upcoming, awaiting result, final, followed games): the game opens, its star and bell are their own taps. */
function GameRow({ g }: { g: V3Game }) {
  const done = g.phase === 'final' && g.score;
  const awayWon = !!done && g.score!.away > g.score!.home, homeWon = !!done && g.score!.home > g.score!.away;
  return (
    <li className="v3-fg">
      <Link to={gameHref(g)} className="v3-fg__l" aria-label={`${g.away.name} at ${g.home.name}, ${done ? `${g.score!.away} to ${g.score!.home}, ` : ''}${statusWord(g)}. Open game`}>
        <span className="v3-av v3-av--pair"><TeamLogo team={g.away} size={30} /><TeamLogo team={g.home} size={30} /></span>
        <span className="v3-hit__t">
          <b>
            <span className={awayWon ? 'v3-fw' : undefined}>{g.away.abbr}{done ? ` ${g.score!.away}` : ''}</span>{' '}
            <span className="v3-fat">{done ? '–' : '@'}</span>{' '}
            <span className={homeWon ? 'v3-fw' : undefined}>{g.home.abbr}{done ? ` ${g.score!.home}` : ''}</span>
          </b>
          <small>{statusWord(g)}{g.phase === 'live' && <DelayedMark g={g} />} · {leagueLabel(g)}</small>
        </span>
      </Link>
      <FollowStar kind="games" id={g.key} label={`${g.away.nick} at ${g.home.nick}`} />
      <AlertBell id={g.key} label={`${g.away.nick} at ${g.home.nick}`} />
    </li>
  );
}

function whyText(w: Why, games: readonly V3Game[], players: Map<string, PlayerInfo>): string {
  if (w.kind === 'game') return 'Starred game';
  if (w.kind === 'team') return teamOf(w.teamKey, games).nick;
  return `${players.get(w.playerKey)?.name ?? 'Your player'}'s team`;
}

/** A live game as the app's own card, with the reason it is here above it. */
function LiveItem({ x, games, players }: { x: FollowedGame; games: readonly V3Game[]; players: Map<string, PlayerInfo> }) {
  const reasons = [...new Set(x.why.map((w) => whyText(w, games, players)))];
  return (
    <li className="v3-fl__item">
      <p className="v3-fl__why"><Icon name="star" size={12} fill />{reasons.join(' · ')}</p>
      <GameCard g={x.g} />
    </li>
  );
}

// ---------------------------------------------------------------- player updates

const fmtStat = (n: number | null | undefined) => (n == null ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Recent performance and the coming game's lines, from the player's own published log and contracts. Read only for a card near the screen. */
function PlayerBody({ p, now }: { p: PlayerInfo; now: number }) {
  const { vm, loading, notFound, noExplorer } = usePlayerVM(p.slug, p.id, { quotes: false }); // lines only: this card prints no price, so no live quote is registered
  if (!vm) {
    return <p className="v3-note v3-fp__empty">{loading ? 'Loading recent games' : notFound || noExplorer ? 'No research is published for this player yet.' : 'Recent games could not be read right now.'}</p>;
  }
  return <PlayerBodyReady vm={vm} p={p} now={now} />;
}

function PlayerBodyReady({ vm, p, now }: { vm: PlayerVM; p: PlayerInfo; now: number }) {
  const cols = vm.stats.slice(0, 3);
  const recent = recentRows(vm.obs, 3);
  const last5 = recentRows(vm.obs, 5);
  const avg = last5.length >= 3 ? cols.map((c) => meanOf(last5.map((r) => r.v[c.key]))) : null;
  const next = vm.next;
  const when = next ? dayWord(vm.nextStartMs ?? next.startMs, now) : '';
  const lines = [...vm.props.entries()].filter(([, r]) => r.price.tradable).slice(0, 4);
  return (
    <div className="v3-fp__body">
      {next ? (
        <Link to={gameHref(next)} className="v3-fp__next" aria-label={`${vm.name}: ${vm.nextHome === false ? 'at' : 'vs'} ${vm.opp?.name ?? 'opponent'}, ${next.phase === 'live' ? 'in play' : when}. Open game`}>
          {next.phase === 'live' ? <span className="v3-pk__live">In play</span> : <b>{when}</b>}
          <span>{vm.nextHome === false ? '@' : 'vs'} {vm.opp?.abbr ?? ''}{next.phase === 'live' && next.score ? ` · ${next.away.abbr} ${next.score.away}–${next.score.home} ${next.home.abbr}` : next.phase === 'pregame' ? ` · ${statusWord(next)}` : ''}</span>
          <Icon name="chevR" size={16} />
        </Link>
      ) : <p className="v3-note v3-fp__nonext">No game for {vm.team?.nick ?? 'his team'} on the published slate.</p>}
      {next?.phase === 'live' && <p className="v3-note v3-note--dim v3-fp__src">Live player stats are not published. The last games are shown.</p>}

      {lines.length > 0 && (
        <div className="v3-fp__lines" role="group" aria-label={`${when === 'Today' ? "Today's" : 'Coming'} lines for ${vm.name}`}>
          <small>{when === 'Today' ? "Today's lines" : `Lines · ${when}`} <span>{lines[0][1].price.source === 'Sample' ? 'Sample' : 'Kalshi'}</span></small>
          <div className="v3-fp__chips">
            {lines.map(([k, r]) => (
              <Link key={k} to={`/v3/player/${p.slug}/${encodeURIComponent(p.id)}?stat=${encodeURIComponent(k)}`} className="v3-fp__chip" aria-label={`${vm.name} ${vm.stats.find((s) => s.key === k)?.label ?? r.statLabel} line ${r.line}. Open research`}>
                <span>{vm.stats.find((s) => s.key === k)?.short ?? r.statLabel}</span><b className="num">{r.line}</b>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && cols.length > 0 ? (
        <table className="v3-fp__log">
          <caption className="v3-fp__cap">Recent games</caption>
          <thead><tr><th scope="col">Game</th>{cols.map((c) => <th key={c.key} scope="col" title={c.label}>{c.short}</th>)}</tr></thead>
          <tbody>
            {recent.map((r) => <tr key={r.key}><th scope="row">{keyLabel(r.date).replace(/^\w+, /, '')} <span>{r.label.replace(/ · wk \d+$/, '')}</span></th>{cols.map((c) => <td key={c.key} className="num">{fmtStat(r.v[c.key])}</td>)}</tr>)}
            {avg && <tr className="v3-fp__avg"><th scope="row">Last {last5.length} avg</th>{avg.map((a, i) => <td key={cols[i].key} className="num">{fmtStat(a == null ? null : Math.round(a * 10) / 10)}</td>)}</tr>}
          </tbody>
        </table>
      ) : <p className="v3-note v3-fp__empty">{vm.why ?? 'No game log is published for this player.'}</p>}
    </div>
  );
}

function PlayerCard({ p, now }: { p: PlayerInfo; now: number }) {
  const [ref, seen] = useSeen<HTMLLIElement>();
  return (
    <li ref={ref} className="v3-fp">
      <div className="v3-fp__h">
        <Link to={`/v3/player/${p.slug}/${encodeURIComponent(p.id)}`} className="v3-fp__l" aria-label={`${p.name}, player research`}>
          {p.team ? <TeamLogo team={p.team} size={34} /> : <span className="v3-av"><Icon name="user" size={22} /></span>}
          <span className="v3-hit__t"><b>{p.name}</b><small>{[sportWord(p.slug), p.position, p.team?.nick].filter(Boolean).join(' · ')}</small></span>
        </Link>
        <FollowStar kind="players" id={p.key} label={p.name} />
      </div>
      {seen ? <PlayerBody p={p} now={now} /> : <div className="v3-fp__body v3-fp__body--wait" aria-hidden="true" />}
    </li>
  );
}

// ---------------------------------------------------------------- the screen

const KIND_WORD = { player: 'Player', team: 'Team', stat: 'Statistic', game: 'Game', props: 'Props', other: 'Research' } as const;
const PLAYER_CAP = 6;

export function Following() {
  const f = useFollows();
  const { games, loading, unavailable, now } = useSlate();
  const saved = useSaved();
  const alerts = useAlerts();
  const [sp] = useSearchParams();
  const setSp = useQueryPatch();
  const demo = demoOn();
  const [allPlayers, setAllPlayers] = useState(false);

  const sports = useMemo(() => followedSports(f), [f]);
  const sport = validSport(sp.get('sport'), f);
  const setSport = (s: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (s) n.set('sport', s); else n.delete('sport'); return n; });
  const fs = useMemo(() => filterFollows(f, sport), [f, sport]);

  // A sport's search index (up to 450 KB with the explorer index it is found through) is read only to name a player this device follows in it.
  const playerSports = new Set(f.players.map(keySlug));
  const idx = { nfl: useSearchIndex('nfl', !demo && playerSports.has('nfl')), nba: useSearchIndex('nba', !demo && playerSports.has('nba')), nhl: useSearchIndex('nhl', !demo && playerSports.has('nhl')), mlb: useSearchIndex('mlb', !demo && playerSports.has('mlb')) };
  const indexLoading = Object.values(idx).some((x) => x.loading);
  const players = useMemo(() => {
    const m = new Map<string, PlayerInfo>();
    for (const k of f.players) {
      const slug = keySlug(k), id = keyId(k);
      const e = (idx[slug as keyof typeof idx]?.data?.items ?? []).find((x) => x.id === id);
      const sample = demo && id === DEMO_PLAYER_ID;
      const code = e?.context.team ?? null;
      const teamKey = sample ? demoPlayerTeamKey(games) : code ? `${slug}:${code}` : null;
      m.set(k, { key: k, slug, id, name: e?.label ?? (sample ? 'Sample Guard' : indexLoading ? 'Loading player' : id), position: e?.context.position ?? (sample ? 'G' : null), teamKey, team: teamKey ? teamOf(teamKey, games) : null });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the four index results change identity every render; their data does not
  }, [f.players, games, demo, idx.nfl.data, idx.nba.data, idx.nhl.data, idx.mlb.data, indexLoading]);
  const playerTeams = useMemo(() => Object.fromEntries([...players.values()].map((p) => [p.key, p.teamKey])), [players]);

  const view = useMemo(() => selectFollowing(games, f, { playerTeams, sport, now }), [games, f, playerTeams, sport, now]);
  const empty = isEmptyFollows(f);
  const playerList = fs.players.map((k) => players.get(k)).filter((p): p is PlayerInfo => !!p);
  const teamList = fs.teams.map((k) => ({ k, t: teamOf(k, games) }));
  const gameList = fs.games.map((k) => games.find((g) => g.key === k)).filter((g): g is V3Game => !!g);
  const savedShown = sport ? saved.filter((s) => s.sport === sport) : saved;
  const suggested = useMemo(() => (empty ? suggestTeams(games) : []), [empty, games]);

  return (
    <div className="v3-page v3-following">
      <header className="v3-top"><h1 className="v3-pgtitle" style={{ margin: 0 }}>Following</h1><span className="v3-top__sp" /><Link to="/v3/explore?focus=1" className="v3-iconbtn" aria-label="Search teams, players and games"><Icon name="search" size={24} /></Link><Link to="/v3/settings" className="v3-iconbtn" aria-label="Settings"><Icon name="sliders" size={24} /></Link></header>

      {sports.length > 1 && (
        <ChipRail className="v3-chips v3-chips--sports" role="group" aria-label="Filter by sport">
          <button type="button" className="v3-chip" aria-pressed={sport == null} onClick={() => setSport(null)}>All</button>
          {sports.map((s) => <button key={s} type="button" className="v3-chip" aria-pressed={sport === s} onClick={() => setSport(s)}>{sportWord(s)}</button>)}
        </ChipRail>
      )}

      {empty && (
        <section className="v3-fempty" aria-label="Start following">
          <h2>Follow what you care about</h2>
          <p className="v3-note">Teams, players and games from every sport land here: live first, then updates, upcoming and finals. Following never turns on alerts.</p>
          {suggested.length > 0 && (
            <div className="v3-teams v3-teams--wrap" aria-label="Popular teams on the slate">
              {suggested.map((t) => (
                <div key={`${t.slug}:${t.id}`} className="v3-tm"><Link to={teamHref(t)} className="v3-tm__l" aria-label={`${t.name}, team page`}><TeamLogo team={t} size={46} /><b>{t.nick}</b><small>{leagueLabel({ sport: t.sport })}</small></Link><FollowStar kind="teams" id={`${t.slug}:${t.id}`} label={t.name} className="v3-tm__star" /></div>
              ))}
            </div>
          )}
          <Link to="/v3/explore?focus=1" className="v3-btn"><Icon name="search" size={18} /> Search teams, players and games</Link>
        </section>
      )}

      {unavailable && <div className="v3-state v3-state--warn" role="alert"><Icon name="wifiOff" size={20} /><div><b>Published games are unavailable</b>Followed games cannot be shown until they load. Your follows are kept.<br /><button type="button" onClick={() => location.reload()}>Retry</button></div></div>}

      {!empty && (
        <section aria-label="Live now">
          <div className="v3-sechead"><h2><i className="v3-livedot" aria-hidden="true" />Live now{view.live.length > 0 && <span className="v3-fcount"> · {view.live.length}</span>}</h2></div>
          {loading && !games.length ? <div role="status" aria-label="Loading games" className="v3-gclist"><div className="v3-skel v3-gc-skel" /></div>
            : view.live.length > 0 ? <ul className="v3-fl">{view.live.map((x) => <LiveItem key={x.g.key} x={x} games={games} players={players} />)}</ul>
            : <p className="v3-note v3-fnone">{unavailable ? 'Live games are unavailable right now.' : 'None of your games are in play right now.'}</p>}
          {view.pending.length > 0 && (
            <>
              <h3 className="v3-fsub">Awaiting result</h3>
              <ul className="v3-fgs">{view.pending.map((x) => <GameRow key={x.g.key} g={x.g} />)}</ul>
            </>
          )}
        </section>
      )}

      {playerList.length > 0 && (
        <section aria-label="Player updates">
          <div className="v3-sechead"><h2>Player updates</h2></div>
          <ul className="v3-fps">{(allPlayers ? playerList : playerList.slice(0, PLAYER_CAP)).map((p) => <PlayerCard key={p.key} p={p} now={now} />)}</ul>
          {playerList.length > PLAYER_CAP && !allPlayers && <button type="button" className="v3-more" onClick={() => setAllPlayers(true)}>Show {playerList.length - PLAYER_CAP} more players</button>}
        </section>
      )}

      {!empty && (
        <section aria-label="Upcoming">
          <div className="v3-sechead"><h2>Upcoming</h2><Link to="/v3/games?state=following">Open in Games</Link></div>
          {view.upcoming.length > 0 ? view.upcoming.map((d) => (
            <div key={d.day || 'tba'} className="v3-fday">
              <h3 className="v3-fsub">{d.word}{d.day && d.word !== keyLabel(d.day) ? <span> · {keyLabel(d.day)}</span> : null}</h3>
              <ul className="v3-fgs">{d.games.map((x) => <GameRow key={x.g.key} g={x.g} />)}</ul>
            </div>
          )) : <p className="v3-note v3-fnone">{loading && !games.length ? 'Loading the schedule' : 'No game of yours is still to come on the published slate.'}</p>}
          {view.upcomingCount > view.upcoming.reduce((n, d) => n + d.games.length, 0) && <p className="v3-note v3-note--dim">Showing the next {view.upcoming.reduce((n, d) => n + d.games.length, 0)} of {view.upcomingCount}. <Link to="/v3/games?state=following">All in Games</Link></p>}
        </section>
      )}

      {!empty && (
        <section aria-label="Recent finals">
          <div className="v3-sechead"><h2>Recent finals</h2></div>
          {view.finals.length > 0
            ? <ul className="v3-fgs">{view.finals.map((x) => <GameRow key={x.g.key} g={x.g} />)}</ul>
            : <p className="v3-note v3-fnone">{loading && !games.length ? 'Loading results' : 'No final result for your teams or games on the published slate.'}</p>}
        </section>
      )}

      {!empty && (
        <section aria-label="What you follow">
          <div className="v3-sechead"><h2>What you follow</h2><Link to="/v3/explore">Add</Link></div>
          {teamList.length > 0 && (
            <>
              <h3 className="v3-fsub">Teams</h3>
              <ul className="v3-hits">{teamList.map(({ k, t }) => (
                <li key={k} className="v3-hit v3-hit--team">
                  <Link to={teamHref(t)} className="v3-hit__l" aria-label={`${t.name}, team page`}><span className="v3-av"><TeamLogo team={t} size={34} /></span><span className="v3-hit__t"><b>{t.name}</b><small>{leagueLabel({ sport: t.sport })}</small></span></Link>
                  <FollowStar kind="teams" id={k} label={t.name} />
                  <AlertBell id={k} label={t.name} />
                </li>
              ))}</ul>
            </>
          )}
          {playerList.length > 0 && (
            <>
              <h3 className="v3-fsub">Players</h3>
              <ul className="v3-hits">{playerList.map((p) => (
                <li key={p.key} className="v3-hit v3-hit--player">
                  <Link to={`/v3/player/${p.slug}/${encodeURIComponent(p.id)}`} className="v3-hit__l" aria-label={`${p.name}, player research`}><span className="v3-av"><Icon name="user" size={22} /></span><span className="v3-hit__t"><b>{p.name}</b><small>{[sportWord(p.slug), p.position, p.team?.nick].filter(Boolean).join(' · ')}</small></span></Link>
                  <FollowStar kind="players" id={p.key} label={p.name} />
                  <AlertBell id={p.key} label={p.name} />
                </li>
              ))}</ul>
            </>
          )}
          {(gameList.length > 0 || view.missingGames.length > 0) && (
            <>
              <h3 className="v3-fsub">Games</h3>
              <ul className="v3-fgs">
                {gameList.map((g) => <GameRow key={g.key} g={g} />)}
                {view.missingGames.map((k) => (
                  <li key={k} className="v3-fg"><span className="v3-fg__l"><span className="v3-hit__t"><b>{sportWord(keySlug(k))} game</b><small>Not on the published slate{unavailable ? ' right now' : ' (finished or not yet listed)'}</small></span></span><FollowStar kind="games" id={k} label={`${sportWord(keySlug(k))} game`} /></li>
                ))}
              </ul>
            </>
          )}
          {teamList.length + playerList.length + gameList.length + view.missingGames.length === 0 && <p className="v3-note">Nothing followed in {sport ? sportWord(sport) : 'this sport'}.</p>}
          {Object.keys(alerts).length === 0 && <p className="v3-note v3-note--dim">Alerts are off. Tap a bell to opt in, one at a time; following does not turn them on.</p>}
        </section>
      )}

      <section aria-label="Saved research">
        <div className="v3-sechead"><h2>Saved Research</h2></div>
        {savedShown.length ? (
          <ul className="v3-hits">{savedShown.map((s) => (
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
        ) : <p className="v3-note">{sport && saved.length ? `No saved research in ${sportWord(sport)}.` : 'Tap the bookmark on a player or statistic to save the exact setup: stat, line, window and filters come back as you left them. The numbers shown on a saved item are the frozen snapshot; open it to see the current ones.'}</p>}
      </section>
    </div>
  );
}
