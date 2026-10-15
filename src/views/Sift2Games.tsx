import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useNow } from '../live/hooks';
import { useAllOpportunities } from '../opportunity/load';
import { NAV_SPORTS } from '../data/nav';
import { gameRows, featuredGame, slateOrder, phaseWord, type GameRow } from './broadcast/games';
import { useGameResearch, PMark } from './broadcast/parts';
import { useCardFacts } from './broadcast/GameCard';
import { heroInputFor } from '../lib/hero/input';
import { resolveHero } from '../lib/hero/resolve';
import { broadcastHeroSpec, broadcastArtVars } from '../components/sift2/heroArt';
import { VenueArt } from '../components/sift2/VenueArt';
import { BroadcastHero } from '../components/sift2/BroadcastHero';
import { routes } from '../lib/routes';
import { matchupInsights } from '../insights/matchups';
import { featuredView } from './broadcast/lifecycle';

const gameHref = (g: GameRow, tab?: string) => `/design/sift2${routes.game(g.slug, g.item.event_id, tab ? { tab } : undefined)}`;
const dateKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

export function PublishedMatchup({ game, feature = false, selected = false }: { game: GameRow; feature?: boolean; selected?: boolean }) {
  const hasPlayerProps = ['NFL', 'MLB', 'NHL'].includes(game.sport);
  const r = useGameResearch(game.slug, game.item.event_id);
  const { facts } = useCardFacts(game, true);
  const spec = useMemo(() => resolveHero(heroInputFor(game.item, r.data, game.sport)), [game, r.data]);
  const insight = useMemo(() => r.data && game.sport === 'NFL' ? matchupInsights(r.data)[0] ?? null : null, [r.data, game.sport]);
  const state = featuredView(game, r.data?.extensions?.result);
  const title = spec.away && spec.home ? `${spec.away.name} ${spec.context === 'home' || spec.context === 'home-elsewhere' ? 'at' : 'vs'} ${spec.home.name}` : game.label;
  if (feature) return <BroadcastHero spec={spec} start={game.item.start_time_utc} sport={game.sport} title={title} level={2} compact
    away={{ team: spec.away, record: facts.away.record, score: state.scores?.away }} home={{ team: spec.home, record: facts.home.record, score: state.scores?.home }} status={state.statusLine ?? state.word}>
    <div className="s2-feature-story"><span>GAME RESEARCH</span><strong>{insight?.headline ?? facts.tag?.text ?? `${game.label} · the matchup in focus`}</strong><p>{insight ? `${insight.offense.team.abbr} ${insight.offense.unit} ${insight.offense.rank.text} versus ${insight.defense.team.abbr} ${insight.defense.unit} ${insight.defense.rank.text}. Matchup evidence, not a betting edge.` : game.candidates ? `${game.candidates} published research candidates. Review authority and price before acting.` : 'Explore matchup drivers, player research and every published market.'}</p></div>
    <nav aria-label="Featured game research shortcuts"><Link to={gameHref(game)}>Game research →</Link><Link to={gameHref(game, 'matchup')}>Matchups</Link>{hasPlayerProps && <Link to={gameHref(game, 'props')}>Player props</Link>}<Link to={gameHref(game, 'markets')}>{game.item.markets_available} markets</Link></nav>
  </BroadcastHero>;
  const cardArt=broadcastHeroSpec(spec,'card');
  return <article className={`s2-match-card${selected ? ' is-featured' : ''}`} style={broadcastArtVars(cardArt,'card')}>
    <div className="s2-match-card__art"><VenueArt key={cardArt.photo?.id ?? cardArt.reason} spec={cardArt} surface="card" /></div>
    <div className="s2-match-card__top"><span>{game.sport}</span><span>{phaseWord(game)}</span></div>
    <Link className="s2-match-card__match" to={gameHref(game)} aria-label={title}>
      <div><PMark sport={game.sport} p={game.away} size="md" /><strong>{spec.away?.short ?? game.away?.display_name}</strong>{facts.away.record && <small>{facts.away.record}</small>}</div>
      <span>{state.scores ? `${state.scores.away}–${state.scores.home}` : spec.context === 'home' ? 'AT' : 'VS'}</span>
      <div><PMark sport={game.sport} p={game.home} size="md" /><strong>{spec.home?.short ?? game.home?.display_name}</strong>{facts.home.record && <small>{facts.home.record}</small>}</div>
    </Link>
    <p>{spec.venue?.name ?? 'Venue not verified'}</p>
    <div className="s2-match-card__actions"><Link to={gameHref(game)}>Game research</Link><Link to={gameHref(game, hasPlayerProps ? 'props' : 'markets')}>{hasPlayerProps ? 'Player props' : 'Markets'}</Link></div>
  </article>;
}

export function Sift2Games() {
  const now = useNow(30_000);
  const all = useAllOpportunities(now);
  const [sp, setSp] = useSearchParams();
  const day = sp.get('date') ?? dateKey(now);
  const sport = sp.get('sport');
  const week = Math.max(-52, Math.min(52, Number(sp.get('week')) || 0));
  const status = sp.get('status') ?? 'all';
  const rows = useMemo(() => gameRows(all.bundles, all.opportunities, now).sort(slateOrder), [all.bundles, all.opportunities, now]);
  const selectedDay = rows.filter((g) => dateKey(g.startMs) === day && (!sport || g.slug === sport));
  const shown = selectedDay.filter((g) => status === 'all' || (status === 'live' ? g.phase === 'STARTED' && !g.stale : status === 'final' ? g.phase === 'FINAL' : g.phase === 'PREGAME'));
  const selected = shown.find((g) => `${g.slug}:${g.item.event_id}` === sp.get('game') || g.item.event_id === sp.get('game')) ?? featuredGame(shown, now) ?? shown[0];
  const failed = all.bundles.filter((b) => b.error != null);
  const unavailable = !!all.error || (!all.loading && all.bundles.length > 0 && failed.length === all.bundles.length);
  const set = (k: string, value: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (value) n.set(k, value); else n.delete(k); if (k !== 'game') n.delete('game'); return n; }, { replace: true });
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() + i - 3 + week * 7); return d; });
  return <div className="page s2-games">
    <header className="s2-page-heading"><div><h1>Games</h1><p>Every game. Every sport. One connected research experience.</p></div><div className="s2-calendar"><button className="s2-calendar__arrow" aria-label="Previous week" onClick={() => set('week', String(week-1))}>‹</button><div className="s2-date-strip" role="group" aria-label="Game date">{days.map((d) => <button key={dateKey(+d)} aria-pressed={dateKey(+d) === day} onClick={() => set('date', dateKey(+d))}><span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span><strong>{d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong></button>)}</div><button className="s2-calendar__arrow" aria-label="Next week" onClick={() => set('week', String(week+1))}>›</button></div><div className="s2-calendar-tools"><button className="s2-control" onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.delete('date'); n.delete('week'); n.delete('game'); return n; })}>Today</button><label className="s2-calendar-picker"><span className="sr-only">Choose game date</span><input type="date" value={day} onChange={(e) => set('date', e.target.value)} /></label></div></header>
    <div className="s2-games__filters"><div className="s2-filter-strip" role="group" aria-label="Sport"><button aria-pressed={!sport} onClick={() => set('sport', null)}>All sports</button>{NAV_SPORTS.filter((s) => s.status !== 'planned').map((s) => <button key={s.slug} aria-pressed={sport === s.slug} onClick={() => set('sport', s.slug)}>{s.label}</button>)}</div><div className="s2-filter-strip" role="group" aria-label="Game status">{['all','live','upcoming','final'].map((s) => <button key={s} aria-pressed={status === s} onClick={() => set('status', s)}>{s}</button>)}</div></div>

    {unavailable ? <p role="alert" className="s2-empty">Published games are unavailable. A failed publication does not mean there are no opportunities.</p> : all.loading ? <p role="status" className="s2-empty">Loading published games…</p> : !shown.length ? <div className="s2-empty"><h2>No published games in this view</h2><p>Choose another date, sport or status. This is a schedule filter, not an edge assessment.</p><button onClick={() => setSp({})}>Reset filters</button></div> : <>
      <div className="s2-games__lead"><PublishedMatchup game={selected} feature /><aside className="s2-today" aria-label="Games in this view"><header><h2>{day === dateKey(now) ? 'Today' : 'Selected day'}</h2><span>{shown.length} games</span></header>{shown.slice(0,10).map((g) => <button key={`${g.slug}:${g.item.event_id}`} aria-pressed={g.slug === selected.slug && g.item.event_id === selected.item.event_id} onClick={() => set('game',`${g.slug}:${g.item.event_id}`)}><span className="s2-today__teams"><span><PMark sport={g.sport} p={g.away} size="sm" />{g.sport === 'NFL' ? g.away?.display_name.split(' ').at(-1) : g.away?.display_name ?? g.away?.short_name}</span><span><PMark sport={g.sport} p={g.home} size="sm" />{g.sport === 'NFL' ? g.home?.display_name.split(' ').at(-1) : g.home?.display_name ?? g.home?.short_name}</span></span><span><small>{g.sport}</small><strong>{phaseWord(g)}</strong></span><span aria-hidden="true">›</span></button>)}</aside></div>
      <section className="s2-matchups"><header><h2>{day === dateKey(now) ? "Today's matchups" : 'Matchups'}</h2><div>{failed.length > 0 && !unavailable && <details className="s2-coverage"><summary>{failed.length} feeds unavailable · showing available publications</summary><p>{failed.map((b) => b.sport.label).join(', ')} could not be read. Missing research is not a no-edge verdict.</p></details>}<span>{shown.length} published games</span></div></header><div className="s2-match-grid">{[selected, ...shown.filter((g) => g !== selected)].map((g) => <PublishedMatchup key={`${g.slug}:${g.item.event_id}`} game={g} selected={g.slug === selected.slug && g.item.event_id === selected.item.event_id} />)}</div></section>
    </>}
  </div>;
}
