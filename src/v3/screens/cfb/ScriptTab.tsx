// Game Detail, Game Script tab for a Script Engine game: one scenario at a time (a chip per scenario, the address remembers it), told in the order a reader asks:
// what is it and how does the engine rank it, why does it happen, what is the evidence, what breaks it, and which contracts express it (each a tap on the exact-contract sheet,
// priced through the quote gate). Deeper material (the full causal chain, the outcome shape, rungs of the same thesis, contracts the scenario contradicts) is one tap down.
// The engine publishes no probability for a scenario; scoring lines are research only.
import { useMemo, useState } from 'react';
import type { Market } from '../../../contract/types';
import { LABEL_WORD, SCORING_RESEARCH_NOTE, bandText, isDescriptiveBand, marginBandText, type Engine, type EngineScript } from '../../../lib/scriptEngine';
import { relationWord, scriptBreaks } from '../../../lib/scriptMarkets';
import { sideLabel, useSideQuotes } from '../../data/research/scriptPrices';
import { marketMap, fitSentence, STATUS_WORD } from '../../model/scriptRead';
import { scenarioMarkets, scenarios, type Scenario } from '../../model/scriptStory';
import { Icon } from '../../ui/Icon';
import type { GameCtx } from '../GameShared';
import { DetailNotice, EvidenceList, FindingNote, PriceWhy, ResearchOnly, RoleChip, SidePriceTap } from './parts';
import { ScenarioMarketsBlock, scenarioTickers } from './ScenarioParts';

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
      {shown.some(([, , d]) => d) && <p className="cs-foot">Point ranges marked descriptive are drawn around an uncalibrated scoring baseline. They describe the scenario; they are not a projection and support no total or team-total contract.</p>}
    </>
  );
}

function Markets({ engine, s, ctx }: { engine: Engine; s: Scenario; ctx: GameCtx }) {
  const markets = useMemo(() => marketMap(ctx.detail?.markets), [ctx.detail]);
  const m = useMemo(() => scenarioMarkets(engine, s.card.script, markets as Map<string, Market>), [engine, s, markets]);
  const breaks = useMemo(() => scriptBreaks(engine, s.card.script.script_id), [engine, s]);
  const tickers = useMemo(() => [...new Set([...scenarioTickers(m), ...breaks.map((e) => e.ticker)])], [m, breaks]);
  const quote = useSideQuotes(ctx.g, ctx.detail, ctx.startMs, tickers);
  if (!m.core.length && !m.scoring.length && !engine.expressions.length && engine.detail.state !== 'inline') {
    return <p className="cs-empty">{engine.detail.state === 'loading' ? 'Loading the script-to-market map.' : `The script-to-market map is not available for this game: ${engine.detail.reason ?? 'not published'}.`}</p>;
  }
  const rungs = (c: (typeof m.core)[number]) => c.alternatives.length > 0 && (
    <details className="cs-more cs-more--in0">
      <summary>Other rungs of this line ({c.alternatives.length})<Icon name="chevD" size={16} /></summary>
      <ul className="cs-alts">
        {c.alternatives.map((a) => (
          <li key={a.e.id}><span>{a.label}<small>{relationWord(a.relation)}{a.extraPoints != null ? ` · ${a.extraPoints > 0 ? '+' : ''}${a.extraPoints} pts` : ''}</small></span><SidePriceTap ticker={a.e.ticker} side={a.e.side} q={quote(a.e.ticker, a.e.side)} label={a.label} hasMarket={!!a.market} /></li>
        ))}
      </ul>
    </details>
  );
  return (
    <>
      <ScenarioMarketsBlock engine={engine} s={s} m={m} quote={quote} markets={markets as Map<string, Market>} rungs={rungs} />
      {breaks.length > 0 && (
        <details className="cs-more">
          <summary>Contracts this scenario contradicts ({breaks.length})<Icon name="chevD" size={16} /></summary>
          <ul className="cs-alts">
            {breaks.map((e) => { const mk = markets.get(e.ticker); const label = sideLabel(e, mk); const q = quote(e.ticker, e.side); return <li key={e.id}><span>{label}<small>{fitSentence(engine, e)}</small><PriceWhy q={q} /></span><SidePriceTap ticker={e.ticker} side={e.side} q={q} label={label} hasMarket={!!mk} /></li>; })}
          </ul>
        </details>
      )}
      {engine.scoringResearchOnly && <p className="cs-notice" role="note"><span className="cs-lbl cs-lbl--scoring_band_uncalibrated">{LABEL_WORD.SCORING_BAND_UNCALIBRATED}</span> {SCORING_RESEARCH_NOTE}</p>}
    </>
  );
}

function ScriptDetail({ s, engine, ctx }: { s: Scenario; engine: Engine; ctx: GameCtx }) {
  const c = s.card, sc = c.script;
  const home = engine.teams.home.name, away = engine.teams.away.name;
  const evidence = sc.outcome_shape.margin_authority_evidence ?? [];
  return (
    <div className="cs-detail" data-testid="cfb-script-detail" data-script={sc.script_id}>
      <section className={`x-card cs-sec cs-scn cs-scn--s${c.tone}`} aria-label={`${c.role} scenario`}>
        <header className="cs-scn__h"><RoleChip role={c.role} tone={c.tone} /><span className="cs-arch">{c.archetype}</span></header>
        <h2 className="cs-scn__t">{c.title}</h2>
        <p className="cs-scr__lead">{c.lead}{c.rest ? ` ${c.rest}` : ''}</p>
        <div className="cs-lkbox" data-testid="cfb-likelihood">
          <p className="cs-lk"><b>{s.likelihood.rank}.</b> {s.likelihood.statement}</p>
          {s.likelihood.historical && <p className="cs-lk cs-lk--hist">{s.likelihood.historical.text} {s.likelihood.historical.range ? `${s.likelihood.historical.range}. ` : ''}<em>{s.likelihood.historical.caveat}</em></p>}
        </div>
        <h3 className="cs-h4">Why it happens</h3>
        <ol className="cs-why3">{s.why.map((x) => <li key={x}>{x}</li>)}</ol>
        {s.support.length > 0 && (
          <>
            <h3 className="cs-h4">The matchup numbers behind it</h3>
            <EvidenceList lines={s.support} />
          </>
        )}
        <h3 className="cs-h4">What breaks it</h3>
        <ul className="cs-brk" data-testid="cfb-breaks">{s.breaks.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
      <section className="x-card cs-sec" aria-labelledby="cs-mk-h" data-testid="cfb-scenario-markets">
        <div className="cs-sh"><h2 id="cs-mk-h">Ways to play this scenario</h2></div>
        <p className="cs-sub">Tap a price to open the exact contract. Each row names the matchup statistic that supports it; the price is that side’s own Kalshi ask.</p>
        <Markets engine={engine} s={s} ctx={ctx} />
      </section>
      <section className="x-card cs-sec" aria-labelledby="cs-more-h">
        <div className="cs-sh"><h2 id="cs-more-h">Deeper detail</h2></div>
        <details className="cs-more cs-more--dim">
          <summary>Full causal chain ({c.steps.length} steps)<Icon name="chevD" size={16} /></summary>
          <ol className="cs-chain cs-chain--full">
            {c.steps.map((st) => <li key={st.step}><span>{st.step}</span>{st.findings.map((f) => <FindingNote key={f.code} label={f.label} statement={f.statement} strength={f.strength} />)}</li>)}
          </ol>
        </details>
        <details className="cs-more cs-more--dim">
          <summary>Outcome shape<Icon name="chevD" size={16} /></summary>
          <Shape s={sc} home={home} away={away} />
          {sc.outcome_shape.bands.home_margin && evidence.length > 0 && <div className="cs-cited"><h4>Margin authority</h4>{evidence.map((code) => { const f = c.steps.flatMap((st) => st.findings).find((x) => x.code === code); const g = engine.findings.find((x) => x.code === code); return g && f ? <FindingNote key={code} label={f.label} statement={g.statement} strength={g.strength} /> : null; })}</div>}
          {!sc.outcome_shape.bands.home_margin && sc.outcome_shape.total_environment !== 'NOT_STATED' && <p className="cs-plain">No margin stated: the scoring environment says nothing about how close the game is, and no resolved matchup finding does either.</p>}
        </details>
        {c.against.length > 0 && (
          <details className="cs-more cs-more--dim">
            <summary>Findings against it ({c.against.length})<Icon name="chevD" size={16} /></summary>
            <div className="cs-cited">{c.against.map((f) => <FindingNote key={f.code} label={f.label} statement={f.statement} />)}</div>
          </details>
        )}
      </section>
    </div>
  );
}

export function CfbScriptTab({ ctx, engine }: { ctx: GameCtx; engine: Engine }) {
  const list = useMemo(() => scenarios(engine), [engine]);
  const [local, setLocal] = useState<string | null>(null);
  const sel = ctx.scenario ?? local;
  const cur = list.find((x) => x.card.script.script_id === sel) ?? list[0];
  const pick = (id: string) => { setLocal(id); ctx.setScenario?.(id); };
  if (!cur) {
    return (
      <section className="cs" aria-label="Game script" data-testid="cfb-script-tab">
        <div className="x-card cs-sec"><div className="cs-sh"><h2>Game Script</h2><ResearchOnly /></div><p className="cs-plain"><b>{STATUS_WORD[engine.status] ?? 'No script cleared its evidence requirement.'}</b> The matchup evidence for this game does not support any scenario yet, so none is shown rather than invented.</p></div>
      </section>
    );
  }
  return (
    <section className="cs" aria-label="Game script" data-testid="cfb-script-tab">
      <DetailNotice engine={engine} />
      <div className="cs-pick" role="group" aria-label="Scenario">
        {list.map((x) => <button key={x.card.script.script_id} type="button" className={`cs-chip cs-chip--s${x.card.tone}`} aria-pressed={x.card.script.script_id === cur.card.script.script_id} onClick={() => pick(x.card.script.script_id)}><b>{x.card.role}</b><span>{x.card.title}</span></button>)}
      </div>
      <ScriptDetail s={cur} engine={engine} ctx={ctx} />
      <p className="cs-foot"><ResearchOnly /> Scenarios are ranked by evidence; the engine publishes no probability and no price for any of them.</p>
    </section>
  );
}
