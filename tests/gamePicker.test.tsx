// The phone game picker (components/GamePicker.tsx) on BottomSheet (components/BottomSheet.tsx): a searchable sheet of
// matchup tiles that replaces the native <select> on phones; the select stays on desktop.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePicker, pickerGroups, type PickGame } from '../src/components/GamePicker';

const at = (iso: string) => Date.parse(iso);
const G = (id: string, a: string, h: string, iso: string, sport = 'NFL', names?: [string, string]): PickGame => ({ id, sport, away: { abbr: a, name: names?.[0] }, home: { abbr: h, name: names?.[1] }, startMs: at(iso) });
const games = [
  G('1', 'NE', 'BUF', '2026-10-04T17:00:00Z', 'NFL', ['New England Patriots', 'Buffalo Bills']),
  G('2', 'TEN', 'BAL', '2026-10-04T17:00:00Z', 'NFL', ['Tennessee Titans', 'Baltimore Ravens']),
  G('3', 'KC', 'LV', '2026-10-05T00:20:00Z', 'NFL', ['Kansas City Chiefs', 'Las Vegas Raiders']),
  G('4', 'BOS', 'NYK', '2026-10-05T23:00:00Z', 'NBA', ['Boston Celtics', 'New York Knicks']),
];

function phone(matches: boolean) {
  window.matchMedia = ((q: string) => ({ matches: matches && q.includes('719'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
beforeEach(() => { process.env.TZ = 'UTC'; });
afterEach(() => { cleanup(); document.documentElement.style.overflow = ''; });

describe('pickerGroups', () => {
  it('groups by local day in start order and keeps every game when nothing filters', () => {
    const g = pickerGroups(games, '', null);
    expect(g.map((d) => d.games.length)).toEqual([2, 2]);
    expect(g.flatMap((d) => d.games.map((x) => x.id))).toEqual(['1', '2', '3', '4']);
  });
  it('searches abbreviations, names and sport, and filters by sport', () => {
    expect(pickerGroups(games, 'buf', null).flatMap((d) => d.games).map((x) => x.id)).toEqual(['1']);
    expect(pickerGroups(games, 'chiefs', null).flatMap((d) => d.games).map((x) => x.id)).toEqual(['3']);
    expect(pickerGroups(games, 'nba', null).flatMap((d) => d.games).map((x) => x.id)).toEqual(['4']);
    expect(pickerGroups(games, '', 'NBA').flatMap((d) => d.games).map((x) => x.id)).toEqual(['4']);
    expect(pickerGroups(games, 'zzz', null)).toEqual([]);
  });
  it('keeps a game with no usable start, last', () => {
    const g = pickerGroups([...games, G('9', 'A', 'B', 'not-a-date')], '', null);
    expect(g.at(-1)!.day).toBe('Time to be confirmed');
  });
  it('handles a 150-game slate', () => {
    const big = Array.from({ length: 150 }, (_, i) => G(`g${i}`, `A${i}`, `H${i}`, new Date(at('2026-10-04T12:00:00Z') + i * 1800_000).toISOString()));
    expect(pickerGroups(big, '', null).flatMap((d) => d.games)).toHaveLength(150);
    expect(pickerGroups(big, 'a14', null).flatMap((d) => d.games).length).toBeLessThan(150);
  });
});

describe('GamePicker on a phone', () => {
  it('opens a labelled modal sheet with All games and a tile per game; the chosen game is marked', () => {
    phone(true);
    render(<GamePicker games={games} value="3" onChange={() => {}} />);
    const btn = screen.getByRole('button', { name: /Game.*KC @ LV/ });
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(btn);
    const dlg = screen.getByRole('dialog', { name: 'Choose a game' });
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(within(dlg).getByRole('button', { name: /All games \(4\)/ }).getAttribute('aria-pressed')).toBe('false');
    expect(within(dlg).getAllByRole('button', { pressed: true }).map((b) => b.getAttribute('aria-label')).filter(Boolean)).toEqual(['Kansas City Chiefs at Las Vegas Raiders, 12:20 AM']);
    expect(within(dlg).getByRole('button', { name: /New England Patriots at Buffalo Bills, 5:00 PM/ })).toBeTruthy();
  });
  it('shows sport filters only when the slate spans several sports', () => {
    phone(true);
    const { unmount } = render(<GamePicker games={games} value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Game/ }));
    expect(screen.getByRole('group', { name: 'Sport' })).toBeTruthy();
    unmount();
    render(<GamePicker games={games.slice(0, 3)} value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Game/ }));
    expect(screen.queryByRole('group', { name: 'Sport' })).toBeNull();
  });
  it('narrows with the search, announces the count, and says so when nothing matches', () => {
    phone(true);
    render(<GamePicker games={games} value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Game/ }));
    const search = screen.getByRole('searchbox', { name: /Search games by team/ });
    fireEvent.change(search, { target: { value: 'ravens' } });
    expect(screen.getByRole('status').textContent).toBe('1 game shown');
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /All games/ })).toBeNull();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText(/No game matches/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getAllByRole('button', { name: /, \d+:\d\d (AM|PM)$/ })).toHaveLength(4);
  });
  it('choosing a game reports it and closes the sheet; All games reports the empty id', () => {
    phone(true);
    const onChange = vi.fn();
    render(<GamePicker games={games} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Game/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tennessee Titans at Baltimore Ravens/ }));
    expect(onChange).toHaveBeenLastCalledWith('2');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /Game/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /All games \(4\)/ }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
  it('Escape and the close button dismiss it, and focus returns to the control that opened it', () => {
    phone(true);
    render(<GamePicker games={games} value="" onChange={() => {}} />);
    const btn = screen.getByRole('button', { name: /Game/ });
    btn.focus();
    fireEvent.click(btn);
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(btn);
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole('button', { name: 'Close Choose a game' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('typing in the search keeps focus there (a parent re-render must not rebuild the sheet)', () => {
    phone(true);
    render(<GamePicker games={games} value="" onChange={() => {}} />);
    const opener = screen.getByRole('button', { name: /Game/ });
    opener.focus();
    const handed = vi.spyOn(opener, 'focus');
    fireEvent.click(opener);
    const search = screen.getByRole('searchbox');
    expect(document.activeElement).toBe(search);
    for (const v of ['b', 'bu', 'buf']) {
      fireEvent.change(search, { target: { value: v } });
      expect(document.activeElement).toBe(search);
      expect(document.documentElement.style.overflow).toBe('hidden');
    }
    expect(handed).not.toHaveBeenCalled(); // focus goes back to the opener only when the sheet closes
  });
  it('keeps Tab inside the open sheet', () => {
    phone(true);
    render(<GamePicker games={games} value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Game/ }));
    const dlg = screen.getByRole('dialog');
    const last = [...dlg.querySelectorAll<HTMLElement>('button, input')].at(-1)!;
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dlg.contains(document.activeElement)).toBe(true);
  });
});

describe('GamePicker on a desktop', () => {
  it('stays a native select with All games and one option per game', () => {
    phone(false);
    const onChange = vi.fn();
    render(<GamePicker games={games} value="" onChange={onChange} />);
    const sel = screen.getByRole('combobox') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(['', '1', '2', '3', '4']);
    fireEvent.change(sel, { target: { value: '3' } });
    expect(onChange).toHaveBeenCalledWith('3');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
