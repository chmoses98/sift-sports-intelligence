// THE INTELLIGENCE-TO-MARKET CHAIN (src/intelligence/chain.ts) on the bundled NE @ BUF publication: a matchup mismatch
// followed to its player, its scripts and its priced markets, where only the opportunity layer says whether a price
// justifies a bet. Covers a contract with no executable price, a research-only candidate, a candidate on the opposite
// side, the split close-game scripts (sim-script-1.1.0) and the scheme link (observation only).
import { describe, expect, it } from 'vitest';
import type { EventResearchDoc, Market, ModelPrice } from '../src/contract/types';
import { gameScripts } from '../src/lib/scripts';
import { matchupInsights, type MatchupInsight } from '../src/insights/matchups';
import type { SchemeLink } from '../src/insights/schemePlayers';
import { buildChain, chainEvidenceLine, chainRows, judge, judgmentWords } from '../src/intelligence/chain';
import type { Opportunity } from '../src/opportunity/types';
import { readSnapshot } from './helpers';

const EV = 'evt_0cb333291f580a201a70';
const base = readSnapshot<EventResearchDoc>(`explorer/events/${EV}.json`);
const detail = readSnapshot<{ markets: Market[]; model_prices: ModelPrice[] }>(`event_detail/${EV}.json`);
const ML_BUF = 'KXNFLGAME-26OCT04NEBUF-BUF';
const mlBuf = detail.markets.find((m) => m.kalshi_ticker === ML_BUF)!;

const BUF = { 'win1-6': { share_of_rows: 0.2259, pass_rate_mean: 0.5871, pass_att_mean: 32.4, rush_att_mean: 29.6, plays_mean: 64.4 }, tie: { share_of_rows: 0.0024 }, 'lose1-6': { share_of_rows: 0.1358, pass_rate_mean: 0.6281, pass_att_mean: 34.4, rush_att_mean: 27.0, plays_mean: 64.2 } };
const NE = { 'win1-6': { share_of_rows: 0.1358, pass_rate_mean: 0.6012, pass_att_mean: 31.2, rush_att_mean: 28.4, plays_mean: 62.8 }, tie: { share_of_rows: 0.0024 }, 'lose1-6': { share_of_rows: 0.2259, pass_rate_mean: 0.6355, pass_att_mean: 32.6, rush_att_mean: 26.9, plays_mean: 62.5 } };

/* eslint-disable @typescript-eslint/no-explicit-any */
function withSplit(): EventResearchDoc {
  const r = structuredClone(base) as any;
  r.extensions.game_script_inputs.team_volume.BUF.by_close_result = BUF;
  r.extensions.game_script_inputs.team_volume.NE.by_close_result = NE;
  return r as EventResearchDoc;
}

const insight = (r: EventResearchDoc, area: MatchupInsight['area']) => matchupInsights(r).find((i) => i.area === area)!;
const chainFor = (r: EventResearchDoc, area: MatchupInsight['area'], over: { markets?: Market[]; prices?: ModelPrice[]; opps?: Opportunity[]; scheme?: SchemeLink | null } = {}) => {
  const set = gameScripts(r);
  return buildChain({ ins: insight(r, area), r, set, rows: chainRows(r, over.markets ?? detail.markets, over.prices ?? detail.model_prices, set), opps: over.opps ?? [], scheme: over.scheme });
};

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  id: 'o1', sport: 'NFL', slug: 'nfl', eventId: EV, eventLabel: 'NE @ BUF', competition: null, startTime: '2026-10-04T17:00:00Z', marketId: mlBuf.market_id, ticker: ML_BUF, family: 'game_winner',
  what: { title: 'BUF to win', side: 'YES', subject: 'BUF' }, why: '', evidence: [], risk: 'Behind the closing market on game outcomes', alternatives: [],
  price: { side: 'YES', ask: 0.74, bid: 0.73, observedAt: null, source: 'recommendation', fair: 0.79, fairLow: null, fairHigh: null, fee: 0.02, feeSource: 'kalshi-schedule', breakEven: 0.76, evPerContract: 0.03, evSource: 'derived', betUpTo: null, availableSize: null, expiresAt: null, state: 'CURRENT' },
  confidence: { calibration: 'RESEARCH', note: '', inputs: {}, support: null, supportNote: null, edgeShare: null },
  status: 'RESEARCH_CANDIDATE', authority: 'RESEARCH_ONLY', statusReason: 'Research-only model: a candidate to study, not a bet.', phase: 'PREGAME', reprice: { side: 'YES', fair: 0.79 }, group: null, orientation: { state: 'OK' } as never,
  href: '', gameHref: '', rank: { tier: 4, tierWord: '', worstCaseEdge: null, evPerContract: 0.03, edgeShare: null, priceCurrent: true, highVariance: false, kickoff: '2026-10-04T17:00:00Z' }, ...over,
});

describe('the matchup-to-market chain', () => {
  it('follows the Bills run edge to the lead back, his scripts and the priced markets, quoting published asks only', () => {
    const c = chainFor(base, 'run');
    expect(c.matchup.beneficiary).toBe('Bills');
    expect(c.matchup.indicates).toMatch(/not a priced edge/);
    expect(c.player?.name).toBe('James Cook III');
    expect(c.player?.effect).toBe('up');
    expect(c.player?.projection?.mean).toBeCloseTo(84.86, 1);
    expect(c.scripts?.list.map((s) => s.id).sort()).toEqual(['close', 'dog', 'fav', 'fav-big']);
    expect(c.scripts?.tie).toBeNull();
    const prop = c.markets.find((m) => m.basis === 'volume')!;
    const src = detail.markets.find((m) => m.market_id === prop.marketId)!;
    expect(prop.side).toBe('YES');
    expect(prop.ask).toBe(src.yes_ask);
    expect(prop.ask).toBeGreaterThanOrEqual(0.03);
    expect(prop.ask).toBeLessThanOrEqual(0.97);
    const ml = c.markets.find((m) => m.marketId === mlBuf.market_id)!;
    expect(ml.basis).toBe('fit');
    expect(ml.survival).toMatch(/^Survives 2 of 4 scripts/);
    // No candidate in the opportunity layer: the research model price is quoted as such, never as a call.
    expect(ml.judgment.kind).toBe('model-only');
    expect(judgmentWords(ml.judgment)).toMatch(/research-only model price .* not a bet call/);
    expect(chainEvidenceLine(c)).toMatch(/None of the 2 linked contracts is a publication candidate/);
    expect(c.counter.source).toBe('scripts');
    expect(c.counter.text).toMatch(/Patriots Win Comfortably.*rush attempts fall/);
  });

  it('says so when no model price exists, and lists nothing when no contract has an executable price', () => {
    const noPrices = chainFor(base, 'run', { prices: [] });
    expect(noPrices.markets.every((m) => m.judgment.kind === 'none')).toBe(true);
    expect(judgmentWords(noPrices.markets[0].judgment)).toBe('No model price is published for this contract, so nothing says whether this price is good.');
    const dead = detail.markets.map((m) => ({ ...m, yes_ask: 0.99, no_ask: 0.99 }));
    const c = chainFor(base, 'run', { markets: dead });
    expect(c.markets).toEqual([]);
    expect(c.marketNote).toMatch(/executable price \(3–97¢\)/);
    expect(chainEvidenceLine(c)).toMatch(/no executable price/);
    // The player and scripts still read: only the market link is empty.
    expect(c.player?.name).toBe('James Cook III');
  });

  it('reads a research-only candidate from the opportunity layer without upgrading it, and its published risk is the counter', () => {
    const c = chainFor(base, 'run', { opps: [opp()] });
    const ml = c.markets.find((m) => m.marketId === mlBuf.market_id)!;
    expect(ml.judgment).toMatchObject({ kind: 'opportunity', word: 'Watch', tone: 'research', authority: 'Research only' });
    expect(judgmentWords(ml.judgment)).toBe('Watch — Research candidate · not a validated bet (Research only).');
    expect(c.counter).toEqual({ text: 'Published risk: Behind the closing market on game outcomes', source: 'publication' });
    expect(chainEvidenceLine(c)).toMatch(/1 of 2 linked contracts carry a publication call/);
  });

  it('a publication candidate on the other side of a linked contract is the strongest counterargument', () => {
    const c = chainFor(base, 'run', { opps: [opp({ what: { title: 'BUF to win', side: 'NO', subject: 'BUF' } })] });
    const ml = c.markets.find((m) => m.marketId === mlBuf.market_id)!;
    expect(ml.judgment.kind).toBe('opposite');
    expect(c.counter.source).toBe('publication');
    expect(c.counter.text).toMatch(/other side \(NO\)/);
    expect(judge('x', 'y', 'YES', [], null)).toEqual({ kind: 'none' });
  });

  it('reads the split close-game scripts: five scripts, the tie share stated, exact fits re-derived', () => {
    const r = withSplit();
    const c = chainFor(r, 'run');
    expect(c.scripts?.list.map((s) => s.id).sort()).toEqual(['dog', 'dog-close', 'fav', 'fav-big', 'fav-close']);
    expect(c.scripts?.total).toBe(5);
    expect(c.scripts?.tie).toBe(0.0024);
    expect(c.scripts!.list.reduce((a, s) => a + s.share, 0) + c.scripts!.tie!).toBeCloseTo(1, 3);
    const ml = c.markets.find((m) => m.marketId === mlBuf.market_id)!;
    expect(ml.survival).toMatch(/^Survives 3 of 5 scripts/);
    expect(c.survives.text).toMatch(/BUF to win always wins in 3 of 5 \(exact fit\)/);
    // The badge follows the reading (the back's volume lean), not the moneyline's fit.
    expect(c.survives.multi).toBe(c.scripts!.supportCount >= 2);
  });

  it('a scheme tendency is attached only to its own offense, and only as an observation', () => {
    const ins = insight(base, 'run');
    const link = { offense: ins.offense.team, scheme: 'Patriots put 8+ defenders in the box on 30% of designed runs.', sample: '120 charted runs faced', player: null } as unknown as SchemeLink;
    expect(chainFor(base, 'run', { scheme: link }).scheme).toEqual({ text: link.scheme, sample: '120 charted runs faced', player: null });
    const other = { ...link, offense: ins.defense.team } as SchemeLink;
    const c = chainFor(base, 'run', { scheme: other });
    expect(c.scheme).toBeNull();
    expect(c.schemeNote).toMatch(/No charted scheme tendency/);
  });

  it('an area with no single-player market links only the beneficiary’s margin contracts', () => {
    const r = structuredClone(base);
    const ins = { ...insight(base, 'run'), area: 'turnovers' as const };
    const set = gameScripts(r);
    const c = buildChain({ ins, r, set, rows: chainRows(r, detail.markets, detail.model_prices, set), opps: [] });
    expect(c.player).toBeNull();
    expect(c.scripts).toBeNull();
    expect(c.markets.every((m) => m.basis === 'fit')).toBe(true);
    expect(c.markets.length).toBeGreaterThan(0);
  });
});
