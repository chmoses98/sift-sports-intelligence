import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from '../../routing';
import { useQueryPatch } from '../state/url';
import { useStatVM, useTeamSeries, type StatEntry, type StatVM } from '../data/useStat';
import { fmtStat } from '../model/stat';
import { ago } from '../model/format';
import { pushVisit, saveResearch, useFollows, useSaved, removeSaved } from '../state/prefs';
import { findSaved } from '../model/saved';
import { Icon } from '../ui/Icon';
import { LineChart } from '../ui/LineChart';
import { useSheet } from '../ui/Sheet';
import { TeamLogo } from '../ui/TeamLogo';
import { teamHref } from '../ui/gamebits';
import { useSlate } from '../data/useSlate';

type Tab = 'rankings' | 'trends' | 'splits' | 'matchups';
const TABS: [Tab, string][] = [['rankings', 'Rankings'], ['trends', 'Trends'], ['splits', 'Splits'], ['matchups', 'Matchups']];
const WINDOW_WORD: Record<string, string> = { SEASON: 'Season', ADJ_RIDGE: 'Opponent-adjusted', L6: 'Last 6 games', L34: 'Last 34 games', L10: 'Last 10 games', L20: 'Last 20 games' };
const windowWord = (w: string) => WINDOW_WORD[w] ?? w;

function Definition({ vm }: { vm: StatVM }) {
  return (
    <div className="v3-def">
      <h3 className="v3-lens__k" style={{ marginTop: 4 }}>What is {vm.name}?</h3>
      <p className="v3-lens__p">{vm.description}</p>
      <dl className="v3-lens__rows" style={{ marginTop: 14 }}>
        <div><dt>Direction</dt><dd>{vm.higherIsBetter == null ? 'Descriptive (no better or worse)' : vm.higherIsBetter ? 'Higher is better' : 'Lower is better'}</dd></div>
        <div><dt>Unit</dt><dd>{vm.unit ?? '—'}</dd></div>
        <div><dt>Basis</dt><dd>{vm.adjusted ? 'Opponent-adjusted' : 'Raw'} · {windowWord(vm.window)}</dd></div>
        <div><dt>Universe</dt><dd>{vm.universe || '—'}</dd></div>
        {vm.source && <div><dt>Source</dt><dd>{vm.source}</dd></div>}
        {vm.methodology && <div><dt>Methodology</dt><dd>{vm.methodology}</dd></div>}
      </dl>
      {vm.limitations.length > 0 && <><h3 className="v3-lens__k">Known limitations</h3><ul className="v3-bul">{vm.limitations.map((l) => <li key={l}>{l}</li>)}</ul></>}
      {vm.related.length > 0 && (
        <>
          <h3 className="v3-lens__k">Related statistics</h3>
          <ul className="v3-props">{vm.related.map((r) => <li key={r.id}><Link to={r.route} className="v3-prop__who"><span><b>{r.name}</b></span></Link><Icon name="chevR" size={20} /></li>)}</ul>
        </>
      )}
      <p className="v3-note v3-note--dim">Raw and opponent-adjusted statistics are separate rankings. Counts, rates and per-game values are never mixed.</p>
    </div>
  );
}

function Rankings({ vm, selected, scope, sort, setSort, entries }: { vm: StatVM; selected: string | null; scope: string; sort: string; setSort: (s: string) => void; entries: StatEntry[] }) {
  const selRef = useRef<HTMLLIElement>(null);
  const [didScroll, setDidScroll] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    // Opening with a team selected lands on that team once; Back restores the scroll the viewer left at instead.
    if (!didScroll && selected && selRef.current && !sessionStorage.getItem(`sift3.scroll`)?.includes(loc.pathname)) {
      const r = selRef.current.getBoundingClientRect();
      if (r.top > window.innerHeight - 160) window.scrollTo({ top: window.scrollY + r.top - window.innerHeight / 2 });
    }
    setDidScroll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, entries.length]);
  const valueHead = vm.unit === 'share' ? 'Rate' : vm.higherIsBetter === false ? 'Allowed' : 'Value';
  return (
    <>
      <div className="v3-rkhead" role="row">
        <button type="button" className="v3-rkhead__b" aria-label={`Sort by rank ${sort === 'rank' ? '(current)' : ''}`} onClick={() => setSort(sort === 'rank' ? 'rank-desc' : 'rank')}>Rank {sort === 'rank' ? '↑' : sort === 'rank-desc' ? '↓' : ''}</button>
        <span>Team</span>
        <button type="button" className="v3-rkhead__b v3-rkhead__v" onClick={() => setSort(sort === 'value' ? 'value-desc' : 'value')}>{valueHead} {sort === 'value' ? '↑' : sort === 'value-desc' ? '↓' : ''}</button>
      </div>
      <ol className="v3-rkrows">
        {entries.map((e) => {
          const sel = selected === e.team.id;
          return (
            <li key={e.entityId} ref={sel ? selRef : undefined} className={`v3-rkrow${sel ? ' is-sel' : ''}`} aria-current={sel || undefined}>
              <span className="v3-rkrow__n num">{e.rank}</span>
              <Link to={teamHref(e.team)} className="v3-rkrow__t" aria-label={`${e.team.name}, rank ${e.rank}. Open team`}><TeamLogo team={e.team} size={34} /><span>{e.team.nick}</span></Link>
              <Link to={`?tab=trends&team=${encodeURIComponent(e.team.id)}`} className="v3-rkrow__v num" aria-label={`${e.team.name} ${fmtStat(e.value, vm.unit)}. Open ${e.team.nick} history for ${vm.name}`}>{fmtStat(e.value, vm.unit)}</Link>
            </li>
          );
        })}
      </ol>
      {scope === 'mine' && entries.length === 0 && <div className="v3-state"><Icon name="star" size={20} /><div><b>You follow no teams in this ranking</b>Star a team and it appears here. Switch to All teams to see the full ranking.</div></div>}
      {vm.summary && <p className="v3-note v3-note--dim">League mean {fmtStat(vm.summary.mean, vm.unit)} · median {fmtStat(vm.summary.median, vm.unit)} · {vm.entries.length} teams{vm.asOf ? ` · as of ${ago(vm.asOf)}` : ''}.</p>}
    </>
  );
}

function TeamHistory({ vm, tab, teamId, slug }: { vm: StatVM; tab: 'trends' | 'splits' | 'matchups'; teamId: string; slug: string }) {
  const { series, loading, profile, available } = useTeamSeries(slug, vm.metricId, teamId, vm.provenance === 'publication');
  const slate = useSlate();
  const nav = useNavigate();
  const [win, setWin] = useState<'L10' | 'L20' | 'SEASON'>('SEASON');
  const [sel, setSel] = useState<number | null>(null);
  const team = vm.entries.find((e) => e.team.id === teamId)?.team;
  const pts = useMemo(() => {
    const all = (series?.points ?? []).filter((p) => p.value != null);
    return win === 'SEASON' ? all : all.slice(-(win === 'L10' ? 10 : 20));
  }, [series, win]);
  const byEvent = useMemo(() => new Map(slate.games.map((g) => [g.eventId, g])), [slate.games]);
  const oppOf = (id: string | null) => vm.entries.find((e) => e.entityId === id)?.team ?? null;
  if (vm.provenance === 'demo') return <div className="v3-state"><Icon name="info" size={20} /><div><b>Sample data has no history</b>Switch to real data to see a team's game-by-game values.</div></div>;
  if (!team) return <div className="v3-state"><Icon name="info" size={20} /><div><b>Choose a team</b>Tap a team's value in Rankings to see its history here.</div></div>;
  const head = (
    <header className="v3-sthead">
      <Link to={teamHref(team)} aria-label={`${team.name}, team page`}><TeamLogo team={team} size={56} /></Link>
      <span><b>{team.name}</b><small>{vm.name}</small></span>
    </header>
  );
  if (tab === 'splits') {
    const rows = (profile?.metrics ?? []).filter((m) => m.metric_id === vm.metricId);
    return (
      <>{head}
        {rows.length ? (
          <table className="v3-tbl v3-tbl--stats"><thead><tr><th scope="col">Window</th><th scope="col">Value</th><th scope="col">Rank</th></tr></thead>
            <tbody>{rows.map((m) => <tr key={m.window?.label}><th scope="row">{windowWord(m.window?.label ?? 'SEASON')}</th><td>{fmtStat(m.adjusted_value ?? m.value, vm.unit)}</td><td>{m.context?.rank ? `${m.context.rank} of ${m.context.universe_size}` : '—'}</td></tr>)}</tbody></table>
        ) : <div className="v3-state"><Icon name="info" size={20} /><div><b>No windows published</b>The publication has no other windows for this team.</div></div>}
        <div className="v3-state"><Icon name="info" size={20} /><div><b>Situational splits</b>Home/away and opponent-quality splits are not published for this statistic{Object.keys(profile?.splits ?? {}).length ? '' : ', so none are shown'}.</div></div>
      </>
    );
  }
  if (loading) return <>{head}<div className="v3-skel" style={{ height: 220 }} role="status" aria-label="Loading history" /></>;
  if (!available || !pts.length) return <>{head}<div className="v3-state"><Icon name="info" size={20} /><div><b>No game-by-game history</b>The publication has no time series for this team and statistic.</div></div></>;
  const u = series?.unit ?? vm.unit;
  if (tab === 'matchups') {
    return (
      <>{head}
        <ul className="v3-results">
          {[...pts].reverse().map((p) => { const o = oppOf(p.opponent_id); const g = p.event_id ? byEvent.get(p.event_id) : undefined; return (
            <li key={p.t + p.x} className="v3-res v3-res--o">
              <span className="v3-res__b v3-res__b--n">{p.x.length > 4 ? p.x.slice(0, 4) : p.x}</span>
              {o ? <Link to={teamHref(o)} className="v3-res__lg" aria-label={`${o.name}, team page`}><TeamLogo team={o} size={32} /></Link> : <span />}
              {g ? <Link to={`/v3/game/${g.slug}/${g.eventId}`} className="v3-res__m"><span className="v3-res__t">vs {o?.nick ?? 'opponent'}</span><span className="v3-res__s num">{fmtStat(p.adjusted_value ?? p.value, u)}</span></Link> : <div className="v3-res__m"><span className="v3-res__t">vs {o?.nick ?? 'opponent'}</span><span className="v3-res__s num">{fmtStat(p.adjusted_value ?? p.value, u)}</span></div>}
            </li>); })}
        </ul>
      </>
    );
  }
  const cur = sel != null ? pts[sel] : null;
  const curGame = cur?.event_id ? byEvent.get(cur.event_id) : undefined;
  return (
    <>{head}
      <div className="v3-chips" role="group" aria-label="Window">{(['L10', 'L20', 'SEASON'] as const).map((w) => <button key={w} type="button" className="v3-chip" aria-pressed={win === w} onClick={() => { setWin(w); setSel(null); }}>{windowWord(w)}</button>)}</div>
      <div className="v3-panel v3-chartbox">
        <LineChart pts={pts.map((p) => ({ key: p.t + p.x, label: p.x.length > 5 ? p.x.slice(5) : p.x, y: (p.adjusted_value ?? p.value) as number }))} fmt={(v) => fmtStat(v, u)} sel={sel} onSel={setSel} label={`${team.name} ${vm.name}, ${pts.length} observations`} />
      </div>
      {cur ? (
        <div className="v3-panel v3-pad v3-pointcard">
          <b className="num">{fmtStat((cur.adjusted_value ?? cur.value) as number, u)}</b>
          <span>{cur.x}{oppOf(cur.opponent_id) ? ` · vs ${oppOf(cur.opponent_id)!.nick}` : ''}</span>
          {curGame ? <button type="button" className="v3-btn" onClick={() => nav(`/v3/game/${curGame.slug}/${curGame.eventId}`)}>Open that game<Icon name="chevR" size={18} /></button> : <small>This game is not on the published slate, so there is no game page to open.</small>}
        </div>
      ) : <p className="v3-note">Tap a point to see the game behind it.</p>}
      <p className="v3-note v3-note--dim">{pts.length} observations · {series?.rolling_window ? `rolling ${series.rolling_window} games · ` : ''}as of {ago(series?.as_of)}.</p>
    </>
  );
}

export function Stat() {
  const { slug = '', statId = '' } = useParams();
  const id = decodeURIComponent(statId);
  const { vm, loading, error } = useStatVM(slug, id);
  const nav = useNavigate();
  const loc = useLocation();
  const sheet = useSheet();
  const follows = useFollows();
  const saved = useSaved();
  const [sp] = useSearchParams();
  const setSp = useQueryPatch();
  const tab = (TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'rankings') as Tab;
  const team = sp.get('team');
  const sort = sp.get('sort') ?? 'rank';
  const scope = sp.get('scope') ?? 'all';
  const set = (k: string, v: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; });
  const entries = useMemo(() => {
    if (!vm) return [];
    let e = vm.entries;
    if (scope === 'mine') e = e.filter((x) => follows.teams.includes(`${x.team.slug}:${x.team.id}`));
    const byRank = [...e].sort((a, b) => a.rank - b.rank);
    if (sort === 'rank-desc') return byRank.reverse();
    if (sort === 'value') return [...e].sort((a, b) => (a.value ?? 1e9) - (b.value ?? 1e9));
    if (sort === 'value-desc') return [...e].sort((a, b) => (b.value ?? -1e9) - (a.value ?? -1e9));
    return byRank;
  }, [vm, sort, scope, follows.teams]);
  const route = `${loc.pathname}${loc.search}`;
  const savedItem = findSaved(saved, `/v3/stat/${slug}/${encodeURIComponent(id)}${loc.search}`);
  const back = () => { if (loc.key !== 'default') nav(-1); else nav('/v3/explore', { replace: true }); };
  void route;
  useEffect(() => { if (vm) pushVisit({ route: `/v3/stat/${slug}/${encodeURIComponent(id)}`, title: vm.name, subtitle: `${vm.scope.split(' · ')[0]} · ${windowWord(vm.window)} ranking`, kind: 'stat', slug }); }, [vm?.name, id, slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const histTeam = team ?? vm?.entries[0]?.team.id ?? '';

  return (
    <div className="v3-page v3-stat">
      <header className="v3-pgbar">
        <button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={26} /></button>
        <h1>Stat Detail</h1>
        <button type="button" className={`v3-iconbtn v3-star${savedItem ? ' is-on' : ''}`} aria-pressed={!!savedItem} aria-label={savedItem ? 'Remove saved statistic' : 'Save this statistic'}
          onClick={() => { if (!vm) return; if (savedItem) removeSaved(savedItem.id); else saveResearch({ title: vm.name, subtitle: `${vm.scope.split(' · ')[0]} · ${windowWord(vm.window)}${team ? ` · ${team}` : ''}`, route: `/v3/stat/${slug}/${encodeURIComponent(id)}${loc.search}`, snapshot: vm.entries.slice(0, 1).map((e) => ({ label: `${e.team.abbr} (rank 1)`, value: fmtStat(e.value, vm.unit), asOf: vm.asOf })) }); }}>
          <Icon name="star" size={24} fill={!!savedItem} />
        </button>
      </header>
      {loading && <div role="status" aria-label="Loading statistic"><div className="v3-skel" style={{ height: 120 }} /><div className="v3-skel" style={{ height: 300, marginTop: 14 }} /></div>}
      {!loading && !vm && <div className="v3-state"><Icon name="info" size={20} /><div><b>Statistic not available</b>{error ?? 'The publication has no ranking with this identity.'}<br /><Link to="/v3/explore" style={{ color: 'var(--sift-cyan)' }}>Search statistics</Link></div></div>}
      {vm && (
        <>
          {vm.provenance === 'demo' && <p className="v3-tag" style={{ display: 'inline-block', marginBottom: 8 }}>Sample ranking</p>}
          <p className="v3-over">{vm.scope}</p>
          <h2 className="v3-stat__t">{vm.name} <button type="button" className="v3-iconbtn v3-info" aria-label={`Definition of ${vm.name}`} onClick={() => sheet.open('Stat definition', <Definition vm={vm} />, { tall: true })}><Icon name="info" size={22} /></button></h2>
          <p className="v3-stat__d">{vm.description}</p>
          <div className="v3-seg v3-seg--box" role="tablist" aria-label="Statistic views">
            {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => set('tab', k === 'rankings' ? null : k)}>{label}</button>)}
          </div>
          {tab === 'rankings' && (
            <div className="v3-sels">
              <label className="v3-sel v3-sel--full"><span className="sr">Season</span><select aria-label="Season" disabled value="s"><option value="s">{vm.season ? `${vm.season} season` : 'Current season'}</option></select><Icon name="chevD" size={18} /></label>
              <label className="v3-sel"><span className="sr">Window</span>
                <select aria-label="Window" value={id} onChange={(e) => nav(`/v3/stat/${slug}/${encodeURIComponent(e.target.value)}${loc.search}`, { replace: true })}>
                  {(vm.siblings.length ? vm.siblings : [{ id, window: vm.window }]).map((s) => <option key={s.id} value={s.id}>{windowWord(s.window)}</option>)}
                </select><Icon name="chevD" size={18} /></label>
              <label className="v3-sel"><span className="sr">Teams</span>
                <select aria-label="Teams" value={scope} onChange={(e) => set('scope', e.target.value === 'all' ? null : e.target.value)}><option value="all">All teams</option><option value="mine">My teams</option></select><Icon name="chevD" size={18} /></label>
            </div>
          )}
          {tab === 'rankings' ? <Rankings vm={vm} selected={team} scope={scope} sort={sort} setSort={(s) => set('sort', s === 'rank' ? null : s)} entries={entries} />
            : <TeamHistory vm={vm} tab={tab} teamId={histTeam} slug={slug} />}
        </>
      )}
    </div>
  );
}
