// A small, auditable bridge between published game-script scenarios and both sides of priced
// full-game margin markets. This is context, not a betting recommendation or calibrated win rate.
// The simulator publishes coarse margin buckets; totals/props/periods cannot be attributed to them.
import type { Market, ModelPrice } from '../contract/types';
import { quoteFreshness } from '../live/freshness';
import { kalshiFee, breakEven } from '../opportunity/pricing';
import { scriptFit, type Fit, type ScriptFit, type ScriptSet } from '../lib/scripts';

export type ScriptSide = 'YES' | 'NO';

export interface ScriptMarketRow {
  market: Market;
  side: ScriptSide;
  ask: number;
  /** Published model fair probability on this side, when it exists; not independently validated here. */
  model: number | null;
  /** Model minus fee-inclusive break-even; context only, never a claimed positive edge. */
  modelMinusBreakEven: number | null;
  /** Guaranteed / partial / excluded compatibility with each coarse simulated margin bucket. */
  fit: ScriptFit;
}

function invertedFit(fit: ScriptFit, set: ScriptSet): ScriptFit {
  const fits: Fit[] = fit.fits.map((f) => f === 'yes' ? 'no' : f === 'no' ? 'yes' : 'part');
  const coverage = fits.reduce((a, f, i) => a + (f === 'yes' ? set.scripts[i].share : 0), 0);
  const coverageMax = fits.reduce((a, f, i) => a + (f !== 'no' ? set.scripts[i].share : 0), 0);
  return { fits, full: fits.filter((f) => f === 'yes').length, part: fits.filter((f) => f === 'part').length, coverage, coverageMax };
}

/** Strictly current (or aging) quoted sides, full-game winners and spreads only. */
export function scriptMarketRows(
  markets: readonly Market[],
  prices: ReadonlyMap<string, ModelPrice>,
  set: ScriptSet | null,
  homeId: string | null,
  awayId: string | null,
  now: number,
): ScriptMarketRow[] {
  if (!set || !homeId || !awayId) return [];
  const rows: ScriptMarketRow[] = [];
  for (const market of markets) {
    const fit = scriptFit(market, set, homeId, awayId);
    // The source may have a fresh snapshot of a market that is no longer trading.
    if (market.market_status && /^(closed|inactive|settled|suspended|halted|expired|final)$/i.test(market.market_status)) continue;
    if (!fit || !['FRESH', 'AGING'].includes(quoteFreshness(market.captured_at, now))) continue;
    const p = prices.get(market.market_id)?.fair_probability;
    const validModel = p != null && Number.isFinite(p) && p >= 0 && p <= 1 ? p : null;
    for (const side of ['YES', 'NO'] as const) {
      const ask = side === 'YES' ? market.yes_ask : market.no_ask;
      if (ask == null || !Number.isFinite(ask) || ask <= 0 || ask >= 1) continue;
      const fee = kalshiFee(ask);
      const be = breakEven(ask, fee);
      const model = validModel == null ? null : side === 'YES' ? validModel : 1 - validModel;
      rows.push({
        market, side, ask, model,
        modelMinusBreakEven: model != null && be != null ? model - be : null,
        fit: side === 'YES' ? fit : invertedFit(fit, set),
      });
    }
  }
  // This is an explanatory sort: which side survives more *entire* simulated buckets,
  // not an edge, EV, pick, or calibrated probability ranking. One entry per contract side.
  return rows.sort((a, b) => b.fit.coverage - a.fit.coverage
    || b.fit.full - a.fit.full
    || a.market.market_id.localeCompare(b.market.market_id)
    || a.side.localeCompare(b.side));
}
export function scriptFitLine(row: Pick<ScriptMarketRow, 'fit'>): string {
  const lo = Math.round(row.fit.coverage * 100);
  const hi = Math.round(row.fit.coverageMax * 100);
  return lo === hi ? `${lo}% of simulated games in definitely winning margin buckets`
    : `${lo}–${hi}% of simulated games in fully or partly winning margin buckets`;
}
