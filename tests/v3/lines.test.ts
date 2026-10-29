import { describe, expect, it } from 'vitest';
import type { Market } from '../../src/contract/types';
import { deriveLines, deriveProps } from '../../src/v3/data/adapt';
import { breakEvenPct, showAsk, takerFeeCents } from '../../src/v3/model/format';
import type { V3Team } from '../../src/v3/model/types';

const T = (id: string): V3Team => ({ id, slug: 'x', sport: 'NFL', name: id, nick: id, abbr: id, logo: null, colors: ['#000', '#fff'] });
const M = (o: Partial<Market>): Market => ({ market_id: 'm', kalshi_ticker: 'T', event_id: 'e', market_family: 'spread', yes_description: '', yes_bid: 0.5, yes_ask: 0.52, market_probability: 0.51, captured_at: '2026-10-25T11:00:00Z', participant_id: null, player_id: null, period: 'FULL', line: null, threshold: null, market_status: 'OPEN', ...o } as Market);
const ids = { away: 'pa', home: 'ph' };

describe('Kalshi lines (never mistaken for a sportsbook line)', () => {
  it('NFL shapes: spread by threshold, total ">= N" is over N-0.5, moneyline from game_winner', () => {
    const lines = deriveLines([
      M({ market_family: 'spread', participant_id: 'ph', threshold: 1.5, yes_description: 'YES iff ATL margin (FULL) > 1.5', market_probability: 0.41, yes_ask: 0.41 }),
      M({ kalshi_ticker: 'S2', market_family: 'spread', participant_id: 'ph', threshold: 2.5, market_probability: 0.5, yes_ask: 0.5 }),
      M({ market_family: 'total', yes_description: 'YES iff total_points (FULL) >= 45.0', threshold: 45, market_probability: 0.49, yes_ask: 0.5 }),
      M({ market_family: 'game_winner', participant_id: 'ph', market_probability: 0.42, yes_ask: 0.43 }),
      M({ market_family: 'game_winner', participant_id: 'pa', market_probability: 0.57, yes_ask: 0.58 }),
    ], T('SF'), T('ATL'), ids);
    expect(lines.find((l) => l.kind === 'spread')).toMatchObject({ label: 'ATL −2.5', line: 2.5 });
    expect(lines.find((l) => l.kind === 'total')).toMatchObject({ label: 'O/U 44.5' });
    const ml = lines.find((l) => l.kind === 'moneyline')!;
    expect(ml.label).toBe('SF to win');
    expect(ml.price.ask).toBe(58);
    expect(ml.alternates).toHaveLength(2);
  });
  it('NBA/NHL/CFB shapes: game_spread / game_total with `line`, FULL_GAME and full_game periods', () => {
    const lines = deriveLines([
      M({ market_family: 'game_spread', participant_id: 'ph', threshold: null, line: 10.5, period: 'FULL_GAME', yes_description: 'Minnesota wins by over 10.5 points', yes_ask: 0.23, market_probability: 0.23 }),
      M({ market_family: 'game_total', line: 203.5, threshold: 203.5, period: 'full_game', yes_description: 'Full Game: Over 203.5 points scored', yes_ask: 0.5, market_probability: 0.5 }),
      M({ market_family: 'period_spread', participant_id: 'ph', period: '1H', threshold: 2.5, yes_ask: 0.5 }),
    ], T('A'), T('B'), ids);
    expect(lines.map((l) => l.kind).sort()).toEqual(['spread', 'total']);
    expect(lines.find((l) => l.kind === 'total')!.label).toBe('O/U 203.5');
  });
  it('a contract with no executable ask yields no line instead of an invented price', () => {
    expect(deriveLines([M({ market_family: 'game_spread', participant_id: 'ph', line: 3.5, yes_ask: null })], T('A'), T('B'), ids)).toEqual([]);
  });
  it('props: one row per player and stat, main line nearest 50¢, ">= N" is over N-0.5, duplicates families ignored', () => {
    const base = { market_family: 'player_stat', player_id: 'p1', extensions: { stat: 'receiving_yards', subject: 'A Player', subject_kind: 'player', operator: '>=' } } as Partial<Market>;
    const rows = deriveProps([
      M({ ...base, kalshi_ticker: 'a', threshold: 40, yes_ask: 0.8, market_probability: 0.8 }),
      M({ ...base, kalshi_ticker: 'b', threshold: 60, yes_ask: 0.51, market_probability: 0.5 }),
      M({ ...base, kalshi_ticker: 'c', threshold: 80, yes_ask: 0.2, market_probability: 0.2 }),
      M({ market_family: 'player_unknown', player_id: 'p1', extensions: { stat: 'receiving_yards', subject: 'A Player' }, threshold: 50, yes_ask: 0.5 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ player: 'A Player', stat: 'receiving_yards', line: 59.5 });
    expect(rows[0].ladder.map((p) => p.ticker)).toEqual(['a', 'b', 'c']);
  });
});

describe('prices: native cents/percent and fee-aware (whether one may be shown is data/quoteGate.ts)', () => {
  it('Kalshi taker fee and break-even', () => {
    expect(takerFeeCents(50)).toBe(2);
    expect(breakEvenPct(54)).toBe(54 + takerFeeCents(54));
  });
  it('display conversions are of the same ask', () => {
    expect(showAsk(54, 'cents')).toBe('54¢');
    expect(showAsk(50, 'decimal')).toBe('2.00');
    expect(showAsk(60, 'american')).toBe('−150');
    expect(showAsk(40, 'american')).toBe('+150');
    expect(showAsk(null, 'cents')).toBe('—');
  });
});
