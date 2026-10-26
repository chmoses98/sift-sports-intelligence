// P1 and P2: the statistic pills, the decision card (the selected line, the Over price and the three evidence lanes), the chart card (window chips
// with hit counts, the hit bars with the draggable line, the summary strip), the observation card and the alt-line ladder.
import { useNavigate } from '../../../routing';
import { teamLogo } from '../../../lib/teams';
import { Icon } from '../../ui/Icon';
import { useShortScreen } from './Header';
import { Lanes, LaneTrack, LaneMark, type LaneCell } from '../../ui/atoms';
import { HitBars } from '../../ui/charts/HitBars';
import { GameLink, PriceTap } from '../../nav/Targets';
import { routes } from '../../nav/routes';
import { ledgerKey, rungWindow, sameLine, unitWord, type RungView } from '../../model/playerResearch';
import { resultOf } from '../../model/research';
import type { PlayerView } from './view';

export const fmt1 = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(v * 10) / 10));
export const signedN = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 10) / 10)}`);
const pct = (over: number, n: number) => (n ? Math.round((100 * over) / n) : null);
export const shortDate = (d: string) => { const [, m, dd] = d.split('-'); return `${Number(m)}/${Number(dd)}`; };

export function StatPills({ v, onFilters, noFilters }: { v: PlayerView; onFilters: () => void; noFilters?: boolean }) {
  const vm = v.vm!;
  const n = v.filterCount;
  return (
    <div className="v3p-pills">
      <div className="v3p-pills__s" role="group" aria-label="Statistic">
        {vm.stats.map((s) => <button key={s.key} type="button" className="v3p-pill" data-stat={s.key} aria-pressed={v.stat === s.key} onClick={() => v.set({ stat: s.key, line: null, obs: null })}>{s.short}</button>)}
      </div>
      {!noFilters && <button type="button" className={`v3p-pill v3p-pill--f${n ? ' is-on' : ''}`} aria-label={`Research filters${n ? `, ${n} applied` : ''}`} onClick={onFilters}>
        <Icon name="sliders" size={19} />{n > 0 && <b>{n}</b>}
      </button>}
    </div>
  );
}

export function FilterChips({ v }: { v: PlayerView }) {
  if (!v.filterChips.length) return null;
  const clear = (key: string) => v.set(key === 'tier' ? { tier: 'any' } : key === 'minMin' ? { min: null } : key === 'opp' ? { opp: null } : { [key]: 'any' });
  return (
    <div className="v3p-fchips" role="group" aria-label="Applied filters">
      {v.filterChips.map((c) => <button key={c.key} type="button" className="v3p-fchip" aria-label={`Remove filter ${c.label}`} onClick={() => clear(c.key)}>{c.label}<Icon name="close" size={14} /></button>)}
    </div>
  );
}

export function Decision({ v, onLadder, onFilters }: { v: PlayerView; onLadder: () => void; onFilters: () => void }) {
  const vm = v.vm!;
  const k = v.k, line = v.line;
  const where = `${vm.nextHome === false ? 'at' : 'vs'} ${vm.opp?.abbr ?? ''}`.trim();
  const unit = unitWord(v.statDef ? statUnit(v.statDef.key) : null);
  const res = v.res?.kind === 'authoritative' ? v.res.value : null;
  const hasRungs = (v.prop?.rungs.length ?? 0) > 0;
  const h = v.hit;
  const market: LaneCell = {
    lane: 'market', value: v.ask != null ? `${v.ask}%` : null, sub: v.isRef ? 'no market for this line' : `Kalshi ask for ${k}+`,
    wrap: v.ticker ? (cell) => <PriceTap ticker={v.ticker!} label={`Exact contract for over ${line}`} className="v3p-lane">{cell}</PriceTap> : undefined,
  };
  const history: LaneCell = {
    lane: 'history', value: h.n ? `${pct(h.over, h.n)}%` : null, sub: h.n ? `${h.over} of ${h.n} · observed` : 'no games shown',
    wrap: (cell) => <button type="button" className="v3p-lane" onClick={onFilters} aria-label="Observed history: cut the games with filters">{cell}</button>,
  };
  const sift: LaneCell = {
    lane: 'sift', value: v.sift.p != null ? `${Math.round(v.sift.p * 100)}%` : null,
    sub: v.sift.p != null ? `P(${k}+)${res?.p10 != null && res.p90 != null ? ` · range ${res.p10}–${res.p90}` : ''}` : v.sift.reason,
    wrap: (cell) => <button type="button" className="v3p-lane" data-ledger={(v.stat && ledgerKey(vm.sport, v.stat)) || undefined} data-lane={v.sift.p != null ? 'value' : 'withheld'} onClick={() => v.set({ tab: 'matchup' })} aria-label="SIFT model: how the projection builds">{cell}</button>,
  };
  return (
    <section className="v3p-decide v3p-card" aria-label="Selected line">
      <div className="v3p-dl">
        <button type="button" className="v3p-dl__l" onClick={hasRungs ? onLadder : undefined} disabled={!hasRungs}>
          <span className="k">{v.statDef?.label} · Over</span>
          <span className="v num">{line ?? '—'}<small>{k != null ? `${k}+ ${unit}`.trim() : ''}{where ? ` · ${where}` : ''}</small></span>
        </button>
        {v.ticker && !v.isRef ? (
          <PriceTap ticker={v.ticker} label={`Exact contract for over ${line}`} className="v3p-dl__r">
            <span className="p num">Over {v.ask != null ? `${v.ask}¢` : '—'}</span><span className="s">{v.ask != null ? `${v.ask}% implied · pre-fee` : 'pre-fee'}</span>
          </PriceTap>
        ) : (
          <div className="v3p-dl__r is-ref"><span className="p num">—</span><span className="s">reference line · no market</span></div>
        )}
        {hasRungs && <button type="button" className="v3p-dl__cv" aria-label="Alt lines" onClick={onLadder}><Icon name="chevD" size={20} /></button>}
      </div>
      <Lanes cells={[market, history, sift]} />
      <p className="v3p-foot">Pre-fee market implied · observed frequency · {v.sift.p != null ? 'approved model estimate' : `no approved model estimate (${v.sift.reason})`}</p>
    </section>
  );
}

/** The unit key of a statistic (the log's own unit), for "7+ catches". */
const UNIT: Record<string, string> = { receptions: 'rec', receiving_yards: 'yds', rushing_yards: 'yds', passing_yards: 'yds', targets: 'tgt', carries: 'car', attempts: 'att', completions: 'cmp', longest_reception: 'yds', longest_rush: 'yds', rush_rec_yards: 'yds', touchdowns: 'TD', passing_tds: 'TD', interceptions: 'INT' };
const statUnit = (key: string): string | null => UNIT[key] ?? null;

/** The window chips with their hit counts at the line (L5, L10, this season, vs the coming opponent, all). */
export function WindowChips({ v }: { v: PlayerView }) {
  return (
    <div className="v3p-wins" role="group" aria-label="Window">
      {v.chips.map((c) => <button key={c.win} type="button" data-win={c.win} aria-pressed={v.win === c.win} onClick={() => v.set({ win: c.win, obs: null })}><span>{c.label}</span><b>{c.n ? `${c.over}/${c.n}` : '—'}</b></button>)}
    </div>
  );
}

export function ChartCard({ v, onLadder }: { v: PlayerView; onLadder: () => void }) {
  const vm = v.vm!;
  const nav = useNavigate();
  const stat = v.stat!;
  const games = v.cut.games;
  const sel = v.state.obs && games.some((g) => g.key === v.state.obs) ? v.state.obs : null;
  const scrubbing = v.drag.on;
  const cur = v.current;
  const next = vm.next;
  const toGame = next ? routes.game({ slug: next.slug, eventId: next.eventId }) : null;
  const tonight = next && vm.opp ? {
    label: vm.nextWeek != null ? `W${vm.nextWeek}` : vm.nextStartMs != null ? shortDate(new Date(vm.nextStartMs).toISOString().slice(0, 10)) : '',
    logo: teamLogo(vm.sport, vm.opp.abbr), model: v.tonightModel, to: toGame, onOpen: () => { if (toGame) nav(toGame); },
  } : null;
  const rungLines = (v.prop?.rungs ?? []).map((r) => r.line);
  const tiersWait = v.filters.tier != null && v.tiers.loading;
  const short = useShortScreen();
  return (
    <section className="v3p-chartc v3p-card" aria-label={`${v.statDef?.label} history`}>
      <div className="v3p-top">
        {scrubbing && cur ? (
          <div className="v3p-readout" role="status" aria-live="polite">
            <span className="rk">{cur.label} <small>over {cur.line}</small></span>
            <span className="m"><b><LaneMark lane="market" />{cur.ask != null ? `${cur.ask}¢` : '—'}</b><small>Market</small></span>
            <span className="h"><b><LaneMark lane="history" />{cur.n ? `${cur.over}/${cur.n}` : '—'}</b><small>History</small></span>
            <span className="z"><b><LaneMark lane="sift" />{cur.sift.p != null ? `${Math.round(cur.sift.p * 100)}%` : '—'}</b><small>SIFT model</small></span>
          </div>
        ) : (
          <WindowChips v={v} />
        )}
      </div>
      {tiersWait ? (
        <div className="v3p-empty" role="status"><b>Loading opponent ranks</b>The Top-10 and Bottom-10 tiers use each opponent’s current season rank.</div>
      ) : games.length === 0 ? (
        <div className="v3p-empty" role="status">
          <b>0 games match</b>
          {v.win === 'H2H' && !vm.opp ? 'There is no coming opponent to compare against.' : v.filters.tier && !v.tiers.tierOf ? v.tiers.why ?? 'The opponent tiers are not available.' : 'No game fits the window and filters.'}
          {v.filterCount > 0 && <button type="button" className="v3p-link" onClick={() => v.set({ site: 'any', opp: null, tier: 'any', rest: 'any', script: 'any', role: 'any', min: null, obs: null })}>Remove all filters</button>}
        </div>
      ) : (
        <>
          <HitBars
            games={games} stat={stat} line={v.line} rungs={rungLines} tonight={tonight} selKey={sel} height={short ? 130 : 160} scrubbing={scrubbing}
            onSelect={(key) => v.set({ obs: sel === key ? null : key })} onScrub={v.drag.setOn} onLine={v.drag.onLine}
            logoOf={(code) => teamLogo(vm.sport, code)} fmt={(n) => String(n)} label={`${vm.name} ${v.statDef?.label}, ${games.length} games`}
          />
          <div className="v3p-sum" aria-live="polite">
            <div><b className={`num ${v.hit.n && v.hit.over * 2 >= v.hit.n ? 'pos' : 'neg'}`}>{v.hit.n ? `${v.hit.over}/${v.hit.n}` : '—'}</b><span>Hit rate</span></div>
            <div><b className="num">{fmt1(v.summary.mean)}</b><span>Average</span></div>
            <div><b className="num">{fmt1(v.summary.median)}</b><span>Median</span></div>
            <div><b className={`num ${(v.summary.vsLine ?? 0) >= 0 ? 'pos' : 'neg'}`}>{signedN(v.summary.vsLine)}</b><span>vs line</span></div>
          </div>
          {v.hit.n > 0 && v.hit.n < 8 && <p className="v3p-warn">Small sample: {v.hit.n} game{v.hit.n === 1 ? '' : 's'}. Read the rate as a description of those games only.</p>}
          {rungLines.length > 1 && <p className="v3p-hint">Drag the line · it snaps to the Kalshi rungs · bars recolour and every number updates. <button type="button" className="v3p-link" onClick={onLadder}>Alt lines</button></p>}
        </>
      )}
    </section>
  );
}

export function ObsCard({ v }: { v: PlayerView }) {
  const vm = v.vm!;
  const o = v.state.obs ? v.cut.games.find((g) => g.key === v.state.obs) ?? null : null;
  if (!o || !v.stat) return null;
  const val = o.v[v.stat];
  const r = val != null && v.line != null ? resultOf(val, v.line) : null;
  const eventId = v.eventIdOf(o);
  return (
    <section className="v3p-obs v3p-card" aria-label="Selected game">
      <div className="bh"><b>{o.week != null ? `Week ${o.week}` : shortDate(o.date)} · {o.home === false ? 'at' : 'vs'} {o.opp}</b><span>{shortDate(o.date)}</span></div>
      <div className="row">
        <div><b className="num">{fmt1(val)}</b> <small>{v.statDef?.label.toLowerCase()}{r ? ` · ${r === 'over' ? 'cleared' : r === 'under' ? 'missed' : 'pushed'} the line` : ''}{o.margin != null ? ` · ${o.margin > 0 ? `won by ${o.margin}` : o.margin < 0 ? `lost by ${-o.margin}` : 'tied'}` : ''}</small></div>
        {eventId ? <GameLink game={{ slug: vm.team?.slug ?? v.slug, eventId }} label={`Game Detail for ${o.label}`} className="v3p-btn is-pri">Game Detail</GameLink> : <span className="v3p-obs__no">No game page for this game</span>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ the alt-line ladder

export function LadderRows({ v, rows, onPick }: { v: PlayerView; rows: RungView[]; onPick?: (r: RungView) => void }) {
  return (
    <div className="v3p-lad" role="group" aria-label="Alt lines">
      <div className="v3p-lad__axis" aria-hidden="true"><span>0</span><span>50%</span><span>100</span></div>
      {rows.map((r) => {
        const on = sameLine(r.line, v.line);
        return (
          <button key={r.ticker} type="button" className="v3p-lr" data-rung={r.k} aria-pressed={on} onClick={() => (onPick ? onPick(r) : v.set({ line: r.line, obs: null }))} aria-label={`${r.label}: Market ${r.ask != null ? `${r.ask} cents` : 'no price'}, History ${r.over} of ${r.n}, SIFT model ${r.sift.p != null ? `${Math.round(r.sift.p * 100)} percent` : r.sift.reason}`}>
            <span className="rk num">{r.label}</span>
            <LaneTrack market={r.ask} history={r.history} sift={r.sift.p != null ? Math.round(r.sift.p * 100) : null} />
            <span className="vals">
              <b className="m">{r.ask != null ? `${r.ask}¢` : '—'}</b>
              <b className="h">{r.n ? `${r.over}/${r.n}` : '—'}</b>
              <b className="z">{r.sift.p != null ? `${Math.round(r.sift.p * 100)}%` : '—'}</b>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ladderFoot(v: PlayerView): string {
  const res = v.res;
  if (res?.kind === 'authoritative') {
    const ks = res.value.thresholds.map((t) => t.k);
    const run = ks.length > 4 && ks.every((x, i) => i === 0 || x === ks[i - 1] + 1);
    const list = run ? `every rung from ${ks[0]}+ to ${ks[ks.length - 1]}+` : ks.length <= 1 ? `${ks[0]}+` : `${ks.slice(0, -1).map((x) => `${x}+`).join(', ')} and ${ks[ks.length - 1]}+`;
    return `Kalshi ask is pre-fee. The SIFT model publishes P(≥n) at ${list}${run ? '' : ' only'}; any other rung stays “—”. Lanes are never subtracted into an “edge”.`;
  }
  return 'Kalshi ask is pre-fee. The SIFT model has no approved estimate for this statistic, so its lane stays “—” on every rung. Lanes are never subtracted into an “edge”.';
}

export function Legend() {
  return <span className="v3p-legend"><span className="m"><LaneMark lane="market" />Market</span><span className="h"><LaneMark lane="history" />History</span><span className="z"><LaneMark lane="sift" />SIFT model</span></span>;
}

export function LadderCard({ v, onAll }: { v: PlayerView; onAll: () => void }) {
  if (!v.rungs.length) return null;
  const rows = rungWindow(v.rungs, v.line);
  return (
    <section className="v3p-ladder v3p-card" aria-label="Alt lines">
      <div className="v3p-ladder__h"><h2>Alt lines</h2><Legend /></div>
      <LadderRows v={v} rows={rows} />
      {rows.length < v.rungs.length && <button type="button" className="v3p-link v3p-ladder__all" onClick={onAll}>All {v.rungs.length} lines</button>}
      <p className="v3p-foot">{ladderFoot(v)}</p>
    </section>
  );
}
