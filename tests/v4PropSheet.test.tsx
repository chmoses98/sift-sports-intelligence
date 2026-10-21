// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Opportunity } from '../src/opportunity/types';

const NOW = Date.parse('2026-10-04T15:00:00Z');
let opportunities: Opportunity[] = [];
vi.mock('../src/opportunity/load', () => ({ useAllOpportunities: () => ({ loading: false, error: undefined, bundles: [], opportunities, verdicts: [] }) }));

const { PropResearch } = await import('../src/v4/PropSheet');
const { SheetHost } = await import('../src/v4/sheet');
const { TrayProvider } = await import('../src/state/tray');

const iso = (m: number) => new Date(NOW - m * 60_000).toISOString();
const rung = { market: { market_id: 'mkt_kalshi_T-7', kalshi_ticker: 'T-7', threshold: 7, captured_at: iso(2), yes_bid: 0.5, yes_ask: 0.52 }, threshold: 7, line: '6.5', yesBid: 0.5, yesAsk: 0.52, noAsk: 0.5, marketP: 0.51, modelP: 0.6, modelState: 'PROJECTION' };
const row = {
  id: 'p1|receptions', playerId: 'p1', name: 'Chris Olave', role: 'WR',
  team: { pid: 't', abbr: 'NO', nick: 'Saints', city: 'New Orleans', home: true }, opp: { pid: 'o', abbr: 'ATL', nick: 'Falcons', city: 'Atlanta', home: false },
  def: { stat: 'receptions', label: 'Receptions', unit: 'rec', family: 'receiving', sim: 'x', def: null, defUnit: null, positions: null, count: true },
  family: 'receiving', projection: 7.3, range: null, projectionStatus: { kind: 'legacy' }, band: null, distribution: null, predictionRange: null,
  main: rung, line: 6.5, ladder: [rung], read: 'ABOVE', separation: 0.5, matchup: null, price: null, risks: ['Wide quote: 5¢ between bid and ask.'], injury: null, interest: 0.5, reasons: [], marketTitle: null,
};
const ctx = { row, slug: 'nfl', eventId: 'e1', kickoff: '2026-10-05T17:00:00Z', status: null, game: 'ATL @ NO', researchAt: iso(300), side: 'over' as const, marketId: null };
const opp = {
  id: 'o1', sport: 'NFL', slug: 'nfl', eventId: 'e1', eventLabel: 'ATL @ NO', competition: 'Week 5', startTime: '2026-10-05T17:00:00Z', marketId: 'mkt_kalshi_T-7', ticker: 'T-7', family: 'player_stat',
  what: { title: 'Chris Olave 7+ receptions', side: 'YES', subject: null }, why: 'Published research flags this line.', evidence: ['Target share 28%'], risk: 'Thin market.', alternatives: [],
  price: { side: 'YES', ask: 0.52, bid: 0.5, observedAt: iso(2), source: 'live', fair: 0.6, fairLow: null, fairHigh: null, fee: 0.02, feeSource: 'kalshi-schedule', breakEven: 0.54, evPerContract: 0.06, evSource: 'derived', betUpTo: 0.55, availableSize: 100, expiresAt: null, state: 'CURRENT' },
  confidence: { calibration: 'RESEARCH', note: 'Research-only model.', inputs: {}, support: null, supportNote: null, edgeShare: null },
  status: 'RESEARCH_CANDIDATE', authority: 'RESEARCH_ONLY', statusReason: '', phase: 'PREGAME', reprice: { side: 'YES', fair: 0.6 }, group: null, orientation: { state: 'OK' }, href: '/nfl/props?game=e1', gameHref: '',
  rank: { tier: 3, tierWord: 'Research candidate', worstCaseEdge: null, evPerContract: 0.06, edgeShare: null, priceCurrent: true, highVariance: false, kickoff: '2026-10-05T17:00:00Z' },
} as unknown as Opportunity;

const show = () => render(<MemoryRouter><TrayProvider><SheetHost><PropResearch ctx={ctx as never} /></SheetHost></TrayProvider></MemoryRouter>);

describe('the v4 prop research sheet', () => {
  beforeEach(() => { localStorage.clear(); opportunities = []; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('without a published opportunity it shows research-only details and says no signal covers the contract', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Chris Olave receptions 7+' })).toBeTruthy();
    expect(screen.getByText(/Research only · no published signal on this contract/)).toBeTruthy();
    expect(screen.getByText(/No published research signal covers this contract/)).toBeTruthy();
    expect(screen.getByText('Unexplained difference')).toBeTruthy();
    expect(screen.getByText('Published risks')).toBeTruthy();
    expect(screen.queryByText('Why it is flagged')).toBeNull();
    expect(screen.getByRole('button', { name: /^Save to My Board/ })).toBeTruthy();
  });

  it('with a published opportunity on that exact contract it opens the existing research sheet and offers Save', () => {
    opportunities = [opp];
    show();
    expect(screen.getByText('Why it is flagged')).toBeTruthy();
    expect(screen.getByText('Published research flags this line.')).toBeTruthy();
    expect(screen.queryByText(/No published research signal covers this contract/)).toBeNull();
    expect(screen.getByRole('button', { name: /^Save to My Board/ })).toBeTruthy();
  });

  it('an opportunity on a different contract does not turn this prop into a signal', () => {
    opportunities = [{ ...opp, marketId: 'mkt_kalshi_OTHER' } as Opportunity];
    show();
    expect(screen.getByText('Unexplained difference')).toBeTruthy();
    expect(screen.queryByText('Why it is flagged')).toBeNull();
  });

  it('a withheld projection shows its reason and compares nothing', () => {
    const withheld = { ...row, projection: null, projectionStatus: { kind: 'withheld', code: 'STALE', reason: 'inputs are 30h old' }, main: { ...rung, modelP: null }, ladder: [{ ...rung, modelP: null }] };
    render(<MemoryRouter><TrayProvider><SheetHost><PropResearch ctx={{ ...ctx, row: withheld } as never} /></SheetHost></TrayProvider></MemoryRouter>);
    expect(screen.getAllByText(/Projection withheld/).length).toBeGreaterThan(0);
    expect(screen.getByText('No projection to compare')).toBeTruthy();
    expect(screen.queryByText('Unexplained difference')).toBeNull();
  });

  it('a stale price is shown as context and never compared', () => {
    const stale = { ...rung, market: { ...rung.market, captured_at: iso(120) } };
    render(<MemoryRouter><TrayProvider><SheetHost><PropResearch ctx={{ ...ctx, row: { ...row, main: stale, ladder: [stale] } } as never} /></SheetHost></TrayProvider></MemoryRouter>);
    expect(screen.getByText('Price not current')).toBeTruthy();
    expect(screen.getByText(/not executable/)).toBeTruthy();
  });
});
