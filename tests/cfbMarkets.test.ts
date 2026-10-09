import { describe, expect, it } from 'vitest';
import { cfbMarketHeading } from '../src/lib/cfbMarkets';
import { isFullGame, periodCode, periodWords } from '../src/lib/period';
import { groupMarkets } from '../src/components/MarketBoard';

const mk = (ticker: string, market_family: string, period: string) => ({ kalshi_ticker: `${ticker}-26OCT10TXAMMIZZ-MIZZ`, market_family, period });

describe('CFB market headings: plain English, never an internal token', () => {
  it.each([
    ['KXNCAAFGAME', 'game_moneyline', 'full_game', 'Full game moneyline'],
    ['KXNCAAFSPREAD', 'game_spread', 'full_game', 'Full game spread'],
    ['KXNCAAFTOTAL', 'game_total', 'full_game', 'Full game total'],
    ['KXNCAAFTEAMTOTAL', 'team_total', 'full_game', 'Full game team total'],
    ['KXNCAAF1H', 'first_half_moneyline', 'first_half', 'First half moneyline'],
    ['KXNCAAF1HSPREAD', 'first_half_spread', 'first_half', 'First half spread'],
    ['KXNCAAF1HTOTAL', 'first_half_total', 'first_half', 'First half total'],
    ['KXNCAAF1HTEAMTOTAL', 'first_half_team_total', 'first_half', 'First half team total'],
    ['KXNCAAF2H', 'second_half_moneyline', 'second_half', 'Second half moneyline'],
    ['KXNCAAF2HTOTAL', 'second_half_total', 'second_half', 'Second half total'],
    ['KXNCAAF1Q', 'quarter_moneyline', 'first_quarter', 'First quarter moneyline'],
    ['KXNCAAF1QSPREAD', 'quarter_spread', 'first_quarter', 'First quarter spread'],
    ['KXNCAAF3QTOTAL', 'quarter_total', 'third_quarter', 'Third quarter total'],
    ['KXNCAAF4QSPREAD', 'quarter_spread', 'fourth_quarter', 'Fourth quarter spread'],
    ['KXNCAAFOT', 'overtime', 'overtime', 'Overtime'],
    ['KXNCAAFFIRSTTDTEAM', 'touchdown_scorer', 'full_game', 'First team to score a touchdown'],
    ['KXNCAAFTEAMRECYDS', 'team_stat_prop', 'full_game', 'Team receiving yards'],
    ['KXNCAAFTEAMRECTD', 'team_stat_prop', 'full_game', 'Team receiving touchdowns'],
    ['KXNCAAFDSTTD', 'game_stat_prop', 'full_game', 'Defense or special teams touchdown'],
    ['KXNCAAFTOTALFG', 'game_stat_prop', 'full_game', 'Total field goals'],
    ['KXNCAAF1HFT', 'unknown', 'unknown', 'First half and full game result'],
    ['KXNCAAFDELAY', 'unknown', 'unknown', 'Weather delay'],
  ])('%s → %s', (series, family, period, heading) => {
    const h = cfbMarketHeading(mk(series, family, period));
    expect(h).toBe(heading);
    expect(h).not.toMatch(/_|full_game|first_half|·/);
  });

  it('an unknown CFB series still reads in words, never as a token', () => {
    expect(cfbMarketHeading(mk('KXNCAAFNEWTHING', 'first_half_team_stat_prop', 'first_half'))).toBe('First half team stat prop');
    expect(cfbMarketHeading(mk('KXNCAAFNEWTHING', 'unknown', 'unknown'))).toBe('Other market');
  });

  it('other sports keep their own labels', () => {
    expect(cfbMarketHeading({ kalshi_ticker: 'KXNFLGAME-26OCT11BUFNYJ-BUF', market_family: 'game_winner', period: 'FULL' })).toBeNull();
    expect(cfbMarketHeading({ kalshi_ticker: 'KXNHLGAME-26OCT11BOSNYR-BOS', market_family: 'game_winner', period: 'FULL' })).toBeNull();
  });
});

describe('periods: the CFB lower-case tokens', () => {
  it('full_game is the full game; the others read as words and short codes', () => {
    expect(isFullGame('full_game')).toBe(true);
    expect(periodCode('full_game')).toBeNull();
    expect(periodCode('unknown')).toBeNull();
    expect(periodCode('first_half')).toBe('1H');
    expect(periodCode('third_quarter')).toBe('3Q');
    expect(periodCode('overtime')).toBe('OT');
    expect(periodWords('second_half')).toBe('Second half');
  });
  it('the NFL/NHL/MLB periods are unchanged', () => {
    expect(isFullGame('FULL')).toBe(true);
    expect(isFullGame('FULL_GAME')).toBe(true);
    expect(periodCode('1H')).toBe('1H');
    expect(periodCode('FULL')).toBeNull();
    expect(periodWords('2Q')).toBe('2Q');
    expect(periodWords('F5')).toBe('First 5 innings');
  });
});

describe('the CFB market board', () => {
  const m = (ticker: string, market_family: string, period: string, extra: Record<string, unknown> = {}) => ({
    market_id: ticker, kalshi_ticker: ticker, market_family, period, event_id: 'e', participant_id: null, player_id: null,
    yes_bid: 0.4, yes_ask: 0.45, yes_description: 'x', line: null, threshold: null, ...extra,
  });
  const groups = groupMarkets([
    m('KXNCAAFGAME-26OCT10TXAMMIZZ-MIZZ', 'game_moneyline', 'full_game'),
    m('KXNCAAFSPREAD-26OCT10TXAMMIZZ-MIZZ7', 'game_spread', 'full_game', { threshold: 6.5 }),
    m('KXNCAAF1H-26OCT10TXAMMIZZ-MIZZ', 'first_half_moneyline', 'first_half'),
    m('KXNCAAFOT-26OCT10TXAMMIZZ-1', 'overtime', 'overtime'),
    m('KXNCAAF1HFT-26OCT10TXAMMIZZ-MIZZMIZZ', 'unknown', 'unknown'),
  ] as never, () => null);
  const by = Object.fromEntries(groups.map((g) => [g.title, g.section]));
  it('titles every group in words and files full-game lines as game lines', () => {
    expect(by).toEqual({
      'Full game moneyline': 'lines',
      'Full game spread': 'lines',
      'First half moneyline': 'periods',
      Overtime: 'periods',
      'First half and full game result': 'props',
    });
  });
});
