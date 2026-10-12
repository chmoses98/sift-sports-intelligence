// Prop explorer components: the game-log chart colours each game by its result against today's line and explains a
// game on hover/tap/keyboard; the market carousel moves along with the arrow keys; the hit summary never reads as
// a chance.
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { hitRate } from '../src/history/hitRate';
import { statDef } from '../src/history/stats';
import type { GameLogRow } from '../src/history/types';
import type { PropRow } from '../src/insights/propBoard';
import { HitSummary } from '../src/views/props/HitRate';
import { MarketCarousel } from '../src/views/props/MarketCarousel';
import { PerfChart } from '../src/views/props/PerfChart';

const rec = statDef('receptions')!;
const row = (i: number, v: number): GameLogRow => ({
  season: 2026, week: i + 1, game_id: `g${i}`, season_type: 'REG', date: `2026-09-${String(10 + i).padStart(2, '0')}`, team: 'ATL', opp: ['NO', 'TB', 'CAR', 'MIN'][i % 4], home: i % 2 === 0, score: { for: 20, against: 17 },
  snaps: { off: 50, pct: 0.8 }, passing: null, rushing: { car: 0, yds: 0, td: 0, long: null }, receiving: { tgt: v + 2, rec: v, yds: 0, td: 0, long: null, target_share: null, air_share: null },
});
const h = hitRate({ prior: [], current: [row(0, 6), row(1, 3), row(2, 5), row(3, 7)] }, rec, 5, 'season');

describe('PerfChart', () => {
  it('draws one bar per game coloured by over / under / push against the line', () => {
    const { container } = render(<PerfChart h={h} statLabel="Receptions" unit="rec" season={2026} projection={null} />);
    expect(container.querySelectorAll('.pchart__g--over')).toHaveLength(2);
    expect(container.querySelectorAll('.pchart__g--under')).toHaveLength(1);
    expect(container.querySelectorAll('.pchart__g--push')).toHaveLength(1);
    expect(container.querySelector('.pchart__lineLab')?.textContent).toBe('Line 5');
  });
  it('explains a game on click and steps through games from the keyboard', () => {
    const { container } = render(<PerfChart h={h} statLabel="Receptions" unit="rec" season={2026} projection={null} />);
    fireEvent.click(container.querySelectorAll('.pchart__hit')[1]);
    expect(container.querySelector('[role=status]')!.textContent).toMatch(/W2 · at TB.*3 rec · Under 5/);
    fireEvent.keyDown(container.querySelector('.pchart__plot')!, { key: 'ArrowRight' });
    expect(container.querySelector('[role=status]')!.textContent).toMatch(/Push 5/);
  });
  it('has a table view with every game', () => {
    const { container } = render(<PerfChart h={h} statLabel="Receptions" unit="rec" season={2026} projection={{ value: 5.4, typical: [4, 7] }} />);
    expect(container.querySelector('.tableview summary')?.textContent).toBe('Table view (4 games)');
    expect(container.querySelectorAll('.tableview tbody tr')).toHaveLength(4);
    expect(container.querySelector('.pchart__proj')).not.toBeNull();
  });
});

describe('HitSummary', () => {
  it('says "n of N over" with pushes apart and the n of games played, never a chance', () => {
    const { container } = render(<HitSummary h={h} windowName="2026 season" unit="rec" />);
    const text = container.textContent ?? '';
    expect(text).toContain('2 of 4');
    expect(text).toContain('1 push');
    expect(text).toContain('n = 4 games played');
    expect(text).not.toMatch(/\d+% chance/);
  });
});

describe('MarketCarousel', () => {
  const mk = (id: string, label: string, line: number): PropRow => ({ id, def: { label, stat: id }, line, read: 'ABOVE', main: null, ladder: [] } as unknown as PropRow);
  const rows = [mk('a', 'Receiving yards', 54.5), mk('b', 'Receptions', 4.5), mk('c', 'Touchdowns', 0.5)];
  it('marks the selected market and selects another on click', () => {
    const onSelect = vi.fn();
    const { container } = render(<MarketCarousel rows={rows} selectedId="a" onSelect={onSelect} label="Markets" />);
    const tiles = [...container.querySelectorAll<HTMLButtonElement>('.pmk')];
    expect(tiles[0].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(tiles[1]);
    expect(onSelect).toHaveBeenCalledWith(rows[1]);
  });
  it('moves focus with arrows, Home and End', () => {
    const { container } = render(<MarketCarousel rows={rows} selectedId="a" onSelect={() => {}} label="Markets" />);
    const tiles = [...container.querySelectorAll<HTMLButtonElement>('.pmk')];
    tiles[0].focus();
    fireEvent.keyDown(tiles[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tiles[1]);
    fireEvent.keyDown(tiles[1], { key: 'End' });
    expect(document.activeElement).toBe(tiles[2]);
    fireEvent.keyDown(tiles[2], { key: 'Home' });
    expect(document.activeElement).toBe(tiles[0]);
  });
});
