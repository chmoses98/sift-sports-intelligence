// The Slate Priorities rail rendered on the real week-5 publication: every item links somewhere real, the Top
// SIFT Edge says plainly that nothing qualifies, and no homepage line needs betting vocabulary to be understood.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { BoardDoc, EventResearchDoc } from '../src/contract/types';
import { SlatePriorities } from '../src/views/home/Priorities';

const DIR = join(__dirname, 'fixtures', 'nfl-week5');
const board = JSON.parse(readFileSync(join(DIR, 'board.json'), 'utf-8')) as BoardDoc;
const research = new Map<string, EventResearchDoc>(readdirSync(DIR).filter((f) => f.startsWith('evt_')).map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(DIR, f), 'utf-8'))]));
const NOW = Date.parse('2026-10-08T00:45:00Z');

describe('Slate Priorities rail', () => {
  it('renders three to five linked items from real data and an honest no-edge line', () => {
    const { container } = render(<MemoryRouter><SlatePriorities items={board.items} research={research} recommendations={[]} recError={false} slug="nfl" sport="NFL" now={NOW} loading={false} /></MemoryRouter>);
    const rail = screen.getByRole('region', { name: 'Where to look first' });
    expect(within(rail).getByText('No strong SIFT edge yet')).toBeInTheDocument();
    const links = [...container.querySelectorAll('.prio__a')].map((a) => a.getAttribute('href'));
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect(links.length).toBeLessThanOrEqual(5);
    for (const h of links) expect(h).toMatch(/^\/nfl\/(game|market)\/(evt|mkt)_/);
    expect(container.querySelector('.prio__i--holds a')!.getAttribute('href')).toMatch(/^\/nfl\/market\/mkt_kalshi_KXNFLSPREAD-26OCT11HOUTEN-HOU\d\?event=evt_1c0466d60c38da2ebd99$/);
    expect(container.querySelector('.prio__i--watch a')!.getAttribute('href')).toBe('/nfl/game/evt_52cd1892ac06fd90902b');
    expect(rail.textContent).not.toMatch(/\bEV\b|EPA|implied|survivab|z-score|dislocation|calibrat|CLV/i);
  });

  it('says it is reading while research loads, and says so when no game is upcoming', () => {
    const { rerender } = render(<MemoryRouter><SlatePriorities items={board.items} research={new Map()} recommendations={undefined} recError={false} slug="nfl" sport="NFL" now={NOW} loading /></MemoryRouter>);
    expect(screen.getByText('Reading this week’s research…')).toBeInTheDocument();
    rerender(<MemoryRouter><SlatePriorities items={board.items.filter((i) => i.status === 'FINAL')} research={research} recommendations={[]} recError={false} slug="nfl" sport="NFL" now={NOW} loading={false} /></MemoryRouter>);
    expect(screen.getByText('No upcoming games')).toBeInTheDocument();
  });
});
