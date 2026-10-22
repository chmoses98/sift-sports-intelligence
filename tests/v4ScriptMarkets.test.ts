import { describe, expect, it } from 'vitest';
import type { EventResearchDoc, Market, ModelPrice } from '../src/contract/types';
import { gameScripts } from '../src/lib/scripts';
import { kalshiFee } from '../src/opportunity/pricing';
import { scriptFitLine, scriptMarketRows } from '../src/v4/scriptMarkets';
import { readSnapshot } from './helpers';

const research = readSnapshot<EventResearchDoc>('explorer/events/evt_0cb333291f580a201a70.json');
const detail = readSnapshot<{ markets: Market[] }>('event_detail/evt_0cb333291f580a201a70.json');
const set = gameScripts(research)!;
const HOME = 'prt_16bee2e0460c651b4bca'; // Bills
const AWAY = 'prt_3d9358b1e2ac7256767d'; // Patriots
const now = Date.parse('2026-10-04T14:02:00Z');
const source = detail.markets.find((m) => m.kalshi_ticker === 'KXNFLSPREAD-26OCT04NEBUF-BUF7')!;
const make = (over: Partial<Market> = {}): Market => ({
  ...source, captured_at: '2026-10-04T14:00:00Z', yes_ask: 0.40, no_ask: 0.62, ...over,
});
const prices = (market: Market, fair = 0.55) =>
  new Map([[market.market_id, { fair_probability: fair } as ModelPrice]]);

describe('v4 game scripts are actually joined to both priced sides', () => {
  it('matches YES and the complementary NO side to their actual margin buckets', () => {
    const m = make();
    const rows = scriptMarketRows([m], prices(m), set, HOME, AWAY, now);
    expect(rows).toHaveLength(2);
    const yes = rows.find((r) => r.side === 'YES')!;
    const no = rows.find((r) => r.side === 'NO')!;
    expect(yes.fit.fits).toEqual(['no', 'yes', 'yes', 'no']);
    expect(no.fit.fits).toEqual(['yes', 'no', 'no', 'yes']);
    expect(yes.fit.coverage).toBeCloseTo(set.scripts[1].share + set.scripts[2].share);
    expect(no.fit.coverage).toBeCloseTo(set.scripts[0].share + set.scripts[3].share);
    expect(yes.model).toBeCloseTo(0.55);
    expect(no.model).toBeCloseTo(0.45);
    expect(yes.modelMinusBreakEven).toBeCloseTo(0.55 - (0.40 + kalshiFee(0.40)!));
    expect(no.modelMinusBreakEven).toBeCloseTo(0.45 - (0.62 + kalshiFee(0.62)!));
    expect(scriptFitLine(yes)).toContain('simulated games');
  });

  it('never guesses the NO ask from YES and never invents a missing fair probability', () => {
    const m = make({ no_ask: null });
    const rows = scriptMarketRows([m], new Map(), set, HOME, AWAY, now);
    expect(rows).toHaveLength(1);
    expect(rows[0].side).toBe('YES');
    expect(rows[0].model).toBeNull();
    expect(rows[0].modelMinusBreakEven).toBeNull();
  });

  it('excludes stale, undated and unsupported total/quarter prices', () => {
    const current = make();
    const stale = make({ market_id: 'stale', captured_at: '2026-10-04T12:00:00Z' });
    const undated = make({ market_id: 'undated', captured_at: null });
    const total = make({ market_id: 'total', market_family: 'total' });
    const firstHalf = make({ market_id: 'half', period: '1H' });
    const rows = scriptMarketRows([current, stale, undated, total, firstHalf], prices(current), set, HOME, AWAY, now);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.market.market_id === current.market_id)).toBe(true);
  });

  it('returns no scenarios without an authorised publication or verified participant identities', () => {
    const m = make();
    expect(scriptMarketRows([m], prices(m), null, HOME, AWAY, now)).toEqual([]);
    expect(scriptMarketRows([m], prices(m), set, null, AWAY, now)).toEqual([]);
  });
});
