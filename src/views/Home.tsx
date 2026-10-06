// The global Home: useful from the first screen. A one-line masthead, then the game to open first, the
// slate with each game's headline, the week's biggest matchup edges, the context that changes how to read
// season numbers, and the props worth a look. Every row opens the layer underneath it.
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { BoardDoc, BoardItem, EventResearchDoc } from '../contract/types';
import { useAsync, useRepo } from '../data/hooks';
import { sportByCode } from '../data/sports';
import { Icon } from '../components/Icon';
import { EdgeVs, PlayerFace, RangeBar } from '../components/insight';
import { Skeleton, TeamMark } from '../components/ui';
import { routes } from '../lib/routes';
import { gameScripts, sharePct } from '../lib/scripts';
import { playerPhoto } from '../lib/players';
import { useTeamHistory } from '../history/load';
import { contextNotes, type ContextNote } from '../insights/context';
import { matchupInsights, type MatchupInsight } from '../insights/matchups';
import { propCards, propsToWatch, valueText } from '../insights/props';
import { useTrail, useVisit } from '../state/trail';
import { useTray } from '../state/tray';
import { useNow } from '../live/hooks';
import { PanelHead, ViewAll } from './game/panels';
import { featuredItem, FeatureCard, sides, useSlateResearch } from './home/cards';

function useNfl() {
  const nfl = sportByCode('NFL')!;
  const repo = useRepo(nfl);
  const board = useAsync(repo.data?.source.root ? `board:NFL:${repo.data.source.root}` : null, () => repo.data!.board());
  return { repo, board };
}

function YourResearch() {
  const tray = useTray();
  const { recent } = useTrail();
  const n = tray.tray.items.length;
  if (!n && !recent.length) return null;
  return (
    <section className="panel yrp" aria-labelledby="yr-h">
      <PanelHead title="Your Research" sub={n ? `${n} saved ${n === 1 ? 'finding' : 'findings'} on this device` : 'Pick up where you left off'}>
        {n > 0 && <button type="button" className="btn btn--sm" onClick={() => tray.setOpen(true)}>Open</button>}
      </PanelHead>
      {recent.length > 0 && (
        <ol className="recentl">
          {recent.slice(0, 4).map((s) => <li key={s.href}><Link to={s.href}>{s.label}<Icon name="chevronRight" size={14} /></Link></li>)}
        </ol>
      )}
    </section>
  );
}

interface GameRead {
  item: BoardItem;
  r: EventResearchDoc | undefined;
  insights: MatchupInsight[];
}

/** One slate line: kickoff, the matchup, the most likely script and the game's headline edge. */
function SlateLine({ g, slug }: { g: GameRead; slug: string }) {
  const { away, home } = sides(g.item);
  const set = g.r ? gameScripts(g.r) : null;
  const lead = set?.scripts[0];
  const top = g.insights[0];
  return (
    <li>
      <Link to={routes.game(slug, g.item.event_id)} className="sline">
        <span className="sline__t">{new Date(g.item.start_time_utc).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
        <span className="sline__m">
          <TeamMark sport="NFL" abbr={away?.short_name} size="sm" /><span>{away?.short_name}</span>
          <span className="sline__at">at</span>
          <TeamMark sport="NFL" abbr={home?.short_name} size="sm" /><span>{home?.short_name}</span>
        </span>
        <span className="sline__h">{top ? top.headline : g.r ? 'Evenly matched on the published ranks' : 'Reading research…'}</span>
        {lead && <span className="sline__s"><i className={`sdot sdot--s${lead.index}`} aria-hidden="true" />Most likely: {lead.name} <b className="num">{sharePct(lead.share)}</b></span>}
        <Icon name="chevronRight" size={16} className="sline__go" />
      </Link>
    </li>
  );
}

function EdgesPanel({ games, slug }: { games: GameRead[]; slug: string }) {
  // One edge per game, so the list covers the slate instead of one lopsided matchup.
  const seen = new Set<string>();
  const all = games.flatMap((g) => g.insights.map((ins) => ({ ins, g }))).sort((a, b) => b.ins.score - a.ins.score)
    .filter((x) => (seen.has(x.g.item.event_id) ? false : (seen.add(x.g.item.event_id), true))).slice(0, 4);
  if (!all.length) return null;
  return (
    <section className="panel" aria-labelledby="edges-h">
      <PanelHead title="Biggest Matchup Edges" sub="Where this week's games tilt · league ranks, opponent-adjusted" />
      <ol className="edgel">
        {all.map(({ ins, g }) => (
          <li key={g.item.event_id + ins.id}>
            <Link to={routes.game(slug, g.item.event_id)} className="edgel__a">
              <span className="edgel__g">{sides(g.item).away?.short_name} at {sides(g.item).home?.short_name}</span>
              <span className={`edgel__h edgel__h--${ins.size}`}>{ins.headline}</span>
              <EdgeVs ins={ins} />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ContextPanel({ notes, slug }: { notes: { note: ContextNote; eventId: string }[]; slug: string }) {
  if (!notes.length) return null;
  return (
    <section className="panel" aria-labelledby="ctx-h">
      <PanelHead title="Context That Matters" sub="When season numbers may mislead" />
      <ul className="ctxl">
        {notes.slice(0, 4).map(({ note, eventId }) => (
          <li key={note.id}>
            <Link to={routes.game(slug, eventId)} className="ctxl__a">
              <TeamMark sport="NFL" abbr={note.team.abbr} size="sm" />
              <span><b>{note.headline}</b><span className="ctxl__d">{note.detail.split('. ')[0]}.</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FeaturedProps({ item, r, slug }: { item: BoardItem; r: EventResearchDoc | undefined; slug: string }) {
  const { repo } = useNfl();
  const detail = useAsync(r && repo.data ? `ed:NFL:${item.event_id}` : null, () => repo.data!.eventDetail(item.event_id));
  const cards = useMemo(() => (r && detail.data ? propsToWatch(propCards(r, detail.data.markets), 3) : []), [r, detail.data]);
  if (!cards.length) return null;
  return (
    <section className="panel" aria-labelledby="hprops-h">
      <PanelHead title="Props to Watch" sub={`${sides(item).away?.short_name} at ${sides(item).home?.short_name} · projection, typical range and the line`}>
        <ViewAll to={routes.game(slug, item.event_id, { tab: 'props' })}>All props</ViewAll>
      </PanelHead>
      <ul className="hprops">
        {cards.map((c) => (
          <li key={c.id}>
            <Link to={routes.player(slug, c.playerId)} className="hprop">
              <PlayerFace photo={playerPhoto(c.playerId, c.name, c.team.abbr)} team={c.team.abbr} size="sm" />
              <span className="hprop__b">
                <span className="hprop__n">{c.name} <span className="hprop__s">{c.statLabel}</span></span>
                <span className="hprop__v">Projection <b className="num">{valueText(c.projection, c.unit)}</b>{c.line != null && <> · line <b className="num">{c.line}</b></>}</span>
                <RangeBar typical={c.range.typical} full={c.range.full} projection={c.projection} line={c.line} format={(v) => (c.unit === 'rec' ? (Math.round(v * 10) / 10).toString() : String(Math.round(v)))} label={`${c.name} ${c.statLabel.toLowerCase()}`} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NflToday({ board, now }: { board: BoardDoc; now: number }) {
  const { repo } = useNfl();
  const up = useMemo(() => board.items.filter((i) => i.status === 'SCHEDULED').sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)), [board]);
  const research = useSlateResearch(repo.data, 'NFL', up);
  const hist = useTeamHistory('NFL');
  const rmap = research.data;
  const games = useMemo<GameRead[]>(() => up.map((item) => {
    const r = rmap?.get(item.event_id);
    return { item, r, insights: r ? matchupInsights(r) : [] };
  }), [up, rmap]);
  const notes = useMemo(() => games.flatMap((g) => (g.r ? contextNotes(g.r, hist.data ?? null).filter((n) => n.kind === 'qb-change').map((note) => ({ note, eventId: g.item.event_id })) : [])), [games, hist.data]);
  const feat = featuredItem(up, now);
  const featR = feat ? rmap?.get(feat.event_id) : undefined;
  const ahead = games.filter((g) => Date.parse(g.item.start_time_utc) > now || g.item.event_id === feat?.event_id);
  const list = (ahead.length ? ahead : games).filter((g) => g.item.event_id !== feat?.event_id).slice(0, 8);
  const featInsight = feat && featR ? matchupInsights(featR)[0] ?? null : null;
  return (
    <>
      <div className="home__top">
        <div className="stack home__lead">
          {feat && <FeatureCard item={feat} r={featR} insight={featInsight} sportSlug="nfl" sportCode="NFL" now={now} />}
          <EdgesPanel games={games} slug="nfl" />
        </div>
        <section className="panel home__slate" aria-labelledby="slate-h">
          <PanelHead title="On the Slate" sub={`${up.length} games · each with its biggest edge and most likely script`}>
            <ViewAll to={routes.slate('nfl')}>All games</ViewAll>
          </PanelHead>
          {research.loading && !rmap && <Skeleton lines={4} />}
          <ul className="slines">
            {list.map((g) => <SlateLine key={g.item.event_id} g={g} slug="nfl" />)}
          </ul>
        </section>
      </div>
      <div className="home__grid">
        {feat && <FeaturedProps item={feat} r={featR} slug="nfl" />}
        <div className="stack">
          <ContextPanel notes={notes} slug="nfl" />
          <YourResearch />
        </div>
      </div>
    </>
  );
}

export function HomeView() {
  useVisit('Home', 'home');
  const now = useNow(30_000);
  const { repo, board } = useNfl();
  const today = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const up = board.data?.items.filter((i) => i.status === 'SCHEDULED') ?? [];
  const comp = (up[0]?.competition ?? '').replace(/^(\d{4})\s*(REG\s*)?week\s*/i, 'Week ');
  return (
    <div className="page home">
      <header className="hbar">
        <h1 className="hbar__h">Today on Sift</h1>
        <span className="hbar__m">{today}{comp ? <> · NFL {comp}</> : null}{up.length ? <> · {up.length} games</> : null}</span>
      </header>
      {(repo.loading || board.loading) && <Skeleton lines={5} tall />}
      {!repo.loading && !board.loading && !board.data && (
        <section className="panel"><p className="muted">The NFL board could not be read{repo.data && !repo.data.source.root ? ` (${repo.data.source.reason})` : ''}.</p></section>
      )}
      {board.data && <NflToday board={board.data} now={now} />}
    </div>
  );
}

