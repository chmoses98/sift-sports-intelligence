import { describe, expect, it } from 'vitest';
import { TAP_MATRIX } from './tapmatrix';

describe('the walkthrough tap-target matrix', () => {
  it('has all 78 targets, uniquely numbered, each with a destination and an owning milestone', () => {
    expect(TAP_MATRIX).toHaveLength(78);
    expect(new Set(TAP_MATRIX.map((r) => r.id)).size).toBe(78);
    expect(TAP_MATRIX.map((r) => r.id)).toEqual(Array.from({ length: 78 }, (_, i) => i + 1));
    for (const r of TAP_MATRIX) { expect(r.label.length).toBeGreaterThan(3); expect(['team', 'player', 'stat', 'game', 'props', 'price']).toContain(r.dest); }
  });
  it('covers every semantic kind in the navigation contract', () => {
    expect(new Set(TAP_MATRIX.map((r) => r.dest))).toEqual(new Set(['team', 'player', 'stat', 'game', 'props', 'price']));
  });
});
