// Game Detail, Overview for a game whose research carries a Script Engine payload (CFB, and any sport that publishes one). Progressive disclosure, top to bottom:
//   1. SIFT Read hero          the payload's headline, the PRIMARY script, how the engine ranks it (it publishes no probability), the historical frequency its V2 claim states
//                              when one applies, three reasons, and the one expression the engine calls best for it, tap-through to the exact contract
//   2. Game scenarios          Primary, Secondary, Alternate, Danger as one-line tiles; each opens the Game Script tab on that scenario
//   3. Pace & efficiency       the strip: both teams, adjusted vs raw labelled, personnel context
//   4. Matchup advantages      the top three opponent-adjusted advantages, in plain words
//   5. Bets That Survive Multiple Scripts, and why this bet
//   6. Totals & halves         Kalshi's game total, team totals, first-half winner and quarter markets, research only, each priced through the quote gate
//   7. Data confidence         collapsed
// Language rules (docs/CFB_SCRIPT_ENGINE.md, enforced by tests/v3/scriptOverview.test.tsx): scripts are ranked, never given a likelihood the payload did not state; "3 of 4
// scripts" is never a percentage; no row is called +EV, a lock or a fair price; total and team-total contracts are "Scoring: research only" and never listed as surviving;
// "havoc" is never displayed as evidence; every page says "Research only". A game without a payload keeps the generic view and shows the engine's own status and reason.
import { useMemo } from 'react';
import type { Market } from '../../../contract/types';
import { LABEL_WORD, SCORING_RESEARCH_NOTE, type Engine, type Expression } from '../../../lib/scriptEngine';
import { sideLabel, useSideQuotes } from '../../data/research/scriptPrices';
import type { ScriptState } from '../../data/research/scriptEngine';
import { marketMap, scoringHidden, STATUS_WORD, survivorRows, topAdvantages, fitSentence, gapText, survivalWords, whyBet, scriptFits, GATE_WORD, type Advantage } from '../../model/scriptRead';
import { heroExpression, heroOf, marketGroups, scenarios, isHavoc, type Scenario } from '../../model/scriptStory';
import type { GameTab } from '../../nav/schemas';
import { Icon } from '../../ui/Icon';
import type { GameCtx } from '../GameShared';
import { ConfChip, DetailNotice, FindingNote, FitCells, LabelChips, PriceWhy, ResearchOnly, RoleChip, Section, SidePriceTap } from './parts';
import { PaceStrip } from './PaceStrip';
import { CoreRow, type Quote } from './ScenarioParts';

type OnTab = (t: GameTab, scenario?: string) => void;

// ------------------------------------------------------------------ 1. the hero

function Hero({ engine, quote, markets, onTab, frozen }: { engine: Engine; quote: Quote; markets: Map<string, Market>; onTab: OnTab; frozen: boolean }) {
  const hero = useMemo(() => heroOf(engine), [engine]);
  const expr = useMemo(() => heroExpression(engine, markets), [engine, markets]);
  const g = engine.generation;
  const r = engine.read;
  const sc = hero.script;
  const points = r.points.filter((p) => !isHavoc(p.text));
  const rest = [...(sc ? points : []), ...r.caveats.map((c) => ({ text: c }))];
  return (
    <section className="x-card cs-hero" aria-labelledby="cs-read-h" data-testid="cfb-read">
      <div className="cs-hero__top"><h2 id="cs-read-h" className="cs-eyebrow">SIFT Read</h2><ConfChip level={engine.confidence.level} /></div>
      <p className="cs-read">{r.headline}</p>
      {sc ? (
        <div className="cs-hero__sc" data-testid="cfb-hero-script">
          <div className="cs-hero__id"><RoleChip role={sc.card.role} tone={sc.card.tone} /><b>{sc.card.title}</b></div>
          <p className="cs-lk"><b>{sc.likelihood.rank}.</b> {sc.likelihood.statement}</p>
          {sc.likelihood.historical && <p className="cs-lk cs-lk--hist" data-testid="cfb-hero-history">{sc.likelihood.historical.text} <em>{sc.likelihood.historical.caveat}</em></p>}
          <h3 className="cs-h4">Why it happens</h3>
          <ol className="cs-why3">{hero.reasons.map((x) => <li key={x}>{x}</li>)}</ol>
        </div>
      ) : points.length > 0 ? <ul className="cs-pts">{points.map((p) => <li key={p.text}>{p.text}</li>)}</ul> : null}
      {sc && expr && (
        <div className="cs-best">
          <h3 className="cs-h4">Best expression of this script</h3>
          <ul className="cs-exl"><CoreRow engine={engine} c={expr} q={quote(expr.e.ticker, expr.e.side)} stat={sc.head} testid="cfb-hero-expr" full /></ul>
        </div>
      )}
      {sc && !expr && <p className="cs-foot">No winner or margin contract that fits this script is listed on Kalshi.</p>}
      {sc && (
        <div className="cs-go2">
          <button type="button" className="v3-btn" onClick={() => onTab('script', sc.card.script.script_id)}>See why and what breaks it<Icon name="chevR" size={18} /></button>
        </div>
      )}
      {rest.length > 0 && (
        <details className="cs-more">
          <summary>{sc ? 'The full read and caveats' : `Caveats (${r.caveats.length})`}<Icon name="chevD" size={16} /></summary>
          <ul className="cs-pts">{rest.map((p) => <li key={p.text}>{p.text}</li>)}</ul>
        </details>
      )}
      <p className="cs-foot"><ResearchOnly /> Market-blind football read. Scripts are ranked, never given a probability. Football data through {g.football_data_cutoff.slice(0, 10)}.{frozen ? ' Pregame research, frozen before kickoff and not a graded result.' : ''}</p>
    </section>
  );
}

// ------------------------------------------------------------------ 2. scenarios

/** One scenario as a one-line tile; a tap opens it on the Game Script tab. */
export function ScenarioTile({ s, onOpen }: { s: Scenario; onOpen: () => void }) {
  const c = s.card;
  return (
    <button type="button" className={`cs-tile cs-tile--s${c.tone}`} data-testid="cfb-script" aria-label={`${c.role} scenario: ${c.title}. ${s.likelihood.rank}. Open`} onClick={onOpen}>
      <span className="cs-tile__top"><RoleChip role={c.role} tone={c.tone} /><span className="cs-tile__rank">{s.likelihood.rank.replace(' by matchup evidence', '')}</span></span>
      <b className="cs-tile__t">{c.title}</b>
      <span className="cs-tile__l">{c.lead}</span>
      <Icon name="chevR" size={18} />
    </button>
  );
}

function Scenarios({ engine, onTab }: { engine: Engine; onTab: OnTab }) {
  const list = useMemo(() => scenarios(engine), [engine]);
  return (
    <Section id="cs-scripts-h" title="Game scenarios" sub="Ranked by matchup evidence: Primary is the best-supported path, Danger the plausible path that breaks it. The engine publishes no probability for any of them." testid="cfb-scripts">
      {list.length ? <div className="cs-list">{list.map((s) => <ScenarioTile key={s.card.script.script_id} s={s} onOpen={() => onTab('script', s.card.script.script_id)} />)}</div>
        : <p className="cs-empty">{STATUS_WORD[engine.status] ?? 'No script cleared its evidence requirement.'} Nothing is invented.</p>}
    </Section>
  );
}

// ------------------------------------------------------------------ 3. matchup advantages

const rankText = (r: { rank: number | null; of: number | null }) => (r.rank != null ? `#${r.rank} of ${r.of}` : 'unranked');

export function AdvantageCard({ a }: { a: Advantage }) {
  return (
    <article className="cs-adv" data-testid="cfb-advantage">
      <header>
        <b>{a.dimensionWord}</b>
        {a.strength ? <i className={`cs-str cs-str--${a.strength.toLowerCase()}`}>{a.strength === 'STRONG' ? 'Strong' : 'Moderate'}</i> : <i className="cs-str">Larger gaps, no finding</i>}
      </header>
      <p className="cs-adv__who">{a.team} against {a.opponent}{a.metric ? <> <span>· {a.metric.name}</span></> : null}</p>
      {(a.offense || a.defense) && (
        <dl className="cs-ranks">
          {a.offense && <div><dt>{a.offense.team} offense</dt><dd><b className="num">{rankText(a.offense)}</b>{a.offense.value && <small>{a.offense.value} {a.offense.adjusted ? 'adjusted' : 'raw'}</small>}</dd></div>}
          {a.defense && <div><dt>{a.defense.team} defense</dt><dd><b className="num">{rankText(a.defense)}</b>{a.defense.value && <small>{a.defense.value} {a.defense.adjusted ? 'adjusted' : 'raw'}</small>}</dd></div>}
        </dl>
      )}
      {a.edge.forward != null && <p className="cs-gap">Opponent-adjusted gap <b className="num">{gapText(a.edge.forward)}</b> for {a.team}’s offense{a.edge.reverse != null && <>, <b className="num">{gapText(a.edge.reverse)}</b> for {a.opponent}’s</>}.</p>}
      {(a.metric?.what || a.why || a.statement) && (
        <details className="cs-more">
          <summary>What it measures and why it matters<Icon name="chevD" size={16} /></summary>
          {a.metric?.what && <p className="cs-plain"><b>What it measures</b> {a.metric.what}</p>}
          {a.why && <p className="cs-plain"><b>Why it matters</b> {a.why}</p>}
          {a.statement && <FindingNote label="The engine’s finding" statement={a.statement} />}
        </details>
      )}
    </article>
  );
}

function Advantages({ engine }: { engine: Engine }) {
  const top = useMemo(() => topAdvantages(engine, 3), [engine]);
  const gaps = top.some((a) => a.kind === 'gap');
  return (
    <Section id="cs-adv-h" title="Matchup advantages" sub={`${gaps ? 'The engine\u2019s findings first, then the largest opponent-adjusted gaps it published between an offense and the defense it faces.' : 'The strongest opponent-adjusted differences the engine found.'} Ranks are among FBS teams, #1 best. Adjusted gaps are standard deviations: positive favours the offense named.`} testid="cfb-advantages">
      <DetailNotice engine={engine} />
      {top.length ? <div className="cs-list">{top.map((a) => <AdvantageCard key={a.code} a={a} />)}</div> : <p className="cs-empty">No opponent-adjusted matchup difference clears its evidence threshold, so none is shown.</p>}
    </Section>
  );
}

// ------------------------------------------------------------------ 4. bets that survive multiple scripts, and why

function WhyThisBet({ engine, e, labelOf }: { engine: Engine; e: Expression; labelOf: (id: string) => string }) {
  const w = useMemo(() => whyBet(engine, e, labelOf), [engine, e, labelOf]);
  return (
    <div className="cs-why" role="region" aria-label="Why this bet">
      <h4>Scripts</h4>
      <ul className="cs-whyscr">
        {w.fits.map((f) => (
          <li key={f.script.script_id}><i className={`cs-dot cs-dot--s${f.tone}`} aria-hidden="true" /><b>{f.role}</b> {f.title}: <span className={`cs-c cs-c--${f.compat.toLowerCase()}`}>{f.word}</span>{f.compat === 'PARTIAL' && f.coverage != null ? ` (part of its range)` : ''}</li>
        ))}
      </ul>
      {w.paysWhen && <p className="cs-plain"><b>Pays when</b> {w.paysWhen}.</p>}
      <h4>Supporting evidence</h4>
      {w.forFindings.length ? w.forFindings.map((f) => <FindingNote key={f.code} label={f.label} statement={f.statement} />) : <p className="cs-empty">The supporting scripts name no required finding.</p>}
      <h4>Counterarguments</h4>
      {w.againstFindings.length || w.contradictedBy.length ? (
        <>
          {w.contradictedBy.map((f) => <p key={f.script.script_id} className="cs-plain">The {f.role.toLowerCase()} script ({f.title}) contradicts this side.</p>)}
          {w.againstFindings.map((f) => <FindingNote key={f.code} label={f.label} statement={f.statement} />)}
        </>
      ) : <p className="cs-empty">No published finding cuts against the scripts that support it, and no script contradicts it.</p>}
      {w.metrics.length > 0 && <><h4>Matchup evidence</h4><ul className="cs-whyscr">{w.metrics.map((m) => <li key={m.ref}>{m.text}</li>)}</ul></>}
      {w.correlation.length > 0 && <><h4>With the other featured rows</h4><ul className="cs-whyscr">{w.correlation.map((c) => <li key={c.label}>{c.label}: {c.relation}{c.bothLoseWhen ? `, both lose when ${c.bothLoseWhen}` : ''}</li>)}</ul></>}
      <p className="cs-foot">The price ranks ways to express the same football view; it never created the view. Research only: not a judgment of price.</p>
    </div>
  );
}

function Survivors({ engine, ctx, quote, markets }: { engine: Engine; ctx: GameCtx; quote: Quote; markets: Map<string, Market> }) {
  const rows = useMemo(() => survivorRows(engine, 6), [engine]);
  const hidden = scoringHidden(engine);
  const byId = useMemo(() => new Map(engine.expressions.map((e) => [e.id, e])), [engine]);
  const labelOf = useMemo(() => (id: string) => { const o = byId.get(id); return o ? sideLabel(o, markets.get(o.ticker)) : id; }, [byId, markets]);
  const empty = !engine.expressions.length && engine.detail.state !== 'inline'
    ? (engine.detail.state === 'loading' ? 'Loading the script-to-market map.' : `The script-to-market map is not available for this game: ${engine.detail.reason ?? 'not published'}.`)
    : engine.scripts.length ? 'No contract side is supported by more than one script, so none is listed.' : 'No scripts, so no contract is mapped.';
  return (
    <Section id="cs-surv-h" title="Bets That Survive Multiple Scripts" sub="Contract sides that more than one script supports, by how many scripts they survive. A count of scripts, never a probability; the price is that side’s own Kalshi ask, before fees." testid="cfb-survivors">
      {ctx.detailError != null && !ctx.detail && <p className="cs-notice cs-notice--warn" role="status">The Kalshi contract list for this game could not be read, so the rows below carry no price.</p>}
      {rows.length ? (
        <ul className="cs-bets">
          {rows.map((e) => {
            const m = markets.get(e.ticker);
            const label = sideLabel(e, m);
            const fits = scriptFits(engine, e);
            const q = quote(e.ticker, e.side);
            return (
              <li key={e.id} className="cs-bet" data-testid="cfb-survivor" data-side={e.side} data-ticker={e.ticker}>
                <div className="cs-bet__top">
                  <div className="cs-bet__m">
                    <b>{label}</b>
                    {e.similar > 0 && <small>+{e.similar} similar {e.similar === 1 ? 'line' : 'lines'} with the same script support</small>}
                  </div>
                  <SidePriceTap ticker={e.ticker} side={e.side} q={q} label={label} hasMarket={!!m} />
                </div>
                <PriceWhy q={q} />
                <div className="cs-bet__fit">
                  <FitCells fits={fits} label={fitSentence(engine, e)} />
                  <span>{survivalWords(e)}</span>
                  <LabelChips labels={e.labels} />
                </div>
                <p className="cs-bet__s">{fitSentence(engine, e)}</p>
                <details className="cs-more">
                  <summary>Why this bet<Icon name="chevD" size={16} /></summary>
                  <WhyThisBet engine={engine} e={e} labelOf={labelOf} />
                </details>
              </li>
            );
          })}
        </ul>
      ) : <p className="cs-empty">{empty}</p>}
      {engine.scoringResearchOnly && (
        <p className="cs-notice" role="note"><span className="cs-lbl cs-lbl--scoring_band_uncalibrated">{LABEL_WORD.SCORING_BAND_UNCALIBRATED}</span> {SCORING_RESEARCH_NOTE}{hidden > 0 ? ` ${hidden} total or team-total contract${hidden === 1 ? '' : 's'} the engine featured ${hidden === 1 ? 'is' : 'are'} not listed.` : ''}</p>
      )}
      {engine.disagreement && <p className="cs-notice" role="note"><b>Market disagreement.</b> {engine.disagreement.rule}. {engine.disagreement.note}</p>}
      <p className="cs-foot"><ResearchOnly /> No validated CFB pricing source exists: a row is how well a contract fits the scripts, not a judgment of its price.</p>
    </Section>
  );
}

// ------------------------------------------------------------------ 5. totals and halves

/** Kalshi's total, team-total, first-half and quarter prices for the game, at the market's own central line. Research only: the engine maps none of them with calibrated authority. */
function OtherMarkets({ ctx, quote }: { ctx: GameCtx; quote: Quote }) {
  const groups = useMemo(() => marketGroups(ctx.detail?.markets), [ctx.detail]);
  const hasQuarter = (ctx.detail?.markets ?? []).some((m) => /quarter/i.test(`${m.market_family} ${m.period ?? ''}`));
  if (!ctx.detail) return null;
  return (
    <Section id="cs-mk-h" title="Totals, team totals and halves" sub="Kalshi’s own central line for each. Over is the YES side, Under the NO side of the same contract. The engine’s scoring ranges are descriptive, so these are research links, not scenario fits." testid="cfb-markets">
      {groups.length ? (
        <ul className="cs-mgs">
          {groups.map((g) => (
            <li key={g.key} className="cs-mg" data-testid="cfb-market-group">
              <b>{g.title}</b>
              <small>{g.note}</small>
              <div className="cs-opts">
                {g.options.map((o) => {
                  const q = quote(o.ticker, o.side);
                  return <div key={`${o.ticker}${o.side}`} className="cs-opt"><span>{o.label}</span><SidePriceTap ticker={o.ticker} side={o.side} q={q} label={`${g.title}, ${o.label}`} hasMarket /></div>;
                })}
              </div>
              {g.options.map((o) => <PriceWhy key={`w${o.ticker}${o.side}`} q={quote(o.ticker, o.side)} />).slice(0, 1)}
            </li>
          ))}
        </ul>
      ) : <p className="cs-empty">Kalshi lists no total, team-total or half contract for this game.</p>}
      {!hasQuarter && groups.length > 0 && <p className="cs-foot">Kalshi lists no quarter markets for this game.</p>}
      <p className="cs-foot"><ResearchOnly /> {LABEL_WORD.SCORING_BAND_UNCALIBRATED}: a price here is only what Kalshi asks.</p>
    </Section>
  );
}

// ------------------------------------------------------------------ 6. data confidence

export function Confidence({ engine }: { engine: Engine }) {
  const c = engine.confidence;
  const g = engine.generation;
  return (
    <Section id="cs-conf-h" title="Data confidence" right={<ConfChip level={c.level} />} sub={c.describes} testid="cfb-confidence">
      <details className="cs-more">
        <summary>What was checked, known and not known<Icon name="chevD" size={16} /></summary>
      <ul className="cs-gates">
        {Object.entries(c.gates).map(([k, ok]) => <li key={k} className={ok ? 'is-ok' : 'is-bad'}><Icon name={ok ? 'check' : 'close'} size={16} /><span>{GATE_WORD[k] ?? k.replace(/_/g, ' ')}</span><span className="cs-sr">{ok ? ' passed' : ' not passed'}</span></li>)}
      </ul>
      <div className="cs-cols">
        <div><h4>Known</h4><ul className="cs-pts">{c.known.map((k) => <li key={k}>{k}</li>)}</ul></div>
        <div><h4>Not known</h4><ul className="cs-pts">{[...c.unknown, ...c.reasons].map((k) => <li key={k}>{k}</li>)}</ul></div>
      </div>
      </details>
      <p className="cs-foot">Football artifact {g.artifact_hash.slice(0, 12)} · generated {g.generated_at} · data through {g.football_data_cutoff} · {g.methodology_version}</p>
    </Section>
  );
}

// ------------------------------------------------------------------ the Overview block

function Ready({ engine, ctx, onTab }: { engine: Engine; ctx: GameCtx; onTab: OnTab }) {
  const markets = useMemo(() => marketMap(ctx.detail?.markets), [ctx.detail]);
  const groups = useMemo(() => marketGroups(ctx.detail?.markets), [ctx.detail]);
  // Every price on the page is registered with the quote store once, and judged by the quote gate: a withheld price says why.
  const tickers = useMemo(() => {
    const primary = engine.scripts[0];
    const hero = primary ? heroExpression(engine, markets) : null;
    return [...new Set([...(hero ? [hero.e.ticker] : []), ...survivorRows(engine, 6).map((e) => e.ticker), ...groups.flatMap((g) => g.options.map((o) => o.ticker))])];
  }, [engine, markets, groups]);
  const quote = useSideQuotes(ctx.g, ctx.detail, ctx.startMs, tickers);
  return (
    <div className="cs" data-testid="cfb-script-overview">
      <Hero engine={engine} quote={quote} markets={markets} onTab={onTab} frozen={ctx.g.phase !== 'pregame'} />
      <Scenarios engine={engine} onTab={onTab} />
      <PaceStrip engine={engine} />
      <Advantages engine={engine} />
      <Survivors engine={engine} ctx={ctx} quote={quote} markets={markets} />
      <OtherMarkets ctx={ctx} quote={quote} />
      <Confidence engine={engine} />
      <div className="cs-go">
        <button type="button" className="v3-btn v3-btn--ghost" onClick={() => onTab('script')}>Game Script, every scenario<Icon name="chevR" size={18} /></button>
        <button type="button" className="v3-btn v3-btn--ghost" onClick={() => onTab('matchup')}>Matchup, every metric<Icon name="chevR" size={18} /></button>
      </div>
    </div>
  );
}

/** A game the engine published nothing for keeps the generic view and says why, in the engine’s own words. */
export function NoScript({ status, reason }: { status: string | null; reason: string | null }) {
  return (
    <div className="x-card cs-sec cs-none" role="region" aria-label="Script research" data-testid="cfb-no-script">
      <div className="cs-sh"><h2>Game script</h2><ResearchOnly /></div>
      <p className="cs-plain"><b>No script research for this game.</b> {status ? <>The engine’s status is {status.replace(/_/g, ' ').toLowerCase()}. </> : null}{reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}${/[.!?]$/.test(reason) ? '' : '.'} ` : 'The publication carries no Script Engine read for this game. '}The market and team views below are the generic ones.</p>
    </div>
  );
}

/** The Overview block for a Script Engine game; renders nothing for a sport whose research carries no engine and that is not expected to. */
export function ScriptOverview({ ctx, onTab }: { ctx: GameCtx; onTab: OnTab }) {
  const s: ScriptState | undefined = ctx.script;
  const { g } = ctx;
  if (!s || g.provenance !== 'publication') return null;
  if (s.kind === 'loading') return g.slug === 'cfb' ? <div className="v3-skel cs-skel" role="status" aria-label="Loading script research" /> : null;
  if (s.kind === 'ready') return <Ready engine={s.engine} ctx={ctx} onTab={onTab} />;
  if (s.kind === 'unavailable') return <NoScript status={s.status} reason={s.reason} />;
  return g.slug === 'cfb' ? <NoScript status={null} reason={s.reason} /> : null;
}

