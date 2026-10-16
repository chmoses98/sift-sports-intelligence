import { useMemo } from 'react';
import { Link, useSearchParams } from '../routing';
import { useNow } from '../live/hooks';
import { useAllOpportunities } from '../opportunity/load';
import { NAV_SPORTS } from '../data/nav';
import { gameRows, featuredGame, slateOrder, type GameRow } from './broadcast/games';
import { useGameResearch } from './broadcast/parts';
import { useCardFacts } from './broadcast/GameCard';
import { heroInputFor } from '../lib/hero/input';
import { resolveHero } from '../lib/hero/resolve';
import { BroadcastHero } from '../components/sift2/BroadcastHero';
import { GameGroups, gameHref, gameKey } from '../components/sift2/GameList';
import { matchupInsights } from '../insights/matchups';
import { featuredView } from './broadcast/lifecycle';
import '../styles/sift2-games-list.css';

const dateKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
/** A `YYYY-MM-DD` key moved by whole calendar days (built from calendar fields, so a daylight-saving day cannot skip or repeat one). */
const shiftDay = (key: string, n: number) => { const [y, m, d] = key.split('-').map(Number); return dateKey(new Date(y, (m || 1) - 1, (d || 1) + n).getTime()); };
const dayWord = (key: string, now: number) => key === dateKey(now) ? 'Today' : key === shiftDay(dateKey(now), 1) ? 'Tomorrow' : key === shiftDay(dateKey(now), -1) ? 'Yesterday' : '';
const dayLabel = (key: string) => { const [y, m, d] = key.split('-').map(Number); const dt = new Date(y, (m || 1) - 1, d || 1); return Number.isNaN(dt.getTime()) ? key : dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };

/** The one dramatic matchup: venue art, both teams, the evidence-backed read and its research shortcuts. */
export function FeaturedMatchup({ game }: { game: GameRow }) {
  const hasPlayerProps = ['NFL', 'MLB', 'NHL'].includes(game.sport);
  const r = useGameResearch(game.slug, game.item.event_id);
  const { facts } = useCardFacts(game, true);
  const spec = useMemo(() => resolveHero(heroInputFor(game.item, r.data, game.sport)), [game, r.data]);
  const insight = useMemo(() => r.data && game.sport === 'NFL' ? matchupInsights(r.data)[0] ?? null : null, [r.data, game.sport]);
  const state = featuredView(game, r.data?.extensions?.result);
  const title = spec.away && spec.home ? `${spec.away.name} ${spec.context === 'home' || spec.context === 'home-elsewhere' ? 'at' : 'vs'} ${spec.home.name}` : game.label;
  return <BroadcastHero spec={spec} start={game.item.start_time_utc} sport={game.sport} title={title} level={2} compact
    away={{ team: spec.away, record: facts.away.record, score: state.scores?.away }} home={{ team: spec.home, record: facts.home.record, score: state.scores?.home }} status={state.statusLine ?? state.word}>
    <div className="s2-feature-story"><span>GAME RESEARCH</span><strong>{insight?.headline ?? facts.tag?.text ?? `${game.label} · the matchup in focus`}</strong><p>{insight ? `${insight.offense.team.abbr} ${insight.offense.unit} ${insight.offense.rank.text} versus ${insight.defense.team.abbr} ${insight.defense.unit} ${insight.defense.rank.text}. Matchup evidence, not a betting edge.` : game.candidates ? `${game.candidates} published research candidates. Review authority and price before acting.` : 'Explore matchup drivers, player research and every published market.'}</p></div>
    <nav aria-label="Featured game research shortcuts"><Link to={gameHref(game)}>Game research →</Link><Link to={gameHref(game, 'matchup')}>Matchups</Link>{hasPlayerProps && <Link to={gameHref(game, 'props')}>Player props</Link>}<Link to={gameHref(game, 'markets')}>{game.item.markets_available} markets</Link></nav>
  </BroadcastHero>;
}

export function Sift2Games() {
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const [sp, setSp] = useSearchParams();
  // Classic addresses carry `day=tomorrow|week` (routes.games); SIFT 2.0 selects a calendar date.
  const today = dateKey(now);
  const day = sp.get('date') ?? (sp.get('day') === 'tomorrow' ? shiftDay(today, 1) : today);
  const sport = sp.get('sport');
  const week = Math.max(-52, Math.min(52, Number(sp.get('week')) || 0));
  const status = sp.get('status') ?? 'all';
  const rows = useMemo(() => gameRows(all.bundles, all.opportunities, now).sort(slateOrder), [all.bundles, all.opportunities, now]);
  const selectedDay = useMemo(() => rows.filter((g) => Number.isFinite(g.startMs) && dateKey(g.startMs) === day), [rows, day]);
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const g of selectedDay) m.set(g.slug, (m.get(g.slug) ?? 0) + 1); return m; }, [selectedDay]);
  const shown = useMemo(() => selectedDay.filter((g) => (!sport || g.slug === sport) && (status === 'all' || (status === 'live' ? g.phase === 'STARTED' && !g.stale : status === 'final' ? g.phase === 'FINAL' : g.phase === 'PREGAME'))), [selectedDay, sport, status]);
  const selected = shown.find((g) => `${g.slug}:${g.item.event_id}` === sp.get('game') || g.item.event_id === sp.get('game')) ?? featuredGame(shown, now) ?? shown[0];
  const failed = all.bundles.filter((b) => b.error != null);
  const unavailable = !!all.error || (!all.loading && all.bundles.length > 0 && failed.length === all.bundles.length);
  const set = (k: string, value: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (value) n.set(k, value); else n.delete(k); if (k !== 'game') n.delete('game'); return n; }, { replace: true });
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() + i - 3 + week * 7); return d; });
  const word = dayWord(day, now);
  return <div className="page s2-games">
    <header className="s2-page-heading"><div><h1>Games</h1><p>Every game. Every sport. One connected research experience.</p></div>
      <div className="s2-daybar" role="group" aria-label="Game date">
        <button type="button" className="s2-daybar__step" aria-label="Previous day" onClick={() => set('date', shiftDay(day, -1))}>‹</button>
        <label className="s2-daybar__label"><span className="s2-daybar__day">{word || dayLabel(day)}</span><span className="s2-daybar__date">{word ? dayLabel(day) : 'Choose a date'}</span><input type="date" value={day} aria-label="Choose game date" onChange={(e) => e.target.value && set('date', e.target.value)} /></label>
        <button type="button" className="s2-daybar__step" aria-label="Next day" onClick={() => set('date', shiftDay(day, 1))}>›</button>
        {day !== today && <button type="button" className="s2-daybar__today" onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.delete('date'); n.delete('week'); n.delete('game'); return n; })}>Today</button>}
      </div>
      <div className="s2-calendar"><button className="s2-calendar__arrow" aria-label="Previous week" onClick={() => set('week', String(week-1))}>‹</button><div className="s2-date-strip" role="group" aria-label="Game date">{days.map((d) => <button key={dateKey(+d)} aria-pressed={dateKey(+d) === day} onClick={() => set('date', dateKey(+d))}><span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong></button>)}</div><button className="s2-calendar__arrow" aria-label="Next week" onClick={() => set('week', String(week+1))}>›</button></div><div className="s2-calendar-tools"><button className="s2-control" onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.delete('date'); n.delete('week'); n.delete('game'); return n; })}>Today</button><label className="s2-calendar-picker"><span className="sr-only">Choose game date</span><input type="date" value={day} onChange={(e) => set('date', e.target.value)} /></label></div></header>
    <div className="s2-games__filters"><div className="s2-filter-strip" role="group" aria-label="Sport"><button aria-pressed={!sport} onClick={() => set('sport', null)}>All sports <small>{selectedDay.length}</small></button>{NAV_SPORTS.filter((s) => s.status !== 'planned' && (counts.get(s.slug) || sport === s.slug)).map((s) => <button key={s.slug} aria-pressed={sport === s.slug} onClick={() => set('sport', sport === s.slug ? null : s.slug)}>{s.label} <small>{counts.get(s.slug) ?? 0}</small></button>)}</div><div className="s2-filter-strip" role="group" aria-label="Game status">{['all','live','upcoming','final'].map((s) => <button key={s} aria-pressed={status === s} onClick={() => set('status', s === 'all' ? null : s)}>{s}</button>)}</div></div>

    {unavailable ? <p role="alert" className="s2-empty">Published games are unavailable. A failed publication does not mean there are no opportunities.</p> : all.loading ? <p role="status" className="s2-empty">Loading published games…</p> : !shown.length ? <div className="s2-empty"><h2>No published games in this view</h2><p>Choose another date, sport or status. This is a schedule filter, not an edge assessment.</p><button onClick={() => setSp({})}>Reset filters</button></div> : <>
      {failed.length > 0 && <details className="s2-coverage"><summary>{failed.length} feeds unavailable · showing available publications</summary><p>{failed.map((b) => b.sport.label).join(', ')} could not be read. Missing research is not a no-edge verdict.</p></details>}
      <div className="s2-games__lead"><FeaturedMatchup game={selected} /></div>
      <section className="s2-matchups" aria-labelledby="s2-slate-title"><header><h2 id="s2-slate-title">{word === 'Today' ? 'Today’s schedule' : `${word || dayLabel(day)} schedule`}</h2><span>{shown.length} published game{shown.length === 1 ? '' : 's'} · {new Set(shown.map((g) => g.slug)).size} sport{new Set(shown.map((g) => g.slug)).size === 1 ? '' : 's'}</span></header>
        <GameGroups games={shown} currentKey={gameKey(selected)} uncapped={!!sport} /></section>
    </>}
  </div>;
}
