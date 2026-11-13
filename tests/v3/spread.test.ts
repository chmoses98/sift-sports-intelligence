import { describe, expect, it } from 'vitest';
import { modelSpread } from '../../src/v3/model/spread';

describe('model spread', () => {
  it('names the projected leader and rounds the margin to the half point', () => {
    expect(modelSpread(19.7, 24.6, 'PHI', 'DAL')).toEqual({ leader: 'DAL', margin: 5, label: 'DAL −5' });
    expect(modelSpread(24.1, 20.0, 'PHI', 'DAL')).toEqual({ leader: 'PHI', margin: 4, label: 'PHI −4' });
    expect(modelSpread(20, 20.2, 'PHI', 'DAL')?.label).toBe('Pick’em');
    expect(modelSpread(20, 20.3, 'PHI', 'DAL')?.label).toBe('DAL −0.5');
  });
  it('does not reverse away favourite projections like TOR at PHI on Nov 12', () => {
    expect(modelSpread(118, 116.3, 'TOR', 'PHI')?.label).toBe('TOR −1.5');
  });
  it('is absent unless both projected scores exist', () => {
    expect(modelSpread(null, 20, 'A', 'B')).toBeNull();
    expect(modelSpread(20, undefined, 'A', 'B')).toBeNull();
    expect(modelSpread(NaN, 20, 'A', 'B')).toBeNull();
  });
});
