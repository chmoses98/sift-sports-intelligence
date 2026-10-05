// The global Home: what is happening across Sift today. The featured game, the next kickoffs, every
// sport's real status, and the user's own research (tray, recent). A sport's own home goes deeper.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { BoardDoc } from '../contract/types';
import { useAsync, useRepo } from '../data/hooks';
import { NAV_SPORTS, STATUS_WORD } from '../data/nav';
import { sportByCode } from '../data/sports';
import { Icon } from '../components/Icon';
import { HealthPill } from '../components/SourceBanner';
import { Skeleton, TeamMark } from '../components/ui';
import { compact, until } from '../lib/format';
import { routes } from '../lib/routes';
import { useAllSports } from '../state/allSports';
import { useTrail, useVisit } from '../state/trail';
import { useTray } from '../state/tray';
import { useNow } from '../live/hooks';
import { PanelHead, ViewAll } from './game/panels';
import { FeaturedGame, featuredItem, sides } from './home/cards';

function useNflBoard() {
  const nfl = sportByCode('NFL')!;
  const repo = useRepo(nfl);
  const board = useAsync(repo.data?.source.root ? `board:NFL:${repo.data.source.root}` : null, () => repo.data!.board());
  return { repo, board };
}

function NflToday({ board, now }: { board: BoardDoc; now: number }) {
  const nfl = sportByCode('NFL')!;
  const repo = useRepo(nfl);
  const up = board.items.filter((i) => i.status === 'SCHEDULED').sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc));
  const feat = featuredItem(up, now);
  const research = useAsync(feat && repo.data ? `er:NFL:${feat.event_id}` : null, () => repo.data!.eventResearch(feat!.event_id));
  const comp = (up[0]?.competition ?? '').replace(/^(\d{4})\s*(REG\s*)?week/i, '$1 · Week');
  const next = up.filter((i) => Date.parse(i.start_time_utc) > now && i.event_id !== feat?.event_id).slice(0, 6);
  return (
    <>
      {feat && <FeaturedGame item={feat} r={research.data} sportSlug="nfl" sportCode="NFL" now={now} eyebrow={`Featured · NFL ${comp}`} />}
      <section className="panel" aria-labelledby="next-h">
        <PanelHead title="Up Next" sub={`NFL ${comp} · ${up.length} games · ${compact(up.reduce((a, b) => a + b.markets_available, 0))} markets`}>
          <ViewAll to={routes.sport('nfl')}>NFL home</ViewAll>
        </PanelHead>
        <ul className="nextl">
          {next.map((g) => {
            const { away, home } = sides(g);
            return (
              <li key={g.event_id}>
                <Link to={routes.game('nfl', g.event_id)} className="nextl__row">
                  <span className="nextl__t"><TeamMark sport="NFL" abbr={away?.short_name} size="sm" />{away?.short_name}<span className="muted">@</span><TeamMark sport="NFL" abbr={home?.short_name} size="sm" />{home?.short_name}</span>
                  <span className="nextl__w">{new Date(g.start_time_utc).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="nextl__u">{until(g.start_time_utc, now)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function SportsStatus() {
  const all = useAllSports();
  const by = new Map((all.data ?? []).map((s) => [s.sport.slug, s]));
  return (
    <section className="panel" aria-labelledby="sports-h">
      <PanelHead title="Across Sift" sub="Each sport's live publication" >
        <ViewAll to={routes.sports()}>All sports</ViewAll>
      </PanelHead>
      <ul className="sportl">
        {NAV_SPORTS.map((n) => {
          const s = by.get(n.slug);
          const h = s?.source?.liveHealth;
          return (
            <li key={n.slug}>
              <Link to={routes.sport(n.slug)} className="sportl__row" style={{ ['--accent' as string]: n.accent }}>
                <Icon name={n.icon} size={18} />
                <span className="sportl__n">{n.label}</span>
                <span className={`sportl__st sportl__st--${n.status}`}>{STATUS_WORD[n.status]}</span>
                <span className="sportl__h">{n.status === 'planned' ? null : all.loading ? '…' : h ? <HealthPill status={h.overall_status} /> : <span className="muted small">unreadable</span>}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function YourResearch() {
  const tray = useTray();
  const { recent } = useTrail();
  const n = tray.tray.items.length;
  return (
    <section className="panel" aria-labelledby="yr-h">
      <PanelHead title="Your Research" sub="Saved on this device" />
      <div className="yr">
        <div className="yr__n"><span className="panel__big num">{n}</span><span className="muted small">{n === 1 ? 'item' : 'items'} in the tray</span></div>
        <div className="cta-row">
          <button type="button" className="btn btn--sm" onClick={() => tray.setOpen(true)}>Open tray</button>
          {n > 0 && <Link className="btn btn--primary btn--sm" to={routes.packet({ sport: 'nfl', scope: 'CUSTOM' })}><Icon name="bolt" size={14} /> Build packet</Link>}
        </div>
      </div>
      {recent.length > 0 && (
        <>
          <div className="eyebrow yr__k">Pick up where you left off</div>
          <ol className="recentl">
            {recent.slice(0, 5).map((s) => <li key={s.href}><Link to={s.href}>{s.label}</Link></li>)}
          </ol>
        </>
      )}
    </section>
  );
}

export function HomeView() {
  useVisit('Home', 'home');
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const now = useNow(30_000);
  const { repo, board } = useNflBoard();
  const today = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="page home">
      <header className="ghead">
        <div>
          <div className="eyebrow">{today}</div>
          <h1 className="h-display ghead__h">Today on Sift</h1>
          <p className="ghead__lede">How each game could unfold, the evidence behind each path, and the markets that hold up across them.</p>
        </div>
        <form role="search" className="bigsearch ghead__search" onSubmit={(e) => { e.preventDefault(); nav(routes.search(q)); }}>
          <Icon name="search" size={18} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bills · Josh Allen · Baltimore pass defense" aria-label="Search Sift" />
          <button type="submit" className="btn btn--primary btn--sm">Search</button>
        </form>
      </header>

      <div className="home__grid">
        <div className="home__main stack">
          {(repo.loading || board.loading) && <Skeleton lines={5} tall />}
          {!repo.loading && !board.loading && !board.data && (
            <section className="panel"><p className="muted">The NFL board could not be read{repo.data && !repo.data.source.root ? ` (${repo.data.source.reason})` : ''}.</p></section>
          )}
          {board.data && <NflToday board={board.data} now={now} />}
        </div>
        <aside className="home__side stack" aria-label="Sports and your research">
          <YourResearch />
          <SportsStatus />
        </aside>
      </div>
    </div>
  );
}
