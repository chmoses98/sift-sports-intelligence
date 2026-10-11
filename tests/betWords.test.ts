// Conventional betting words, only where the settlement is unambiguous; everything else keeps its explicit side.
import { describe, expect, it } from 'vitest';
import { betPhrase, plainClubTitle } from '../src/lib/betWords';

describe('betPhrase', () => {
  it('reads the NO side of a threshold as the Under', () => {
    expect(betPhrase('NO', 'Total goals over 3.5').text).toBe('Total goals under 3.5');
    expect(betPhrase('NO', 'Over 20.5 games').text).toBe('Under 20.5 games');
    expect(betPhrase('NO', 'Chicago team total over 3.5 goals').text).toBe('Chicago team total under 3.5 goals');
    expect(betPhrase('NO', 'Nikolaj Ehlers: 1+ goals').text).toBe('Nikolaj Ehlers: under 0.5 goals');
  });
  it('never turns NO on a winner into the opponent winning (draws exist)', () => {
    expect(betPhrase('NO', 'Minnesota to win').text).toBe('Minnesota not to win');
    expect(betPhrase('NO', 'Vancouver −1.5').text).toBe('Vancouver does not cover −1.5');
    expect(betPhrase('NO', 'away wins by more than 1.5').text).toBe('away does not win by more than 1.5');
  });
  it('keeps YES as the contract reads, and the explicit side when no rule applies', () => {
    expect(betPhrase('YES', 'Total goals over 3.5').text).toBe('Total goals over 3.5');
    expect(betPhrase('NO', 'Result: home')).toMatchObject({ text: 'NO · Result: home', rewritten: false });
    expect(betPhrase('NO', 'Total goals over 3.5').exact).toBe('NO on Total goals over 3.5');
  });
});

describe('Kalshi one-letter club names', () => {
  it('spells out a shared-city club only where the letter names one club', () => {
    expect(betPhrase('NO', 'New York R -1.5').text).toBe('NY Rangers does not cover −1.5');
    expect(betPhrase('YES', 'New York I to win').text).toBe('NY Islanders to win');
    expect(plainClubTitle('Los Angeles C -3.5')).toBe('Los Angeles C -3.5');
    expect(plainClubTitle('New York Rangers to win')).toBe('New York Rangers to win');
  });
});
