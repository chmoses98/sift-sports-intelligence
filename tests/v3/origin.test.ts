import { describe, expect, it } from 'vitest';
import { carryOrigin, ORIGIN_FALLBACK, ORIGIN_KEY, originFor, planBack, positionOf, readOrigin, withOrigin } from '../../src/v3/nav/origin';

describe('origin marker', () => {
  it('reads a position, null, or undecided; never trusts a malformed value', () => {
    expect(readOrigin({ [ORIGIN_KEY]: 3 })).toBe(3);
    expect(readOrigin({ [ORIGIN_KEY]: 0 })).toBe(0);
    expect(readOrigin({ [ORIGIN_KEY]: null })).toBeNull();
    for (const bad of [undefined, null, 'x', 7, {}, { [ORIGIN_KEY]: -1 }, { [ORIGIN_KEY]: 1.5 }, { [ORIGIN_KEY]: '2' }, { [ORIGIN_KEY]: NaN }]) expect(readOrigin(bad)).toBeUndefined();
  });
  it('writes the marker without losing other state (an open sheet flag)', () => {
    expect(withOrigin({ v3sheet: 'abc' }, 4)).toEqual({ v3sheet: 'abc', [ORIGIN_KEY]: 4 });
    expect(withOrigin(null, null)).toEqual({ [ORIGIN_KEY]: null });
  });
  it('carries only the marker onto a replacement entry', () => {
    expect(carryOrigin({ v3sheet: 'abc', [ORIGIN_KEY]: 2 })).toEqual({ [ORIGIN_KEY]: 2 });
    expect(carryOrigin({ [ORIGIN_KEY]: null })).toEqual({ [ORIGIN_KEY]: null });
    expect(carryOrigin({ v3sheet: 'abc' })).toBeNull();
    expect(carryOrigin(null)).toBeNull();
  });
  it('the entry just below a first-seen game is its origin; the first entry of a tab has none', () => {
    expect(originFor(1)).toBe(0);
    expect(originFor(5)).toBe(4);
    expect(originFor(0)).toBeNull();
    expect(originFor(null)).toBeNull();
  });
  it('reads the history position', () => {
    expect(positionOf({ usr: null, key: 'k', idx: 3 })).toBe(3);
    expect(positionOf({ idx: 0 })).toBe(0);
    for (const bad of [null, undefined, {}, { idx: '1' }, { idx: -1 }]) expect(positionOf(bad)).toBeNull();
  });
});

describe('planBack', () => {
  it('goes to the origin in one step, however far above it the entry is', () => {
    expect(planBack({ [ORIGIN_KEY]: 2 }, 3)).toEqual({ kind: 'pop', delta: -1 });
    // opened from Home (0); a unit pushed (2) and a tab changed after it (3): Back still lands on Home, not the intermediate game entry
    expect(planBack({ [ORIGIN_KEY]: 0 }, 3)).toEqual({ kind: 'pop', delta: -3 });
  });
  it('a deep link has no origin: Home, replacing the entry', () => {
    expect(planBack({ [ORIGIN_KEY]: null }, 0)).toEqual({ kind: 'fallback', to: ORIGIN_FALLBACK });
    expect(ORIGIN_FALLBACK).toBe('/v3');
    expect(planBack(null, 0)).toEqual({ kind: 'fallback', to: '/v3' });
    expect(planBack(null, null)).toEqual({ kind: 'fallback', to: '/v3' });
  });
  it('an origin at or above the entry is stale (history was rewritten): treated as none', () => {
    expect(planBack({ [ORIGIN_KEY]: 5 }, 3)).toEqual({ kind: 'fallback', to: '/v3' });
    expect(planBack({ [ORIGIN_KEY]: 3 }, 3)).toEqual({ kind: 'fallback', to: '/v3' });
  });
  it('an unmarked entry with history below it steps back once (the old behaviour)', () => {
    expect(planBack(null, 2)).toEqual({ kind: 'pop', delta: -1 });
  });
});
