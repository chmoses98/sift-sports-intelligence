// Game Detail, Game Script tab for a Script Engine game: the detailed view of the four ranked scripts. One script at a time (a chip per script), its outcome
// shape, the full causal chain with the findings behind every step, what cuts against it, and the contracts it settles (each side priced through the quote gate).
// Scripts are ranked, never given a likelihood; scoring bands marked descriptive are research only and support no total or team-total contract.
import { useMemo, useState } from 'react';
import type { Market } from '../../../contract/types';
import { LABEL_WORD, SCORING_RESEARCH_NOTE, bandText, isDescriptiveBand, marginBandText, type Engine, type EngineScript } from '../../../lib/scriptEngine';
import { relationWord, scriptBreaks, scriptMarketCards, type ScriptMarketCard } from '../../../lib/scriptMarkets';
import { sideLabel, useSideAsks } from '../../data/research/scriptPrices';
import { breakEvenPct } from '../../model/format';
import { marketMap, scriptCards, fitSentence, STATUS_WORD, type ScriptCard } from '../../model/scriptRead';
import { Icon } from '../../ui/Icon';
import type { GameCtx } from '../GameShared';
import { DetailNotice, FindingNote, LabelChips, ResearchOnly } from './parts';
import { SidePriceTap } from './ScriptOverview';

const ENV_WORD: Record<string, string> = { ELEVATED: 'Elevated', SUPPRESSED: 'Suppressed' };

function Shape({ s, home, away }: { s: EngineScript; home: string; away: string }) {
  const b = s.outcome_shape.bands;
  const tiles: [string, string | null, boolean][] = [
    ['Winner lean', s.outcome_shape.winner_lean === 'HOME' ? home : s.outcome_shape.winner_lean === 'AWAY' ? away : 'Neither', false],
    ['Margin', marginBandText(b.home_margin, home, away), isDescriptiveBand(s, 'home_margin')],
    ['Scoring environment', ENV_WORD[s.outcome_shape.total_environment] ?? null, false],
    ['Total points', bandText(b.total_points), isDescriptiveBand(s, 'total_points')],
    [`${home} points`, bandText(b.home_points), isDescriptiveBand(s, 'home_points')],
    [`${away} points`, bandText(b.away_points), isDescriptiveBand(s, 'away_points')],
  ];
  const shown = tiles.filter(([, v]) => v != null);
  return (
    <>
      <dl className="cs-tiles">
        {shown.map(([k, v, d]) => <div key={k} className={d ? 'is-desc' : undefined}><dt>{k}{d && <em> · descriptive</em>}</dt><dd className="num">{v}</dd></div>)}
      </dl>
      {shown.some(([, , d]) => d) && <p className="cs-foot">Point ranges marked descriptive are drawn around an uncalibrated scoring baseline. They describe the script; they are not a projection and support no total or team-total contract.</p>}
    </>
  );
}

function MarketCard({ c, ask, askOf }: { c: ScriptMarketCard; ask: number | null; askOf: (ticker: string, side: 'YES' | 'NO') => number | null }) {
  const e = c.e;
  return (
    <article className={`cs-mc${c.researchOnly ? ' is-research' : ''}`} data-testid="cfb-script-market">
      <div className="cs-bet__top">
        <div className="cs-bet__m"><b>{c.label}</b><small>{c.compat === 'SUPPORTED' ? 'Pays across this script' : 'Pays in part of this script’s range'}</small></div>
        <SidePriceTap e={e} ask={ask} label={c.label} hasMarket={!!c.market} />
      </div>
      <LabelChips labels={c.labels.filter((l) => l !== 'CONTRADICTED')} />
      {ask != null && <p className="cs-plain"><b>Fee-aware break-even</b> {breakEvenPct(ask)}¢ (the ask plus Kalshi’s taker fee).</p>}
      {c.paysWhen && <p className="cs-plain"><b>Pays when</b> {c.paysWhen}.</p>}
      <p className="cs-plain">{c.survival.charAt(0).toUpperCase()}{c.survival.slice(1)}.</p>
      {c.losesIn.length > 0 ? <p className="cs-plain"><b>Loses in</b> {c.losesIn.map((x) => `the ${x.role.toLowerCase()} script (${x.title})`).join(' and ')}.</p> : <p className="cs-plain">No script the engine built contradicts this side{c.silentIn.length ? `; ${c.silentIn.length} make${c.silentIn.length === 1 ? 's' : ''} no settlement claim about it` : ''}.</p>}
      {c.researchOnly && <p className="cs-plain">{LABEL_WORD.SCORING_BAND_UNCALIBRATED}: the engine does not calibrate scoring bands, so this contract’s script fit is descriptive.</p>}
      {c.conditions.length > 0 && <details className="cs-more"><summary>Football it needs<Icon name="chevD" size={16} /></summary><ul className="cs-pts">{c.conditions.map((x) => <li key={x}>{x}</li>)}</ul></details>}
      {c.alternatives.length > 0 && (
        <details className="cs-more">
          <summary>Other rungs of the same thesis ({c.alternatives.length})<Icon name="chevD" size={16} /></summary>
          <ul className="cs-alts">
            {c.alternatives.map((a) => (
              <li key={a.e.id}><span>{a.label}<small>{relationWord(a.relation)}{a.extraPoints != null ? ` · ${a.extraPoints > 0 ? '+' : ''}${a.extraPoints} pts` : ''}</small></span><SidePriceTap e={a.e} ask={askOf(a.e.ticker, a.e.side)} label={a.label} hasMarket={!!a.market} /></li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function ScriptMarkets({ engine, script, ctx }: { engine: Engine; script: EngineScript; ctx: GameCtx }) {
  const markets = useMemo(() => marketMap(ctx.detail?.markets), [ctx.detail]);
  const cards = useMemo(() => scriptMarketCards(engine, script.script_id, markets as Map<string, Market>), [engine, script, markets]);
  const breaks = useMemo(() => scriptBreaks(engine, script.script_id), [engine, script]);
  const tickers = useMemo(() => [...new Set([...cards.flatMap((c) => [c.e.ticker, ...c.alternatives.map((a) => a.e.ticker)]), ...breaks.map((e) => e.ticker)])], [cards, breaks]);
  const ask = useSideAsks(ctx.g, ctx.detail, ctx.startMs, tickers);
  if (!cards.length && !engine.expressions.length && engine.detail.state !== 'inline') {
    return <p className="cs-empty">{engine.detail.state === 'loading' ? 'Loading the script-to-market map.' : `The script-to-market map is not available for this game: ${engine.detail.reason ?? 'not published'}.`}</p>;
  }
  return (
    <>
      {cards.length ? <div className="cs-list">{cards.map((c) => <MarketCard key={c.e.id} c={c} ask={ask(c.e.ticker, c.e.side)} askOf={ask} />)}</div> : <p className="cs-empty">No contract is supported by this script.</p>}
      {breaks.length > 0 && (
        <>
          <h3 className="cs-h3">Contradicted by this script</h3>
          <ul className="cs-alts">
            {breaks.map((e) => { const m = markets.get(e.ticker); const label = sideLabel(e, m); return <li key={e.id}><span>{label}<small>{fitSentence(engine, e)}</small></span><SidePriceTap e={e} ask={ask(e.ticker, e.side)} label={label} hasMarket={!!m} /></li>; })}
          </ul>
        </>
      )}
      {engine.scoringResearchOnly && <p className="cs-notice" role="note"><span className="cs-lbl cs-lbl--scoring_band_uncalibrated">{LABEL_WORD.SCORING_BAND_UNCALIBRATED}</span> {SCORING_RESEARCH_NOTE}</p>}
    </>
  );
}

function ScriptDetail({ c, engine, ctx }: { c: ScriptCard; engine: Engine; ctx: GameCtx }) {
  const s = c.script;
  const home = engine.teams.home.name, away = engine.teams.away.name;
  const evidence = s.outcome_shape.margin_authority_evidence ?? [];
  const danger = engine.scripts.find((x) => x.role === 'DANGER' && x.script_id !== s.script_id);
  return (
    <div className="cs-detail" data-testid="cfb-script-detail" data-script={s.script_id}>
      <section className={`x-card cs-sec cs-scr cs-scr--s${c.tone}`} aria-label={`${c.role} script`}>
        <header><span className="cs-role">{c.role} · rank {s.rank} of {engine.scripts.length}</span><span className="cs-arch">{c.archetype}</span></header>
        <h2>{c.title}</h2>
        <p className="cs-sub">Ranked by matchup evidence. No probability is published for any script.</p>
        <p className="cs-scr__lead">{c.lead}</p>
        {c.rest && <p className="cs-plain">{c.rest}</p>}
        <p className="cs-plain"><b>How this script fails</b> {c.against.length ? `${c.against.length} finding${c.against.length === 1 ? ' cuts' : 's cut'} against it` : 'No published finding cuts against it'}{danger ? `; the danger path is ${danger.title}.` : '.'}</p>
      </section>
      <section className="x-card cs-sec" aria-labelledby="cs-chain-h">
        <div className="cs-sh"><h2 id="cs-chain-h">Causal chain</h2></div>
        <ol className="cs-chain cs-chain--full">
          {c.steps.map((st) => <li key={st.step}><span>{st.step}</span>{st.findings.map((f) => <FindingNote key={f.code} label={f.label} statement={f.statement} strength={f.strength} />)}</li>)}
        </ol>
      </section>
      <section className="x-card cs-sec" aria-labelledby="cs-shape-h">
        <div className="cs-sh"><h2 id="cs-shape-h">Outcome shape</h2><ResearchOnly /></div>
        <Shape s={s} home={home} away={away} />
        {s.outcome_shape.bands.home_margin && evidence.length > 0 && <div className="cs-cited"><h4>Margin authority</h4>{evidence.map((code) => { const f = c.steps.flatMap((st) => st.findings).find((x) => x.code === code); const g = engine.findings.find((x) => x.code === code); return g ? <FindingNote key={code} label={f?.label ?? code} statement={g.statement} strength={g.strength} /> : null; })}</div>}
        {!s.outcome_shape.bands.home_margin && s.outcome_shape.total_environment !== 'NOT_STATED' && <p className="cs-plain">No margin stated: the scoring environment says nothing about how close the game is, and no resolved matchup finding does either.</p>}
        {c.against.length > 0 && <div className="cs-cited"><h4>Evidence against</h4>{c.against.map((f) => <FindingNote key={f.code} label={f.label} statement={f.statement} />)}</div>}
      </section>
      <section className="x-card cs-sec" aria-labelledby="cs-mk-h">
        <div className="cs-sh"><h2 id="cs-mk-h">Markets this script settles</h2></div>
        <p className="cs-sub">Settlement-exact: a contract is supported only if every outcome in the script’s range pays it. The price is that side’s own Kalshi ask.</p>
        <ScriptMarkets engine={engine} script={s} ctx={ctx} />
      </section>
    </div>
  );
}

export function CfbScriptTab({ ctx, engine }: { ctx: GameCtx; engine: Engine }) {
  const cards = useMemo(() => scriptCards(engine), [engine]);
  const [sel, setSel] = useState<string | null>(null);
  const cur = cards.find((c) => c.script.script_id === sel) ?? cards[0];
  if (!cur) {
    return (
      <section className="cs" aria-label="Game script" data-testid="cfb-script-tab">
        <div className="x-card cs-sec"><div className="cs-sh"><h2>Game Script</h2><ResearchOnly /></div><p className="cs-plain"><b>{STATUS_WORD[engine.status] ?? 'No script cleared its evidence requirement.'}</b> The matchup evidence for this game does not support any script yet, so none is shown rather than invented.</p></div>
      </section>
    );
  }
  return (
    <section className="cs" aria-label="Game script" data-testid="cfb-script-tab">
      <DetailNotice engine={engine} />
      <div className="cs-pick" role="group" aria-label="Script">
        {cards.map((c) => <button key={c.script.script_id} type="button" className={`cs-chip cs-chip--s${c.tone}`} aria-pressed={c.script.script_id === cur.script.script_id} onClick={() => setSel(c.script.script_id)}><b>{c.role}</b><span>{c.title}</span></button>)}
      </div>
      <ScriptDetail c={cur} engine={engine} ctx={ctx} />
      <p className="cs-foot"><ResearchOnly /> Scripts are ranked by evidence and never priced.</p>
    </section>
  );
}
