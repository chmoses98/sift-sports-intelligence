// THE TOP-PROPS BOARD — every priced NFL player prop on the coming slate, ranked by one published-data criterion the
// viewer picks and can read on every row:
//   Projection vs line  how far the simulation's projection sits from the main line, in widths of its own middle-50%
//                       range (the prop board's separation). Research: the NFL publication's scorecard has the market
//                       ahead of its prop pricing, so this is never presented as an edge.
//   Recent history      how many of the player's last 10 games played cleared TODAY's line. History, not a chance.
// Rows can be ticked and saved together to My Board (the research tray: one MARKET item per prop, the same item a
// single Save makes). Games that have kicked off are not on the board: pregame research cannot be saved after kickoff.
import { useMemo, useState } from 'react';
import { Link } from '../../routing';
import type { BoardItem } from '../../contract/types';
import { Icon } from '../../components/Icon';
import { PlayerFace } from '../../components/insight';
import { Skeleton, TeamMark } from '../../components/ui';
import type { SportRepo } from '../../data/repo';
import type { HitRate } from '../../history/hitRate';
import { roleShift, statDef } from '../../history/stats';
import { fmtValue, PROP_FAMILY_LABEL, PROP_FAMILY_ORDER, type PropFamily } from '../../insights/propBoard';
import { playerPhoto } from '../../lib/players';
import { routes } from '../../lib/routes';
import { teamColors } from '../../lib/teams';
import { useTray } from '../../state/tray';
import { HitDots } from './HitRate';
import { historySide, type DiscoveryRow, type DiscoverySort } from './model';
import { rankSlate } from './ranking';
import { addedNotice, addPropsToBoard, cents, gameName, onBoard, propHref, rowKey, useSlateProps } from './slate';
import { histKey, hitFor, usePlayerHistories } from './useHits';

const PAGE = 20;
export { rowKey, useSlateProps };

export function TopProps({ repo, games, slug, sportCode }: { repo: SportRepo | undefined; games: BoardItem[]; slug: string; sportCode: string }) {
  const slate = useSlateProps(repo, games);
  const tray = useTray();
  const [sort, setSort] = useState<DiscoverySort>('gap');
  const [game, setGame] = useState<string>('');
  const [fam, setFam] = useState<PropFamily | ''>('');
  const [limit, setLimit] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const all = useMemo(() => (slate.data?.rows ?? []).filter((d) => d.row.main && (!game || d.eventId === game) && (!fam || d.row.family === fam)), [slate.data, game, fam]);
  // History is fetched only when the viewer asks for the history ranking (one game log per player).
  const histPlayers = useMemo(() => {
    if (sort !== 'history') return [];
    const m = new Map<string, { name: string; team: string }>();
    for (const d of all) if (statDef(d.row.def.stat)) m.set(histKey(d.row.name, d.row.team.abbr), { name: d.row.name, team: d.row.team.abbr });
    return [...m.values()];
  }, [all, sort]);
  const { docs, loading: histLoading } = usePlayerHistories(sportCode, histPlayers);

  // The shared slate ranking (views/props/ranking.ts): Home's Top Props reads the same order.
  const { ranked, setAside } = useMemo(
    () => rankSlate<HitRate>(all, { sort, touchdowns: fam === 'touchdowns', hit: sort === 'history' ? (d) => hitFor(docs.get(histKey(d.row.name, d.row.team.abbr)), d.row, d.kickoff, 'last10') : undefined }),
    [all, sort, docs, fam],
  );
  const shown = ranked.slice(0, limit);
  const savedKey = (d: DiscoveryRow) => onBoard(tray, d);
  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const pickedRows = ranked.filter((x) => picked.has(rowKey(x.d)) && !savedKey(x.d));

  const addAll = () => {
    const res = addPropsToBoard(tray, pickedRows.map((x) => x.d), sportCode, slug);
    setPicked(new Set());
    setNotice(addedNotice(res));
  };

  const gameIds = [...new Set((slate.data?.rows ?? []).map((d) => d.eventId))];
  const gamesWithProps = games.filter((g) => gameIds.includes(g.event_id));

  return (
    <section className="tprops fx-card" aria-labelledby="tprops-h">
      <header className="tprops__h">
        <div>
          <h2 className="tprops__t" id="tprops-h">Top props on the slate</h2>
          <p className="tprops__sub">
            {sort === 'gap'
              ? <><span className="tprops__long">Ranked by how far the <b>published projection</b> sits from the line, measured in its own middle-50% range. </span><span className="tprops__auth">Research</span> <span className="tprops__long">— the publication rates its prop pricing research only; </span>not a validated edge.</>
              : <><span className="tprops__long">Ranked by how one-sided his <b>last 10 games played</b> were against today’s line (most over or most under first). </span><span className="tprops__auth tprops__auth--hist">History</span> — past games, not a probability.</>}
          </p>
        </div>
        <div className="fr-seg" role="group" aria-label="Rank by">
          <button type="button" className={`fr-seg__b${sort === 'gap' ? ' is-on' : ''}`} aria-pressed={sort === 'gap'} onClick={() => { setSort('gap'); setLimit(PAGE); }}>Projection vs line</button>
          <button type="button" className={`fr-seg__b${sort === 'history' ? ' is-on' : ''}`} aria-pressed={sort === 'history'} onClick={() => { setSort('history'); setLimit(PAGE); }}>Last 10 history</button>
        </div>
      </header>

      <div className="tprops__filters">
        <label className="term__sel"><span>Game</span>
          <select value={game} onChange={(e) => { setGame(e.target.value); setLimit(PAGE); }}>
            <option value="">All games ({gamesWithProps.length})</option>
            {gamesWithProps.map((g) => <option key={g.event_id} value={g.event_id}>{gameName(g)} · {new Date(g.start_time_utc).toLocaleDateString(undefined, { weekday: 'short' })}</option>)}
          </select>
        </label>
        <div className="fr-chips" role="group" aria-label="Prop type">
          <button type="button" className={`fr-chip${!fam ? ' is-on' : ''}`} aria-pressed={!fam} onClick={() => setFam('')}>All</button>
          {PROP_FAMILY_ORDER.filter((f) => f !== 'other').map((f) => <button key={f} type="button" className={`fr-chip${fam === f ? ' is-on' : ''}`} aria-pressed={fam === f} onClick={() => setFam(fam === f ? '' : f)}>{PROP_FAMILY_LABEL[f]}</button>)}
        </div>
      </div>

      {slate.loading || histLoading ? <Skeleton lines={8} /> : !ranked.length ? (
        <div className="bempty"><h3>No props to rank here</h3><p>{sort === 'gap' ? 'No priced prop in this filter has a published simulation to compare with its line.' : 'No game logs reach these players yet.'}</p></div>
      ) : (
        <ol className="tprops__list" aria-label={`${ranked.length} ranked props`}>
          {shown.map(({ d, h }, i) => {
            const k = rowKey(d);
            const saved = savedKey(d);
            const r = d.row;
            const gap = r.projection != null && r.line != null ? r.projection - r.line : null;
            const unitless = (v: number) => fmtValue(v, r.def).replace(/ \S+$/, '');
            const id = `tp-${i}`;
            return (
              <li key={k} className={`tprow${picked.has(k) ? ' is-picked' : ''}${saved ? ' is-saved' : ''}`} style={{ ['--tc' as string]: teamColors('NFL', r.team.abbr)[0] }}>
                <label className="tprow__chk">
                  <input type="checkbox" checked={saved || picked.has(k)} disabled={saved} onChange={() => toggle(k)} aria-describedby={id} />
                  <span className="sr-only">{saved ? 'Already on My Board' : 'Select'} {r.name} {r.def.label}</span>
                </label>
                <span className="tprow__rk num" aria-hidden="true">{i + 1}</span>
                <PlayerFace photo={playerPhoto(r.playerId, r.name, r.team.abbr)} team={r.team.abbr} size="sm" />
                <span className="tprow__who" id={id}>
                  <b>{r.name}{saved && <span className="tprow__saved">On My Board</span>}</b>
                  <small><TeamMark sport="NFL" abbr={r.team.abbr} size="sm" /> {r.team.abbr} {r.role ?? ''} · {d.game}</small>
                </span>
                <span className="tprow__mk">
                  <span className="tprow__stat">{r.def.label}</span>
                  <span className="tprow__line"><b className="num">{r.line}</b> <small>O {cents(r.main?.yesAsk)} · U {cents(r.main?.noAsk)}</small></span>
                </span>
                <span className="tprow__why">
                  {sort === 'gap' && gap != null && r.projection != null ? (
                    <>
                      <span className={`tprow__gap tprow__gap--${gap >= 0 ? 'up' : 'down'}`}>{gap >= 0 ? '▲' : '▼'} Proj {unitless(r.projection)} <small>({gap >= 0 ? '+' : '−'}{unitless(Math.abs(gap))})</small></span>
                      <small className="tprow__crit">{Math.abs(r.separation ?? 0).toFixed(1)}× his middle-50% range {gap >= 0 ? 'above' : 'below'} the line</small>
                    </>
                  ) : h ? (() => {
                    const hs = historySide(h);
                    return (
                      <>
                        <span className={`tprow__hit tprow__hit--${hs.side}`}><HitDots h={h} /> <b className="num">{hs.side === 'under' ? h.under : h.over}/{h.n}</b> {hs.side === 'under' ? 'under' : 'over'}</span>
                        <small className="tprow__crit">{hs.text}{h.n < 10 ? ` · only ${h.n} played` : ''}{(() => { const sh = roleShift(h.games.map((x) => x.row)); return sh ? <b className="tprow__shift"> · role changed: {sh.metric} {sh.metric === 'carries' ? `${Math.round(sh.from * 10) / 10} → ${Math.round(sh.to * 10) / 10}/g` : `${Math.round(sh.from * 100)}% → ${Math.round(sh.to * 100)}%`} in his last 2</b> : null; })()}</small>
                      </>
                    );
                  })() : <small className="tprow__crit">—</small>}
                  {r.matchup && <small className="tprow__ctx">vs {r.matchup.label} <b>{r.matchup.rank.text}</b> · opponent-adjusted</small>}
                </span>
                <span className="tprow__auth">{sort === 'gap' ? <span className="tprops__auth" title={r.main?.modelState ? `Shadow model: ${r.main.modelState.toLowerCase().replace(/_/g, ' ')}` : 'Research only'}>Research</span> : <span className="tprops__auth tprops__auth--hist">History</span>}</span>
                <Link className="tprow__go" to={propHref(slug, d)} aria-label={`Analyse ${r.name} ${r.def.label.toLowerCase()}`}><Icon name="arrowRight" size={16} /></Link>
              </li>
            );
          })}
        </ol>
      )}
      {ranked.length > limit && <button type="button" className="btn btn--sm tprops__more" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, ranked.length - limit)} more</button>}
      {fam !== 'touchdowns' && <p className="fr-note">Touchdown props rank under the Touchdowns filter only: {sort === 'gap' ? 'their simulated range collapses to zero, so the gap is not comparable with yards.' : 'an anytime-touchdown line lands under in most games for most players, which would crowd out every other market.'}</p>}
      {setAside.length > 0 && (
        <details className="tprops__aside">
          <summary>{setAside.length} prop{setAside.length === 1 ? '' : 's'} not ranked: the line sits outside the simulation’s 5th–95th range</summary>
          <p className="fr-note">The market and the simulation are pricing different roles (for example a backup projected for spot snaps against a starter’s line). That is a data question to check, not a finding.</p>
          <ul>{setAside.map((d) => <li key={rowKey(d)}><Link to={propHref(slug, d)}>{d.row.name} · {d.row.def.label.toLowerCase()} {d.row.line}</Link> <small>projection {fmtValue(d.row.projection!, d.row.def)}, simulated range {d.row.range ? `${Math.round(d.row.range.full[0] * 10) / 10}–${Math.round(d.row.range.full[1] * 10) / 10}` : '—'}</small></li>)}</ul>
        </details>
      )}
      {slate.data?.unreadable ? <p className="fr-note">{slate.data.unreadable} game{slate.data.unreadable === 1 ? '’s' : 's’'} research could not be read, so {slate.data.unreadable === 1 ? 'its props are' : 'their props are'} not ranked.</p> : null}

      <div className={`tprops__bar${pickedRows.length || notice ? ' is-on' : ''}`} aria-live="polite">
        {pickedRows.length ? (
          <>
            <span><b className="num">{pickedRows.length}</b> selected</span>
            <button type="button" className="btn btn--sm" onClick={() => setPicked(new Set())}>Clear</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={addAll}><Icon name="plus" size={15} /> Add {pickedRows.length} to My Board</button>
          </>
        ) : notice ? (
          <>
            <span>{notice}</span>
            <Link to={routes.board()} className="btn btn--sm">Open My Board</Link>
            <button type="button" className="btn btn--sm" onClick={() => setNotice(null)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
          </>
        ) : null}
      </div>
    </section>
  );
}
