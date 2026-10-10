import { describe, expect, it } from 'vitest';
import { quantileMass, quantilePoints } from '../src/components/fxResearch';

describe('quantileMass (published quantiles drawn as blocks)', () => {
  const pts = quantilePoints({ p05: 100, p25: 150, p50: 200, p75: 250, p95: 300 })!;

  it('keeps exactly the 90% the quantiles span, and no tail', () => {
    const q = quantileMass(pts, 20)!;
    const total = q.mass.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(0.9, 10);
    expect(q.edges[0]).toBe(100);
    expect(q.edges[q.edges.length - 1]).toBe(300);
  });

  it('spreads each span evenly: the middle half holds half the games', () => {
    const q = quantileMass(pts, 4)!;
    expect(q.mass.map((m) => Math.round(m * 100) / 100)).toEqual([0.2, 0.25, 0.25, 0.2]);
  });

  it('refuses to draw a spread too narrow to be honest', () => {
    expect(quantileMass(quantilePoints({ p05: 0, p25: 0, p50: 0, p75: 0, p95: 1 })!, 10)).toBeNull();
  });

  it('needs at least three published quantiles', () => {
    expect(quantilePoints({ p05: 1, p95: 9 })).toBeNull();
  });
});
