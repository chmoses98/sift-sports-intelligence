// Game Detail, Game Script tab for an NFL game: the publication's simulation, told one script at a time. SIFT 2.0's script logic is reused (src/lib/scripts.ts,
// scriptExpressions.ts, via model/nflScript.ts); this is the v3 presentation. Top to bottom:
//   1. the scripts      four or five cards (name, share of simulated games, the final margin, "Most likely") as a selector; the address remembers it (`sc`)
//   2. the selected one its summary, and "How it plays": the final margin, team volume against all simulated games, the pass/run lean
//   3. bets that survive multiple scripts, and ways to bet this script: Kalshi contract sides, each price through the quote gate (a withheld one says why)
//   4. key players      each team's lead passer, runner and receiver, with his TEAM's volume in this script (player projections are not split by script)
//   5. where it ends    the scripts on the final-margin axis over the simulation's published bands
// Shares are SIMULATION SHARES, never odds. A game whose research carries no usable simulation shows the published thesis instead (`fallback`).
import { useMemo, useState, type ReactNode } from 'react';
import type { Market } from '../../../contract/types';
import type { PriceRow } from '../../../lib/gamedata';
import { multiScriptSurvivors, scriptExpressions, survivalWords, VOLUME_LEAN_NOTE, type ScriptExpression } from '../../../lib/scriptExpressions';
import type { GameScript, ScriptSet } from '../../../lib/scripts';
import { sharePct } from '../../../lib/scripts';
import { usePublishNflScriptContracts, type NamedSide } from '../../data/research/nflScriptPrices';
import { useSideQuotes } from '../../data/research/scriptPrices';
import { SIM_SHARE_NOTE, CLOSE_SPLIT_HELD, closeSplitShown, leanSentences, marginBand, marginPos, marginSegs, marginWords, otherEndings, pickScript, playerLeans, rangeText, readNflScript, readScripts, scriptCards, volumeRows, type DeltaText, type NflScript } from '../../model/nflScript';
import { PlayerLink } from '../../nav/Targets';
import { Icon } from '../../ui/Icon';
import { PriceWhy, SidePriceTap } from '../cfb/parts';
import type { GameCtx } from '../GameShared';
import './nfl.css';

const Delta = ({ d }: { d: DeltaText | null }) => (d ? <span className={`ns-d ns-d--${d.dir}`}>{d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : ''} {d.text}</span> : null);
const KIND_WORD = { moneyline: 'Moneyline', spread: 'Spread', prop: 'Player prop' } as const;

// ------------------------------------------------------------------ 1. the script cards

export function ScriptPicker({ set, selected, onPick }: { set: ScriptSet; selected: string; onPick: (id: string) => void }) {
  const cards = useMemo(() => scriptCards(set), [set]);
  return (
    <div className="ns-pick" role="group" aria-label="Script" data-testid="nfl-script-picker">
      {cards.map((c) => (
        <button key={c.id} type="button" className={`ns-card ns-t${c.tone}${c.id === selected ? ' is-on' : ''}`} aria-pressed={c.id === selected} data-script={c.id}
          aria-label={`${c.mostLikely ? 'Most likely: ' : ''}${c.name}: ${c.pct} of simulated games. ${c.line}${c.id === selected ? ' Selected.' : ''}`} onClick={() => onPick(c.id)}>
          <span className="ns-card__top"><b>{c.name}</b>{c.mostLikely && <em className="ns-badge">Most likely</em>}<span className="ns-card__pct num">{c.pct}</span></span>
          <span className="ns-bar" aria-hidden="true"><i style={{ width: `${Math.max(3, c.share * 100)}%` }} /></span>
          <small>{c.line}</small>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ 2. the selected script

function VolumeTable({ s, set }: { s: GameScript; set: ScriptSet }) {
  const rows = useMemo(() => volumeRows(s, set), [s, set]);
  return (
    <table className="ns-vol" data-testid="nfl-script-volume">
      <caption className="cs-sr">Simulated volume in games that end this way, against every simulated game</caption>
      <thead><tr><th scope="col">Metric</th><th scope="col">{set.awayAbbr}</th><th scope="col">{set.homeAbbr}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row">{r.label}</th>
            {(['away', 'home'] as const).map((side) => <td key={side}><b className="num">{r.cells[side].value}</b><Delta d={r.cells[side].delta} /></td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Selected({ s, set }: { s: GameScript; set: ScriptSet }) {
  const lean = useMemo(() => leanSentences(s, set), [s, set]);
  const others = otherEndings(s, set);
  return (
    <section className={`x-card ns-sel ns-t${s.index}`} aria-label={`${s.name}, selected script`} data-testid="nfl-script-detail" data-script={s.id}>
      <header><span className="ns-sel__tag">Selected script</span><h2>{s.name}</h2></header>
      <p className="ns-sel__pct"><b className="num">{sharePct(s.share)}</b> of simulated games<span className="ns-bar ns-bar--w" aria-hidden="true"><i style={{ width: `${Math.max(3, s.share * 100)}%` }} /></span></p>
      <p className="ns-sel__story">{s.summary}{s.detail ? ` ${s.detail}` : ''}</p>
      <details className="cs-more" data-testid="nfl-script-how">
        <summary>How it plays<Icon name="chevD" size={16} /></summary>
        <p className="ns-p">{rangeText(s, set)} Score paths are not simulated, only the final margin.</p>
        <VolumeTable s={s} set={set} />
        <p className="ns-p ns-p--dim">Simulated averages in games that end this way, against every simulated game.</p>
        <p className="ns-p">{lean.join('; ')}.</p>
        <p className="ns-p">{others.rest} of simulated games end another way{others.top ? `, most often ${others.top.name} (${sharePct(others.top.share)})` : ''}.</p>
      </details>
    </section>
  );
}

// ------------------------------------------------------------------ 3. bets: survivors and ways to bet

type Quote = ReturnType<typeof useSideQuotes>;

function FitCells({ fits, set, label }: { fits: ('yes' | 'part' | 'no')[]; set: ScriptSet; label: string }) {
  return (
    <span className="ns-fit" role="img" aria-label={label}>
      {fits.map((f, i) => <i key={set.scripts[i].id} className={`ns-fc ns-fc--${f} ns-t${set.scripts[i].index}`} title={`${set.scripts[i].name}: ${f === 'yes' ? 'always wins' : f === 'part' ? 'wins in part of its range' : 'does not win'}`} />)}
    </span>
  );
}

function BetsLoading({ ctx, children }: { ctx: GameCtx; children: ReactNode }) {
  if (!ctx.detail && ctx.detailError) return <p className="cs-empty" role="status">The Kalshi contract list for this game could not be read, so no contract is shown.</p>;
  if (!ctx.detail) return <div className="v3-skel ns-skel" role="status" aria-label="Loading Kalshi contracts" />;
  return <>{children}</>;
}

function Survivors({ ctx, nfl, quote }: { ctx: GameCtx; nfl: NflScript; quote: Quote }) {
  const list = useMemo(() => multiScriptSurvivors(nfl.rows, nfl.set, 2, 6), [nfl]);
  return (
    <section className="x-card ns-sec" aria-labelledby="ns-surv-h" data-testid="nfl-survivors">
      <h2 id="ns-surv-h">Bets that survive multiple scripts</h2>
      <p className="cs-sub">Moneylines and spreads that win in every game of two or more scripts. Exact, because they settle on the final margin. Surviving many scripts is not a reason on its own: read the price beside it.</p>
      <BetsLoading ctx={ctx}>
        {list.length ? (
          <ul className="ns-bets">
            {list.map((x) => {
              const q = quote(x.row.m.kalshi_ticker, 'YES');
              return (
                <li key={x.row.m.market_id} className="ns-bet" data-testid="nfl-survivor" data-ticker={x.row.m.kalshi_ticker}>
                  <div className="ns-bet__top">
                    <div className="ns-bet__m"><b>{x.row.label}</b>{x.similar > 0 && <small>+{x.similar} similar {x.similar === 1 ? 'line' : 'lines'} with the same script pattern</small>}</div>
                    <SidePriceTap ticker={x.row.m.kalshi_ticker} side="YES" q={q} label={x.row.label} hasMarket />
                  </div>
                  <PriceWhy q={q} />
                  <div className="ns-bet__fit"><FitCells fits={x.fits} set={nfl.set} label={survivalWords(x)} /><span>{survivalWords(x)}</span></div>
                </li>
              );
            })}
          </ul>
        ) : <p className="cs-empty">No priced margin contract wins in every game of two or more scripts on this game.</p>}
      </BetsLoading>
    </section>
  );
}

function ExpressionRow({ x, quote }: { x: ScriptExpression; quote: Quote }) {
  const q = quote(x.row.m.kalshi_ticker, x.side);
  return (
    <li className="ns-bet" data-testid="nfl-expression" data-ticker={x.row.m.kalshi_ticker} data-side={x.side} data-kind={x.kind}>
      <div className="ns-bet__top">
        <div className="ns-bet__m"><b>{x.row.label}</b><small>{KIND_WORD[x.kind]} · {x.basis === 'fit' ? 'exact fit' : 'volume lean'}</small></div>
        <SidePriceTap ticker={x.row.m.kalshi_ticker} side={x.side} q={q} label={x.row.label} hasMarket />
      </div>
      <PriceWhy q={q} />
      <p className="ns-p ns-p--dim">{x.why}</p>
    </li>
  );
}

function Ways({ ctx, nfl, s, quote }: { ctx: GameCtx; nfl: NflScript; s: GameScript; quote: Quote }) {
  const expr = useMemo(() => (ctx.research ? scriptExpressions(ctx.research, nfl.rows, nfl.set, s.id, nfl.set.names) : null), [ctx.research, nfl, s.id]);
  const hasProp = !!expr?.items.some((x) => x.kind === 'prop');
  return (
    <section className="x-card ns-sec" aria-labelledby="ns-ways-h" data-testid="nfl-ways">
      <h2 id="ns-ways-h">Ways to bet {s.name}</h2>
      <p className="cs-sub">Priced Kalshi contracts that express this script. Tap a price for the exact contract.</p>
      <BetsLoading ctx={ctx}>
        {expr?.items.length ? <ul className="ns-bets">{expr.items.map((x) => <ExpressionRow key={x.row.m.market_id + x.side} x={x} quote={quote} />)}</ul> : <p className="cs-empty">No priced contract expresses this script.</p>}
        {hasProp && <p className="cs-foot">{VOLUME_LEAN_NOTE}</p>}
        {expr && expr.missing.length > 0 && (
          <details className="cs-more">
            <summary>What is not linked ({expr.missing.length})<Icon name="chevD" size={16} /></summary>
            <ul className="ns-miss">{expr.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </details>
        )}
      </BetsLoading>
    </section>
  );
}

// ------------------------------------------------------------------ 4. key players, 5. margin map

function Players({ ctx, nfl, s }: { ctx: GameCtx; nfl: NflScript; s: GameScript }) {
  const list = useMemo(() => (ctx.research ? playerLeans(ctx.research, nfl.set, s) : []), [ctx.research, nfl, s]);
  return (
    <section className="x-card ns-sec" aria-labelledby="ns-pl-h" data-testid="nfl-players">
      <h2 id="ns-pl-h">Key players in this script</h2>
      {list.length ? (
        <ul className="ns-pls">
          {list.map(({ p, value, delta }) => (
            <li key={p.pid + p.vol}>
              <PlayerLink player={{ slug: ctx.g.slug, id: p.pid }} className="ns-pl" label={`${p.name}, ${p.role} for ${p.abbr}: ${p.volLabel.toLowerCase()} ${value} in this script. Open player research`}>
                <span className="ns-pl__id"><b>{p.name}</b><small>{p.role} · {p.abbr}</small></span>
                <span className="ns-pl__v"><b className="num">{value}</b><small>{p.volLabel}</small></span>
                <span className="ns-pl__d"><Delta d={delta} /><small>vs all games</small></span>
              </PlayerLink>
            </li>
          ))}
        </ul>
      ) : <p className="cs-empty">The publication lists no projected players for this game.</p>}
      <p className="cs-foot">His <b>team’s</b> volume in this script against all simulated games. Player projections are not split by script.</p>
    </section>
  );
}

const SPAN = 28;
function MarginMap({ nfl, ctx, s }: { nfl: NflScript; ctx: GameCtx; s: GameScript }) {
  const { set } = nfl;
  const segs = useMemo(() => marginSegs(set, s.id), [set, s.id]);
  const band = useMemo(() => (ctx.research ? marginBand(ctx.research) : null), [ctx.research]);
  const a = (v: number | null, dflt: number) => marginPos(v ?? dflt, SPAN);
  const desc = segs.map((x) => `${x.name}: ${marginWords(x.lo, x.hi, set.homeAbbr, set.awayAbbr)}`).join('; ');
  return (
    <section className="x-card ns-sec" aria-labelledby="ns-mm-h" data-testid="nfl-margin-map">
      <h2 id="ns-mm-h">Where it ends</h2>
      <figure className="ns-mm" role="img" aria-label={`Final margin of each script, ${s.name} selected. ${desc}.${band?.r50 ? ` Simulated ${set.homeAbbr} margin: middle half ${band.r50[0]} to ${band.r50[1]}.` : ''}`}>
        {band?.r90 && (
          <div className="ns-mm__band">
            <i className="ns-mm__r90" style={{ left: `${marginPos(band.r90[0], SPAN)}%`, width: `${marginPos(band.r90[1], SPAN) - marginPos(band.r90[0], SPAN)}%` }} />
            {band.r50 && <i className="ns-mm__r50" style={{ left: `${marginPos(band.r50[0], SPAN)}%`, width: `${marginPos(band.r50[1], SPAN) - marginPos(band.r50[0], SPAN)}%` }} />}
            {band.mean != null && <i className="ns-mm__mean" style={{ left: `${marginPos(band.mean, SPAN)}%` }} />}
          </div>
        )}
        <div className="ns-mm__rows">
          <i className="ns-mm__zero" aria-hidden="true" />
          {segs.map((x) => {
            const l = a(x.lo, -SPAN), r = a(x.hi, SPAN);
            return (
              <div key={x.id} className={`ns-mm__row ns-t${x.tone}${x.on ? ' is-on' : ''}`}>
                <i className="ns-mm__seg" style={{ left: `${l}%`, width: `${Math.max(1.5, r - l)}%` }} />
                <span className="ns-mm__lb" style={(l + r) / 2 >= 50 ? { right: `${100 - l + 1}%` } : { left: `${r + 1}%` }}>{x.label}</span>
              </div>
            );
          })}
        </div>
        <div className="ns-mm__ax" aria-hidden="true"><span>{set.awayAbbr} +{SPAN}</span><span>Tie</span><span>{set.homeAbbr} +{SPAN}</span></div>
      </figure>
      <p className="cs-foot">{band?.r50 ? 'The bright bar is the simulation’s middle half of the final margin, the faint bar nine in ten, the dot the mean. ' : ''}Each script is a range of final margins.</p>
    </section>
  );
}

// ------------------------------------------------------------------ the tab

export function NflScriptTab({ ctx, fallback }: { ctx: GameCtx; fallback: ReactNode }) {
  const { g } = ctx;
  const nfl = useMemo(() => readNflScript(ctx.research, ctx.detail?.markets), [ctx.research, ctx.detail]);
  const [local, setLocal] = useState<string | null>(null);
  const cur = nfl ? pickScript(nfl.set, ctx.scenario ?? local) : null;
  // Every contract the tab can name (survivors and this script's ways) is told to the sheet and registered with the quote store once.
  const shown = useMemo(() => {
    if (!nfl || !cur || !ctx.research) return { sides: [] as NamedSide[], tickers: [] as string[] };
    const sides: NamedSide[] = [];
    const add = (row: PriceRow, side: 'YES' | 'NO') => sides.push({ m: row.m as Market, label: row.label, side });
    for (const x of multiScriptSurvivors(nfl.rows, nfl.set, 2, 6)) add(x.row, 'YES');
    for (const x of scriptExpressions(ctx.research, nfl.rows, nfl.set, cur.id, nfl.set.names).items) add(x.row, x.side);
    return { sides, tickers: [...new Set(sides.map((x) => x.m.kalshi_ticker))] };
  }, [nfl, cur, ctx.research]);
  usePublishNflScriptContracts(g, ctx.startMs, shown.sides);
  const quote = useSideQuotes(g, ctx.detail, ctx.startMs, shown.tickers);
  if (ctx.researchLoading && !ctx.research) return <div className="v3-skel ns-skel ns-skel--tall" role="status" aria-label="Loading game script" />;
  if (!nfl || !cur) return <>{fallback}</>;
  const pick = (id: string) => { setLocal(id); ctx.setScenario?.(id); };
  const { set } = nfl;
  return (
    <section className="ns" aria-label="Game script" data-testid="nfl-script-tab">
      <div className="ns-head">
        <h2 className="v3-h2">Game Script</h2>
        <span className="ns-tag">Simulation</span>
      </div>
      <p className="cs-sub">How {set.names.away} at {set.names.home} could end, from the publication’s simulation. {SIM_SHARE_NOTE}</p>
      <ScriptPicker set={set} selected={cur.id} onPick={pick} />
      {set.tie != null ? <p className="cs-foot" data-testid="close-split-note">{closeSplitShown(set.tie)}</p> : set.scripts.some((x) => x.id === 'close') && <p className="cs-foot" data-testid="close-split-held-note">{CLOSE_SPLIT_HELD}</p>}
      <Selected s={cur} set={set} />
      <Survivors ctx={ctx} nfl={nfl} quote={quote} />
      <Ways ctx={ctx} nfl={nfl} s={cur} quote={quote} />
      {ctx.research && <Players ctx={ctx} nfl={nfl} s={cur} />}
      <MarginMap nfl={nfl} ctx={ctx} s={cur} />
      <p className="cs-foot">Research only, not a bet signal.{set.notSimulated.length ? ` The simulation models the final margin and total only; it does not simulate ${set.notSimulated.join(', ')}.` : ''} Prices are Kalshi asks before fees.</p>
    </section>
  );
}

/** The Overview's compact row: the most likely script and its share, a tap away from the tab. Nothing when the game has no simulation. */
export function NflScriptRow({ ctx, onOpen }: { ctx: GameCtx; onOpen: (scriptId: string) => void }) {
  const set = useMemo(() => readScripts(ctx.research), [ctx.research]);
  if (!set || !set.scripts.length || ctx.g.provenance !== 'publication') return null;
  const top = set.scripts[0];
  return (
    <button type="button" className={`ns-row ns-t${top.index}`} data-testid="nfl-script-row" aria-label={`Most likely script: ${top.name}, ${sharePct(top.share)} of simulated games. Open Game Script`} onClick={() => onOpen(top.id)}>
      <span className="ns-row__k">Most likely script</span>
      <b>{top.name}</b>
      <span className="ns-row__p num">{sharePct(top.share)}<small>of simulated games</small></span>
      <Icon name="chevR" size={18} />
    </button>
  );
}
