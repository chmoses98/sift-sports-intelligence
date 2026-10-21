// A published NFL prop opportunity for the v4 Props tests: Chris Olave 7+ receptions, YES side, fresh and eligible.
// Each test overrides only the field it is about.
import type { Opportunity } from '../../src/opportunity/types';

export const NOW = Date.parse('2026-10-04T15:00:00Z');
export const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
export const MARKET = 'mkt_kalshi_T-7';

type Over = Omit<Partial<Opportunity>, 'price' | 'what'> & { price?: Partial<Opportunity['price']>; what?: Partial<Opportunity['what']> };

export function opp({ price, what, ...o }: Over = {}): Opportunity {
  return {
    id: 'NFL:o1', sport: 'NFL', slug: 'nfl', eventId: 'e1', eventLabel: 'ATL @ NO', competition: 'Week 5', startTime: '2026-10-05T17:00:00Z', marketId: MARKET, ticker: 'T-7', family: 'player_stat',
    what: { title: 'Chris Olave 7+ receptions', side: 'YES', subject: null, ...what }, why: 'Published research flags this line.', evidence: ['Target share 28%'], risk: 'Thin market.', alternatives: [],
    price: { side: 'YES', ask: 0.52, bid: 0.5, observedAt: iso(2), source: 'recommendation', fair: 0.6, fairLow: null, fairHigh: null, fee: 0.02, feeSource: 'kalshi-schedule', breakEven: 0.54, evPerContract: 0.06, evSource: 'derived', betUpTo: 0.55, availableSize: 100, expiresAt: null, state: 'CURRENT', ...price },
    confidence: { calibration: 'RESEARCH', note: 'Research-only model.', inputs: {}, support: null, supportNote: null, edgeShare: null },
    status: 'RESEARCH_CANDIDATE', authority: 'RESEARCH_ONLY', statusReason: 'RESEARCH_ONLY: the publication flags this for research review, not as a bet.', phase: 'PREGAME',
    reprice: { side: 'YES', fair: 0.6 }, group: 'e1', orientation: 'VERIFIED', href: '/nfl/props?game=e1', gameHref: '/nfl/games/e1',
    rank: { tier: 3, tierWord: 'Research candidate', worstCaseEdge: null, evPerContract: 0.06, edgeShare: null, priceCurrent: true, highVariance: false, kickoff: '2026-10-05T17:00:00Z' },
    ...o,
  } as Opportunity;
}
