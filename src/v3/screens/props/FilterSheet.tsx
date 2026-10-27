// PD4: sort and filter the whole universe. A DRAFT is edited here with a live count ("35 props match, NFL 5 · NHL 30"); "Show N props"
// applies it to the list's address in one change (replace, so Back leaves the list). Facets that need data SIFT does not publish are
// visibly locked under "Needs more data" with the reason and do nothing.
import { useMemo, useState } from 'react';
import { usePropUniverse, useQueryCtx } from '../../data/props/hooks';
import { countBySport, hiddenOut, keyAsk, parseRange, SORT_KEYS, SORT_LABEL, sortOf, type ListState, type SortKey } from '../../data/props/query';
import { ChipRail } from '../../ui/ChipRail';
import { Icon } from '../../ui/Icon';
import { useSheet } from '../../ui/Sheet';

export type Draft = Pick<ListState, 'sort' | 'sport' | 'fam' | 'range' | 'hmin' | 'hwin' | 'orank' | 'model' | 'hide'>;

export const draftOf = (st: ListState): Draft => ({ sort: st.sort, sport: st.sport, fam: st.fam, range: st.range, hmin: st.hmin, hwin: st.hwin, orank: st.orank, model: st.model, hide: st.hide });
export const RESET: Draft = { sort: null, sport: 'all', fam: null, range: null, hmin: null, hwin: 'L10', orank: null, model: false, hide: true };

const LO = 1, HI = 99;

function Toggle({ on, onChange, title, sub }: { on: boolean; onChange: (v: boolean) => void; title: string; sub: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="pd-tog" onClick={() => onChange(!on)}>
      <span>{title}<small>{sub}</small></span><i className={`pd-tgl${on ? ' is-on' : ''}`} aria-hidden="true" />
    </button>
  );
}

export function FilterSheet({ initial, set }: { initial: ListState; set: (patch: Partial<ListState>) => void }) {
  const sheet = useSheet();
  const { universe } = usePropUniverse();
  const { ctx } = useQueryCtx(universe);
  const [d, setD] = useState<Draft>(draftOf(initial));
  const [allFams, setAllFams] = useState(false);
  const props = useMemo(() => universe?.props ?? [], [universe]);
  const draftState = useMemo(() => ({ ...initial, ...d }), [initial, d]);
  const live = useMemo(() => countBySport(props, draftState, ctx), [props, draftState, ctx]);
  const fams = useMemo(() => {
    const m = new Map<string, { fam: string; label: string; n: number }>();
    for (const p of props) { const f = m.get(p.fam) ?? { fam: p.fam, label: p.label, n: 0 }; f.n++; m.set(p.fam, f); }
    return [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [props]);
  const buckets = useMemo(() => {
    const b = Array.from({ length: 10 }, () => 0);
    for (const p of props) { const a = keyAsk(p); if (a != null) b[Math.min(9, Math.floor(a / 10))]++; }
    return b;
  }, [props]);
  const mx = Math.max(1, ...buckets);
  const [lo, hi] = parseRange(d.range) ?? [LO, HI];
  const setRange = (a: number, b: number) => setD({ ...d, range: a <= LO && b >= HI ? null : `${a}-${b}` });
  const win = d.hwin === 'L5' ? 5 : 10;
  const hmin = Math.min(d.hmin ?? 0, win);
  const sortNow: SortKey = sortOf(d);
  const nHist = props.filter((p) => p.history && p.histId).length;
  const loaded = props.filter((p) => ctx.values(p)).length;
  const publishedN = props.filter((p) => p.model.state === 'published').length;
  const apply = () => { set({ ...d, hmin: hmin > 0 ? hmin : null, view: 'list', more: null }); sheet.close(); };

  return (
    <div className="pd-fs">
      <div className="pd-fs__top"><button type="button" className="pd-fs__reset" onClick={() => setD(RESET)}>Reset</button></div>
      <div className="pd-fs__live" aria-live="polite">
        <div><b>{live.total} props match</b><small>{live.bySport.map((s) => `${s.label} ${s.n}`).join(' · ') || 'No props today'}</small></div>
        <div className="pd-spl" aria-hidden="true">{live.bySport.map((s) => <i key={s.slug} style={{ flex: Math.max(s.n, 1) }} />)}</div>
      </div>

      <fieldset className="pd-fg"><legend>Sort by</legend>
        <ChipRail className="pd-fc pd-fc--row pd-fc--sort">{SORT_KEYS.map((k) => <button key={k} type="button" aria-pressed={sortNow === k} onClick={() => setD({ ...d, sort: k === 'soon' ? null : k })}>{SORT_LABEL[k]}</button>)}</ChipRail>
        {sortNow === 'model' && <p className="x-note">Sorts by SIFT’s own published probability only. There is no model-versus-market sort.</p>}
      </fieldset>

      <fieldset className="pd-fg"><legend>Sport and stat</legend>
        <div className="pd-fc">
          <button type="button" aria-pressed={d.sport === 'all' && !d.fam} onClick={() => setD({ ...d, sport: 'all', fam: null })}>All sports</button>
          {(universe?.sports ?? []).map((s) => <button key={s.slug} type="button" aria-pressed={d.sport === s.slug} onClick={() => setD({ ...d, sport: d.sport === s.slug ? 'all' : s.slug })}>{s.label}<em>{s.count}</em></button>)}
          {(allFams ? fams : fams.slice(0, 4)).map((f) => <button key={f.fam} type="button" aria-pressed={d.fam === f.fam} onClick={() => setD({ ...d, fam: d.fam === f.fam ? null : f.fam })}>{f.label}<em>{f.n}</em></button>)}
          {fams.length > 4 && !allFams && <button type="button" onClick={() => setAllFams(true)}>+ {fams.length - 4} more</button>}
        </div>
      </fieldset>

      <fieldset className="pd-fg"><legend>Price of the rung<b className="num">{d.range ? `${lo}¢ to ${hi}¢` : 'Any price'}</b></legend>
        <div className="pd-hist" aria-hidden="true">{buckets.map((c, i) => <i key={i} className={i * 10 + 9 >= lo && i * 10 <= hi ? 'in' : ''} style={{ height: `${4 + (26 * c) / mx}px` }} />)}</div>
        <div className="pd-rng">
          <div className="pd-rng__track" /><div className="pd-rng__on" style={{ left: `${((lo - LO) / (HI - LO)) * 100}%`, right: `${100 - ((hi - LO) / (HI - LO)) * 100}%` }} />
          <input type="range" min={LO} max={HI} value={lo} aria-label="Lowest price in cents" onChange={(e) => setRange(Math.min(Number(e.target.value), hi), hi)} />
          <input type="range" min={LO} max={HI} value={hi} aria-label="Highest price in cents" onChange={(e) => setRange(lo, Math.max(Number(e.target.value), lo))} />
        </div>
        <p className="x-note">The captured price of each prop’s featured rung, so the list does not shuffle as quotes tick.</p>
      </fieldset>

      <fieldset className="pd-fg"><legend>History at that rung</legend>
        <div className="pd-step">
          <button type="button" aria-label="Fewer games" disabled={hmin <= 0} onClick={() => setD({ ...d, hmin: Math.max(0, hmin - 1) || null })}><Icon name="back" size={16} /></button>
          <span className="pd-step__v">{hmin > 0 ? <><b className="num">{hmin} of {win}</b> or better</> : <b>Any history</b>}</span>
          <button type="button" aria-label="More games" disabled={hmin >= win} onClick={() => setD({ ...d, hmin: hmin + 1 })}><Icon name="chevR" size={16} /></button>
          <div className="pd-seg" role="group" aria-label="History window">
            {(['L10', 'L5'] as const).map((w) => <button key={w} type="button" aria-pressed={d.hwin === w} onClick={() => setD({ ...d, hwin: w, hmin: d.hmin == null ? null : Math.min(d.hmin, w === 'L5' ? 5 : 10) })}>{w}</button>)}
          </div>
        </div>
        {hmin > 0 && <p className="x-note">Counted from each player’s last games, for the {loaded} of {nHist} props whose game log is loaded now. The list loads the rest when this is applied.</p>}
      </fieldset>

      <fieldset className="pd-fg"><legend>Opponent unit rank</legend>
        <div className="pd-seg pd-seg--fill" role="group" aria-label="Opponent unit rank">
          {([[null, 'Any'], ['bottom10', 'Bottom 10'], ['top10', 'Top 10']] as const).map(([k, l]) => <button key={String(k)} type="button" aria-pressed={d.orank === k} onClick={() => setD({ ...d, orank: k })}>{l}</button>)}
        </div>
      </fieldset>

      <fieldset className="pd-fg"><legend>SIFT model and availability</legend>
        <Toggle on={d.model} onChange={(v) => setD({ ...d, model: v })} title="SIFT model published only" sub={`${publishedN} props today`} />
        <Toggle on={d.hide} onChange={(v) => setD({ ...d, hide: v })} title="Hide out and doubtful" sub={`${hiddenOut(props)} props hidden`} />
        {universe && universe.availabilityGaps > 0 && <p className="x-note">Availability is not published for {universe.availabilityGaps} game{universe.availabilityGaps === 1 ? '' : 's'}, so nobody is hidden there.</p>}
      </fieldset>

      <fieldset className="pd-fg pd-locked"><legend className="pd-fl"><Icon name="lock" size={13} /> Needs more data</legend>
        <div className="pd-fc">
          <span role="note"><b>Price move since open</b><em>no prop price history</em></span>
          <span role="note"><b>Teammate out</b><em>needs data</em></span>
          <span role="note"><b>Position-level defense</b><em>not published</em></span>
        </div>
      </fieldset>

      <div className="pd-apply"><button type="button" onClick={apply}>Show {live.total} props</button></div>
    </div>
  );
}
