import { describe, expect, it } from 'vitest';
import {
  spreadFromHomeMargin,
  spreadFromHomeHandicap,
  spreadFromScores,
  spreadFromFinalScores,
} from '../src/lib/spreadNotation';

describe('canonical team-first spread notation (all sports)', () => {
  it('renders a home-favourite projection with the standard minus sign', () => {
    expect(spreadFromHomeMargin(6.5, 'PHI', 'TOR')?.label).toBe('PHI −6.5');
    expect(spreadFromScores(113.5, 107, 'PHI', 'TOR')?.label).toBe('PHI −6.5');
    expect(spreadFromHomeMargin(20.1, 'BYU', 'MTST')?.label).toBe('BYU −20.1');
  });

  it('labels away favourites correctly when the native home margin is negative', () => {
    // Nov 12: PHI is home, model predicts Toronto by 1.7, not Philly −1.7.
    expect(spreadFromHomeMargin(-1.7, 'PHI', 'TOR')?.label).toBe('TOR −1.7');
    expect(spreadFromHomeMargin(-12.8, 'DAL', 'MIN')?.label).toBe('MIN −12.8');
  });

  it('prints final result notation without confusing a final margin with a market handicap', () => {
    expect(spreadFromFinalScores(112, 101, 'PHI', 'TOR')?.label).toBe('PHI −11');
    expect(spreadFromFinalScores(101, 104, 'PHI', 'TOR')?.label).toBe('TOR −3');
    expect(spreadFromFinalScores(3, 2, 'BOS', 'MTL')?.label).toBe('BOS −1');
    expect(spreadFromFinalScores(21, 24, 'NYG', 'WAS')?.label).toBe('WAS −3');
  });

  it('keeps the distinct sportsbook handicap sign direction', () => {
    expect(spreadFromHomeHandicap(-6.5, 'PHI', 'TOR')?.label).toBe('PHI −6.5');
    expect(spreadFromHomeHandicap(6.5, 'PHI', 'TOR')?.label).toBe('TOR −6.5');
    expect(spreadFromHomeHandicap(-3, 'PHI', 'TOR')?.label).toBe('PHI −3');
  });

  it('shows pick em when tied or rounded to zero, and never fabricates absent scores', () => {
    expect(spreadFromScores(100, 100, 'PHI', 'TOR')?.label).toBe('Pick’em');
    expect(spreadFromScores(100.12, 100, 'PHI', 'TOR', { roundTo: 0.5 })?.label).toBe('Pick’em');
    expect(spreadFromHomeMargin(6.49, 'PHI', 'TOR', { roundTo: 0.5 })?.label).toBe('PHI −6.5');
    expect(spreadFromFinalScores(null, 102, 'PHI', 'TOR')).toBeNull();
    expect(spreadFromHomeMargin(NaN, 'PHI', 'TOR')).toBeNull();
    expect(spreadFromHomeHandicap(Infinity, 'PHI', 'TOR')).toBeNull();
    expect(spreadFromHomeMargin(2, 'PHI', 'PHI')).toBeNull();
  });

  it('does not strip significant zeroes from whole-number margins', () => {
    expect(spreadFromFinalScores(130, 100, 'PHI', 'TOR')?.label).toBe('PHI −30');
    expect(spreadFromHomeMargin(20, 'PHI', 'TOR')?.label).toBe('PHI −20');
  });
});
