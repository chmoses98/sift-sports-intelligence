// Small honesty and reachability guarantees found in review: a price line never prints an age it does not have, and a heading that counts
// reasons to look again shows every one of them.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { priceLine } from '../src/v4/words';
import { Reasons } from '../src/v4/Board';
import type { LookReason } from '../src/v4/boardModel';

describe('the Game header price line', () => {
  it('says there are no prices, no capture time, or the source and age; never Infinity', () => {
    expect(priceLine(0, 'UNKNOWN', null)).toBe('No prices published');
    expect(priceLine(0, 'FRESH', 5000)).toBe('No prices published');
    expect(priceLine(4, 'UNKNOWN', null)).toBe('Prices · no capture time');
    expect(priceLine(4, 'STALE', Infinity)).toBe('Prices · no capture time');
    expect(priceLine(4, 'FRESH', 2 * 60_000)).toBe('Prices live · 2m ago');
    expect(priceLine(4, 'AGING', 20 * 60_000)).toBe('Prices aging · 20m ago');
    expect(priceLine(4, 'STALE', 3 * 3600_000 + 11 * 60_000)).toBe('Prices stale · 3h 11m ago');
    for (const f of ['FRESH', 'AGING', 'STALE', 'UNKNOWN'] as const) for (const n of [null, NaN, Infinity, -Infinity, 0, 1, 99_999_999]) expect(priceLine(3, f, n)).not.toMatch(/Infinity|NaN|undefined|null/);
  });
});

const reason = (n: number): LookReason => ({
  key: `r${n}`, kind: 'price', text: `YES ask up ${n}¢ since saved`,
  entry: { item: { item_id: `try_${n}`, ref_kind: 'MARKET', sport: 'NFL', id: `m${n}`, extra: null, note: null, added_at: '2026-10-04T13:00:00Z' }, label: { label: `Saved market ${n}`, href: '/x' }, group: 'props', savedAt: '2026-10-04T13:00:00Z' },
  game: { key: 'g', title: 'ATL @ NO' },
} as unknown as LookReason);

describe('Worth another look', () => {
  afterEach(cleanup);
  it('shows every reason its heading counts: the first six, then "Show all N"', () => {
    const reasons = Array.from({ length: 9 }, (_, i) => reason(i + 1));
    render(<Reasons reasons={reasons} open={() => {}} />);
    const region = screen.getByRole('region', { name: 'Worth another look' });
    expect(region.querySelector('.v4-sechead__n')!.textContent).toBe('9');
    expect(within(region).getAllByRole('listitem')).toHaveLength(6);
    fireEvent.click(within(region).getByRole('button', { name: 'Show all 9' }));
    expect(within(region).getAllByRole('listitem')).toHaveLength(9);
    expect(within(region).getByRole('button', { name: 'Show the first 6' }).getAttribute('aria-expanded')).toBe('true');
  });
  it('six or fewer need no control', () => {
    render(<Reasons reasons={Array.from({ length: 6 }, (_, i) => reason(i + 1))} open={() => {}} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
  });
});
