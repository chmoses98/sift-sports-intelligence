// The SIFT 2.0 type-scale codemod: sizes land on the scale, classic files keep their literal as a fallback.
import { describe, expect, it } from 'vitest';
import { snapPx, transform } from '../scripts/sift2/css-type-snap.mjs';

describe('snapPx', () => {
  it('raises anything under 12px to the floor', () => {
    expect(snapPx(9)?.[0]).toBe('micro');
    expect(snapPx(10.5)?.[0]).toBe('micro');
  });
  it('snaps to the nearest step and sends ties to the larger one', () => {
    expect(snapPx(15)?.[0]).toBe('body');
    expect(snapPx(13.5)?.[0]).toBe('small');
    expect(snapPx(22)?.[0]).toBe('h3');
  });
  it('leaves display sizes alone', () => {
    expect(snapPx(40)).toBeNull();
  });
});

describe('transform', () => {
  it('keeps the original literal as the fallback for shared files', () => {
    const { out } = transform('.a { font-size: 0.62rem; }', { fallback: true });
    expect(out).toBe('.a { font-size: var(--sift2-fs-micro, 0.62rem); }');
  });
  it('omits the fallback for sift2 files', () => {
    const { out } = transform('.a { font-size: 15px; }', { fallback: false });
    expect(out).toBe('.a { font-size: var(--sift2-fs-body); }');
  });
  it('rewrites the font shorthand, weights and Barlow families', () => {
    const { out } = transform(".a { font: 800 15px/1.2 'Barlow Condensed', Barlow, sans-serif; }", { fallback: false });
    expect(out).toBe('.a { font: 700 var(--sift2-fs-body)/1.2 var(--font-cond); }');
  });
  it('does not touch clamp(), calc() or var() sizes', () => {
    const css = '.a { font-size: clamp(1rem, 2vw, 2rem); } .b { font-size: var(--fs-sm); }';
    expect(transform(css, { fallback: true }).out).toBe(css);
  });
  it('is idempotent', () => {
    const once = transform('.a { font-size: 11px; }', { fallback: true }).out;
    expect(transform(once, { fallback: true }).out).toBe(once);
  });
});
