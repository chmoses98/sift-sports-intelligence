// The Trends tab (design inferred: the locked mockups name the tab but draw no state for it, so it is built from the same atoms as the rest of the
// screen, and nothing on it is a number the other tabs could not show). (1) Windows: hit count, average, median and distance from the line for
// L5, L10, the season, the coming opponent and every game. (2) Splits: the same cuts the research-filters sheet offers (site, opponent tier, role,
// game script, rest) shown side by side with sample sizes, read from the window's games; a row applies that cut on the chart. (3) SIFT Replay,
// the deeper research destination: comparable observed games, kept apart from any adjusted what-if (`view=replay`).
// Everything here is observed history. Nothing is a prediction, a recommendation or a value signal.
import { useMemo } from 'react';
import { teamLogo } from '../../../lib/teams';
import { useTierRanks } from '../../data/useOppUnits';
import { Icon } from '../../ui/Icon';
import { HitBars } from '../../ui/charts/HitBars';
import { LockedRow, Seg } from '../../ui/atoms';
import { facets, replayGames, windowTable, type FacetOption } from '../../model/playerResearch';
import { NO_FILTERS, smallSample, summarize, sliceWindow } from '../../model/research';
import { fmt1, FilterChips, signedN, StatPills } from './Overview';
import { GameRows } from './LogTab';
import { filterPatch, type PlayerView } from './view';

export function TrendsTab({ v, onFilters }: { v: PlayerView; onFilters: () => void }) {
  if (v.state.view === 'replay') return <ReplayView v={v} />;
  return (
    <>
      <StatPills v={v} onFilters={onFilters} />
      <FilterChips v={v} />
      <WindowsCard v={v} />
      <SplitsCard v={v} />
      <button type="button" className="v3p-replaylink v3p-card" onClick={() => v.set({ view: 'replay', obs: null })} aria-label="Open SIFT Replay: comparable games">
        <span><b>SIFT Replay</b><small>Comparable games: same venue side, or head-to-head with {v.vm?.opp?.abbr ?? 'the opponent'}</small></span>
        <Icon name="chevR" size={18} />
      </button>
    </>
  );
}

function WindowsCard({ v }: { v: PlayerView }) {
  const vm = v.vm!;
  const rows = useMemo(() => (v.stat ? windowTable(vm.obs, v.filters, v.stat, v.line, v.cutCtx) : []), [vm.obs, v.filters, v.stat, v.line, v.cutCtx]);
  return (
    <section className="v3p-sec v3p-card" aria-label="Windows">
      <div className="v3p-sh"><h2>{v.statDef?.label} by window</h2><span className="v3p-note">line {v.line ?? '—'}</span></div>
      <div className="v3p-tt" role="table" aria-label="Windows">
        <div className="v3p-tt__h" role="row"><span role="columnheader">Window</span><span role="columnheader">Hit</span><span role="columnheader">Avg</span><span role="columnheader">Median</span><span role="columnheader">vs line</span></div>
        {rows.map((r) => (
          <button key={r.win} type="button" role="row" className="v3p-tt__r" data-win={r.win} aria-pressed={v.win === r.win} onClick={() => v.set({ tab: 'overview', win: r.win, obs: null })} aria-label={`${r.label}: ${r.n ? `${r.over} of ${r.n}` : 'no games'}. Show on the chart`}>
            <b role="cell">{r.label}</b><span role="cell" className="num">{r.n ? `${r.over}/${r.n}` : '—'}</span><span role="cell" className="num">{fmt1(r.mean)}</span><span role="cell" className="num">{fmt1(r.median)}</span><span role="cell" className="num">{signedN(r.vsLine)}</span>
          </button>
        ))}
      </div>
      <p className="v3p-foot">Observed games only, with the filters above applied inside each window. A tap shows that window on the chart.</p>
    </section>
  );
}

function SplitsCard({ v }: { v: PlayerView }) {
  const vm = v.vm!;
  const stat = v.stat!;
  const tiers = useTierRanks(v.slug, vm.sport, stat, true);
  const pool = useMemo(() => sliceWindow(vm.obs, v.win, v.cutCtx.opp, v.cutCtx.season), [vm.obs, v.win, v.cutCtx]);
  const groups = useMemo(
    () => facets(pool, NO_FILTERS, { ...v.cutCtx, tierOf: tiers.tierOf ?? undefined, stat, line: v.line, tiers: !!tiers.tierOf, tiersWhy: tiers.loading ? 'Loading opponent ranks.' : tiers.why, sport: vm.sport, hasMinutes: vm.hasMinutes }),
    [pool, v.cutCtx, tiers, stat, v.line, vm.sport, vm.hasMinutes],
  );
  const apply = (o: FacetOption) => v.set({ tab: 'overview', obs: null, ...filterPatch({ ...NO_FILTERS, ...o.patch }) });
  return (
    <section className="v3p-sec v3p-card" aria-label="Splits">
      <div className="v3p-sh"><h2>Splits</h2><span className="v3p-note">{pool.length} games in the window</span></div>
      {groups.map((g) => (
        <div key={g.id} className="v3p-sp3">
          <span className="v3p-eb">{g.label}</span>
          {g.options.filter((o) => o.key !== 'any').map((o) => o.locked ? (
            <div key={o.key} className="v3p-spr is-locked" role="note" aria-label={`${o.label}: ${o.locked}`}><b>{o.label}</b><span>{o.locked}</span></div>
          ) : (
            <button key={o.key} type="button" className="v3p-spr" data-split={`${g.id}:${o.key}`} onClick={() => apply(o)} aria-label={`${o.label}: ${o.n ? `${o.over} of ${o.n}` : 'no games'}. Show on the chart`}>
              <b>{o.label}</b><span className="num">{o.n ? `${o.over}/${o.n}` : '—'}</span><span className="num">{o.mean != null ? fmt1(o.mean) : '—'}</span><small>n {o.n}</small>
            </button>
          ))}
        </div>
      ))}
      <p className="v3p-foot">Hit count at the line, then the average. Each cut can be thin: read n first. Opponent tiers use each team’s current season rank.</p>
    </section>
  );
}

/** SIFT Replay: observed comparable games (the same venue side, or head-to-head), apart from any adjusted counterfactual. */
function ReplayView({ v }: { v: PlayerView }) {
  const vm = v.vm!;
  const stat = v.stat!;
  const mode = v.state.rmode;
  const opp = vm.opp?.abbr ?? null;
  const rows = useMemo(() => replayGames(vm.obs, mode, vm.nextHome, opp), [vm.obs, mode, vm.nextHome, opp]);
  const sum = summarize(rows, stat, v.line);
  const rule = mode === 'h2h' ? `games against ${opp ?? 'the coming opponent'}` : `${vm.nextHome == null ? 'all' : vm.nextHome ? 'home' : 'away'} games`;
  return (
    <>
      <button type="button" className="v3p-back" onClick={() => v.set({ view: 'main', obs: null })} aria-label="Back to Trends"><Icon name="back" size={18} />Trends</button>
      <StatPills v={v} onFilters={() => undefined} noFilters />
      <section className="v3p-sec v3p-card" aria-label="SIFT Replay">
        <div className="v3p-sh"><h2>SIFT Replay</h2><span className="v3p-chip is-cy">observed games</span></div>
        <p className="v3p-note">Comparable games and how {vm.name.split(' ').slice(-1)[0]} did in them. These are observed games, not a model.</p>
        <Seg options={[['similar', 'Similar games'], ['h2h', 'Head-to-head']] as const} value={mode} onChange={(m) => v.set({ rmode: m, obs: null })} label="Replay mode" hit />
        <ul className="v3p-ctx">
          <li>{vm.opp ? `${vm.nextHome === false ? 'At' : 'Vs'} ${vm.opp.name}` : 'No coming opponent on the published slate'}</li>
          <li>Rule: {rule}, the most recent 20 (the window and filters on the other tabs are not used here)</li>
          <li>Compared with the line {v.line ?? '—'}: historical betting lines are not published</li>
        </ul>
      </section>
      {rows.length === 0 ? (
        <div className="v3p-empty" role="status"><b>0 games match</b>{mode === 'h2h' && !opp ? 'There is no coming opponent to compare against.' : 'No comparable games are in the published log.'}</div>
      ) : (
        <section className="v3p-chartc v3p-card" aria-label="Comparable games">
          <div className="v3p-logc__h"><b>{rows.length} {mode === 'h2h' ? 'head-to-head' : 'similar'} {rows.length === 1 ? 'game' : 'games'}</b><span>{v.statDef?.label}</span></div>
          <HitBars games={rows} stat={stat} line={v.line} rungs={[]} tonight={null} selKey={null} height={150} scrubbing={false} onSelect={() => undefined} onScrub={() => undefined} onLine={() => undefined} logoOf={(c) => teamLogo(vm.sport, c)} fmt={(n) => String(n)} label={`Comparable games, ${rows.length}`} />
          <div className="v3p-sum">
            <div><b className={`num ${sum.n && sum.over * 2 >= sum.n ? 'pos' : 'neg'}`}>{sum.n ? `${sum.over}/${sum.n}` : '—'}</b><span>Hit rate</span></div>
            <div><b className="num">{fmt1(sum.mean)}</b><span>Average</span></div>
            <div><b className="num">{fmt1(sum.median)}</b><span>Median</span></div>
            <div><b className={`num ${(sum.vsLine ?? 0) >= 0 ? 'pos' : 'neg'}`}>{signedN(sum.vsLine)}</b><span>vs line</span></div>
          </div>
          {smallSample(sum.n) && <p className="v3p-warn">Small sample: {sum.n} game{sum.n === 1 ? '' : 's'}. Read the rate as a description of those games only.</p>}
          <GameRows v={v} rows={[...rows].reverse().slice(0, 8)} />
        </section>
      )}
      <LockedRow title="Adjusted what-if: not available.">No validated adjustment model is published for this statistic, so SIFT shows no adjusted number. The observed games above are the only evidence here.</LockedRow>
    </>
  );
}
