import { describe, expect, it } from 'vitest';
import { groupMarkets, humanize, latestPrices } from '../src/components/MarketBoard';
import { rankDomain } from '../src/charts/RankBars';
import { quantilesOf, statOf } from '../src/views/Player';
import type { EntityProfileDoc, EventDetailDoc } from '../src/contract/types';
import { readSnapshot } from './helpers';

const detail = readSnapshot<EventDetailDoc>('event_detail/evt_0cb333291f580a201a70.json');

describe('market detail mapping', () => {
  it('groups every market exactly once; ladders are sorted by line', () => {
    const groups = groupMarkets(detail.markets, () => null);
    const ids = groups.flatMap((g) => g.rows.map((m) => m.market_id));
    expect(ids).toHaveLength(detail.markets.length);
    expect(new Set(ids).size).toBe(detail.markets.length);
    for (const g of groups.filter((x) => x.ladder)) {
      const lines = g.rows.map((m) => Number(m.threshold ?? m.line));
      expect([...lines].sort((a, b) => a - b)).toEqual(lines);
    }
    expect(new Set(groups.map((g) => g.section))).toEqual(new Set(['lines', 'periods', 'players', 'props']));
  });

  it('keeps the newest model price per market', () => {
    const p = latestPrices(detail.model_prices);
    expect(p.size).toBe(new Set(detail.model_prices.map((x) => x.market_id)).size);
  });

  it('writes contract semantics readably without changing them', () => {
    expect(humanize('YES iff Josh Allen attempts (FULL) >= 30.0')).toBe('Josh Allen attempts ≥ 30.0');
    expect(humanize('YES iff team margin > 0 (FULL) [subject: BUF]')).toBe('team margin > 0 · BUF');
  });
});

describe('chart data mapping', () => {
  it('maps a player ladder to its simulated quantiles', () => {
    const allen = readSnapshot<EntityProfileDoc>('explorer/players/prt_06ec4b4943c66094d6f3.json');
    const att = allen.markets.filter((m) => statOf(m) === 'attempts');
    expect(att.length).toBeGreaterThan(1);
    const sim = allen.metrics.find((o) => o.metric_id === 'met_nfl.sim_attempts');
    const q = quantilesOf(sim)!;
    expect(q.p05).toBeLessThan(q.p50!);
    expect(q.p50).toBeLessThan(q.p95!);
    expect(q.mean).toBe(sim!.value);
  });

  it('bars grow from zero and the domain covers mean and median', () => {
    expect(rankDomain([-0.1, 0.2], 0.01, -0.02)).toEqual([-0.1, 0.2]);
    expect(rankDomain([0.3, 0.5], 0.4, 0.41)).toEqual([0, 0.5]);
  });
});
