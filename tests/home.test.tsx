// The global Home: opportunity cards show WHAT, WHY, PRICE (ask, break-even, fair, bet-up-to), CONFIDENCE and RISK
// from a publication's own candidate layer; a sport with nothing says PASS with its reason; the window filter is a
// local calendar rule; and the home itself renders an honest state when no publication can be read.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { BoardDoc, ItemsDoc, Recommendation, Thesis } from '../src/contract/types';
import { clearAsyncMemo } from '../src/data/hooks';
import { sportByCode } from '../src/data/sports';
import { evaluate } from '../src/opportunity/load';
import { featureOpportunities, isLive } from '../src/opportunity/rank';
import { TrailProvider } from '../src/state/trail';
import { TrayProvider } from '../src/state/tray';
import { MarketsView as HomeView, inWindow } from '../src/views/Markets';
import { OpportunityBoard, OpportunityCard } from '../src/views/home/Opportunities';
import { readSoccer, useDiskFetch } from './helpers';

const NOW = Date.parse('2026-10-09T06:10:00Z');

function soccerBundle() {
  return {
    sport: sportByCode('SOCCER')!, board: readSoccer<BoardDoc>('board.json').items, recommendations: readSoccer<ItemsDoc<Recommendation>>('recommendations.json').items,
    theses: readSoccer<ItemsDoc<Thesis>>('theses.json').items, signals: null, modelState: 'RESEARCH_ONLY', marketCaptureAt: null, error: null,
  };
}

function wrap(el: React.ReactElement) {
  const router = createMemoryRouter([{ path: '*', element: <TrailProvider>{el}</TrailProvider> }], { initialEntries: ['/'] });
  return render(<TrayProvider><RouterProvider router={router} /></TrayProvider>);
}

beforeAll(() => {
  useDiskFetch();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});
beforeEach(() => {
  clearAsyncMemo();
  localStorage.clear();
});
afterEach(() => cleanup());

describe('the window filter', () => {
  it('is a local calendar rule: today, tomorrow, the week', () => {
    const now = new Date(2026, 9, 9, 10, 0).getTime();
    expect(inWindow(new Date(2026, 9, 9, 20, 0).toISOString(), now, 'today')).toBe(true);
    expect(inWindow(new Date(2026, 9, 10, 1, 0).toISOString(), now, 'today')).toBe(false);
    expect(inWindow(new Date(2026, 9, 10, 1, 0).toISOString(), now, 'tomorrow')).toBe(true);
    expect(inWindow(new Date(2026, 9, 14, 1, 0).toISOString(), now, 'week')).toBe(true);
    expect(inWindow(new Date(2026, 9, 17, 1, 0).toISOString(), now, 'week')).toBe(false);
    // A game that started up to three hours ago still counts as today's.
    expect(inWindow(new Date(now - 2 * 3600_000).toISOString(), now, 'today')).toBe(true);
  });
});

describe('opportunity cards', () => {
  it('say what, why, the price with break-even and bet-up-to, the publication’s authority and what beats it', () => {
    const { opportunities } = evaluate(soccerBundle(), NOW);
    const feats = featureOpportunities(opportunities.filter(isLive));
    const ars = feats.find((f) => f.lead.ticker === 'KXEPLGAME-26OCT10ARSLEE-ARS')!;
    wrap(<OpportunityCard f={ars} now={NOW} />);
    expect(screen.getByRole('heading', { name: /NO Arsenal to win/ })).toBeInTheDocument();
    expect(screen.getByText('Research candidate')).toBeInTheDocument();
    expect(screen.getByText(/Arsenal vs Leeds United: model expected goals/)).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/NO ask29¢/);
    expect(text).toMatch(/Break-even30¢/);
    expect(text).toMatch(/Bet up to34¢/);
    expect(text).toMatch(/What beats it:/);
    expect(text).toMatch(/research only/i);
    expect(text).not.toMatch(/undefined|NaN/);
    fireEvent.click(screen.getByRole('button', { name: /Evidence/ }));
    expect(screen.getByText(/Edge positive in 91% of posterior draws/)).toBeInTheDocument();
    expect(screen.getByText(/Related expressions of the same thesis/)).toBeInTheDocument();
  });

  it('a PASS sport shows the missing prerequisite; a filtered-empty board says so without inventing anything', () => {
    const v = { sport: 'NBA' as const, slug: 'nba', label: 'NBA', games: 2, opportunities: 0, passes: 0, passReason: 'The NBA publication prices no contract, and its own study shows the market beating its model in 8 of 8 families.', modelState: 'RESEARCH_ONLY', marketCaptureAt: null, loaded: true, error: null };
    wrap(<OpportunityBoard featured={[]} verdicts={[v]} now={NOW} loading={false} />);
    expect(screen.getByText('No opportunity clears the bar right now.')).toBeInTheDocument();
    expect(screen.getByText(/prices no contract/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open NBA/ })).toBeInTheDocument();
  });

  it('a stale publication says so with its own market-capture clock, on the pass card', () => {
    const v = { sport: 'MLB' as const, slug: 'mlb', label: 'MLB', games: 1, opportunities: 0, passes: 7, passReason: 'Every row of the MLB slate ledger is a PASS: no research candidate on the board.', modelState: 'STALE', marketCaptureAt: new Date(Date.now() - 11 * 3600_000).toISOString(), loaded: true, error: null };
    wrap(<OpportunityBoard featured={[]} verdicts={[v]} now={NOW} loading={false} />);
    expect(screen.getByText(/Publication stale/)).toBeInTheDocument();
    expect(screen.getByText(/markets last captured 11h/)).toBeInTheDocument();
  });
});

describe('the Home', () => {
  it('renders the masthead, the filters and both sections; every unreadable sport says so instead of disappearing', async () => {
    wrap(<HomeView />);
    expect(screen.getByRole('heading', { name: 'Market board' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /opportunities/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /games/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Sport' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tomorrow' })).toBeInTheDocument();
    // In tests no live publication root is readable: each explorable sport is a PASS card that says it could not be read.
    expect((await screen.findAllByText(/could not be read/)).length).toBeGreaterThan(3);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/undefined|NaN/);
  });
});
