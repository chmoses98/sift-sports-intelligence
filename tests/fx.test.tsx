import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { binSamples, Histogram, rankStrength, Ring } from '../src/components/fx';

describe('fx kit', () => {
  it('bins real samples without inventing mass', () => {
    const { edges, counts } = binSamples([1, 2, 2, 3, 9, Number.NaN], 4, 0, 10);
    expect(edges).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(counts).toEqual([3, 1, 0, 1]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it('a histogram with too few bins says so instead of drawing', () => {
    const { container } = render(<Histogram edges={[0, 1, 2]} counts={[1, 2]} label="x" />);
    expect(container.textContent).toMatch(/Not enough observed data/);
  });

  it('marks the line and tints the mass above it', () => {
    const { container } = render(<Histogram edges={[0, 1, 2, 3, 4]} counts={[1, 3, 2, 1]} marker={{ value: 2, label: 'Line 2' }} label="dist" />);
    expect(container.querySelectorAll('rect[fill="url(#fxh-o)"]').length).toBe(2);
    expect(container.textContent).toContain('Line 2');
  });

  it('rank strength is 1 for #1 and 0 for last; unknown stays unknown', () => {
    expect(rankStrength(1, 133)).toBe(1);
    expect(rankStrength(133, 133)).toBe(0);
    expect(rankStrength(null, 133)).toBeNull();
  });

  it('a ring is labelled for assistive tech', () => {
    const { getByRole } = render(<Ring value={0.42} label="Seattle win probability 42%" />);
    expect(getByRole('img').getAttribute('aria-label')).toBe('Seattle win probability 42%');
  });
});
