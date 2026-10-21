// A controlled published recommendation for Chris Olave's receptions line (7+, the 6.5 main line, ATL at NO), so the browser can exercise the
// prop research sheet over a real opportunity: the bundled NFL publication carries no recommendations, so each test serves
// exactly the recommendation it is about through the same file the app reads (data/nfl/app/latest/recommendations.json).
// The contract, event, ticker and board are the bundled publication's own; only the recommendation is synthetic.
import type { BrowserContext } from '@playwright/test';
import { GAME } from './projectionDoc';

export const OLAVE_TICKER = 'KXNFLREC-26OCT05ATLNO-NOCOLAVE12-7';
export const OLAVE_MARKET = `mkt_kalshi_${OLAVE_TICKER}`;
/** Two minutes before NOW (e2e/fixtures.ts): a fresh capture on game day. */
export const FRESH_AT = '2026-10-04T14:58:00Z';

export interface RecOver { [k: string]: unknown }

/** A research-only candidate on the YES side (the over): a 47¢ ask against the publication's 53% fair and 50¢ bet-up-to. */
export const rec = (over: RecOver = {}) => ({
  recommendation_id: 'rec_v4_olave_7_yes', market_id: OLAVE_MARKET, event_id: GAME, selection: 'YES', status: 'RESEARCH_CANDIDATE',
  authority: 'RESEARCH_ONLY', research_only: true, fair_probability: 0.53, bet_up_to_price: 0.5, current_price: 0.47, created_at: FRESH_AT,
  expires_at: '2026-10-05T12:00:00Z', market_description: 'Chris Olave 7+ receptions', data_freshness: 'FRESH', extensions: {},
  source_ids: { kalshi_ticker: OLAVE_TICKER }, ...over,
});

/** The same contract's NO side (the under): a 55¢ ask against a 62% fair and a 57¢ bet-up-to (synthetic: the fixture only needs a published NO-side signal). */
export const recNo = (over: RecOver = {}) => rec({ recommendation_id: 'rec_v4_olave_7_no', selection: 'NO', fair_probability: 0.62, bet_up_to_price: 0.57, current_price: 0.55, ...over });

export async function serveRecommendations(ctx: BrowserContext, items: unknown[]) {
  await ctx.route(/\/data\/nfl\/app\/latest\/recommendations\.json/, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ count: items.length, generated_at: FRESH_AT, items, kind: 'recommendations', run_id: 'run_v4_fixture', schema_version: 'edge_finder.app.v1', sport: 'NFL' }),
  }));
}

/** Another rung of the same Olave receptions ladder (bundled contracts: 4+ through 14+). */
export const olaveRung = (n: number) => ({ ticker: `KXNFLREC-26OCT05ATLNO-NOCOLAVE12-${n}`, market: `mkt_kalshi_KXNFLREC-26OCT05ATLNO-NOCOLAVE12-${n}`, description: `Chris Olave ${n}+ receptions` });

/** A recommendation on another rung. `current_price` must be the price the live mock quotes for that side (the bundled yes ask for YES). */
export const recOn = (n: number, over: RecOver = {}) => {
  const r = olaveRung(n);
  return rec({ recommendation_id: `rec_v4_olave_${n}`, market_id: r.market, market_description: r.description, source_ids: { kalshi_ticker: r.ticker }, ...over });
};

/** A recommendation the publication permits as a bet (not research-only): the opportunity layer calls it ACTIONABLE while its price is current. */
export const recActionable = (n: number, over: RecOver = {}) => recOn(n, { recommendation_id: `rec_v4_olave_${n}_act`, status: 'ACTIONABLE', authority: 'PUBLISHED_PLAYABLE', research_only: false, ...over });
