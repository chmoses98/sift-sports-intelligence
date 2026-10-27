import { useMemo, useState } from 'react';
import { Link, useSearchParams } from '../../routing';
import { useQueryPatch } from '../state/url';
import { useSlate } from '../data/useSlate';
import { useFollows } from '../state/prefs';
import { dayKey, keyLabel, keyWord, shiftDayKey } from '../model/time';
import type { V3Game } from '../model/types';
import { Brand } from '../ui/Brand';
import { ChipRail } from '../ui/ChipRail';
import { GameCard } from '../ui/GameCard';
import { Icon } from '../ui/Icon';
import { useSheet } from '../ui/Sheet';
import { leagueLabel } from '../ui/gamebits';

// Days are the viewer's LOCAL calendar days (model/time.ts): a game belongs to the day its start falls on at the viewer's own midnight.
const labelOf = keyLabel;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type GameState = 'following' | 'live' | 'today' | 'upcoming' | 'final';
const STATES: GameState[] = ['following', 'live', 'today', 'upcoming', 'final'];

export const followsGame = (g: V3Game, f: { teams: string[]; games: string[] }) =>
  f.games.includes(g.key) || f.teams.includes(`${g.slug}:${g.away.id}`) || f.teams.includes(`${g.slug}:${g.home.id}`);

/** Sports that have games on screen, in the product's order (the rail never lists a sport with nothing to open). */
const SPORT_ORDER = ['NFL', 'NBA', 'MLB', 'NHL', 'CFB', 'CBB', 'SOCCER', 'TENNIS'];
export const sportsIn = (games: V3Game[]) => SPORT_ORDER.filter((s) => games.some((g) => g.sport === s)).map((s) => ({ slug: s.toLowerCase(), label: leagueLabel({ sport: s }) }));

function DateSheet({ day, today, onPick }: { day: string; today: string; onPick: (k: string) => void }) {
  const days = Array.from({ length: 15 }, (_, i) => shiftDayKey(today, i - 3));
  return (
    <ul className="v3-days" role="list">
      {days.map((k) => (
        <li key={k}><button type="button" aria-pressed={k === day} onClick={() => onPick(k)}>{k === today ? `Today · ${labelOf(k)}` : labelOf(k)}</button></li>
      ))}
    </ul>
  );
}

export function Games() {
  const { games, loading, unavailable, failed, saved, now } = useSlate();
  const follows = useFollows();
  const sheet = useSheet();
  const [sp] = useSearchParams();
  const setSp = useQueryPatch();
  const today = dayKey(now) ?? '';
  const day = DAY_KEY.test(sp.get('date') ?? '') ? sp.get('date')! : today;
  const sport = sp.get('sport') ?? 'all';
  const st = (STATES.includes(sp.get('state') as GameState) ? sp.get('state') : 'today') as GameState;
  const set = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; });

  const sports = useMemo(() => sportsIn(games), [games]);
  const inSport = useMemo(() => (sport === 'all' ? games : games.filter((g) => g.slug === sport)), [games, sport]);
  const onDay = useMemo(() => inSport.filter((g) => dayKey(g.startMs) === day), [inSport, day]);
  const counts = useMemo(() => ({
    live: inSport.filter((g) => g.phase === 'live').length,
    following: onDay.filter((g) => followsGame(g, follows)).length,
  }), [inSport, onDay, follows]);

  const shown = useMemo(() => {
    let list: V3Game[];
    if (st === 'live') list = inSport.filter((g) => g.phase === 'live');
    else if (st === 'following') list = onDay.filter((g) => followsGame(g, follows));
    else if (st === 'upcoming') list = inSport.filter((g) => g.phase === 'pregame' && (dayKey(g.startMs) ?? '') > day);
    else if (st === 'final') list = onDay.filter((g) => g.phase === 'final');
    else list = onDay;
    // Followed games lead; then the slate's own order (live, upcoming by start, finals).
    return [...list].sort((a, b) => Number(followsGame(b, follows)) - Number(followsGame(a, follows)));
  }, [st, inSport, onDay, day, follows]);

  const [limit, setLimit] = useState(30);
  const title = st === 'live' ? 'Live now' : st === 'upcoming' ? 'Upcoming' : st === 'final' ? 'Final' : st === 'following' ? 'Following' : day === today ? 'Today' : labelOf(day);
  const emptyText: Record<GameState, string> = {
    live: 'No games are in play right now.',
    following: follows.teams.length + follows.games.length ? 'None of the teams or games you follow play on this day.' : 'You are not following anything yet. Star a team or a game and it appears here first.',
    today: `No published games ${day === today ? 'today' : `on ${labelOf(day)}`}${sport === 'all' ? '' : ' in this sport'}.`,
    upcoming: 'No upcoming games are published yet.',
    final: `No finished games ${day === today ? 'yet today' : `on ${labelOf(day)}`}.`,
  };

  return (
    <div className="v3-page v3-games">
      <header className="v3-top">
        <Brand />
        <span className="v3-top__sp" />
        <Link to="/v3/explore?focus=1" className="v3-iconbtn" aria-label="Search"><Icon name="search" size={24} /></Link>
        <button type="button" className="v3-iconbtn" aria-label={`Choose a date. Showing ${keyWord(day, today)}`}
          onClick={() => sheet.open('Choose a day', <DateSheet day={day} today={today} onPick={(k) => { set('date', k === today ? null : k); sheet.close(); }} />)}>
          <Icon name="calendar" size={24} />
        </button>
      </header>

      <ChipRail className="v3-rail" role="tablist" aria-label="Sport">
        {[{ slug: 'all', label: 'All' }, ...sports].map((s) => (
          <button key={s.slug} type="button" role="tab" aria-selected={sport === s.slug} className="v3-rail__t" onClick={() => set('sport', s.slug === 'all' ? null : s.slug)}>{s.label}</button>
        ))}
      </ChipRail>

      <ChipRail className="v3-chips v3-chips--states" role="group" aria-label="Game state">
        {STATES.map((s) => (
          <button key={s} type="button" className="v3-chip" aria-pressed={st === s} onClick={() => set('state', s === 'today' ? null : s)}>
            {s === 'today' && day !== today ? labelOf(day).split(',')[0] : s[0].toUpperCase() + s.slice(1)}
            {s === 'live' && counts.live > 0 && <i className="is-live">{counts.live}</i>}
            {s === 'following' && counts.following > 0 && <i>{counts.following}</i>}
          </button>
        ))}
      </ChipRail>

      <div className="v3-gamehead">
        <h1>{title}{st !== 'live' && shown.length > 0 ? ` · ${shown.length} ${shown.length === 1 ? 'Game' : 'Games'}` : ''}</h1>
        {day !== today && <button type="button" onClick={() => set('date', null)}>Back to today</button>}
      </div>

      {shown.length > 0 && st !== 'final' && <p className="v3-note v3-linesnote">Lines: Kalshi prediction-market prices in ¢, not sportsbook odds.</p>}
      {unavailable && <div className="v3-state v3-state--warn" role="alert"><Icon name="wifiOff" size={20} /><div><b>Published games are unavailable</b>A failed publication does not mean there are no games. Try again in a moment.<br /><button type="button" onClick={() => location.reload()}>Retry</button></div></div>}
      {saved.length > 0 && <div className="v3-state v3-state--warn" role="status" style={{ marginBottom: 10 }}><Icon name="info" size={20} /><div><b>Saved copy in use</b>{saved.map((x) => x.label).join(', ')} {saved.length === 1 ? 'is' : 'are'} showing the research saved with this app because the live publication could not be read. Prices appear only when a current Kalshi quote is available.</div></div>}
      {!unavailable && failed.length > 0 && <div className="v3-state" style={{ marginBottom: 10 }}><Icon name="info" size={20} /><div><b>{failed.length} feed{failed.length === 1 ? '' : 's'} unavailable</b>{failed.join(', ')} could not be read; showing everything else.</div></div>}
      {loading && !games.length && <div role="status" aria-label="Loading games" className="v3-gclist">{[0, 1, 2, 3].map((i) => <div key={i} className="v3-skel v3-gc-skel" />)}</div>}
      {!loading && !unavailable && shown.length === 0 && (
        <div className="v3-state"><Icon name="calendar" size={20} /><div><b>Nothing here</b>{emptyText[st]}
          {st !== 'today' && <><br /><button type="button" onClick={() => set('state', null)}>Show all of {day === today ? 'today' : labelOf(day)}</button></>}
          {sport !== 'all' && <><br /><button type="button" onClick={() => set('sport', null)}>Show all sports</button></>}
        </div></div>
      )}
      <div className="v3-gclist">
        {shown.slice(0, limit).map((g) => <GameCard key={g.key} g={g} />)}
      </div>
      {shown.length > limit && <button type="button" className="v3-more" onClick={() => setLimit((n) => n + 30)}>Show {Math.min(30, shown.length - limit)} more games</button>}
      {st === 'live' && shown.length > 0 && <p className="v3-note v3-foot">Scores come from a licensed score feed only where one exists. Games in play without one show “Score unavailable”.</p>}
    </div>
  );
}
