import { describe, expect, it } from 'vitest';
import { marginWords } from '../src/views/cbb/data';

describe('CBB pages use the sport-wide spread display contract', () => {
  it('prints the winner as a negative spread, not a raw signed model margin', () => {
    expect(marginWords(20.1, 'BYU', 'MTST')).toBe('BYU −20.1');
    expect(marginWords(-3.0, 'BYU', 'MTST')).toBe('MTST −3');
    expect(marginWords(0, 'BYU', 'MTST')).toBe('Pick’em');
    expect(marginWords(null, 'BYU', 'MTST')).toBe('—');
  });
});
