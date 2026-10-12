// Team-page and soccer hero identity (wave 2, 2026-10-12): a team page shows the club alone (never an opponent, never
// a home claim it cannot make), and club names are whole names on the identity line.
import { describe, expect, it } from 'vitest';
import { heroInputForTeam, shortName } from '../src/lib/hero/input';
import { resolveHero } from '../src/lib/hero/resolve';
import { accentOnDark, contrast } from '../src/lib/hero/accent';
import { teamColors } from '../src/lib/teams';

describe('team page hero', () => {
  it('is the club alone, at home, with no opponent', () => {
    const spec = resolveHero(heroInputForTeam('NFL', 'BUF', 'Buffalo Bills', '2026-10-12T12:00:00Z'));
    expect(spec.home?.short).toBe('Bills');
    expect(spec.away).toBeNull();
    expect(spec.context).toBe('home');
  });
  it('without a team code it claims no home', () => {
    const spec = resolveHero(heroInputForTeam('NFL', null, 'Unknown', '2026-10-12T12:00:00Z'));
    expect(spec.context).toBe('matchup');
    expect(spec.photo).toBeNull();
  });
  it('the accent rule reaches 3:1 on the dark frame for every NFL club', () => {
    for (const abbr of ['BUF', 'CHI', 'LV', 'HOU', 'CLE', 'WAS', 'NE', 'TEN']) {
      expect(contrast(accentOnDark(teamColors('NFL', abbr)), '#02080e')).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('soccer identity line', () => {
  it('keeps the whole club name', () => {
    expect(shortName('SOCCER', 'AJ', 'Argentinos Juniors')).toBe('Argentinos Juniors');
    expect(shortName('SOCCER', 'MUN', 'Manchester United')).toBe('Manchester United');
  });
});
