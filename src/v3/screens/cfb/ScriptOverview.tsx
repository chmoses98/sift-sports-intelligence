// Game Detail, Overview for a game whose research carries a Script Engine payload (CFB, and any sport that publishes one). It shows DIRECTLY, in this order:
//   1. SIFT Read                 the sentences the engine generated from structured findings, before any price was read
//   2. Matchup advantages        the top three opponent-adjusted advantages, in plain words (what the metric is, the ranks, why it matters)
//   3. Game scripts              Primary, Secondary, Alternate, Danger as compact cards; each step of the causal chain cites the findings behind it
//   4. Bets That Survive Multiple Scripts   the contract sides that more than one script supports, with the scripts that support and contradict them and the side's own Kalshi price
//   5. Why this bet              findings for and against, per row
//   6. Data confidence
// Language rules (docs/CFB_SCRIPT_ENGINE.md, enforced by tests/v3/scriptOverview.test.tsx): scripts are ranked, never given a likelihood; "3 of 4 scripts" is
// never a percentage; no row is called +EV, a lock or a fair price; total and team-total contracts are "Scoring: research only" and never listed as surviving;
// every page says "Research only". A game without a payload keeps the generic view and shows the engine's own status and reason, never a blank.
import { useMemo } from 'react';
import { LABEL_WORD, SCORING_RESEARCH_NOTE, type Engine, type Expression } from '../../../lib/scriptEngine';
import { sideLabel, useSideAsks } from '../../data/research/scriptPrices';
import type { ScriptState } from '../../data/research/scriptEngine';
import { marketMap, scoringHidden, scriptCards, STATUS_WORD, survivorRows, topAdvantages, fitSentence, gapText, survivalWords, whyBet, scriptFits, GATE_WORD, type Advantage, type ScriptCard } from '../../model/scriptRead';
import type { GameTab } from '../../nav/schemas';
import { PriceTap } from '../../nav/Targets';
import { Icon } from '../../ui/Icon';
import type { GameCtx } from '../GameShared';
import { ConfChip, DetailNotice, FindingNote, FitCells, LabelChips, ResearchOnly, Section } from './parts';

// ------------------------------------------------------------------ 1. SIFT Read

function ReadCard({ engine, frozen }: { engine: Engine; frozen: boolean }) {
  const r = engine.read;
  const g = engine.generation;
  return (
    <Section id="cs-read-h" title="SIFT Read" right={<ConfChip level={engine.confidence.level} />} testid="cfb-read">
      <p className="cs-read">{r.headline}</p>
      {r.points.length > 0 && <ul className="cs-pts">{r.points.map((p) => <li key={p.text}>{p.text}</li>)}</ul>}
      {r.caveats.length > 0 && (
        <details className="cs-more">
          <summary>Caveats ({r.caveats.length})<Icon name="chevD" size={16} /></summary>
          <ul className="cs-pts">{r.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
        </details>
      )}
      <p className="cs-foot"><ResearchOnly /> Market-blind football read. Scripts are ranked, never given a probability. Football data through {g.football_data_cutoff.slice(0, 10)}.{frozen ? ' Pregame research, frozen before kickoff and not a graded result.' : ''}</p>
    </Section>
  );
}

// ------------------------------------------------------------------ 2. matchup advantages

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
          {a.offense && <div><dt>{a.offense.team} offense</dt><dd><b className="num">{rankText(a.offense)}</b>{a.offense.value && <small>{a.offense.value}</small>}</dd></div>}
          {a.defense && <div><dt>{a.defense.team} defense</dt><dd><b className="num">{rankText(a.defense)}</b>{a.defense.value && <small>{a.defense.value}</small>}</dd></div>}
        </dl>
      )}
      {a.edge.forward != null && <p className="cs-gap">Opponent-adjusted gap <b className="num">{gapText(a.edge.forward)}</b> for {a.team}’s offense{a.edge.reverse != null && <>, <b className="num">{gapText(a.edge.reverse)}</b> for {a.opponent}’s</>}.</p>}
      {a.metric?.what && <p className="cs-plain"><b>What it measures</b> {a.metric.what}</p>}
      {a.why && <p className="cs-plain"><b>Why it matters</b> {a.why}</p>}
      {a.statement && <FindingNote label="The engine’s finding" statement={a.statement} />}
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

// ------------------------------------------------------------------ 3. scripts

export function ScriptCardView({ c, steps = 2 }: { c: ScriptCard; steps?: number }) {
  const shown = c.steps.slice(0, steps);
  const more = c.steps.length - shown.length;
  return (
    <article className={`cs-scr cs-scr--s${c.tone}`} data-testid="cfb-script" aria-label={`${c.role} script: ${c.title}`}>
      <header>
        <span className="cs-role">{c.role}</span>
        <span className="cs-arch">{c.archetype}</span>
      </header>
      <h3>{c.title}</h3>
      <p className="cs-scr__lead">{c.lead}</p>
      {c.steps.length > 0 && (
        <ol className="cs-chain">
          {shown.map((s) => (
            <li key={s.step}><span>{s.step}</span>{s.findings.length > 0 && <small>{s.findings.map((f) => f.label).join(' · ')}</small>}</li>
          ))}
        </ol>
      )}
      {(more > 0 || c.rest || c.against.length > 0) && (
        <details className="cs-more">
          <summary>{more > 0 ? `Full causal chain (${c.steps.length} steps)` : 'More detail'}<Icon name="chevD" size={16} /></summary>
          {c.rest && <p className="cs-plain">{c.rest}</p>}
          {more > 0 && (
            <ol className="cs-chain cs-chain--full" start={shown.length + 1}>
              {c.steps.slice(shown.length).map((s) => (
                <li key={s.step}><span>{s.step}</span>{s.findings.map((f) => <FindingNote key={f.code} label={f.label} statement={f.statement} strength={f.strength} />)}</li>
              ))}
            </ol>
          )}
          {shown.some((s) => s.findings.length > 0) && (
            <div className="cs-cited"><h4>Findings behind the first {shown.length} steps</h4>{shown.flatMap((s) => s.findings).filter((f, i, all) => all.findIndex((x) => x.code === f.code) === i).map((f) => <FindingNote key={f.code} label={f.label} statement={f.statement} strength={f.strength} />)}</div>
          )}
          {c.against.length > 0 && <div className="cs-cited"><h4>Findings against this script</h4>{c.against.map((f) => <FindingNote key={f.code} label={f.label} statement={f.statement} />)}</div>}
        </details>
      )}
    </article>
  );
}

function Scripts({ engine }: { engine: Engine }) {
  const cards = useMemo(() => scriptCards(engine), [engine]);
  return (
    <Section id="cs-scripts-h" title="Game scripts" sub="Ranked by matchup evidence: Primary is the best-supported path, Danger the plausible path that breaks it. The engine publishes no likelihoods." testid="cfb-scripts">
      {cards.length ? <div className="cs-list">{cards.map((c) => <ScriptCardView key={c.script.script_id} c={c} />)}</div>
        : <p className="cs-empty">{STATUS_WORD[engine.status] ?? 'No script cleared its evidence requirement.'} Nothing is invented.</p>}
    </Section>
  );
}

// ------------------------------------------------------------------ 4 + 5. bets that survive multiple scripts, and why

/** A contract side's price as a tap on the exact-contract sheet: "YES 57¢" / "NO 43¢", or "—" when no current quote passes the gate. */
export function SidePriceTap({ e, ask, label, hasMarket }: { e: Expression; ask: number | null; label: string; hasMarket: boolean }) {
  const body = <><small>{e.side}</small><b className="num">{ask != null ? `${ask}¢` : '—'}</b></>;
  if (!hasMarket) return <span className="cs-px is-none" aria-label={`${label}: no contract listed`}>{body}</span>;
  return <PriceTap ticker={e.ticker} className="cs-px" label={`${label}: ${e.side} ask ${ask != null ? `${ask} cents` : 'unavailable'}. Open exact contract`}>{body}</PriceTap>;
}

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

function Survivors({ engine, ctx }: { engine: Engine; ctx: GameCtx }) {
  const rows = useMemo(() => survivorRows(engine, 6), [engine]);
  const markets = useMemo(() => marketMap(ctx.detail?.markets), [ctx.detail]);
  const ask = useSideAsks(ctx.g, ctx.detail, ctx.startMs, useMemo(() => rows.map((e) => e.ticker), [rows]));
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
          {rows.map((e, i) => {
            const m = markets.get(e.ticker);
            const label = sideLabel(e, m);
            const fits = scriptFits(engine, e);
            return (
              <li key={e.id} className="cs-bet" data-testid="cfb-survivor" data-side={e.side} data-ticker={e.ticker}>
                <div className="cs-bet__top">
                  <div className="cs-bet__m">
                    <b>{label}</b>
                    {e.similar > 0 && <small>+{e.similar} similar {e.similar === 1 ? 'line' : 'lines'} with the same script support</small>}
                  </div>
                  <SidePriceTap e={e} ask={ask(e.ticker, e.side)} label={label} hasMarket={!!m} />
                </div>
                <div className="cs-bet__fit">
                  <FitCells fits={fits} label={fitSentence(engine, e)} />
                  <span>{survivalWords(e)}</span>
                  <LabelChips labels={e.labels} />
                </div>
                <p className="cs-bet__s">{fitSentence(engine, e)}</p>
                <details className="cs-more" open={i === 0}>
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

// ------------------------------------------------------------------ 6. data confidence

export function Confidence({ engine }: { engine: Engine }) {
  const c = engine.confidence;
  const g = engine.generation;
  return (
    <Section id="cs-conf-h" title="Data confidence" right={<ConfChip level={c.level} />} sub={c.describes} testid="cfb-confidence">
      <ul className="cs-gates">
        {Object.entries(c.gates).map(([k, ok]) => <li key={k} className={ok ? 'is-ok' : 'is-bad'}><Icon name={ok ? 'check' : 'close'} size={16} /><span>{GATE_WORD[k] ?? k.replace(/_/g, ' ')}</span><span className="cs-sr">{ok ? ' passed' : ' not passed'}</span></li>)}
      </ul>
      <div className="cs-cols">
        <div><h4>Known</h4><ul className="cs-pts">{c.known.map((k) => <li key={k}>{k}</li>)}</ul></div>
        <div><h4>Not known</h4><ul className="cs-pts">{[...c.unknown, ...c.reasons].map((k) => <li key={k}>{k}</li>)}</ul></div>
      </div>
      <p className="cs-foot">Football artifact {g.artifact_hash.slice(0, 12)} · generated {g.generated_at} · data through {g.football_data_cutoff} · {g.methodology_version}</p>
    </Section>
  );
}

// ------------------------------------------------------------------ the Overview block

function Ready({ engine, ctx, onTab }: { engine: Engine; ctx: GameCtx; onTab: (t: GameTab) => void }) {
  return (
    <div className="cs" data-testid="cfb-script-overview">
      <ReadCard engine={engine} frozen={ctx.g.phase !== 'pregame'} />
      <Advantages engine={engine} />
      <Scripts engine={engine} />
      <Survivors engine={engine} ctx={ctx} />
      <Confidence engine={engine} />
      <div className="cs-go">
        <button type="button" className="v3-btn v3-btn--ghost" onClick={() => onTab('script')}>Game Script, every step<Icon name="chevR" size={18} /></button>
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
export function ScriptOverview({ ctx, onTab }: { ctx: GameCtx; onTab: (t: GameTab) => void }) {
  const s: ScriptState | undefined = ctx.script;
  const { g } = ctx;
  if (!s || g.provenance !== 'publication') return null;
  if (s.kind === 'loading') return g.slug === 'cfb' ? <div className="v3-skel cs-skel" role="status" aria-label="Loading script research" /> : null;
  if (s.kind === 'ready') return <Ready engine={s.engine} ctx={ctx} onTab={onTab} />;
  if (s.kind === 'unavailable') return <NoScript status={s.status} reason={s.reason} />;
  return g.slug === 'cfb' ? <NoScript status={null} reason={s.reason} /> : null;
}

