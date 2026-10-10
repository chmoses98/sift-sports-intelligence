// EXPLORE — research without starting from a game. One sport at a time: the research tools (prop explorer, season
// navigator, compare), every team as a logo grid, the Stats Lab (every published ranking, opponent-adjusted first)
// and a player finder over the publication's own search index. Sports whose publication has no explorer say so.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAsync } from '../../data/hooks';
import { NAV_SPORTS, navSport } from '../../data/nav';
import { SportRepo } from '../../data/repo';
import { resolveSource } from '../../data/source';
import { sportBySlug } from '../../data/sports';
import { Icon } from '../../components/Icon';
import { SportMark } from '../../components/SportMark';
import { Skeleton } from '../../components/ui';
import { routes } from '../../lib/routes';
import { useVisit } from '../../state/trail';
import { PMark } from '../broadcast/parts';

interface SearchItem { id: string; kind: string; label: string; secondary?: string | null; context?: { team?: string | null; position?: string | null } }

function useExplorer(slug: string) {
  return useAsync(`explore:${slug}`, async () => {
    const sport = sportBySlug(slug);
    if (!sport) return null;
    const repo = new SportRepo(await resolveSource(sport));
    if (!repo.hasExplorer) return { sport, teams: [], items: [] as SearchItem[], available: false };
    const [idx, si] = await Promise.all([repo.index(), repo.searchIndex().catch(() => null)]);
    return { sport, teams: idx.teams, items: ((si?.items ?? []) as unknown as SearchItem[]), available: true };
  });
}

const rankGroup = (label: string) => (/\(ADJ/i.test(label) ? 'Opponent-adjusted' : /\(L\d+\)/.test(label) ? 'Recent form' : /\(SEASON\)/.test(label) ? 'This season' : 'Other rankings');
const cleanRank = (label: string) => label.replace(/\s*ranking\s*/i, ' ').replace(/\s*\((ADJ_RIDGE|SEASON|L\d+)\)\s*$/, '').trim();

export function ExploreView() {
  useVisit('Explore', 'explore');
  const [sp, setSp] = useSearchParams();
  const slug = sp.get('sport') ?? 'nfl';
  const ex = useExplorer(slug);
  const [rq, setRq] = useState('');
  const [pq, setPq] = useState('');
  const nav = navSport(slug);
  const rankings = useMemo(() => (ex.data?.items ?? []).filter((i) => i.kind === 'RANKING' && (!rq || i.label.toLowerCase().includes(rq.toLowerCase()))), [ex.data, rq]);
  const groups = useMemo(() => {
    const m = new Map<string, SearchItem[]>();
    for (const r of rankings) m.set(rankGroup(r.label), [...(m.get(rankGroup(r.label)) ?? []), r]);
    return ['Opponent-adjusted', 'This season', 'Recent form', 'Other rankings'].filter((k) => m.has(k)).map((k) => [k, m.get(k)!] as const);
  }, [rankings]);
  const players = useMemo(() => (ex.data?.items ?? []).filter((i) => i.kind === 'PLAYER' && (!pq || `${i.label} ${i.secondary ?? ''} ${i.context?.team ?? ''}`.toLowerCase().includes(pq.toLowerCase()))).slice(0, 24), [ex.data, pq]);
  const teams = ex.data?.teams ?? [];
  const code = ex.data?.sport.code ?? slug.toUpperCase();
  const tools = [
    { to: routes.props(slug), title: 'Prop explorer', sub: 'Every published player prop: projection, range, line and price', icon: 'sliders', tone: 'gold', show: slug === 'nfl' },
    { to: routes.season(slug), title: 'Season navigator', sub: slug === 'nfl' ? 'The 18-week grid, results and weekly form' : 'The calendar, day by day', icon: 'grid', tone: 'green', show: true },
    { to: routes.compare(slug, ''), title: 'Compare', sub: 'Two teams side by side, rank by rank', icon: 'compare', tone: 'violet', show: ex.data?.available },
    { to: routes.pulse(slug), title: 'Model evidence', sub: 'How this sport’s model has performed', icon: 'bolt', tone: 'red', show: true },
  ].filter((t) => t.show);
  return (
    <div className="page explore">
      <header className="bhome__mast">
        <div><span className="eyebrow2">Research tools</span><h1 className="bhome__h">Explore</h1></div>
        <p className="bhome__sum">Teams, players, rankings, seasons and props — straight from each sport’s publication</p>
      </header>
      <div className="gtabs2" role="group" aria-label="Sport">
        {NAV_SPORTS.filter((s) => s.status !== 'planned').map((s) => (
          <button key={s.slug} type="button" className={`gtab${slug === s.slug ? ' is-on' : ''}`} aria-pressed={slug === s.slug} onClick={() => setSp({ sport: s.slug }, { replace: true })}><SportMark slug={s.slug} icon={s.icon} size={14} />{s.label}</button>
        ))}
      </div>
      <section className="bsec" aria-labelledby="tools-h">
        <div className="bsec__h"><h2 className="bsec__t" id="tools-h"><Icon name="layers" size={20} /> {nav?.label} research tools</h2></div>
        <ul className="labgrid labgrid--4">
          {tools.map((l) => <li key={l.title}><Link to={l.to} className={`labtile labtile--${l.tone}`}><span className="labtile__ic"><Icon name={l.icon} size={22} /></span><span className="labtile__t">{l.title}</span><span className="labtile__s">{l.sub}</span></Link></li>)}
        </ul>
      </section>
      {ex.loading && <Skeleton lines={8} tall />}
      {ex.data && !ex.data.available && <div className="bempty"><h3>{nav?.label} has no research explorer yet</h3><p>Its publication carries the board and markets but not team and player research documents. Open <Link to={routes.sport(slug)}>{nav?.label}</Link> for what it does publish.</p></div>}
      {teams.length > 0 && (
        <section className="bsec" aria-labelledby="teams-h">
          <div className="bsec__h"><h2 className="bsec__t" id="teams-h"><Icon name="shield" size={20} /> {code === 'TENNIS' ? 'Players' : 'Teams'} <small className="bsec__n">{teams.length}</small></h2></div>
          <ul className="tgrid">
            {teams.slice(0, 400).map((t) => (
              <li key={t.participant_id}>
                <Link to={routes.team(slug, t.participant_id)} className="tcell" title={t.display_name}>
                  <PMark sport={code} p={{ participant_id: t.participant_id, display_name: t.display_name, short_name: t.short_name, participant_type: 'TEAM' } as never} size="md" />
                  <span>{code === 'NFL' || code === 'NHL' || code === 'NBA' || code === 'MLB' ? t.short_name : t.display_name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {ex.data?.available && (
        <div className="explore__cols">
          <section className="bsec" aria-labelledby="stats-h">
            <div className="bsec__h"><h2 className="bsec__t" id="stats-h"><Icon name="chart" size={20} /> Stats Lab <small className="bsec__n">{rankings.length}</small></h2></div>
            <label className="explore__q"><Icon name="search" size={15} /><input type="search" value={rq} onChange={(e) => setRq(e.target.value)} placeholder="Filter rankings (EPA, rush, sack…)" aria-label="Filter rankings" /></label>
            {groups.map(([g, rs]) => (
              <div key={g} className="explore__grp">
                <h3 className="bgame__gh">{g} <small>{rs.length}</small></h3>
                <ul className="rklist">{rs.slice(0, 40).map((r) => <li key={r.id}><Link to={routes.ranking(slug, r.id)}>{cleanRank(r.label)}<Icon name="chevronRight" size={14} className="chev" /></Link></li>)}</ul>
              </div>
            ))}
            {!groups.length && <p className="muted">No ranking matches.</p>}
          </section>
          <section className="bsec" aria-labelledby="players-h">
            <div className="bsec__h"><h2 className="bsec__t" id="players-h"><Icon name="star" size={20} /> Players</h2></div>
            <label className="explore__q"><Icon name="search" size={15} /><input type="search" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Find a player or team" aria-label="Find a player" /></label>
            {players.length ? <ul className="rklist">{players.map((p) => <li key={p.id}><Link to={routes.player(slug, p.id)}>{p.label}<span className="muted"> · {p.secondary ?? p.context?.team ?? ''}</span><Icon name="chevronRight" size={14} className="chev" /></Link></li>)}</ul> : <p className="muted">{pq ? 'No player matches.' : 'This publication lists no players.'}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
