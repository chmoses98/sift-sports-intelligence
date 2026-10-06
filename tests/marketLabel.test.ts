import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EventDetailDoc } from '../src/contract/types';
import { describeMarket, overLine, parseKalshiTicker, tickerTitle } from '../src/lib/marketLabel';
import { readSnapshot } from './helpers';

const NICK: Record<string, string> = {};
const details = readdirSync(`${__dirname}/../public/data/nfl/app/latest/event_detail`).map((f) => readSnapshot<EventDetailDoc>(`event_detail/${f}`));

describe('human-readable market labels', () => {
  it('turns Kalshi YES conditions into sportsbook language', () => {
    const base = { kalshi_ticker: 'KXNFLGAME-26OCT05ATLNO-ATL', period: 'FULL', player_id: null, extensions: {} };
    const abbrOf = (pid: string | null) => (pid === 'p_atl' ? 'ATL' : pid === 'p_no' ? 'NO' : null);
    expect(describeMarket({ ...base, market_family: 'game_winner', participant_id: 'p_atl', threshold: null }, { abbrOf }).title).toBe('Falcons moneyline');
    expect(describeMarket({ ...base, kalshi_ticker: 'KXNFLSPREAD-26OCT05ATLNO-ATL4', market_family: 'spread', participant_id: 'p_atl', threshold: 3.5 }, { abbrOf }).title).toBe('Falcons −3.5');
    expect(describeMarket({ ...base, kalshi_ticker: 'KXNFLTEAMTOTAL-26OCT05ATLNO-ATL25', market_family: 'team_total', participant_id: 'p_atl', threshold: 25 }, { abbrOf }).title).toBe('Falcons team total over 24.5');
    expect(describeMarket({ ...base, kalshi_ticker: 'KXNFLTOTAL-26OCT05ATLNO-48', market_family: 'total', participant_id: null, threshold: 48 }, { abbrOf }).title).toBe('Game total over 47.5');
    expect(describeMarket({ ...base, kalshi_ticker: 'KXNFL1HSPREAD-26OCT05ATLNO-ATL2', market_family: 'spread', period: '1H', participant_id: 'p_atl', threshold: 1.5 }, { abbrOf }).title).toBe('First-half Falcons −1.5');
    expect(describeMarket({ ...base, kalshi_ticker: 'KXNFLRSHYDS-26OCT05ATLNO-ATLBROBINSON7-80', market_family: 'player_stat', participant_id: null, player_id: 'b', threshold: 80, extensions: { stat: 'rushing_yards' } }, { playerName: () => 'Bijan Robinson' }).title).toBe('Bijan Robinson over 79.5 rushing yards');
    expect(describeMarket({ ...base, kalshi_ticker: 'KXNFLWINMARGIN-26OCT05ATLNO-ATL1TO6', market_family: 'win_margin_bucket', participant_id: 'p_atl', threshold: null }, { abbrOf }).title).toBe('Falcons win by 1–6');
  });

  it('parses a bare ticker when nothing else is known', () => {
    expect(parseKalshiTicker('KXNFLSPREAD-26OCT04NYJCHI-CHI10')).toMatchObject({ away: 'NYJ', home: 'CHI', kind: 'spread' });
    expect(tickerTitle('KXNFLSPREAD-26OCT04NYJCHI-CHI10')).toBe('Bears −9.5');
    expect(tickerTitle('KXNFL2HTOTAL-26OCT05ATLNO-4')).toBe('Second-half total over 3.5');
    expect(tickerTitle('KXNFLRECYDS-26OCT05ATLNO-ATLBROBINSON7-40')).toBe('B. Robinson over 39.5 receiving yards');
    expect(tickerTitle('KXNFLFFPTS-26OCT04NYJCHI-CHIDSWIFT4-16P6')).toBe('D. Swift 17+ fantasy points');
    expect(tickerTitle('KXNFLFG-26OCT04NYJCHI-CHI2')).toBe('Bears over 1.5 field goals');
    expect(tickerTitle('KXNFLOT-26OCT04NYJCHI-Y')).toBe('Game goes to overtime');
    expect(overLine(48)).toBe('47.5');
    expect(overLine(9.5)).toBe('9.5');
  });

  it('never shows a raw ticker for any published NFL market', () => {
    let n = 0;
    for (const d of details) {
      const abbr = new Map<string, string>();
      for (const m of d.markets) if (m.participant_id) abbr.set(m.participant_id, '');
      for (const m of d.markets) {
        const l = describeMarket(m, { abbrOf: () => null, playerName: () => null, teamName: (a) => NICK[a] ?? null });
        expect(l.title, m.kalshi_ticker).not.toMatch(/KX[A-Z0-9]+-/);
        expect(l.title, m.kalshi_ticker).not.toMatch(/YES iff|_/);
        expect(l.title, m.kalshi_ticker).not.toBe('Kalshi contract');
        n++;
      }
    }
    expect(n).toBeGreaterThan(10000);
  });
});
