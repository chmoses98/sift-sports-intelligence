import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from '../../routing';
import { useQueryPatch } from '../state/url';
import { useTeamVM, type MetricGroup, type MetricRow } from '../data/useTeam';
import { teamPhoto } from '../data/adapt';
import { ago, clockTime, dayWord } from '../model/format';
import { demoOn, pushVisit, useFollows } from '../state/prefs';
import type { V3Game } from '../model/types';
import { AlertBell, FollowStar } from '../ui/Controls';
import { HeroBg } from '../ui/HeroBg';
import { Icon } from '../ui/Icon';
import { TeamLogo } from '../ui/TeamLogo';
import { Rank } from '../ui/rank';
import { gameHref, leagueLabel, teamHref } from '../ui/gamebits';
import { useSlate } from '../data/useSlate';

type Tab = 'overview' | 'schedule' | 'roster' | 'stats' | 'injuries';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['schedule', 'Schedule'], ['roster', 'Roster'], ['stats', 'Stats'], ['injuries', 'Injuries']];
const GROUP_LABEL: Record<MetricGroup, string> = { offense: 'Offense', defense: 'Defense', adjusted: 'Opponent-adjusted', style: 'Style', results: 'Results', other: 'Other' };

function StatTile({ m }: { m: MetricRow }) {
  const inner = (<><b className="num">{m.value}</b><span>{m.name}</span><Rank rank={m.rank} n={m.n} word /></>);
  return m.route ? <Link to={m.route} className="v3-stile" aria-label={`${m.name}: ${m.value}, ${m.rank ?? 'unranked'}. Open league ranking`}>{inner}</Link> : <div className="v3-stile">{inner}</div>;
}

function StatsTab({ metrics, why }: { metrics: MetricRow[]; why?: string }) {
  const groups = useMemo(() => (['offense', 'defense', 'adjusted', 'style', 'results', 'other'] as MetricGroup[]).filter((g) => metrics.some((m) => m.group === g)), [metrics]);
  const [g, setG] = useState<MetricGroup | null>(null);
  const cur = g && groups.includes(g) ? g : groups[0];
  if (!groups.length) return <div className="v3-state"><Icon name="info" size={20} /><div><b>No team statistics</b>{why ?? 'The publication has none for this team.'}</div></div>;
  const rows = metrics.filter((m) => m.group === cur);
  return (
    <section aria-label="Team statistics">
      <div className="v3-chips" role="group" aria-label="Statistic group">
        {groups.map((x) => <button key={x} type="button" className="v3-chip" aria-pressed={cur === x} onClick={() => setG(x)}>{GROUP_LABEL[x]}</button>)}
      </div>
      <h2 className="v3-h2">Key Metrics</h2>
      <table className="v3-tbl v3-tbl--stats">
        <thead><tr><th scope="col">Stat</th><th scope="col">Value</th><th scope="col">{cur === 'adjusted' ? 'Adj. rank' : 'Rank'}</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <th scope="row">{m.route ? <Link to={m.route}>{m.name}</Link> : m.name}</th>
              <td>{m.value}</td>
              <td>{m.route ? <Link to={m.route} aria-label={`${m.name} league ranking`}><Rank rank={m.rank} n={m.n} /></Link> : <Rank rank={m.rank} n={m.n} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="v3-note v3-note--dim">{cur === 'adjusted' ? 'Opponent-adjusted values are a different statistic from the raw season values; they are never mixed. Each row opens its own ranking.' : 'Raw season values. Each row opens its league ranking; opponent-adjusted versions are on their own tab.'}</p>
    </section>
  );
}

export function Team() {
  const { slug = '', teamId = '' } = useParams();
  const id = decodeURIComponent(teamId);
  const { vm, loading, upcoming } = useTeamVM(slug, id);
  const slate = useSlate();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const setSp = useQueryPatch();
  const tab = (TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'overview') as Tab;
  const follows = useFollows();
  const t = vm.team;
  const key = `${t.slug}:${t.id}`;
  const photo = useMemo(() => (demoOn() ? null : teamPhoto(t.sport, t.id, t.name, new Date().toISOString())), [t]);
  const sentinel = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-56px 0px 0px 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => { if (t.name && t.name !== id) pushVisit({ route: `/v3/team/${slug}/${encodeURIComponent(id)}`, title: t.name, subtitle: `${leagueLabel({ sport: t.sport })} · team`, kind: 'team', slug, logo: t.logo }); }, [t.name, t.logo, id, slug, t.sport]);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const setTab = (k: Tab) => setSp((p) => { const n = new URLSearchParams(p); if (k === 'overview') n.delete('tab'); else n.set('tab', k); return n; });
  const back = () => nav(-1);
  const next: V3Game | undefined = upcoming.find((g) => g.phase === 'live' || g.phase === 'pregame');
  const bySlate = useMemo(() => new Map(slate.games.map((g) => [g.eventId, g])), [slate.games]);
  const tiles = useMemo(() => {
    const ranked = vm.metrics.filter((m) => m.rank != null && (m.group === 'offense' || m.group === 'defense' || m.group === 'results'));
    return (ranked.length >= 3 ? ranked : vm.metrics.filter((m) => m.rank != null)).slice(0, 3);
  }, [vm.metrics]);
  const roster = useMemo(() => vm.roster.filter((r) => (!pos || r.role === pos) && (!q || r.name.toLowerCase().includes(q.toLowerCase()))), [vm.roster, pos, q]);
  const roles = useMemo(() => [...new Set(vm.roster.map((r) => r.role).filter(Boolean) as string[])].sort(), [vm.roster]);

  return (
    <div className="v3-team">
      <header className="v3-th">
        <HeroBg g={{ away: t, home: t, photo }} cover />
        <div className="v3-gh__bar">
          <button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={26} /></button>
          <span className="v3-top__sp" />
          <AlertBell id={key} label={t.name} />
          <FollowStar kind="teams" id={key} label={t.name} />
        </div>
        <div className="v3-th__id">
          <TeamLogo team={t} size={92} />
          <h1>{t.name}</h1>
          <p>{leagueLabel({ sport: t.sport })}{vm.provenance === 'demo' ? ' · sample data' : ''}</p>
          {vm.record && <b className="v3-th__rec num">{vm.record.replace(/-/g, ' - ')}</b>}
          {vm.season && <small>{vm.season} season · completed games in the publication</small>}
        </div>
      </header>
      <div ref={sentinel} className="v3-gd__sentinel" aria-hidden="true" />
      <div className={`v3-cb${collapsed ? ' is-on' : ''}`} aria-hidden={!collapsed}>
        <button type="button" className="v3-iconbtn" tabIndex={collapsed ? 0 : -1} aria-label="Back" onClick={back}><Icon name="back" size={24} /></button>
        <button type="button" className="v3-cb__mid v3-cb__mid--team" tabIndex={collapsed ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label={`${t.name}, scroll to top`}><TeamLogo team={t} size={30} /><b>{t.name}</b></button>
        <FollowStar kind="teams" id={key} label={t.name} />
      </div>
      <div className={`v3-tabs v3-tabs--box${collapsed ? ' is-stuck' : ''}`} role="tablist" aria-label="Team sections">
        {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <div className="v3-gd__body">
        {loading && <div className="v3-skel" style={{ height: 120 }} role="status" aria-label="Loading team" />}
        {tab === 'overview' && (
          <>
            <section className="v3-panel v3-next" aria-label="Next game">
              <header><h2>Next Game</h2>{next && <span>{dayWord(next.startMs)} · {clockTime(next.startMs)}</span>}</header>
              {next ? (
                <Link to={gameHref(next)} className="v3-next__r" aria-label={`Next game: ${next.away.name} at ${next.home.name}. Open`}>
                  {(() => { const opp = next.home.id === t.id && next.home.slug === t.slug ? next.away : next.home; const away = next.away.id === t.id; return (<><TeamLogo team={opp} size={52} /><span><b>{away ? '@' : 'vs'} {opp.nick}</b><small>{leagueLabel(next)}{next.network ? ` · ${next.network}` : ''}</small></span></>); })()}
                  <Icon name="chevR" size={20} />
                </Link>
              ) : <p className="v3-note">No upcoming game is on the published slate.</p>}
            </section>
            {tiles.length > 0 && <div className="v3-stiles">{tiles.map((m) => <StatTile key={m.id} m={m} />)}</div>}
            <section aria-label="Recent results">
              <div className="v3-sechead" style={{ margin: '8px 0 4px' }}><h2>Recent Results</h2>{vm.results.length > 5 && <button type="button" onClick={() => setTab('schedule')}>See All<Icon name="chevR" size={16} /></button>}</div>
              {vm.results.length ? (
                <ul className="v3-results">{vm.results.slice(0, 5).map((r) => <ResultItem key={r.eventId} r={r} g={bySlate.get(r.eventId)} />)}</ul>
              ) : <div className="v3-state"><Icon name="info" size={20} /><div><b>No results to show</b>{vm.why.results ?? 'Nothing is published yet.'}</div></div>}
            </section>
          </>
        )}
        {tab === 'schedule' && (
          <section aria-label="Schedule">
            {upcoming.filter((g) => g.phase !== 'final').length > 0 && <><h2 className="v3-h2">Upcoming</h2><ul className="v3-results">{upcoming.filter((g) => g.phase !== 'final').map((g) => {
              const away = g.away.id === t.id; const opp = away ? g.home : g.away;
              return <li key={g.key} className="v3-res"><span className="v3-res__b v3-res__b--n">{dayWord(g.startMs).slice(0, 3)}</span><Link to={teamHref(opp)} className="v3-res__lg" aria-label={`${opp.name}, team page`}><TeamLogo team={opp} size={32} /></Link><Link to={gameHref(g)} className="v3-res__m" aria-label={`${away ? 'At' : 'Versus'} ${opp.name}, ${clockTime(g.startMs)}. Open game`}><span className="v3-res__t">{away ? '@' : 'vs'} {opp.nick}</span><span className="v3-res__s">{clockTime(g.startMs)}</span></Link></li>;
            })}</ul></>}
            <h2 className="v3-h2">Results</h2>
            {vm.results.length ? <ul className="v3-results">{vm.results.map((r) => <ResultItem key={r.eventId} r={r} g={bySlate.get(r.eventId)} />)}</ul> : <div className="v3-state"><Icon name="info" size={20} /><div><b>No results to show</b>{vm.why.results ?? 'Nothing is published yet.'}</div></div>}
          </section>
        )}
        {tab === 'roster' && (
          <section aria-label="Roster">
            {vm.roster.length ? (
              <>
                <label className="v3-pk__search"><Icon name="search" size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the roster" aria-label="Search the roster" autoComplete="off" /></label>
                {roles.length > 1 && <div className="v3-chips" role="group" aria-label="Position"><button type="button" className="v3-chip" aria-pressed={!pos} onClick={() => setPos(null)}>All</button>{roles.map((r) => <button key={r} type="button" className="v3-chip" aria-pressed={pos === r} onClick={() => setPos(r)}>{r}</button>)}</div>}
                <ul className="v3-props">{roster.map((r) => <li key={r.id}><Link to={`/v3/player/${t.slug}/${encodeURIComponent(r.id)}`} className="v3-prop__who"><span><b>{r.name}</b><small>{r.role ?? 'Player'}</small></span></Link><Icon name="chevR" size={20} /></li>)}</ul>
                {roster.length === 0 && <div className="v3-state"><Icon name="search" size={20} /><div><b>No matching players</b><button type="button" onClick={() => { setQ(''); setPos(null); }}>Clear filters</button></div></div>}
              </>
            ) : <div className="v3-state"><Icon name="info" size={20} /><div><b>No roster</b>{vm.why.roster}</div></div>}
          </section>
        )}
        {tab === 'stats' && <StatsTab metrics={vm.metrics} why={vm.why.stats} />}
        {tab === 'injuries' && (
          <section aria-label="Injuries">
            {vm.injuries.length ? (
              <ul className="v3-props">{vm.injuries.map((i) => (
                <li key={i.player + i.status} className="v3-inj">
                  <button type="button" className="v3-prop__who" aria-expanded={open === i.player} onClick={() => setOpen(open === i.player ? null : i.player)}>
                    <span><b>{i.player}{i.position ? ` · ${i.position}` : ''}</b><small>{i.status.replace(/_/g, ' ').toLowerCase()}{i.asOf ? ` · ${ago(i.asOf)}` : ''}</small>{open === i.player && <small className="v3-inj__n">{i.note || 'No detail published.'}</small>}</span>
                  </button>
                  <span className={`v3-chip v3-chip--st v3-chip--${i.status.toLowerCase()}`}>{i.status.replace(/_/g, ' ')}</span>
                </li>))}
              </ul>
            ) : <div className="v3-state"><Icon name="info" size={20} /><div><b>No injuries listed</b>{vm.why.injuries}</div></div>}
            <p className="v3-note v3-note--dim">Injury designations as published{vm.asOf ? `, ${ago(vm.asOf)}` : ''}. Nothing is inferred.</p>
          </section>
        )}
        {follows.teams.includes(key) && tab === 'overview' && <p className="v3-note v3-note--dim">You follow {t.nick}. Alerts stay off until you turn them on with the bell.</p>}
      </div>
    </div>
  );
}

function ResultItem({ r, g }: { r: import('../data/useTeam').ResultRow; g: V3Game | undefined }) {
  const word = r.outcome === 'W' ? 'Win' : r.outcome === 'L' ? 'Loss' : 'Tie';
  const main = (<><span className="v3-res__t">{r.home ? 'vs' : '@'} {r.opp.nick}</span><span className="v3-res__s num">{r.for} - {r.against}</span></>);
  return (
    <li className="v3-res">
      <span className={`v3-res__b v3-res__b--${r.outcome}`} aria-label={word}>{r.outcome}</span>
      <Link to={teamHref(r.opp)} className="v3-res__lg" aria-label={`${r.opp.name}, team page`}><TeamLogo team={r.opp} size={32} /></Link>
      {g ? <Link to={gameHref(g)} className="v3-res__m" aria-label={`${word} ${r.home ? 'versus' : 'at'} ${r.opp.name}, ${r.for} to ${r.against}. Open game`}>{main}</Link> : <div className="v3-res__m">{main}</div>}
    </li>
  );
}
