import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from '../../routing';
import { usePlayerVM, type PlayerVM } from '../data/usePlayer';
import { useSlate } from '../data/useSlate';
import { applyFilters, filtersActive, NO_FILTERS, referenceLine, resultOf, sliceWindow, smallSample, summarize, WINDOWS, type Filters, type Obs, type Window } from '../model/research';
import { ago, clockTime, dayWord, quoteState } from '../model/format';
import { pushVisit, removeSaved, saveResearch, useSaved } from '../state/prefs';
import type { Price } from '../model/types';
import { BarChart } from '../ui/BarChart';
import { FollowStar } from '../ui/Controls';
import { HeroBg } from '../ui/HeroBg';
import { Icon } from '../ui/Icon';
import { useSheet } from '../ui/Sheet';
import { TeamLogo } from '../ui/TeamLogo';
import { gameHref, MarketDetail, teamHref } from '../ui/gamebits';

type Tab = 'overview' | 'props' | 'log' | 'replay';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['props', 'Props'], ['log', 'Game log'], ['replay', 'Replay']];
const WIN_LABEL: Record<Window, string> = { L5: 'L5', L10: 'L10', L20: 'L20', SEASON: 'Season', H2H: 'H2H' };
const fmt1 = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(v * 10) / 10));
const signedN = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 10) / 10)}`);
const shortDate = (d: string) => { const [, m, dd] = d.split('-'); return `${Number(m)}/${Number(dd)}`; };

/** Everything the viewer can change, in the address so Back, reload and Saved research restore it exactly. */
function useResearchState(vm: PlayerVM | null) {
  const [sp, setSp] = useSearchParams();
  const set = (patch: Record<string, string | null>) => setSp((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') n.delete(k); else n.set(k, v); } return n; }, { replace: true });
  const stat = vm && vm.stats.some((s) => s.key === sp.get('stat')) ? sp.get('stat')! : vm ? (vm.stats.find((s) => vm.props.has(s.key)) ?? vm.stats[0])?.key ?? null : null;
  const win = (WINDOWS.includes(sp.get('win') as Window) ? sp.get('win') : 'L10') as Window;
  const filters: Filters = {
    site: sp.get('site') === 'home' || sp.get('site') === 'away' ? (sp.get('site') as 'home' | 'away') : null,
    opp: sp.get('opp'),
    rest: sp.get('rest') === 'short' || sp.get('rest') === 'normal' ? (sp.get('rest') as 'short' | 'normal') : null,
    script: sp.get('script') === 'close' || sp.get('script') === 'blowout' ? (sp.get('script') as 'close' | 'blowout') : null,
    minMin: sp.get('min') ? Number(sp.get('min')) : null,
  };
  const lineParam = sp.get('line') ? Number(sp.get('line')) : null;
  return { sp, set, stat, win, filters, lineParam, tab: (TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'overview') as Tab };
}

function ObsDetail({ o, vm, stat, line }: { o: Obs; vm: PlayerVM; stat: string; line: number | null }) {
  const slate = useSlate();
  const g = o.eventId ? slate.games.find((x) => x.eventId === o.eventId) : undefined;
  const v = o.v[stat];
  const r = v != null && line != null ? resultOf(v, line) : null;
  return (
    <div>
      <p className="v3-mkt__q">{o.label} · {o.date}</p>
      {v != null && <div className="v3-mkt__big"><span className="num">{fmt1(v)}</span><small>{vm.stats.find((s) => s.key === stat)?.label}{r && line != null ? ` · ${r === 'over' ? 'over' : r === 'under' ? 'under' : 'push on'} ${line}` : ''}</small></div>}
      <div className="v3-kvs">
        {vm.stats.map((s) => <div key={s.key} className="v3-kv"><span>{s.label}</span><b>{fmt1(o.v[s.key])}</b></div>)}
        {o.min != null && <div className="v3-kv"><span>Minutes</span><b>{o.min}</b></div>}
        {o.margin != null && <div className="v3-kv"><span>Final margin</span><b>{signedN(o.margin)}</b></div>}
        {o.rest != null && <div className="v3-kv"><span>Days of rest</span><b>{o.rest}</b></div>}
      </div>
      {g ? <Link to={gameHref(g)} className="v3-btn" style={{ marginTop: 14 }}>Open this game<Icon name="chevR" size={18} /></Link> : <p className="v3-note v3-note--dim">This game is not on the published slate, so there is no game page to open. The values above are the published observation.</p>}
      <p className="v3-note v3-note--dim">Closing the sheet returns to your chart exactly as it was.</p>
    </div>
  );
}

function LinesSheet({ vm, stat, line, set }: { vm: PlayerVM; stat: string; line: number | null; set: (p: Record<string, string | null>) => void }) {
  const sheet = useSheet();
  const prop = vm.props.get(stat);
  const s = vm.stats.find((x) => x.key === stat);
  const [detail, setDetail] = useState<Price | null>(null);
  if (!prop) return <p className="v3-note">No market is listed for {s?.label.toLowerCase()} in the coming game. The line on the chart is a reference line (the median of the games shown), not a price.</p>;
  if (detail && vm.next) return <><button type="button" className="v3-link" onClick={() => setDetail(null)}>‹ All lines</button><MarketDetail g={vm.next} line={{ kind: 'total', label: `${vm.name} ${s?.label}`, price: detail, line, alternates: prop.ladder }} /></>;
  return (
    <div>
      <p className="v3-note">Choose a line: the chart, hit rate and averages move with it.</p>
      <ul className="v3-ladder">
        {prop.ladder.map((p) => {
          const ln = Number(/(\d+(?:\.\d+)?)\D*$/.exec(p.description.replace(/ (points|yards|goals|assists).*$/i, ''))?.[1] ?? NaN);
          const use = Number.isFinite(ln) ? ln : prop.line;
          return (
            <li key={p.ticker}>
              <button type="button" aria-pressed={use === line} onClick={() => { set({ line: String(use) }); sheet.close(); }}>
                <span>Over {use}</span><b>{p.ask != null ? `${p.ask}¢` : '—'}</b>
              </button>
              <button type="button" className="v3-link" aria-label={`Exact contract for over ${use}`} onClick={() => setDetail(p)}>Contract</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FiltersSheet({ vm, filters, set }: { vm: PlayerVM; filters: Filters; set: (p: Record<string, string | null>) => void }) {
  const sheet = useSheet();
  const [f, setF] = useState<Filters>(filters);
  const opp = vm.opp;
  const Seg = <T extends string | number | null>({ label, value, opts, onPick, hint }: { label: string; value: T; opts: [T, string][]; onPick: (v: T) => void; hint?: string }) => (
    <fieldset className="v3-fs"><legend>{label}</legend>
      <div className="v3-seg" role="group">{opts.map(([k, l]) => <button key={String(k)} type="button" aria-pressed={value === k} className="v3-seg__b" onClick={() => onPick(k)}>{l}</button>)}</div>
      {hint && <p className="v3-note">{hint}</p>}
    </fieldset>
  );
  const apply = () => { set({ site: f.site, opp: f.opp, rest: f.rest, script: f.script, min: f.minMin != null ? String(f.minMin) : null }); sheet.close(); };
  return (
    <div className="v3-filters">
      <Seg label="Game type" value={f.site} opts={[[null, 'All'], ['home', 'Home'], ['away', 'Away']]} onPick={(v) => setF({ ...f, site: v })} />
      <Seg label="Opponent" value={f.opp} opts={[[null, 'All'], ...(opp ? [[opp.id, `vs ${opp.abbr}`] as [string | null, string]] : [])]} onPick={(v) => setF({ ...f, opp: v })} hint={opp ? undefined : 'No coming opponent is on the published slate.'} />
      <Seg label="Days of rest" value={f.rest} opts={[[null, 'All'], ['short', '6 or fewer'], ['normal', '7 or more']]} onPick={(v) => setF({ ...f, rest: v })} hint="Counted from the team's previous game." />
      {vm.hasScore && <Seg label="Game script" value={f.script} opts={[[null, 'All'], ['close', 'Competitive (≤ 8)'], ['blowout', 'Blowout (> 14)']]} onPick={(v) => setF({ ...f, script: v })} hint="By the final margin of each past game." />}
      {vm.hasMinutes && <Seg label="Minutes played (actual)" value={f.minMin} opts={[[null, 'Any'], [20, '20+'], [28, '28+'], [32, '32+'], [36, '36+']]} onPick={(v) => setF({ ...f, minMin: v })} hint="Minutes he actually played in each past game. A projection for tonight is a different thing and is not used here." />}
      <p className="v3-note v3-note--dim">Teammate with/without, pace and similar filters need data this publication does not carry, so they are not offered.</p>
      <div className="v3-filters__bar">
        <button type="button" className="v3-link" onClick={() => setF(NO_FILTERS)}>Reset</button>
        <button type="button" className="v3-btn v3-btn--cyan" onClick={apply}>Apply filters</button>
      </div>
    </div>
  );
}

function AllProps({ vm, set }: { vm: PlayerVM; set: (p: Record<string, string | null>) => void }) {
  const sheet = useSheet();
  const [q, setQ] = useState('');
  const rows = vm.stats.filter((s) => !q || s.label.toLowerCase().includes(q.toLowerCase()) || s.short.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <label className="v3-pk__search"><Icon name="search" size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stats and props" aria-label="Search stats and props" autoComplete="off" /></label>
      <ul className="v3-props" style={{ marginTop: 12 }}>
        {rows.map((s) => {
          const p = vm.props.get(s.key);
          return (
            <li key={s.key}>
              <button type="button" className="v3-prop__who" onClick={() => { set({ stat: s.key, line: p ? String(p.line) : null, tab: null }); sheet.close(); }}><span><b>{s.label}</b><small>{p ? `Over ${p.line} · ${p.price.ask ?? '—'}¢` : 'No market listed: research only'}</small></span></button>
              <Icon name="chevR" size={20} />
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <p className="v3-note">No stat matches “{q}”.</p>}
    </div>
  );
}

export function Player() {
  const { slug = '', playerId = '' } = useParams();
  const pid = decodeURIComponent(playerId);
  const { vm, loading, notFound, noExplorer } = usePlayerVM(slug, pid);
  const R = useResearchState(vm);
  const sheet = useSheet();
  const nav = useNavigate();
  const loc = useLocation();
  const saved = useSaved();
  const [sel, setSel] = useState<string | null>(null);
  const back = () => { if (loc.key !== 'default') nav(-1); else nav('/v3/explore', { replace: true }); };
  useEffect(() => { if (vm) pushVisit({ route: `/v3/player/${slug}/${encodeURIComponent(pid)}`, title: vm.name, subtitle: [slug.toUpperCase(), vm.team?.abbr, vm.position].filter(Boolean).join(' · '), kind: 'player', slug, logo: vm.team?.logo }); }, [vm?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const prop = vm && R.stat ? vm.props.get(R.stat) : undefined;
  const filtered = useMemo(() => (vm ? applyFilters(vm.obs, R.filters) : []), [vm, R.filters]);
  const oppCode = R.filters.opp ?? vm?.opp?.id ?? null;
  // The reference line when no market exists: median of the games in the window (a reference, never a price).
  const win = vm && R.stat ? sliceWindow(filtered, R.win, oppCode, vm.season) : [];
  const line = R.lineParam ?? prop?.line ?? (vm && R.stat ? referenceLine(win.length ? win : vm.obs, R.stat) : null);
  const isRef = !prop || (R.lineParam != null && R.lineParam !== prop.line && !prop.ladder.some((p) => p.description.includes(String(R.lineParam))));
  const sum = R.stat ? summarize(win, R.stat, line) : null;
  const statDef = vm?.stats.find((s) => s.key === R.stat);
  const chips = vm && R.stat ? WINDOWS.map((w) => ({ w, s: summarize(sliceWindow(filtered, w, oppCode, vm.season), R.stat!, line) })) : [];
  const bars = win.map((o) => { const v = o.v[R.stat ?? ''] ?? null; return { key: o.key, v, label: shortDate(o.date), sub: o.opp, result: v != null && line != null ? resultOf(v, line) : null }; });
  const route = `/v3/player/${slug}/${encodeURIComponent(pid)}${loc.search}`;
  const savedItem = saved.find((s) => s.route === route);
  const openObs = (k: string) => { const o = win.find((x) => x.key === k); if (!o || !vm || !R.stat) return; setSel(k); sheet.open('Game observation', <ObsDetail o={o} vm={vm} stat={R.stat} line={line} />); };
  const price = prop?.price;
  const fAct = filtersActive(R.filters);
  const next = vm?.next;
  const chipsOf = [R.filters.site && (R.filters.site === 'home' ? 'Home' : 'Away'), R.filters.opp && `vs ${R.filters.opp}`, R.filters.rest && (R.filters.rest === 'short' ? 'Rest ≤ 6' : 'Rest ≥ 7'), R.filters.script && (R.filters.script === 'close' ? 'Competitive' : 'Blowout'), R.filters.minMin != null && `${R.filters.minMin}+ min`].filter(Boolean) as string[];
  const clear = (label: string) => R.set(label.startsWith('Home') || label === 'Away' ? { site: null } : label.startsWith('vs') ? { opp: null } : label.startsWith('Rest') ? { rest: null } : label === 'Competitive' || label === 'Blowout' ? { script: null } : { min: null });

  return (
    <div className="v3-player">
      <header className="v3-ph">
        {vm?.team && <HeroBg g={{ away: vm.team, home: vm.team, photo: null }} cover />}
        {vm?.photo && <img className="v3-ph__img" src={vm.photo.src} alt="" style={{ objectPosition: vm.photo.focus }} />}
        <div className="v3-gh__bar">
          <button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={26} /></button>
          <span className="v3-top__sp" />
          {vm && <FollowStar kind="players" id={`${slug}:${pid}`} label={vm.name} />}
          <button type="button" className={`v3-iconbtn v3-star${savedItem ? ' is-on' : ''}`} aria-pressed={!!savedItem} aria-label={savedItem ? 'Remove saved research' : 'Save this research'} disabled={!vm || !R.stat}
            onClick={() => { if (!vm || !R.stat) return; if (savedItem) removeSaved(savedItem.id); else saveResearch({ title: `${vm.name} · ${statDef?.label}`, subtitle: `${WIN_LABEL[R.win]}${chipsOf.length ? ` · ${chipsOf.join(', ')}` : ''}${line != null ? ` · line ${line}` : ''}`, route, snapshot: [{ label: 'Hit rate', value: sum ? `${sum.over}/${sum.n}` : '—', asOf: vm.asOf }, { label: isRef ? 'Reference line' : 'Line · price', value: price ? `${line} · ${price.ask}¢` : String(line), asOf: price?.observedAt ?? vm.asOf }] }); }}>
            <Icon name="bookmark" size={22} fill={!!savedItem} />
          </button>
        </div>
        {vm && (
          <div className="v3-ph__id">
            {vm.team && <Link to={teamHref(vm.team)} className="v3-ph__tm" aria-label={`${vm.team.name}, team page`}><TeamLogo team={vm.team} size={56} /></Link>}
            <h1><small>{vm.name.split(' ').slice(0, -1).join(' ') || ' '}</small><b>{vm.name.split(' ').slice(-1)[0]}</b></h1>
            <p>{[vm.team?.abbr, vm.position].filter(Boolean).join(' · ')}{vm.provenance === 'demo' ? ' · sample' : ''}</p>
          </div>
        )}
      </header>

      {loading && <div className="v3-page"><div className="v3-skel" style={{ height: 200 }} role="status" aria-label="Loading player" /></div>}
      {!loading && (notFound || noExplorer) && (
        <div className="v3-page"><div className="v3-state"><Icon name="info" size={20} /><div><b>Player research is not available</b>{noExplorer ? `The ${slug.toUpperCase()} publication carries no player profiles yet.` : 'This player is not in the publication.'}<br /><Link to="/v3/explore" style={{ color: 'var(--sift-cyan)' }}>Search players</Link></div></div></div>
      )}
      {vm && (
        <>
          <div className="v3-vs">
            {vm.opp && vm.team ? (
              <>
                <Link to={teamHref(vm.team)} aria-label={`${vm.team.name}, team page`}><TeamLogo team={vm.team} size={44} /></Link>
                {next ? <Link to={gameHref(next)} className="v3-vs__m" aria-label={`${vm.team.nick} ${vm.nextHome ? 'versus' : 'at'} ${vm.opp.nick}. Open game`}><b>{vm.nextHome ? 'vs' : '@'} {vm.opp.abbr}</b><span>{dayWord(next.startMs)} · {clockTime(next.startMs)}</span>{next.network && <small>{next.network}</small>}</Link> : <span />}
                <Link to={teamHref(vm.opp)} aria-label={`${vm.opp.name}, team page`}><TeamLogo team={vm.opp} size={44} /></Link>
              </>
            ) : <p className="v3-note" style={{ textAlign: 'center', width: '100%' }}>No upcoming game for this player is on the published slate.</p>}
          </div>
          <div className="v3-tabs v3-tabs--player" role="tablist" aria-label="Player sections">
            {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={R.tab === k} onClick={() => R.set({ tab: k === 'overview' ? null : k })}>{label}{k === 'props' && vm.props.size > 0 && <i className="v3-badge">{vm.props.size}</i>}</button>)}
          </div>
          <div className="v3-gd__body">
            {vm.why && vm.obs.length === 0 ? <div className="v3-state"><Icon name="info" size={20} /><div><b>No game history to chart</b>{vm.why}</div></div> : (
              <>
                {R.tab === 'props' && (
                  <section aria-label="Props">
                    {vm.props.size ? (
                      <ul className="v3-props">{[...vm.props.values()].map((p) => (
                        <li key={p.stat}>
                          <button type="button" className="v3-prop__who" onClick={() => R.set({ stat: p.stat, line: null, tab: null })}><span><b>{vm.stats.find((s) => s.key === p.stat)?.label ?? p.statLabel}</b><small>Over {p.line} · tap to chart it</small></span></button>
                          <button type="button" className="v3-prop__p num" aria-label={`Exact contract for ${p.statLabel} over ${p.line}`} onClick={() => vm.next && sheet.open('Contract', <MarketDetail g={vm.next} line={{ kind: 'total', label: `${vm.name} ${p.statLabel}`, price: p.price, line: p.line, alternates: p.ladder }} />, { tall: true })}>{p.price.ask != null ? `${p.price.ask}¢` : '—'}</button>
                        </li>))}
                      </ul>
                    ) : <div className="v3-state"><Icon name="info" size={20} /><div><b>No props listed for the coming game</b>{vm.next ? 'Kalshi lists no contracts for this player in that game.' : 'There is no coming game on the published slate.'} The chart below still shows the player's history.</div></div>}
                    <button type="button" className="v3-btn v3-btn--ghost" onClick={() => sheet.open(`All props · ${vm.name}`, <AllProps vm={vm} set={R.set} />, { tall: true })}>Browse all stats for {vm.name.split(' ').slice(-1)[0]}<Icon name="chevR" size={18} /></button>
                  </section>
                )}
                {(R.tab === 'overview' || R.tab === 'props') && R.stat && (
                  <>
                    <div className="v3-pills" role="group" aria-label="Stat">
                      {vm.stats.map((s) => <button key={s.key} type="button" className="v3-pill" aria-pressed={R.stat === s.key} onClick={() => { setSel(null); R.set({ stat: s.key, line: null }); }}>{s.short}</button>)}
                    </div>
                    <section className={`v3-panel v3-linecard${price && quoteState(price.observedAt) === 'stale' && price.source === 'Kalshi' ? ' is-stale' : ''}`} aria-label="Selected line">
                      <div><h2>{statDef?.label}</h2><b className="num">{line ?? '—'}</b></div>
                      <div className="v3-linecard__r">
                        {price ? <><span className="v3-linecard__o">Over</span><b className="num">{price.ask}¢</b><small>{Math.round(price.implied ?? price.ask ?? 0)}% implied · {price.source}{price.source === 'Kalshi' ? ` · ${quoteState(price.observedAt) === 'stale' ? 'last known ' : ''}${ago(price.observedAt)}` : ''}</small></> : <small className="v3-linecard__ref">Reference line · no market</small>}
                      </div>
                      <button type="button" className="v3-iconbtn v3-linecard__c" aria-label="Choose a line" onClick={() => sheet.open('Choose a line', <LinesSheet vm={vm} stat={R.stat!} line={line} set={R.set} />, { tall: true })}><Icon name="chevD" size={22} /></button>
                    </section>
                    <div className="v3-wins" role="group" aria-label="Window">
                      {chips.map(({ w, s }) => <button key={w} type="button" className="v3-win" aria-pressed={R.win === w} onClick={() => { setSel(null); R.set({ win: w === 'L10' ? null : w }); }}><span>{WIN_LABEL[w]}</span><b>{w === 'H2H' && !oppCode ? '—' : `${s.over}/${s.n}`}</b></button>)}
                    </div>
                    <div className="v3-fbar">
                      {chipsOf.map((c) => <button key={c} type="button" className="v3-fchip" aria-label={`Remove filter ${c}`} onClick={() => clear(c)}>{c}<Icon name="close" size={14} /></button>)}
                      <button type="button" className="v3-fbtn" onClick={() => sheet.open('Research filters', <FiltersSheet vm={vm} filters={R.filters} set={R.set} />, { tall: true })}><Icon name="sliders" size={18} />Filters{fAct ? ` · ${fAct}` : ''}</button>
                    </div>
                    {win.length === 0 ? (
                      <div className="v3-state"><Icon name="info" size={20} /><div><b>0 games match</b>{R.win === 'H2H' && !oppCode ? 'There is no coming opponent to compare against.' : 'No game fits the window and filters.'}<br />
                        {chipsOf.length > 0 && <button type="button" onClick={() => R.set({ site: null, opp: null, rest: null, script: null, min: null })}>Remove all filters</button>}</div></div>
                    ) : (
                      <>
                        <div className="v3-panel v3-chartbox"><BarChart bars={bars} line={line} sel={sel} onSel={openObs} fmt={(v) => fmt1(v)} label={`${vm.name} ${statDef?.label}, ${win.length} games`} /></div>
                        <div className="v3-sumstrip" aria-live="polite">
                          <div><b className={`num${sum && sum.over / Math.max(1, sum.n) >= 0.5 ? ' is-up' : ''}`}>{sum?.over}/{sum?.n}</b><span>Hit rate</span></div>
                          <div><b className="num">{fmt1(sum?.mean)}</b><span>Average</span></div>
                          <div><b className="num">{fmt1(sum?.median)}</b><span>Median</span></div>
                          <div><b className={`num${(sum?.vsLine ?? 0) >= 0 ? ' is-up' : ' is-down'}`}>{signedN(sum?.vsLine ?? null)}</b><span>vs line</span></div>
                        </div>
                        {sum && smallSample(sum.n) && <p className="v3-note v3-warn">Small sample: {sum.n} game{sum.n === 1 ? '' : 's'}. Treat the rate as a description of those games only.</p>}
                        <p className="v3-note v3-note--dim">Observed games vs {isRef ? 'a reference line (no market)' : 'the current line'}; history, not a forecast. O = over, U = under, P = push. {sum && sum.push ? `${sum.push} push.` : ''} Tap a bar for that game.</p>
                      </>
                    )}
                  </>
                )}
                {R.tab === 'overview' && sum && sum.n >= 5 && (
                  <button type="button" className="v3-lenscard" onClick={() => sheet.open('SIFT Lens', <div className="v3-lens"><span className="v3-lens__tag">Observed history</span><h3 className="v3-lens__h">{vm.name.split(' ').slice(-1)[0]} cleared {line} in {sum.over} of {sum.n} games</h3><p className="v3-lens__p">Over {line} {statDef?.label.toLowerCase()} in {sum.over} of the last {sum.n} games shown; under in {sum.under}{sum.push ? `; ${sum.push} push` : ''}. Average {fmt1(sum.mean)}, median {fmt1(sum.median)}.</p><h4 className="v3-lens__k">Counter-case</h4><p className="v3-note">Past games do not know tonight's opponent, role or game script. The filters let you narrow to comparable games; the sample then shrinks.</p><p className="v3-lens__ctx">History, not a bet signal</p></div>)}>
                    <Icon name="lens" size={40} /><span className="v3-lenscard__t"><b>SIFT Lens</b><span>{vm.name.split(' ').slice(-1)[0]} cleared {line} in {sum.over} of {sum.n} games (observed).</span></span><Icon name="chevR" size={22} className="v3-lenscard__c" />
                  </button>
                )}
                {R.tab === 'overview' && (
                  <button type="button" className="v3-btn v3-btn--ghost" onClick={() => sheet.open(`All props · ${vm.name}`, <AllProps vm={vm} set={R.set} />, { tall: true })}>Browse all props for {vm.name.split(' ').slice(-1)[0]}<Icon name="chevR" size={18} /></button>
                )}
                {R.tab === 'log' && R.stat && (
                  <section aria-label="Game log">
                    <h2 className="v3-h2">Game log · {statDef?.short}</h2>
                    <table className="v3-tbl v3-tbl--log">
                      <thead><tr><th scope="col">Date</th><th scope="col">Opp</th>{vm.hasMinutes && <th scope="col">Min</th>}<th scope="col">{statDef?.short}</th><th scope="col">Result</th></tr></thead>
                      <tbody>
                        {[...win].reverse().map((o) => { const v = o.v[R.stat!]; const r = v != null && line != null ? resultOf(v, line) : null; return (
                          <tr key={o.key}>
                            <td><button type="button" className="v3-tbl__b" onClick={() => openObs(o.key)}>{shortDate(o.date)}</button></td>
                            <td>{o.home === false ? '@' : ''}{o.opp}</td>
                            {vm.hasMinutes && <td>{o.min ?? '—'}</td>}
                            <td><b>{fmt1(v)}</b></td>
                            <td className={r ? `v3-res-${r}` : ''}>{r === 'over' ? 'O' : r === 'under' ? 'U' : r === 'push' ? 'P' : '—'}</td>
                          </tr>); })}
                      </tbody>
                    </table>
                    {win.length === 0 && <div className="v3-state"><Icon name="info" size={20} /><div><b>0 games match</b>Change the window or remove a filter.</div></div>}
                  </section>
                )}
                {R.tab === 'replay' && <Replay vm={vm} stat={R.stat} line={line} openObs={(o) => sheet.open('Game observation', <ObsDetail o={o} vm={vm} stat={R.stat!} line={line} />)} />}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** SIFT Replay: observed comparable games (same venue side, the coming opponent when there is one), kept apart from any adjusted counterfactual. */
function Replay({ vm, stat, line, openObs }: { vm: PlayerVM; stat: string | null; line: number | null; openObs: (o: Obs) => void }) {
  const [mode, setMode] = useState<'similar' | 'h2h'>('similar');
  if (!stat) return null;
  const opp = vm.opp?.id ?? null;
  const similar = vm.nextHome == null ? vm.obs : vm.obs.filter((o) => o.home === vm.nextHome);
  const rows = (mode === 'h2h' ? vm.obs.filter((o) => o.opp === opp) : similar).slice(-20);
  const sum = summarize(rows, stat, line);
  const def = vm.stats.find((s) => s.key === stat);
  return (
    <section aria-label="SIFT Replay">
      <h2 className="v3-h2">SIFT Replay <small className="v3-tag">Beta</small></h2>
      <p className="v3-note">Find comparable games and see how {vm.name.split(' ').slice(-1)[0]} performed. These are observed games, not a model.</p>
      <div className="v3-panel v3-pad">
        <h3 className="v3-h3">Current game context</h3>
        <ul className="v3-ctx">
          <li>{vm.opp ? <>vs {vm.opp.name}</> : 'No coming opponent on the published slate'}</li>
          <li>{vm.nextHome == null ? 'Venue side unknown' : vm.nextHome ? 'At home' : 'On the road'}</li>
          <li>Inclusion: {mode === 'h2h' ? `games against ${opp ?? 'the opponent'}` : `${vm.nextHome == null ? 'all' : vm.nextHome ? 'home' : 'away'} games`}, most recent 20</li>
        </ul>
      </div>
      <div className="v3-seg" role="tablist" aria-label="Replay mode">
        <button type="button" role="tab" aria-selected={mode === 'similar'} onClick={() => setMode('similar')}>Similar games</button>
        <button type="button" role="tab" aria-selected={mode === 'h2h'} onClick={() => setMode('h2h')}>Head-to-head</button>
      </div>
      <h3 className="v3-h2" style={{ fontSize: 18 }}>{rows.length} {mode === 'h2h' ? 'head-to-head' : 'similar'} game{rows.length === 1 ? '' : 's'}</h3>
      {rows.length ? (
        <>
          <div className="v3-sumstrip"><div><b className="num is-up">{sum.over}/{sum.n}</b><span>Hit rate</span></div><div><b className="num">{fmt1(sum.mean)}</b><span>Average</span></div><div><b className="num">{fmt1(sum.median)}</b><span>Median</span></div></div>
          {smallSample(sum.n) && <p className="v3-note v3-warn">Small sample: {sum.n} game{sum.n === 1 ? '' : 's'}.</p>}
          <div className="v3-panel v3-chartbox"><BarChart bars={rows.map((o) => { const v = o.v[stat]; return { key: o.key, v, label: shortDate(o.date), sub: o.opp, result: v != null && line != null ? resultOf(v, line) : null }; })} line={line} sel={null} onSel={(k) => { const o = rows.find((x) => x.key === k); if (o) openObs(o); }} fmt={fmt1} label="Comparable games" /></div>
          <table className="v3-tbl v3-tbl--log"><thead><tr><th scope="col">Date</th><th scope="col">Opp</th><th scope="col">{def?.short}</th><th scope="col">Line</th><th scope="col">Result</th></tr></thead>
            <tbody>{[...rows].reverse().slice(0, 8).map((o) => { const v = o.v[stat]; const r = v != null && line != null ? resultOf(v, line) : null; return <tr key={o.key}><td><button type="button" className="v3-tbl__b" onClick={() => openObs(o)}>{shortDate(o.date)}</button></td><td>{o.home === false ? '@' : ''}{o.opp}</td><td><b>{fmt1(v)}</b></td><td>{line}</td><td className={r ? `v3-res-${r}` : ''}>{r === 'over' ? 'O' : r === 'under' ? 'U' : 'P'}</td></tr>; })}</tbody></table>
        </>
      ) : <div className="v3-state"><Icon name="info" size={20} /><div><b>0 games match</b>No comparable games are in the published log.</div></div>}
      <div className="v3-state v3-state--warn"><Icon name="shield" size={20} /><div><b>Adjusted what-if: not available</b>No validated adjustment model is published for this stat, so SIFT shows no adjusted number and no edge. Observed games above are the only evidence here.</div></div>
      <p className="v3-note v3-note--dim">Comparisons use today's line; historical betting lines are not published.</p>
    </section>
  );
}
