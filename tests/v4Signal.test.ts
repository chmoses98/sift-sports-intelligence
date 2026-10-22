import { describe, expect, it } from 'vitest';
import { ineligibleWhy, matchSignal, sideOfProp } from '../src/v4/signal';
import { iso, MARKET, NOW, opp } from './support/v4Opportunity';

describe('a published signal must name this market AND this side', () => {
  it('no opportunity, no market id, or another market or sport matches nothing', () => {
    expect(matchSignal([], MARKET, 'YES', NOW).kind).toBe('none');
    expect(matchSignal([opp()], null, 'YES', NOW).kind).toBe('none');
    expect(matchSignal([opp()], 'mkt_kalshi_OTHER', 'YES', NOW).kind).toBe('none');
    expect(matchSignal([opp({ sport: 'NHL' })], MARKET, 'YES', NOW).kind).toBe('none');
    expect(matchSignal([opp({ marketId: null })], MARKET, 'YES', NOW).kind).toBe('none');
  });

  it('the over is YES and the under is NO', () => {
    expect(sideOfProp('over')).toBe('YES');
    expect(sideOfProp('under')).toBe('NO');
  });

  it('a current YES signal is valid for the over', () => {
    const m = matchSignal([opp()], MARKET, 'YES', NOW);
    expect(m.kind).toBe('valid');
  });

  it('a signal for the opposite side is not a signal for this side', () => {
    const no = opp({ what: { side: 'NO' }, price: { side: 'NO', ask: 0.5 } });
    expect(matchSignal([no], MARKET, 'YES', NOW)).toMatchObject({ kind: 'oppositeSide', has: 'NO', wanted: 'YES' });
    expect(matchSignal([opp()], MARKET, 'NO', NOW)).toMatchObject({ kind: 'oppositeSide', has: 'YES', wanted: 'NO' });
  });

  it('when both sides are published, each side reads its own', () => {
    const yes = opp({ id: 'yes' });
    const no = opp({ id: 'no', what: { side: 'NO' }, price: { side: 'NO', ask: 0.5 } });
    const m1 = matchSignal([no, yes], MARKET, 'YES', NOW);
    const m2 = matchSignal([yes, no], MARKET, 'NO', NOW);
    expect(m1.kind === 'valid' && m1.opp.id).toBe('yes');
    expect(m2.kind === 'valid' && m2.opp.id).toBe('no');
  });
});

describe('a PASS decision is a decision, not a signal', () => {
  it('an exact-side PASS reads as passed with the publication reason', () => {
    const m = matchSignal([opp({ status: 'PASS', statusReason: 'The ask is above the publication’s own bet-up-to price.' })], MARKET, 'YES', NOW);
    expect(m.kind).toBe('passed');
  });
  it('a PASS on this side outranks a signal on the other side, and a valid signal outranks a PASS', () => {
    const no = opp({ id: 'no', what: { side: 'NO' }, price: { side: 'NO' } });
    const yesPass = opp({ id: 'ypass', status: 'PASS' });
    expect(matchSignal([no, yesPass], MARKET, 'YES', NOW).kind).toBe('passed');
    expect(matchSignal([yesPass, opp({ id: 'yes' })], MARKET, 'YES', NOW)).toMatchObject({ kind: 'valid' });
  });
  it('a game-level watch is not a priced contract signal', () => {
    expect(matchSignal([opp({ status: 'WATCH' })], MARKET, 'YES', NOW).kind).toBe('watch');
  });
});

describe('a flagged opportunity that no longer holds is ineligible, with the reason', () => {
  const why = (o: ReturnType<typeof opp>) => ineligibleWhy(o, NOW);
  it('a current, fresh, pregame, verified candidate has no reason', () => {
    expect(why(opp())).toBeNull();
    expect(why(opp({ price: { observedAt: iso(20) } }))).toBeNull(); // AGING still executable
  });
  it('a stale quote, even when the state still says CURRENT', () => {
    const o = opp({ price: { observedAt: iso(45) } });
    expect(why(o)).toMatch(/stale/);
    expect(matchSignal([o], MARKET, 'YES', NOW)).toMatchObject({ kind: 'ineligible' });
  });
  it('an undated quote is not current', () => { expect(why(opp({ price: { observedAt: null } }))).toMatch(/no capture time/); });
  it('stale, expired, above bet-up-to, unquoted and unpriced states', () => {
    expect(why(opp({ price: { state: 'STALE' } }))).toMatch(/stale/);
    expect(why(opp({ price: { state: 'EXPIRED' } }))).toMatch(/validity window/);
    expect(why(opp({ price: { state: 'ABOVE_BET_UP_TO' } }))).toMatch(/bet-up-to/);
    expect(why(opp({ price: { state: 'NO_QUOTE', ask: null } }))).toMatch(/No executable quote/);
    expect(why(opp({ price: { state: 'UNPRICED' } }))).toMatch(/prices nothing/);
  });
  it('a validity window that passed after the opportunity loaded', () => {
    expect(why(opp({ price: { expiresAt: iso(1) } }))).toMatch(/validity window/);
    expect(why(opp({ price: { expiresAt: new Date(NOW + 60_000).toISOString() } }))).toBeNull();
  });
  it('a game that started, or has no verified start', () => {
    expect(why(opp({ phase: 'STARTED' }))).toMatch(/frozen/);
    expect(why(opp({ phase: 'NO_START' }))).toMatch(/no verified start/);
  });
  it('a contract identity mismatch, and a side that differs from its price', () => {
    expect(why(opp({ orientation: 'MISMATCH' }))).toMatch(/identity/);
    expect(why(opp({ what: { side: 'YES' }, price: { side: 'NO' } }))).toMatch(/different sides/);
  });
  it('an actionable status cannot rest on a research-only authority', () => {
    expect(why(opp({ status: 'ACTIONABLE', authority: 'RESEARCH_ONLY' }))).toMatch(/research only/);
    expect(why(opp({ status: 'ACTIONABLE', authority: 'PUBLISHED_PLAYABLE' }))).toBeNull();
  });
  it('an ineligible exact-side signal outranks a passed one, and is never reported as valid', () => {
    const stale = opp({ id: 'stale', price: { observedAt: iso(60) } });
    const pass = opp({ id: 'pass', status: 'PASS' });
    const m = matchSignal([pass, stale], MARKET, 'YES', NOW);
    expect(m.kind).toBe('ineligible');
  });
});
