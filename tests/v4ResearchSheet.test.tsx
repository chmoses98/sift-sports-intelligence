// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ResearchSheet } from '../src/v4/ResearchSheet';
import { SheetHost } from '../src/v4/sheet';
import { TrayProvider } from '../src/state/tray';
import type { Opportunity } from '../src/opportunity/types';

const NOW = Date.parse('2026-10-11T20:00:00Z');
const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  id: 'o1', sport: 'NFL', slug: 'nfl', eventId: 'e1', eventLabel: 'NE @ BUF', competition: 'Week 4', startTime: '2026-10-11T23:00:00Z', marketId: 'm1', ticker: 'KXNFLGAME-26OCT11NEBUF-BUF', family: 'game_winner',
  what: { title: 'Bills to win', side: 'NO', subject: null }, why: 'The model has Buffalo closer to a coin flip than the market does.', evidence: ['Run offence ranks first', 'Market moved 3 points'], risk: 'Weather could suppress the run game.', alternatives: ['Bills -3.5'],
  price: { side: 'NO', ask: 0.42, bid: 0.4, observedAt: new Date(NOW - 4 * 60_000).toISOString(), source: 'live', fair: 0.5, fairLow: 0.45, fairHigh: 0.56, fee: 0.02, feeSource: 'kalshi-schedule', breakEven: 0.44, evPerContract: 0.06, evSource: 'derived', betUpTo: 0.46, availableSize: 120, expiresAt: null, state: 'CURRENT' },
  confidence: { calibration: 'RESEARCH', note: 'Research-only model.', inputs: { 'Market capture': 'FRESH' }, support: null, supportNote: null, edgeShare: null },
  status: 'RESEARCH_CANDIDATE', authority: 'RESEARCH_ONLY', statusReason: '', phase: 'PREGAME', reprice: { side: 'NO', fair: 0.5 } as never, group: null, orientation: { state: 'OK' } as never, href: '', gameHref: '',
  rank: { tier: 3, tierWord: 'Research candidate', worstCaseEdge: null, evPerContract: 0.06, edgeShare: null, priceCurrent: true, highVariance: false, kickoff: '2026-10-11T23:00:00Z' }, ...over,
} as Opportunity);

const show = (o: Opportunity) => render(<MemoryRouter><TrayProvider><SheetHost><ResearchSheet o={o} g={null} /></SheetHost></TrayProvider></MemoryRouter>);

describe('v4 research sheet', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  it('names the side the publication flags, not the bare contract title', () => {
    show(opp());
    expect(screen.getByRole('heading', { name: 'Bills not to win' })).toBeTruthy();
  });
  it('keeps the Kalshi quote and the model figure apart, each labelled', () => {
    show(opp());
    expect(screen.queryByText(/stale/)).toBeNull();
    expect(screen.getByText(/4m ago/)).toBeTruthy();
    expect(screen.getByText('Kalshi ask')).toBeTruthy();
    expect(screen.getByText(/Model fair/)).toBeTruthy();
    expect(screen.getByText('Break-even after fee')).toBeTruthy();
  });
  it('is concise by default: evidence and sources are behind a button', () => {
    show(opp());
    expect(screen.queryByText('Run offence ranks first')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show evidence, risks and sources/ }));
    expect(screen.getByText('Run offence ranks first')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Prices' }));
    expect(screen.getByText("Publication's upper limit price")).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    expect(screen.getByText('Research-only model.')).toBeTruthy();
  });
  it('never recommends a bet', () => {
    const { container } = show(opp());
    expect(container.textContent).not.toMatch(/\b(you should|we recommend|best bet|lock|guaranteed)\b/i);
    expect(screen.getByText(/does not recommend a bet/)).toBeTruthy();
  });
  it('shows pregame research as frozen once the game has started', () => {
    show(opp({ phase: 'STARTED' }));
    expect(screen.getByText(/frozen at kickoff/)).toBeTruthy();
    expect(screen.getByText('Price as published')).toBeTruthy();
  });
  it('says a quote is stale, and says so when no quote exists', () => {
    const { unmount } = show(opp({ price: { ...opp().price, observedAt: new Date(NOW - 3 * 3600_000).toISOString() } }));
    expect(screen.getByText(/stale, re-check before relying on it/)).toBeTruthy();
    unmount();
    show(opp({ price: { ...opp().price, ask: null, state: 'NO_QUOTE' } }));
    expect(screen.getByText(/No executable Kalshi quote/)).toBeTruthy();
  });
});
