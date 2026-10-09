// Live repricing: a newer live quote replaces the publication's ask for the selected side, the fee comes from Kalshi's
// schedule, freshness from the quote's clock, and the status is revalidated — an actionable row needs a current
// executable quote at or under the bet-up-to; a closed or settled contract is a PASS; an older quote changes nothing.
import { describe, expect, it } from 'vitest';
import type { BoardDoc, ItemsDoc, Recommendation, Thesis } from '../src/contract/types';
import { repriceAll, repriceWithLive } from '../src/opportunity/live';
import { soccerOpportunities } from '../src/opportunity/sources';
import type { Opportunity } from '../src/opportunity/types';
import { quote } from './live/fakes';
import { readSoccer } from './helpers';

const NOW = Date.parse('2026-10-09T06:10:00Z');
const ARS = 'KXEPLGAME-26OCT10ARSLEE-ARS';
const inputs = () => ({ sport: { code: 'SOCCER' as const, slug: 'soccer', label: 'Soccer' }, board: readSoccer<BoardDoc>('board.json').items, recommendations: readSoccer<ItemsDoc<Recommendation>>('recommendations.json').items as never, theses: readSoccer<ItemsDoc<Thesis>>('theses.json').items, now: NOW });
const ars = () => soccerOpportunities(inputs()).find((o) => o.ticker === ARS)!;
const actionable = (o: Opportunity): Opportunity => ({ ...o, status: 'ACTIONABLE', rank: { ...o.rank, tier: 1 } });

describe('repriceWithLive', () => {
  it('a newer quote reprices the selected side (NO ask), with the Kalshi fee and the quote’s clock', () => {
    const o = ars();
    expect(o.price.ask).toBeCloseTo(0.29, 6);
    // yesBid 0.66 → yesAsk 0.68, noBid 0.32, noAsk 0.34: the NO side's executable ask is 34¢.
    const r = repriceWithLive(o, quote(ARS, 0.66, NOW - 60_000), NOW);
    expect(r.price.ask).toBeCloseTo(0.34, 6);
    expect(r.price.source).toBe('live');
    expect(r.price.feeSource).toBe('kalshi-schedule');
    expect(r.price.breakEven).toBeCloseTo(0.34 + 0.02, 6);
    expect(r.price.evSource).toBe('derived');
    expect(r.price.state).toBe('CURRENT');
    expect(r.status).toBe('RESEARCH_CANDIDATE');
    expect(r.price.betUpTo).toBeCloseTo(0.34, 6);
  });
  it('an older quote than the publication’s capture changes nothing', () => {
    const o = ars();
    expect(repriceWithLive(o, quote(ARS, 0.5, Date.parse(o.price.observedAt!) - 60_000), NOW)).toBe(o);
    expect(repriceWithLive(o, undefined, NOW)).toBe(o);
  });
  it('an actionable row above the bet-up-to, without a quote, or stale, becomes a PASS with the reason', () => {
    const o = actionable(ars());
    const above = repriceWithLive(o, quote(ARS, 0.6, NOW - 60_000), NOW); // NO ask 40¢ > 34¢ limit
    expect(above.status).toBe('PASS');
    expect(above.statusReason).toMatch(/above the publication’s bet-up-to/);
    expect(above.rank.tier).toBe(5);
    // A quote newer than the publication's capture but older than 30 minutes is stale (capture moved back, no expiry).
    const older: Opportunity = { ...o, price: { ...o.price, observedAt: '2026-10-09T05:00:00Z' }, reprice: { ...o.reprice, expiresAt: null } };
    const stale = repriceWithLive(older, quote(ARS, 0.66, NOW - 40 * 60_000), NOW);
    expect(stale.status).toBe('PASS');
    expect(stale.statusReason).toMatch(/stale/);
    const noAsk = repriceWithLive(o, quote(ARS, 0.66, NOW - 60_000, { noAsk: null }), NOW);
    expect(noAsk.status).toBe('PASS');
    expect(noAsk.price.state).toBe('NO_QUOTE');
    const fine = repriceWithLive(o, quote(ARS, 0.66, NOW - 60_000), NOW);
    expect(fine.status).toBe('ACTIONABLE');
    expect(fine.rank.priceCurrent).toBe(true);
  });
  it('a closed or settled contract is a PASS whatever the research said', () => {
    for (const availability of ['CLOSED', 'SETTLED', 'UNOPENED'] as const) {
      const r = repriceWithLive(ars(), quote(ARS, 0.66, NOW - 60_000, { availability }), NOW);
      expect(r.status).toBe('PASS');
      expect(r.price.state).toBe('NO_QUOTE');
      expect(r.statusReason).toMatch(new RegExp(availability.toLowerCase()));
    }
  });
  it('repriceAll touches only the rows with a quote', () => {
    const all = soccerOpportunities(inputs());
    const out = repriceAll(all, (t) => (t === ARS ? quote(ARS, 0.66, NOW - 60_000) : undefined), NOW);
    expect(out.find((o) => o.ticker === ARS)!.price.source).toBe('live');
    expect(out.filter((o) => o.ticker !== ARS).every((o, i) => o === all.filter((x) => x.ticker !== ARS)[i])).toBe(true);
  });
});
