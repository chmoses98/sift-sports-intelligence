// The SIFT model lane: which approval-ledger record permits each number that can appear on the Player screen, and that nothing appears
// without one. Uses the app's own authority and ledger (src/lib) over the shared projection-feed builders; no number is invented here.
import { describe, expect, it } from 'vitest';
import { makeAuthority, type Resolution } from '../../src/lib/projectionAuthority';
import { ledgerKey, ledgerProof, ledgerWords, siftLaneFor } from '../../src/v3/model/playerResearch';
import { decoded, nflPlayer, NOW } from '../support/projectionFeed';

const FAMILIES = { receptions: {}, targets: {}, receiving_yards: { readiness: 'SHADOW VALIDATION' } };
const players = [nflPlayer(), nflPlayer({ family: 'targets', mean: 9.1, thresholds: { '7': 0.8 } }), nflPlayer({ family: 'receiving_yards', mean: 70, thresholds: { '60': 0.6 } })];
const auth = makeAuthority('NFL', decoded('NFL', players, FAMILIES), NOW);
const q = (stat: string) => ({ stat, playerId: '00-0036900' });
const lane = (stat: string, k: number) => siftLaneFor(auth.resolve(q(stat)), 'NFL', stat, k);

describe('the ledger record behind each SIFT model number', () => {
  it('NFL receptions and targets are PROMOTED to the foundation engine on 2026-10-18: that record permits their numbers', () => {
    expect(ledgerKey('NFL', 'receptions')).toBe('NFL:receptions:PROMOTED:2026-10-18');
    expect(ledgerKey('NFL', 'targets')).toBe('NFL:targets:PROMOTED:2026-10-18');
    expect(ledgerProof('NFL', 'receptions')).toMatchObject({ permitted: true, engine: 'foundation' });
    expect(lane('receptions', 4)).toEqual({ p: 0.8, reason: null });
    expect(lane('receptions', 6)).toEqual({ p: 0.55, reason: null });
    expect(lane('targets', 7)).toEqual({ p: 0.8, reason: null });
  });
  it('a rung the publication does not carry is "—" with that reason, never interpolated', () => {
    expect(lane('receptions', 5)).toEqual({ p: null, reason: 'not published at this rung' });
  });
  it('NFL receiving yards is HELD in the ledger: no number, the ledger’s own words, even though the feed carries a row', () => {
    expect(ledgerKey('NFL', 'receiving_yards')).toBe('NFL:receiving_yards:HELD:2026-10-18');
    expect(ledgerProof('NFL', 'receiving_yards')?.permitted).toBe(false);
    expect(lane('receiving_yards', 60)).toEqual({ p: null, reason: 'not approved yet' });
  });
  it('even if an authoritative resolution is handed to the lane for a stat the ledger does not permit, the lane stays "—"', () => {
    const forged = auth.resolve(q('receptions')) as Resolution;
    expect(forged.kind).toBe('authoritative');
    expect(siftLaneFor(forged, 'NFL', 'receiving_yards', 4)).toEqual({ p: null, reason: 'not approved yet' });
    expect(siftLaneFor(forged, 'NFL', 'passing_tds', 4).p).toBeNull();      // RETAINED
    expect(siftLaneFor(forged, 'NFL', 'no_such_stat', 4).p).toBeNull();     // no ledger row at all
  });
  it('NBA stats are approved only pending live inputs: the lane says so and shows no number', () => {
    expect(ledgerProof('NBA', 'pts')).toMatchObject({ decision: 'APPROVED_PENDING_LIVE_INPUTS', permitted: false });
    expect(ledgerWords('NBA', 'pts')).toBe('awaiting live inputs');
    expect(siftLaneFor({ kind: 'legacy' }, 'NBA', 'pts', 25)).toEqual({ p: null, reason: 'awaiting live inputs' });
  });
  it('NHL stats are RETAINED (the established model stays): no SIFT model number', () => {
    expect(ledgerProof('NHL', 'g')?.permitted).toBe(false);
    expect(ledgerWords('NHL', 'g')).toBe('not approved yet');
  });
  it('a missing, withheld or out-of-population projection is "—" with a reason that never mentions age', () => {
    const none = (r: Resolution) => siftLaneFor(r, 'NFL', 'receptions', 6);
    for (const r of [null, { kind: 'withheld', code: 'STALE', reason: 'inputs are 9 days old' }, { kind: 'withheld', code: 'NOT_PUBLISHED', reason: 'x' }, { kind: 'withheld', code: 'OUT', reason: 'x' }, { kind: 'withheld', code: 'GATE_BLOCK', reason: 'x' }] as (Resolution | null)[]) {
      const l = r ? none(r) : siftLaneFor(null, 'NFL', 'receptions', 6);
      expect(l.p).toBeNull();
      expect(l.reason).not.toMatch(/\bago\b|old|stale|day|hour/i);
    }
  });
  it('the lane never uses the market or history: with no approved row the value is null whatever else is known', () => {
    expect(siftLaneFor({ kind: 'legacy' }, 'NFL', 'receiving_yards', 60).p).toBeNull();
  });
});
