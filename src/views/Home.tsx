// The global Home: the front door. What matters today (the featured game over its stadium), every
// sport and what it offers, today's slate with each game's leading script, where the model and the
// market disagree most, and the user's own research. A sport's own home goes deeper.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { BoardDoc } from '../contract/types';
import { useAsync, useRepo } from '../data/hooks';
import { NAV_SPORTS, STATUS_WORD } from '../data/nav';
import { sportByCode } from '../data/sports';
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/ui';
import { compact } from '../lib/format';
import { routes } from '../lib/routes';
import { useTrail, useVisit } from '../state/trail';
import { useTray } from '../state/tray';
import { useNow } from '../live/hooks';
import { PanelHead, ViewAll } from './game/panels';
import { Disagreements, FeaturedGame, featuredItem, SlateRow, useSlateResearch } from './home/cards';

function useNfl() {
  const nfl = sportByCode('NFL')!;
  const repo = useRepo(nfl);
  const board = useAsync(repo.data?.source.root ? `board:NFL:${repo.data.source.root}` : null, () => repo.data!.board());
  return { repo, board };
}

function SportsRow() {
  return (
    <nav className="sportsrow" aria-label="Sports on Sift">
      {NAV_SPORTS.map((n) => (
        <Link key={n.slug} to={routes.sport(n.slug)} className={`sportsrow__a sportsrow__a--${n.status}`} style={{ ['--accent' as string]: n.accent }}>
          <Icon name={n.icon} size={20} />
          <span className="sportsrow__n">{n.label}</span>
          <span className="sportsrow__s">{STATUS_WORD[n.status]}</span>
        </Link>
      ))}
    </nav>
  );
}

function YourResearch() {
  const tray = useTray();
  const { recent } = useTrail();
  const n = tray.tray.items.length;
  return (
    <section className="panel yrp" aria-labelledby="yr-h">
      <PanelHead title="Your Research" sub="Saved on this device" />
      <div className="yr">
        <div className="yr__n"><span className="panel__big">{n}</span><span className="muted">{n === 1 ? 'item in the tray' : 'items in the tray'}</span></div>
        <div className="cta-row">
          <button type="button" className="btn btn--sm" onClick={() => tray.setOpen(true)}>Open tray</button>
          {n > 0 && <Link className="btn btn--primary btn--sm" to={routes.packet({ sport: 'nfl', scope: 'CUSTOM' })}><Icon name="bolt" size={14} /> Build packet</Link>}
        </div>
      </div>
      {recent.length > 0 && (
        <>
          <div className="eyebrow yr__k">Pick up where you left off</div>
          <ol className="recentl">
            {recent.slice(0, 5).map((s) => <li key={s.href}><Link to={s.href}>{s.label}<Icon name="chevronRight" size={14} /></Link></li>)}
          </ol>
        </>
      )}
    </section>
  );
}

function NflToday({ board, now }: { board: BoardDoc; now: number }) {
  const { repo } = useNfl();
  const up = useMemo(() => board.items.filter((i) => i.status === 'SCHEDULED').sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc)), [board]);
  const research = useSlateResearch(repo.data, 'NFL', up);
  const rmap = research.data ?? new Map();
  const feat = featuredItem(up, now);
  const featR = useAsync(feat && repo.data ? `er:NFL:${feat.event_id}` : null, () => repo.data!.eventResearch(feat!.event_id));
  const comp = (up[0]?.competition ?? '').replace(/^(\d{4})\s*(REG\s*)?week/i, '$1 · Week');
  const next = up.filter((i) => Date.parse(i.start_time_utc) > now && i.event_id !== feat?.event_id).slice(0, 7);
  return (
    <>
      {feat && <FeaturedGame item={feat} r={featR.data} sportSlug="nfl" sportCode="NFL" now={now} eyebrow={`Featured · NFL ${comp}`} size="lg" />}
      <div className="home__grid">
        <section className="panel" aria-labelledby="next-h">
          <div className="phead">
            <div>
              <h2 className="phead__t" id="next-h">On the Slate</h2>
              <div className="phead__sub">NFL {comp} · {up.length} games · {compact(up.reduce((a, b) => a + b.markets_available, 0))} markets</div>
            </div>
            <div className="phead__x"><ViewAll to={routes.sport('nfl')}>NFL home</ViewAll></div>
          </div>
          <ul className="sllist">
            {next.map((g) => <SlateRow key={g.event_id} item={g} r={rmap.get(g.event_id)} sportSlug="nfl" sportCode="NFL" />)}
          </ul>
        </section>
        <div className="stack">
          <Disagreements items={up} research={rmap} slug="nfl" title="Where Model and Market Differ" n={4} />
          <YourResearch />
        </div>
      </div>
    </>
  );
}

export function HomeView() {
  useVisit('Home', 'home');
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const now = useNow(30_000);
  const { repo, board } = useNfl();
  const today = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="page home">
      <header className="ghead">
        <div className="ghead__t">
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
      <SportsRow />
      {(repo.loading || board.loading) && <Skeleton lines={5} tall />}
      {!repo.loading && !board.loading && !board.data && (
        <section className="panel"><p className="muted">The NFL board could not be read{repo.data && !repo.data.source.root ? ` (${repo.data.source.reason})` : ''}.</p></section>
      )}
      {board.data && <NflToday board={board.data} now={now} />}
    </div>
  );
}
