// P3: the research-filters sheet. Every option shows its sample size and hit rate BEFORE it is applied (so a thin split is obvious), the live card
// shows which games of the window remain, and the filters that need data SIFT does not publish are visibly locked rows with the reason, never
// working controls. The sheet edits a draft; "Show N games" writes it to the address (the screen underneath), closing the sheet dismisses it.
import { useMemo, useState } from 'react';
import { useTierRanks } from '../../data/useOppUnits';
import { Icon } from '../../ui/Icon';
import { Seg } from '../../ui/atoms';
import { useSheetHeaderAction } from '../../ui/Sheet';
import { facets, LOCKED_FILTERS, matchSummary, type FacetGroup, type FacetOption } from '../../model/playerResearch';
import { NO_FILTERS, sliceWindow, type Filters, type Window } from '../../model/research';
import { filterPatch, type PlayerView } from './view';
import { useSharedView } from './shared';

const TIME: [Window, string][] = [['L5', 'L5'], ['L10', 'L10']];

const GROUP_KEYS: Record<FacetGroup['id'], (keyof Filters)[]> = { site: ['site'], opponent: ['opp', 'tier'], role: ['role', 'minMin'], script: ['script'], rest: ['rest'] };

function Option({ o, onPick }: { o: FacetOption; onPick: () => void }) {
  const sub = o.locked ? o.locked : o.n ? `n ${o.n} · ${o.over}/${o.n}` : `n 0 · —`;
  const body = <><b>{o.label}</b><em>{sub}</em>{!o.locked && <i className="fb"><u style={{ width: `${o.n ? Math.round((100 * o.over) / o.n) : 0}%` }} /></i>}</>;
  // A locked option is a note, not a control.
  if (o.locked) return <div className="v3p-fc is-locked" role="note" aria-label={`${o.label}: ${o.locked}`}>{body}</div>;
  return <button type="button" className="v3p-fc" aria-pressed={o.selected} onClick={onPick}>{body}</button>;
}

export function FiltersSheet() {
  const v = useSharedView();
  if (!v || !v.vm || !v.stat) return null;
  return <Body v={v} />;
}

function Body({ v }: { v: PlayerView }) {
  const vm = v.vm!;
  const stat = v.stat!;
  const [win, setWin] = useState<Window>(v.win === 'H2H' ? 'ALL' : v.win);
  const [f, setF] = useState<Filters>(v.filters);
  const tiers = useTierRanks(v.slug, vm.sport, stat, true);
  const ctx = useMemo(() => ({ opp: vm.opp?.abbr ?? null, season: vm.season, tierOf: tiers.tierOf ?? undefined }), [vm.opp, vm.season, tiers.tierOf]);
  const pool = useMemo(() => sliceWindow(vm.obs, win, ctx.opp, ctx.season), [vm.obs, win, ctx]);
  const groups = useMemo(() => facets(pool, f, { ...ctx, stat, line: v.line, tiers: !!tiers.tierOf, tiersWhy: tiers.loading ? 'Loading opponent ranks.' : tiers.why, sport: vm.sport, hasMinutes: vm.hasMinutes }), [pool, f, ctx, stat, v.line, tiers, vm.sport, vm.hasMinutes]);
  const m = useMemo(() => matchSummary(pool, f, stat, v.line, ctx), [pool, f, stat, v.line, ctx]);
  const pick = (g: FacetGroup, o: FacetOption) => setF((cur) => {
    const clear = Object.fromEntries(GROUP_KEYS[g.id].map((k) => [k, null])) as Partial<Filters>;
    return { ...cur, ...clear, ...(o.selected && g.id !== 'site' ? {} : o.patch) };
  });
  const apply = () => v.set({ win, ...filterPatch(f), obs: null });
  const reset = () => { setWin('L10'); setF(NO_FILTERS); };
  // "Reset" lives on the sheet's title row (P3); it is inert (aria-disabled) while the draft is already the default.
  const dirty = win !== 'L10' || (Object.keys(NO_FILTERS) as (keyof Filters)[]).some((k) => f[k] !== NO_FILTERS[k]);
  useSheetHeaderAction({ label: 'Reset', onClick: reset, disabled: !dirty });
  const timeOpts: [Window, string][] = [...TIME, ['SEASON', vm.season ?? 'Season'], ['ALL', `All ${vm.obs.length}`]];
  return (
    <div className="v3p-fs">
      <div className="v3p-live" role="status" aria-live="polite">
        <div><b className="num">{m.matched} {m.matched === 1 ? 'game matches' : 'games match'}</b><span>{m.hit.n ? `Hit ${m.hit.over}/${m.hit.n} at ${v.k}+` : `No games at ${v.k}+`}{m.mean != null ? ` · avg ${Math.round(m.mean * 10) / 10}` : ''}</span></div>
        <div className="sq" style={{ gridTemplateColumns: `repeat(${Math.min(10, Math.max(1, m.squares.length))}, 1fr)` }} aria-hidden="true">{m.squares.map((s, i) => <i key={i} className={s.hit == null ? 'x' : s.hit ? 'h' : 'u'} />)}</div>
      </div>
      <div className="v3p-fl"><span>Time range</span></div>
      <Seg options={timeOpts} value={win} onChange={(w) => setWin(w)} label="Time range" hit />
      {groups.map((g) => (
        <section key={g.id} className="v3p-fg" aria-label={g.label}>
          <div className="v3p-fl"><span>{g.label}</span></div>
          <div className={`v3p-frow n${Math.min(g.options.length, 4)}`}>{g.options.map((o) => <Option key={o.key} o={o} onPick={() => pick(g, o)} />)}</div>
          {g.note && <p className="v3p-fnote">{g.note}</p>}
        </section>
      ))}
      <section className="v3p-fg is-locked" aria-label="Needs more data">
        <div className="v3p-fl"><span><Icon name="lock" size={13} /> Needs more data</span></div>
        <div className="v3p-frow n3">{LOCKED_FILTERS.map((l) => <div key={l.label} className="v3p-fc is-locked" role="note" aria-label={`${l.label}: ${l.reason}`}><b>{l.label}</b><em>needs data</em></div>)}</div>
        <p className="v3p-fnote">{LOCKED_FILTERS.map((l) => l.reason).join(' ')}</p>
      </section>
      <div className="v3p-apply"><button type="button" className="v3p-btn is-pri" onClick={apply}>Show {m.matched} {m.matched === 1 ? 'game' : 'games'}</button></div>
    </div>
  );
}
