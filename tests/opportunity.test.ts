// The opportunity layer: fee-aware pricing follows Kalshi's schedule and never invents a bet-up-to; every sport's
// own candidate layer normalises into one shape with the publication's authority intact; the ranking rule is the
// documented one; and PASS is a first-class result with a precise reason.
import { describe, expect, it } from 'vitest';
import type { BoardDoc, ItemsDoc, Recommendation, Thesis } from '../src/contract/types';
import { decodeSignals } from '../src/lib/cfbSignals';
import { kalshiFee, priceIntel, priceLine } from '../src/opportunity/pricing';
import { compareOpportunities, featureOpportunities, isLive } from '../src/opportunity/rank';
import { cfbOpportunities, mlbOpportunities, nhlOpportunities, passReasonFor, soccerOpportunities, tennisOpportunities } from '../src/opportunity/sources';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMlb, readNhl, readSoccer, readTennis, CFB_DIR, CFB_SIGNALS_FILE } from './helpers';

const NOW = Date.parse('2026-10-09T06:10:00Z');

describe('fee-aware pricing', () => {
  it('follows Kalshi’s general taker schedule, rounded up to the cent', () => {
    expect(kalshiFee(0.5)).toBeCloseTo(0.02, 6); // 0.07 × 0.25 = 0.0175 → 2¢
    expect(kalshiFee(0.29)).toBeCloseTo(0.02, 6); // 0.07 × 0.2059 = 0.0144 → 2¢
    expect(kalshiFee(0.1)).toBeCloseTo(0.01, 6); // 0.0063 → 1¢
    expect(kalshiFee(0.98)).toBeCloseTo(0.01, 6);
    expect(kalshiFee(null)).toBeNull();
    expect(kalshiFee(1)).toBeNull();
  });
  it('prefers the publication’s fee and EV, derives otherwise, and never produces a bet-up-to', () => {
    const p = priceIntel({ side: 'NO', ask: 0.29, observedAt: new Date(NOW - 60_000).toISOString(), source: 'recommendation', fair: 0.5269, publishedFee: 0.014413, publishedEv: 0.168715, betUpTo: 0.34, now: NOW });
    expect(p.fee).toBeCloseTo(0.014413, 6);
    expect(p.feeSource).toBe('publication');
    expect(p.breakEven).toBeCloseTo(0.304413, 6);
    expect(p.evPerContract).toBeCloseTo(0.168715, 6);
    expect(p.evSource).toBe('publication');
    expect(p.state).toBe('CURRENT');
    const d = priceIntel({ side: 'YES', ask: 0.47, observedAt: new Date(NOW - 60_000).toISOString(), source: 'recommendation', fair: 0.5848, now: NOW });
    expect(d.feeSource).toBe('kalshi-schedule');
    expect(d.betUpTo).toBeNull();
    expect(d.evPerContract).toBeCloseTo(0.5848 - (0.47 + 0.02), 6);
    expect(priceLine(d)).toBe('YES 47¢ · break-even 49¢ · fair 58%');
  });
  it('states expired, stale, above-bet-up-to and unpriced honestly, in that order', () => {
    const base = { side: 'YES' as const, ask: 0.4, observedAt: new Date(NOW - 60_000).toISOString(), source: 'recommendation' as const, fair: 0.5, now: NOW };
    expect(priceIntel({ ...base, expiresAt: new Date(NOW - 1).toISOString() }).state).toBe('EXPIRED');
    expect(priceIntel({ ...base, observedAt: new Date(NOW - 40 * 60_000).toISOString() }).state).toBe('STALE');
    expect(priceIntel({ ...base, betUpTo: 0.38 }).state).toBe('ABOVE_BET_UP_TO');
    expect(priceIntel({ ...base, fair: null }).state).toBe('UNPRICED');
    expect(priceIntel({ ...base, ask: null }).state).toBe('NO_QUOTE');
  });
});

const soccerInputs = () => ({
  sport: { code: 'SOCCER' as const, slug: 'soccer', label: 'Soccer' }, board: readSoccer<BoardDoc>('board.json').items,
  recommendations: readSoccer<ItemsDoc<Recommendation>>('recommendations.json').items as never, theses: readSoccer<ItemsDoc<Thesis>>('theses.json').items, now: Date.parse('2026-10-09T06:10:00Z'),
});

describe('soccer candidates', () => {
  it('normalise with the publication’s price, fee, break-even, bet-up-to, worst case and thesis, as research candidates', () => {
    const opps = soccerOpportunities(soccerInputs());
    expect(opps.length).toBeGreaterThan(5);
    const ars = opps.find((o) => o.ticker === 'KXEPLGAME-26OCT10ARSLEE-ARS')!;
    expect(ars.what).toEqual({ title: 'Arsenal to win', side: 'NO', subject: null });
    expect(ars.eventLabel).toBe('Arsenal v Leeds United');
    expect(ars.status).toBe('RESEARCH_CANDIDATE');
    expect(ars.authority).toBe('RESEARCH_ONLY');
    // The publication states price, fair and bet-up-to for the selected side: NO at 29¢, fair 47.3%, limit 34¢.
    expect(ars.price.ask).toBeCloseTo(0.29, 6);
    expect(ars.price.fair).toBeCloseTo(0.473128, 5);
    expect(ars.price.betUpTo).toBeCloseTo(0.34, 6);
    expect(ars.price.breakEven).toBeCloseTo(0.304413, 6);
    expect(ars.price.state).toBe('CURRENT');
    expect(ars.price.fee).toBeCloseTo(0.014413, 6);
    expect(ars.price.evPerContract).toBeCloseTo(0.168715, 6);
    expect(ars.rank.worstCaseEdge).toBeCloseTo(0.055519, 6);
    expect(ars.confidence.edgeShare).toBeCloseTo(0.91, 6);
    expect(ars.why).toMatch(/Arsenal/);
    expect(ars.risk).toMatch(/lineups unknown/i);
    expect(ars.evidence.some((e) => /best expression/i.test(e))).toBe(true);
    // The publication's own study finds the market beats dc_laplace_v1: a gap is a model disagreement, not an edge.
    expect(ars.confidence.calibration).toBe('MARKET_BEATS_MODEL');
    expect(ars.rank.tier).toBe(4);
    expect(ars.rank.tierWord).toBe('Model disagreement');
    expect(ars.orientation).toBe('VERIFIED');
  });
  it('a candidate past its validity window is a PASS, not a stale edge', () => {
    const late = soccerOpportunities({ ...soccerInputs(), now: Date.parse('2026-10-09T07:00:00Z') });
    expect(late.every((o) => o.status === 'PASS')).toBe(true);
    expect(late[0].statusReason).toMatch(/validity window/);
    expect(passReasonFor('SOCCER', late, soccerInputs().board, true, Date.parse('2026-10-09T07:00:00Z'))).toMatch(/No fixture/);
  });
});

describe('tennis candidates', () => {
  it('carry no bet-up-to, say the market beats the model, and keep NOT_PLAYABLE rows as PASS with the publication’s reason', () => {
    const inputs = { sport: { code: 'TENNIS' as const, slug: 'tennis', label: 'Tennis' }, board: readTennis<BoardDoc>('board.json').items, recommendations: readTennis<ItemsDoc<Recommendation>>('recommendations.json').items as never, now: Date.parse('2026-10-09T06:00:00Z'), tennisRecord: { n: 32335, model: 0.2136, market: 0.1846 } };
    const opps = tennisOpportunities(inputs);
    // Without the published record the risk line still says the market's record is better, with no stale numbers.
    expect(tennisOpportunities({ ...inputs, tennisRecord: null })[0].risk).toMatch(/settled record has the Kalshi mid beating this model/);
    expect(opps.length).toBeGreaterThan(0);
    for (const o of opps) {
      expect(o.price.betUpTo).toBeNull();
      expect(o.confidence.calibration).toBe('MARKET_BEATS_MODEL');
      expect(o.risk).toMatch(/On 32,335 settled rows the Kalshi mid has beaten this model \(Brier 0\.1846 vs 0\.2136\)/);
    }
    const set2 = opps.find((o) => o.ticker === 'KXWTASETWINNER-26OCT07MERSWI-2-MER');
    expect(set2?.what.title).toBe('Elise Mertens wins set 2');
    expect(set2?.eventLabel).toBe('Elise Mertens v Iga Swiatek');
  });
});

describe('NHL and MLB candidates', () => {
  it('NHL: goal-scorer contracts are high variance and sort after other research candidates; bet-up-to and fee are the publication’s', () => {
    const inputs = { sport: { code: 'NHL' as const, slug: 'nhl', label: 'NHL' }, board: readNhl<BoardDoc>('board.json').items, recommendations: readNhl<ItemsDoc<Recommendation>>('recommendations.json').items as never, now: Date.parse('2026-10-06T22:50:00Z') };
    const opps = nhlOpportunities(inputs);
    expect(opps.length).toBeGreaterThan(0);
    const goals = opps.filter((o) => o.family === 'player_goals');
    expect(goals.length).toBeGreaterThan(0);
    expect(goals.every((o) => o.rank.highVariance)).toBe(true);
    expect(goals[0].price.feeSource).toBe('publication');
    expect(goals[0].price.betUpTo).not.toBeNull();
    expect(goals[0].what.title).toMatch(/to score a goal|\+ goals/);
    const sorted = [...opps].sort(compareOpportunities);
    const firstHv = sorted.findIndex((o) => o.rank.highVariance);
    const lastNonHv = sorted.map((o) => o.rank.highVariance).lastIndexOf(false);
    if (firstHv >= 0 && lastNonHv >= 0 && sorted[firstHv].rank.tier === sorted[lastNonHv].rank.tier) expect(firstHv).toBeGreaterThan(lastNonHv);
  });
  it('MLB: PASS rows stay PASS with the ledger’s own status; the one candidate is research only with a bet-up-to', () => {
    const inputs = { sport: { code: 'MLB' as const, slug: 'mlb', label: 'MLB' }, board: readMlb<BoardDoc>('board.json').items, recommendations: readMlb<ItemsDoc<Recommendation>>('recommendations.json').items as never, now: Date.parse('2026-10-07T18:00:00Z') };
    const opps = mlbOpportunities(inputs);
    expect(opps.filter((o) => o.status === 'PASS').length).toBeGreaterThan(10);
    const cand = opps.filter(isLive);
    expect(cand).toHaveLength(1);
    expect(cand[0].status).toBe('RESEARCH_CANDIDATE');
    expect(cand[0].price.betUpTo).toBeCloseTo(0.58, 6);
    expect(cand[0].price.state).toBe('NO_QUOTE');
  });
});

describe('CFB signals as opportunities', () => {
  it('Value Watch games are WATCH on the CONTROL side’s own price; Strong CONTROL is a PASS the market already prices', () => {
    const doc = decodeSignals(JSON.parse(readFileSync(CFB_SIGNALS_FILE, 'utf-8')));
    const board = (JSON.parse(readFileSync(join(CFB_DIR, 'board.json'), 'utf-8')) as BoardDoc).items;
    const now = Date.parse(doc.generated_at) + 60_000;
    const opps = cfbOpportunities(board, doc, 'cfb', now);
    expect(opps.length).toBeGreaterThan(0);
    for (const o of opps) {
      expect(o.what.side).toBe('YES');
      expect(o.price.betUpTo).toBeNull();
      expect(o.price.fair).toBeNull();
      expect(['WATCH', 'PASS']).toContain(o.status);
    }
    const strong = opps.filter((o) => o.confidence.support === 'STRONG_CONTROL');
    expect(strong.every((o) => o.status === 'PASS')).toBe(true);
  });
});

describe('ranking', () => {
  it('features one expression per thesis group and never a PASS', () => {
    const opps = soccerOpportunities(soccerInputs());
    const feats = featureOpportunities(opps.filter(isLive));
    const groups = new Set(feats.map((f) => f.lead.group));
    expect(groups.size).toBe(feats.length);
    for (const f of feats) for (const r of f.related) expect(r.group).toBe(f.lead.group);
    for (let i = 1; i < feats.length; i++) expect(compareOpportunities(feats[i - 1].lead, feats[i].lead)).toBeLessThanOrEqual(0);
  });
});
