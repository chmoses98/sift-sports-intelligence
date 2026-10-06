// Nothing internal reaches a reader: publication codes, statuses, nflverse ids and tickers inside prose are
// written for people; the packet (a machine-readable export) keeps the publication's own text.
import { describe, expect, it } from 'vitest';
import { gameName } from '../src/charts/TrendChart';
import { displayName } from '../src/lib/format';
import { readableNote } from '../src/lib/marketLabel';
import { statusWord, windowName } from '../src/lib/nfl';

describe('readable labels', () => {
  it('window codes and availability statuses become words', () => {
    expect(windowName('ADJ_RIDGE')).toBe('Opponent-adjusted');
    expect(windowName('L34')).toBe('Last 34 games');
    expect(windowName('SOME_NEW_WINDOW')).toBe('Some new window');
    expect(statusWord('INJURED_RESERVE')).toBe('Injured reserve');
    expect(statusWord('QUESTIONABLE')).toBe('Questionable');
    expect(statusWord('NEW_STATUS')).toBe('New status');
  });

  it('tickers inside publication questions are written as market titles', () => {
    const q = 'The model disagrees by -0.537 on KXNFLRSHYDS-26OCT05ATLNO-ATLBROBINSON7-80 (Bijan Robinson). Is that a mean difference?';
    // From the ticker alone the title abbreviates the player, so the publication's "(Bijan Robinson)" stays.
    const bare = readableNote(q);
    expect(bare).not.toMatch(/KX[A-Z0-9]+-/);
    expect(bare).toContain('(Bijan Robinson)');
    // With the game's markets (as on the game page) the title names him, and the repeat is dropped.
    const known = new Map([['KXNFLRSHYDS-26OCT05ATLNO-ATLBROBINSON7-80', { kalshi_ticker: 'KXNFLRSHYDS-26OCT05ATLNO-ATLBROBINSON7-80', market_family: 'player_stat', threshold: 80, extensions: { stat: 'rushing_yards', subject: 'Bijan Robinson' } }]]);
    const out = readableNote(q, known as never);
    expect(out).toContain('“Bijan Robinson over 79.5 rushing yards”');
    expect(out).not.toMatch(/\(Bijan Robinson\)/);
    expect(readableNote('No ticker here.')).toBe('No ticker here.');
  });

  it('nflverse game ids and doubled shared-city names read naturally', () => {
    expect(gameName('2025_13_MIN_SEA', '2025-11-30T18:00:00Z')).toBe('2025 · Wk 13');
    expect(gameName('2025_19_LA_PHI', '2026-01-11T18:00:00Z')).toBe('2025 · Wild Card');
    expect(gameName('evt_123', '2026-09-27T17:00:00Z')).not.toContain('evt_');
    expect(displayName('Los Angeles Chargers Chargers')).toBe('Los Angeles Chargers');
    expect(displayName('New York Jets Jets')).toBe('New York Jets');
    expect(displayName('Buffalo Bills')).toBe('Buffalo Bills');
  });
});
