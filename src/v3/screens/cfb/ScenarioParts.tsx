// The priced expressions of one scenario: the calibrated contracts the engine supports for it (winner / margin), then the scoring lines as research links, each a
// tap on the exact-contract sheet beside the matchup statistic that supports it. Prices come through the quote gate (useSideQuotes), and a withheld one says why.
import type { Market } from '../../../contract/types';
import type { ReactNode } from 'react';
import { LABEL_WORD, type Engine } from '../../../lib/scriptEngine';
import type { ScriptMarketCard } from '../../../lib/scriptMarkets';
import { sideLabel, type SideQuote } from '../../data/research/scriptPrices';
import { breakEvenPct } from '../../model/format';
import { paysWhenPlain } from '../../model/scriptStory';
import type { ScenarioMarkets, ScoringPick, Scenario } from '../../model/scriptStory';
import { LabelChips, PriceWhy, ResearchOnly, SidePriceTap } from './parts';

export type Quote = (ticker: string, side: 'YES' | 'NO') => SideQuote;

/** Every ticker a scenario's rows (and their ladder rungs) name, so the prices are registered with the quote store once. */
export function scenarioTickers(m: ScenarioMarkets): string[] {
  return [...new Set([...m.core.flatMap((c) => [c.e.ticker, ...c.alternatives.map((a) => a.e.ticker)]), ...m.scoring.map((s) => s.e.ticker)])];
}

export function CoreRow({ c, q, stat, engine, testid = 'cfb-script-market', full = false, children }: { c: ScriptMarketCard; q: SideQuote; stat?: string | null; engine: Engine; testid?: string; full?: boolean; children?: ReactNode }) {
  const pays = paysWhenPlain(c.e, engine) ?? c.paysWhen;
  return (
    <li className="cs-ex" data-testid={testid} data-ticker={c.e.ticker} data-side={c.e.side}>
      <div className="cs-ex__top">
        <div className="cs-ex__m">
          <b>{c.label}</b>
          <small>{c.compat === 'SUPPORTED' ? 'Pays across this whole scenario' : 'Pays in part of this scenario’s range'}{c.ask != null && q.ask != null ? ` · break-even ${breakEvenPct(q.ask)}¢ with the fee` : ''}</small>
        </div>
        <SidePriceTap ticker={c.e.ticker} side={c.e.side} q={q} label={c.label} hasMarket={!!c.market} />
      </div>
      <LabelChips labels={c.labels.filter((l) => l !== 'CONTRADICTED')} />
      {pays && <p className="cs-ex__s"><b>Pays when</b> {pays}.</p>}
      {stat && <p className="cs-ex__s cs-ex__stat"><b>Backed by</b> {stat}.</p>}
      <PriceWhy q={q} full={full} />
      {children}
    </li>
  );
}

export function ScoringRow({ p, q }: { p: ScoringPick; q: SideQuote }) {
  const side = p.e.side;
  const label = sideLabel(p.e, p.market);
  return (
    <li className="cs-ex is-research" data-testid="cfb-script-scoring" data-ticker={p.e.ticker} data-side={side}>
      <div className="cs-ex__top">
        <div className="cs-ex__m">
          <b>{label}</b>
          <small>{p.band ? `Descriptive range ${p.band} ${p.relation === 'covers' ? 'covers this line' : 'overlaps this line'}` : 'Descriptive range'} · <ResearchOnly /></small>
        </div>
        <SidePriceTap ticker={p.e.ticker} side={side} q={q} label={label} hasMarket={!!p.market} />
      </div>
      <p className="cs-ex__s"><b>Pays when</b> {p.label}.</p>
      {p.stat && <p className="cs-ex__s cs-ex__stat"><b>Matchup context</b> {p.stat}.</p>}
      <PriceWhy q={q} />
    </li>
  );
}

/**
 * The expressions block of a scenario. `limit` trims it for the Overview; the Script tab shows all and adds the ladder rungs. The scoring group is always labelled research
 * only (the engine's scoring ranges are descriptive), and a script that states no total range says so rather than offering a total as supported.
 */
export function ScenarioMarketsBlock({ engine, s, m, quote, markets, limit, rungs }: { engine: Engine; s: Scenario; m: ScenarioMarkets; quote: Quote; markets: Map<string, Market>; limit?: number; rungs?: (c: ScriptMarketCard) => ReactNode }) {
  const lead = s.head;
  const core = limit ? m.core.slice(0, limit) : m.core;
  const scoring = limit ? m.scoring.slice(0, limit) : m.scoring;
  return (
    <>
      {core.length > 0 && lead && <p className="cs-backed" data-testid="cfb-backed"><b>Backed by</b> {lead}.</p>}
      {core.length ? <ul className="cs-exl">{core.map((c) => <CoreRow key={c.e.id} engine={engine} c={c} q={quote(c.e.ticker, c.e.side)}>{rungs?.(c)}</CoreRow>)}</ul> : <p className="cs-empty">The engine supports no winner or margin contract for this scenario.</p>}
      {(scoring.length > 0 || engine.scoringResearchOnly) && (
        <>
          <h4 className="cs-h4">Scoring lines <span className="cs-lbl cs-lbl--scoring_band_uncalibrated">{LABEL_WORD.SCORING_BAND_UNCALIBRATED}</span></h4>
          {scoring.length ? <ul className="cs-exl">{scoring.map((p) => <ScoringRow key={p.e.id} p={p} q={quote(p.e.ticker, p.e.side)} />)}</ul> : <p className="cs-empty">The engine states no point range for this scenario that relates to a listed team total.</p>}
          {!m.statesTotal && <p className="cs-foot">This scenario states no total-points range or scoring environment, so no game total is linked to it.</p>}
        </>
      )}
      {markets.size === 0 && <p className="cs-notice cs-notice--warn" role="status">The Kalshi contract list for this game is not loaded, so these rows carry no price.</p>}
    </>
  );
}
