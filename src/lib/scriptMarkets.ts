// SCRIPT → MARKETS — for one CFB script, the exact contracts it supports, each with what it needs to pay, what
// breaks it, what it costs after Kalshi's fee and the other rungs of the same thesis. Everything is read from the
// engine's own script_market_map and theses; Sift adds only the fee arithmetic. Script survival counts stay counts
// ("supported in 2 of 3 scripts"): a rank or a count is never turned into a probability.
import type { Market } from '../contract/types';
import { breakEven, kalshiFee } from '../opportunity/pricing';
import { expressionLabel, findingByCode, scriptTitle, sidePrice, winsWhenText, ROLE_WORD, type Compat, type Engine, type EngineScript, type Expression, type Rung } from './scriptEngine';

export interface ScriptMarketCard {
  e: Expression;
  market: Market | undefined;
  /** The contract side in the market's words ("No — Bowling Green wins by 8+"). */
  label: string;
  /** Settlement condition in team names. */
  paysWhen: string | null;
  /** Executable price of this side and its fee-aware break-even. */
  ask: number | null;
  breakEven: number | null;
  /** How this script relates: SUPPORTED or PARTIAL with the share of the script's range it covers. */
  compat: Compat;
  coverage: number | null;
  /** Scripts in which this side loses (CONTRADICTED), by role and title. */
  losesIn: { role: string; title: string }[];
  /** Scripts that make no settlement claim about it. */
  silentIn: { role: string; title: string }[];
  /** Survival counts in words. */
  survival: string;
  /** The football conditions the supporting scripts require (engine findings). */
  conditions: string[];
  /** Thesis ladder: the other rungs of the same thesis with their relation to the core expression. */
  alternatives: { e: Expression; market: Market | undefined; label: string; ask: number | null; relation: string; extraPoints: number | null; cashesWhenCoreFails: boolean | null; isCore: boolean }[];
  /** True for a total / team-total contract whose scoring bands the engine does not calibrate. */
  researchOnly: boolean;
  /** The engine's own labels (BEST_EXPRESSION, MULTI_SCRIPT, MARKET_DISAGREEMENT …). */
  labels: string[];
}

const RELATION_WORD: Record<string, string> = {
  core: 'the core expression',
  correlated_independent_cash_path: 'cashes on its own when the core fails',
  safer_rung: 'a safer rung (needs fewer points)',
  more_aggressive_rung: 'a more aggressive rung (needs more points)',
  same_settlement: 'settles the same way',
};
export const relationWord = (r: string) => RELATION_WORD[r] ?? r.replace(/_/g, ' ');

function roleTitle(s: EngineScript) {
  return { role: ROLE_WORD[s.role], title: scriptTitle(s) };
}

/** The cards for one script (by id; the first script when null), supported first by survival score. */
export function scriptMarketCards(engine: Engine, scriptId: string | null, marketsByTicker: Map<string, Market>, limit = 8): ScriptMarketCard[] {
  if (!engine.scripts.length) return [];
  const s = engine.scripts.find((x) => x.script_id === scriptId) ?? engine.scripts[0];
  const i = engine.scripts.indexOf(s);
  const byId = new Map(engine.expressions.map((e) => [e.id, e]));
  const rungsOf = (e: Expression): { rung: Rung; core: string }[] => {
    const t = engine.theses.find((th) => th.core_expression === e.id || th.rungs.some((r) => r.expression_id === e.id));
    return t ? t.rungs.map((rung) => ({ rung, core: t.core_expression })) : [];
  };
  const list = engine.expressions
    .filter((e) => e.compat[i] === 'SUPPORTED' || e.compat[i] === 'PARTIAL')
    .sort((a, b) => (a.compat[i] === 'SUPPORTED' ? 0 : 1) - (b.compat[i] === 'SUPPORTED' ? 0 : 1) || b.survival.weighted_score - a.survival.weighted_score);
  // One card per thesis and compatibility pattern: a spread ladder's rungs that survive the same scripts collapse
  // into the engine's first choice, the rest ride along as alternatives.
  const seen = new Set<string>();
  const out: ScriptMarketCard[] = [];
  for (const e of list) {
    const k = `${e.thesis}|${e.compat.join('')}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const m = marketsByTicker.get(e.ticker);
    const ask = sidePrice(e, m);
    const supporting = engine.scripts.filter((_, j) => e.compat[j] === 'SUPPORTED' || e.compat[j] === 'PARTIAL');
    const conditions = [...new Set(supporting.flatMap((x) => x.required_findings))].map((c) => findingByCode(engine, c)?.statement).filter((x): x is string => !!x).slice(0, 4);
    const rungs = rungsOf(e);
    const alternatives = rungs
      .filter((r) => r.rung.expression_id !== e.id)
      .map((r) => {
        const alt = byId.get(r.rung.expression_id);
        if (!alt) return null;
        const am = marketsByTicker.get(alt.ticker);
        return { e: alt, market: am, label: expressionLabel(alt, am), ask: sidePrice(alt, am), relation: r.rung.is_core ? 'core' : r.rung.relation_to_core, extraPoints: r.rung.additional_requirement_points, cashesWhenCoreFails: r.rung.cashes_when_core_fails, isCore: r.rung.is_core };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .slice(0, 6);
    out.push({
      e, market: m, label: expressionLabel(e, m), paysWhen: winsWhenText(e, engine), ask, breakEven: breakEven(ask, kalshiFee(ask)),
      compat: e.compat[i], coverage: e.coverage[i] ?? null,
      losesIn: engine.scripts.filter((_, j) => e.compat[j] === 'CONTRADICTED').map(roleTitle),
      silentIn: engine.scripts.filter((_, j) => e.compat[j] === 'NEUTRAL' || e.compat[j] === 'UNMAPPABLE' || e.compat[j] === 'RESEARCH_UNCALIBRATED').map(roleTitle),
      survival: `supported in ${e.survival.supported} of ${e.survival.total_scripts} scripts${e.survival.partial ? `, partly in ${e.survival.partial}` : ''}${e.survival.contradicted ? `, contradicted by ${e.survival.contradicted}` : ''}`,
      conditions, alternatives, researchOnly: e.authority === 'RESEARCH_UNCALIBRATED', labels: e.labels,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** The contracts a script breaks: featured expressions it contradicts. */
export function scriptBreaks(engine: Engine, scriptId: string | null): Expression[] {
  if (!engine.scripts.length) return [];
  const s = engine.scripts.find((x) => x.script_id === scriptId) ?? engine.scripts[0];
  const i = engine.scripts.indexOf(s);
  return engine.expressions.filter((e) => e.compat[i] === 'CONTRADICTED' && e.labels.some((l) => l === 'BEST_EXPRESSION' || l === 'MULTI_SCRIPT' || l === 'SCRIPT_ALIGNED')).slice(0, 6);
}
