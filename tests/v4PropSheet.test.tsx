// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Opportunity } from '../src/opportunity/types';
import { opp } from './support/v4Opportunity';

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
const show = () => render(<MemoryRouter><TrayProvider><SheetHost><PropResearch ctx={ctx as never} /></SheetHost></TrayProvider></MemoryRouter>);

describe('the v4 prop research sheet', () => {
  beforeEach(() => { localStorage.clear(); opportunities = []; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('without a published opportunity it shows research-only details and says no valid signal covers this side', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Chris Olave receptions 7+' })).toBeTruthy();
    expect(screen.getByText(/Research only · no valid published signal for this side/)).toBeTruthy();
    expect(screen.getByText(/No valid published research signal covers this contract and side/)).toBeTruthy();
    expect(screen.getByText('Model above break-even')).toBeTruthy();
    expect(screen.getByText('No published signal validates this difference.')).toBeTruthy();
    expect(screen.getByText('Published risks')).toBeTruthy();
    expect(screen.queryByText('Why it is flagged')).toBeNull();
    expect(screen.getByRole('button', { name: /^Save to My Board/ })).toBeTruthy();
  });

  it('with a valid published signal on that exact contract and side it opens the existing research sheet and offers Save', () => {
    opportunities = [opp()];
    show();
    expect(screen.getByText('Why it is flagged')).toBeTruthy();
    expect(screen.getByText('Published research flags this line.')).toBeTruthy();
    expect(screen.queryByText(/No valid published research signal covers/)).toBeNull();
    expect(screen.getByRole('button', { name: /^Save to My Board/ })).toBeTruthy();
  });

  it('an opportunity on a different contract does not turn this prop into a signal', () => {
    opportunities = [opp({ marketId: 'mkt_kalshi_OTHER' })];
    show();
    expect(screen.getByText('No published signal validates this difference.')).toBeTruthy();
    expect(screen.queryByText('Why it is flagged')).toBeNull();
  });

  it('a signal for the OTHER side is not shown as this side’s; the viewer can go and read it', () => {
    opportunities = [opp({ what: { side: 'NO' }, price: { side: 'NO', ask: 0.5 } })];
    show();
    expect(screen.queryByText('Why it is flagged')).toBeNull();
    expect(screen.getByText(/The publication's signal on this market is for the under \(No\), not this side\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /See the published signal for the under \(No\)/ }));
    expect(screen.getByText('Why it is flagged')).toBeTruthy();
  });

  it('a PASS decision is stated as the publication’s decision, not shown as a signal', () => {
    opportunities = [opp({ status: 'PASS', statusReason: 'The ask is above the publication’s own bet-up-to price.' })];
    show();
    expect(screen.queryByText('Why it is flagged')).toBeNull();
    expect(screen.getByText(/The publication reviewed this contract and passed: The ask is above/)).toBeTruthy();
  });

  it('a stale signal is not a valid signal, whatever its status word says', () => {
    opportunities = [opp({ price: { observedAt: new Date(NOW - 60 * 60_000).toISOString() } })];
    show();
    expect(screen.queryByText('Why it is flagged')).toBeNull();
    expect(screen.getByText(/A published signal names this contract and side but no longer qualifies: The quote behind this signal is stale\./)).toBeTruthy();
  });

  it('wording is neutral: below break-even says so without a verdict, and long explanations sit behind a disclosure', () => {
    const rich = { ...rung, yesAsk: 0.7, modelP: 0.5, market: { ...rung.market, yes_ask: 0.7 } };
    render(<MemoryRouter><TrayProvider><SheetHost><PropResearch ctx={{ ...ctx, row: { ...row, main: rich, ladder: [rich] } } as never} /></SheetHost></TrayProvider></MemoryRouter>);
    expect(screen.getByText('Model below break-even')).toBeTruthy();
    expect(screen.queryByText('No published signal validates this difference.')).toBeNull();
    expect(screen.queryByText(/No size of difference is treated as meaningful/)).toBeNull();
    const more = screen.getByRole('button', { name: /How to read this/ });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/No size of difference is treated as meaningful/)).toBeTruthy();
  });

  it('a one-point difference gets the same neutral statement as any other: no "close" label', () => {
    const near = { ...rung, yesAsk: 0.5, modelP: 0.53 };
    render(<MemoryRouter><TrayProvider><SheetHost><PropResearch ctx={{ ...ctx, row: { ...row, main: near, ladder: [near] } } as never} /></SheetHost></TrayProvider></MemoryRouter>);
    expect(screen.queryByText(/close/i)).toBeNull();
    expect(document.querySelector('.v4-diff__n')!.textContent).toMatch(/^Model 53% vs break-even \d+% after fee for the over \(Yes\): [−+]?\d+ points?\.$/);
  });

  it('switching to the under compares the model with the NO side and saves the under', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /^Under \(No\)/ }));
    expect(document.querySelector('.v4-diff__n')!.textContent).toMatch(/after fee for the under \(No\)/);
    fireEvent.click(screen.getByRole('button', { name: /^Save to My Board: Chris Olave under 6\.5 receptions/ }));
    const s = JSON.parse(localStorage.getItem('sift.researchTray.v1')!);
    expect(Object.values(s.labels)[0]).toMatchObject({ side: 'NO', label: 'Chris Olave under 6.5 receptions' });
  });

  it('a withheld projection shows its reason and compares nothing', () => {
    const withheld = { ...row, projection: null, projectionStatus: { kind: 'withheld', code: 'STALE', reason: 'inputs are 30h old' }, main: { ...rung, modelP: null }, ladder: [{ ...rung, modelP: null }] };
    render(<MemoryRouter><TrayProvider><SheetHost><PropResearch ctx={{ ...ctx, row: withheld } as never} /></SheetHost></TrayProvider></MemoryRouter>);
    expect(screen.getAllByText(/Projection withheld/).length).toBeGreaterThan(0);
    expect(screen.getByText('No projection to compare')).toBeTruthy();
    expect(screen.queryByText('Model above break-even')).toBeNull();
  });

  it('a stale price is shown as context and never compared', () => {
    const stale = { ...rung, market: { ...rung.market, captured_at: iso(120) } };
    render(<MemoryRouter><TrayProvider><SheetHost><PropResearch ctx={{ ...ctx, row: { ...row, main: stale, ladder: [stale] } } as never} /></SheetHost></TrayProvider></MemoryRouter>);
    expect(screen.getByText('Price not current')).toBeTruthy();
    expect(screen.getByText(/not executable/)).toBeTruthy();
  });
});
