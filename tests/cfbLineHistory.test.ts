// Texas A&M at Missouri's Trends tab said "No game-line price history" while the publication carried nine captures
// per contract: CFB names its full-game families game_moneyline / game_spread / game_total and labels sides by school
// name, so the NFL-only matcher found nothing. Real files: tests/fixtures/cfb-lines/README.md.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Market, MarketHistoryDoc } from '../src/contract/types';
import type { PriceRow } from '../src/lib/gamedata';
import { lineSeries, marketFavoriteId } from '../src/views/game/panels';

const DIR = join(__dirname, 'fixtures', 'cfb-lines');
const markets = (JSON.parse(readFileSync(join(DIR, 'markets.json'), 'utf-8')) as { markets: Market[] }).markets;
const hist = JSON.parse(readFileSync(join(DIR, 'market_history.json'), 'utf-8')) as MarketHistoryDoc;
const MIZZ = 'prt_081513711e63e4cea407';
const rows: PriceRow[] = markets.map((m) => ({
  m, label: m.yes_description ?? m.kalshi_ticker, group: 'lines' as PriceRow['group'],
  bid: m.yes_bid ?? null, ask: m.yes_ask ?? null,
  mid: m.yes_bid != null && m.yes_ask != null ? (m.yes_bid + m.yes_ask) / 2 : null, model: null, gap: null, fit: null,
}));

describe('CFB line history', () => {
  it('the market favourite is Missouri (the full-game winner contract priced higher)', () => {
    expect(marketFavoriteId(rows)).toBe(MIZZ);
  });

  it('draws the favourite moneyline, its nearest-even spread and the nearest-even total from the published captures', () => {
    const s = lineSeries(hist, rows, 'MIZZ', MIZZ);
    expect(s.length).toBe(3);
    const fam = (k: string) => markets.find((m) => m.kalshi_ticker === k)!;
    expect(fam(s[0].key).market_family).toBe('game_moneyline');
    expect(fam(s[0].key).participant_id).toBe(MIZZ);
    expect(fam(s[1].key).market_family).toBe('game_spread');
    expect(fam(s[1].key).participant_id).toBe(MIZZ);
    expect(fam(s[2].key).market_family).toBe('game_total');
    for (const x of s) expect(x.points.length).toBeGreaterThanOrEqual(2);
  });

  it('without a favourite id the old label rule still applies (NFL abbreviations), and finds nothing for CFB names', () => {
    expect(lineSeries(hist, rows, 'MIZZ').filter((x) => markets.find((m) => m.kalshi_ticker === x.key)!.market_family !== 'game_total')).toHaveLength(0);
  });
});
