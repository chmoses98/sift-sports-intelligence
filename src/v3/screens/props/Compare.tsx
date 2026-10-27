// PD5: compare up to three props side by side in the same lane order as everywhere: Market, History (with mini bars against the rung),
// SIFT model, the opponent unit on a track, and status. The columns can be different sports; each uses its own units. No column is
// ranked, scored or marked best. Research and Contract sit under every column.
import { useMemo } from 'react';
import { useLocation, useNavigate } from '../../../routing';
import { useHistoryBank } from '../../data/props/bank';
import { hitCount } from '../../data/props/history';
import { historyStateOf, useEnsureAvailability, useEnsureRanks, usePropPrices, useQueryCtx, useVisibleHistory } from '../../data/props/hooks';
import { modelPercent } from '../../data/props/model';
import { parseRef, rungFor, type ListState } from '../../data/props/query';
import { trackPct } from '../../data/props/rank';
import type { Prop, Universe } from '../../data/props/types';
import { routes } from '../../nav/routes';
import { GameLink, PlayerLink, PriceTap, StatLink } from '../../nav/Targets';
import { Icon } from '../../ui/Icon';
import { usePublishContracts } from './contracts';
import { Avatar, lastName, playerRef, playerState, Spark } from './parts';
import { ordinal as ord } from '../../../lib/format';

export function PropsCompare({ st, universe }: { st: ListState; universe: Universe }) {
  const loc = useLocation();
  const nav = useNavigate();
  const bank = useHistoryBank();
  const { ctx, chipOf } = useQueryCtx(universe);
  const cols = useMemo(() => st.cmp.map((t) => { const r = parseRef(t); const p = r ? universe.byId.get(r.id) : undefined; return p ? { p, k: rungFor(p, r!.k).k } : null; }).filter((x): x is { p: Prop; k: number } => !!x), [st.cmp, universe]);
  const colProps = useMemo(() => cols.map((c) => c.p), [cols]);
  useVisibleHistory(colProps);
  useEnsureAvailability(colProps);
  useEnsureRanks(colProps);
  const reader = usePropPrices(useMemo(() => cols.map((c) => c.p), [cols]), null);
  usePublishContracts(cols.map((c) => c.p), bank.get, bank.getVersion());
  const back = () => { if (loc.key !== 'default') nav(-1); else nav(routes.props({ view: 'list', cmp: st.cmp, cmpm: true }), { replace: true }); };
  const grid = { gridTemplateColumns: `58px repeat(${Math.max(cols.length, 1)}, minmax(0, 1fr))` };
  const row = (cap: React.ReactNode, f: (c: { p: Prop; k: number }) => React.ReactNode, cls = '') => (
    <div className={`pd-crow ${cls}`} style={grid}><div className="pd-cap">{cap}</div>{cols.map((c) => <div key={c.p.id + c.k} className={`pd-cell ${cls === 'pd-crow--hd' ? 'pd-cell--hd' : ''}`}>{f(c)}</div>)}</div>
  );
  return (
    <div className="pd pd-compare" data-view="compare">
      <header className="pd-hs">
        <div className="pd-hs__tt">
          <button type="button" className="v3-iconbtn" aria-label="Back" onClick={back}><Icon name="back" size={24} /></button>
          <h1>Compare</h1><span className="pd-hs__cnt">{cols.length}</span>
          <span className="pd-hs__tr"><button type="button" className="pd-btn" onClick={back}>Add prop<Icon name="chevR" size={11} /></button></span>
        </div>
      </header>
      {cols.length === 0 ? (
        <div className="v3-state pd-empty"><Icon name="info" size={20} /><div><b>Nothing to compare yet</b>Tick two or three props in the list, then open Compare.</div></div>
      ) : (
        <div className="pd-cmp">
          {row(null, ({ p, k }) => {
            const ref = playerRef(p);
            const who = <><Avatar p={p} size={36} link={false} k={k} /><b>{lastName(p.name)}</b></>;
            return (
              <>
                {ref ? <PlayerLink player={ref} state={playerState(p, k)} className="pd-colhead" label={`${p.name}, Player Research`}>{who}</PlayerLink> : <span className="pd-colhead">{who}</span>}
                <span className="pd-ab">{p.abbr} {k}+</span>
                <GameLink game={{ slug: p.slug, eventId: p.eventId }}><small>{p.away.abbr} at {p.home.abbr}</small></GameLink>
              </>
            );
          }, 'pd-crow--hd')}
          {row('Market', ({ p, k }) => {
            const r = rungFor(p, k), price = reader.priceOf(p, r);
            return <PriceTap ticker={r.ticker} className="pd-cellbtn" label={`Exact contract, ${p.name} ${p.abbr} ${k}+`}><b className={`num pd-m${price ? '' : ' is-none'}`}>{price?.ask != null ? `${price.ask}%` : '—'}</b><small>{price?.ask != null ? `${price.ask}¢ ask` : 'pre-fee ask'}</small></PriceTap>;
          })}
          {row(<>History<small>last 10</small></>, ({ p, k }) => {
            const hs = historyStateOf(p, bank.get);
            const h = hs.state === 'ready' ? hitCount(hs.values, k) : null;
            const ref = playerRef(p);
            const body = h && hs.state === 'ready' ? <><b className="num pd-hc">{h.h}/{h.n}</b><Spark values={hs.values.slice(-10)} k={k} /></> : <><b className="num pd-hc is-none">{hs.state === 'loading' || hs.state === 'idle' ? '…' : '—'}</b><small>{hs.state === 'loading' || hs.state === 'idle' ? 'loading' : 'no log'}</small></>;
            return ref ? <PlayerLink player={ref} state={playerState(p, k)} className="pd-cellbtn" label={`${p.name} history`}>{body}</PlayerLink> : <span className="pd-cellbtn">{body}</span>;
          })}
          {row('SIFT model', ({ p, k }) => {
            const m = modelPercent(p.model, k);
            return m != null ? <><b className="num pd-z">{m}%</b><small>P({k}+) published</small></> : <><b className="num pd-z is-none">—</b><small>not approved</small></>;
          })}
          {row('Opponent', ({ p }) => {
            const m = ctx.matchup(p);
            if (!m && p.oppUnit && chipOf(p).state === 'loading') return <small role="status">reading the ranking</small>;
            if (!m || !p.oppUnit) return <small>no matchup rows</small>;
            return (
              <StatLink stat={{ slug: p.slug, statId: m.statId }} state={{ win: m.window, sel: m.oppCode, opp: m.selfCode ?? undefined }} className="pd-cellbtn" label={`${m.text}. Open the ranking`}>
                <b className="pd-un">{m.oppCode} {p.oppUnit.short}</b>
                <span className="pd-rk"><b className="num">{ord(m.rank)}</b> of {m.n}</span>
                <span className="pd-mtrk"><i style={{ left: `${trackPct(m.rank, m.n)}%` }} /></span>
              </StatLink>
            );
          })}
          {row('Status', ({ p }) => (p.availPending ? <small role="status">checking availability</small> : p.out ? <span className="pd-stat pd-stat--bad">{p.out}</span> : p.availKnown ? <span className="pd-stat pd-stat--ok"><i />Listed</span> : <small>not published</small>))}
          <div className="pd-crow pd-crow--acts" style={grid}>
            <div className="pd-cap" />
            {cols.map(({ p, k }) => {
              const ref = playerRef(p), r = rungFor(p, k);
              return (
                <div key={p.id + k} className="pd-cell">
                  {ref && <PlayerLink player={ref} state={playerState(p, k)} className="pd-abtn pd-abtn--sm">Research</PlayerLink>}
                  <PriceTap ticker={r.ticker} className="pd-abtn pd-abtn--sm pd-abtn--ghost" label={`Contract, ${p.name} ${p.abbr} ${k}+`}>Contract</PriceTap>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="pd-cnote">“—” means no approved estimate, never a blank to fill. Goals vs = opponent goals allowed per game.</p>
    </div>
  );
}
