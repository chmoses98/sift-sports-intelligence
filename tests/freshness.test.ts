import { describe, expect, it } from 'vitest';
import { classify, statusFor, worst } from '../src/contract/freshness';
import { cents, metricFormatter, ordinal, displayName } from '../src/lib/format';
import { pyFixed, pyG, pyRound } from '../src/contract/pyfmt';
import type { HealthDoc } from '../src/contract/types';
import { readSnapshot } from './helpers';

describe('freshness (contract freshness.py)', () => {
  const th = { fresh_after_seconds: 900, stale_after_seconds: 3600 };
  it('classifies by the publication thresholds', () => {
    expect(classify(null, th)).toBe('UNKNOWN');
    expect(classify(-5, th)).toBe('FRESH');
    expect(classify(900, th)).toBe('FRESH');
    expect(classify(901, th)).toBe('AGING');
    expect(classify(3600, th)).toBe('AGING');
    expect(classify(3601, th)).toBe('STALE');
  });
  it('recomputes the published verdict at read time', () => {
    const h = readSnapshot<HealthDoc>('health.json');
    // At export time the market data was as fresh as the publication said...
    expect(statusFor(h.last_market_capture, 'market_data', h.generated_at!, h.thresholds.market_data)).toBe(h.components.market_data.age_seconds! <= h.thresholds.market_data.fresh_after_seconds ? 'FRESH' : 'AGING');
    // ...and a day later the same capture is STALE, never silently fresh.
    expect(statusFor(h.last_market_capture, 'market_data', Date.parse(h.generated_at!) + 86400e3, h.thresholds.market_data)).toBe('STALE');
  });
  it('worst() ranks UNKNOWN below STALE', () => {
    expect(worst('FRESH', 'AGING')).toBe('AGING');
    expect(worst('STALE', 'UNKNOWN', 'FRESH')).toBe('UNKNOWN');
    expect(worst()).toBe('UNKNOWN');
  });
});

describe('formatting', () => {
  it('matches Python float formatting, ties included', () => {
    expect(pyFixed(0.125, 2)).toBe('0.12');
    expect(pyFixed(0.375, 2)).toBe('0.38');
    expect(pyFixed(2.5, 0)).toBe('2');
    expect(pyFixed(-0.0151, 3)).toBe('-0.015');
    expect(pyG(30)).toBe('30');
    expect(pyG(49.5)).toBe('49.5');
    expect(pyG(0.0001)).toBe('0.0001');
    expect(pyG(1234567)).toBe('1.23457e+06');
    expect(pyRound(73.5, 1)).toBe(73.5);
  });
  it('writes metric values by unit', () => {
    expect(metricFormatter({ unit: 'share', stat_type: 'RATE' })(0.4512)).toBe('45.1%');
    expect(metricFormatter({ unit: 'EPA/play', stat_type: 'RATE' })(-0.1234)).toBe('−0.123');
    expect(metricFormatter({ unit: 'deviation from league mean', stat_type: 'RATING' }, 0.02)(0.0041)).toBe('+0.0041');
    expect(cents(0.735)).toBe('73.5¢');
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(13)).toBe('13th');
  });
  it('drops a repeated nickname for display only', () => {
    expect(displayName('New York Jets Jets')).toBe('New York Jets');
    expect(displayName('Buffalo Bills')).toBe('Buffalo Bills');
  });
});

describe('freshness for a component without a policy', () => {
  // The live Soccer and Tennis health manifests list components Sift has no default thresholds for and publish
  // none of their own; their sport pages crashed on it. The honest answer is UNKNOWN.
  it('is UNKNOWN, not a crash', () => {
    expect(statusFor('2026-10-08T00:00:00Z', 'player_ratings', Date.parse('2026-10-08T00:05:00Z'))).toBe('UNKNOWN');
    expect(statusFor(null, 'player_ratings', Date.now())).toBe('UNKNOWN');
    expect(statusFor('2026-10-08T00:00:00Z', 'model', Date.parse('2026-10-08T00:05:00Z'))).toBe('FRESH');
  });
});
