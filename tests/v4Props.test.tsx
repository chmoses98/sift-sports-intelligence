// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SaveControl } from '../src/v4/SaveControl';
import { TrayProvider, TRAY_KEY } from '../src/state/tray';
import { classifyDifference, filterRows, groupPlayers, matchesSearch, modelFigure, orderRows, projectionWhy, propHref, propsExplorerHref, quoteView, rungView, statShort, CLOSE_POINTS } from '../src/v4/propsModel';
import type { PropRow, Rung } from '../src/insights/propBoard';
import type { DiscoveryRow } from '../src/views/props/model';

const NOW = Date.parse('2026-10-04T15:00:00Z');
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

const rung = (o: Partial<Rung> & { threshold?: number; captured?: string | null } = {}): Rung => ({
  market: { market_id: 'mkt_kalshi_T-7', kalshi_ticker: 'T-7', threshold: o.threshold ?? 7, captured_at: o.captured === undefined ? iso(2) : o.captured, yes_bid: 0.5, yes_ask: 0.52 } as never,
  threshold: o.threshold ?? 7, line: '6.5', yesBid: 0.5, yesAsk: 0.52, noAsk: 0.5, marketP: 0.51, modelP: 0.6, modelState: 'PROJECTION', ...o,
} as Rung);

const row = (o: Partial<PropRow> & { name?: string; pid?: string; family?: PropRow['family']; main?: Rung | null } = {}): PropRow => {
  const main = o.main === undefined ? rung() : o.main;
  return {
    id: `${o.pid ?? 'p1'}|receptions`, playerId: o.pid ?? 'p1', name: o.name ?? 'Chris Olave', role: 'WR',
    team: { pid: 't', abbr: 'NO', nick: 'Saints', city: 'New Orleans', home: true }, opp: { pid: 'o', abbr: 'ATL', nick: 'Falcons', city: 'Atlanta', home: false },
    def: { stat: 'receptions', label: 'Receptions', unit: 'rec', family: 'receiving', sim: 'x', def: null, defUnit: null, positions: null, count: true },
    family: o.family ?? 'receiving', projection: 7.3, range: null, projectionStatus: { kind: 'legacy' }, band: null, distribution: null, predictionRange: null,
    main, line: 6.5, ladder: main ? [main] : [], read: 'ABOVE', separation: 0.5, matchup: null, price: null, risks: [], injury: null, interest: 0.5, reasons: [], marketTitle: null, ...o,
  } as unknown as PropRow;
};
const d = (r: PropRow, eventId = 'e1'): DiscoveryRow => ({ row: r, eventId, kickoff: '2026-10-05T17:00:00Z', game: 'ATL @ NO', publishedAt: iso(300) });

describe('quote freshness: a price is executable only when it is current', () => {
  it('fresh and aging quotes are executable; stale, undated and absent ones are not', () => {
    expect(quoteView(0.5, iso(2), NOW)).toMatchObject({ freshness: 'FRESH', executable: true });
    expect(quoteView(0.5, iso(20), NOW)).toMatchObject({ freshness: 'AGING', executable: true });
    expect(quoteView(0.5, iso(45), NOW)).toMatchObject({ freshness: 'STALE', executable: false });
    expect(quoteView(0.5, null, NOW)).toMatchObject({ freshness: 'UNKNOWN', executable: false });
    expect(quoteView(null, iso(1), NOW)).toMatchObject({ ask: null, executable: false });
    expect(quoteView(0, iso(1), NOW).ask).toBeNull();
    expect(quoteView(1, iso(1), NOW).ask).toBeNull();
  });
});

describe('the ladder compares the model with the same side, fee included', () => {
  it('over: model is P(YES), cost is the YES ask plus the fee; the points are model minus break-even', () => {
    const v = rungView(rung({ yesAsk: 0.52, modelP: 0.6 }), 'over', true, NOW);
    expect(v.side).toBe('over');
    expect(v.quote.ask).toBe(0.52);
    expect(v.fee).toBeGreaterThan(0);
    expect(v.breakEven).toBeCloseTo(0.52 + v.fee!, 5);
    expect(v.model).toBe(0.6);
    expect(v.points).toBe(Math.round(60) - Math.round(v.breakEven! * 100));
    expect(v.label).toBe('7+');
  });
  it('under: the NO ask against 1 minus the model probability', () => {
    const v = rungView(rung({ noAsk: 0.5, modelP: 0.6 }), 'under', false, NOW);
    expect(v.quote.ask).toBe(0.5);
    expect(v.model).toBeCloseTo(0.4, 5);
    expect(v.points).toBe(40 - Math.round(v.breakEven! * 100));
  });
  it('shows no difference for a stale price, no model, or no ask: never a zero', () => {
    expect(rungView(rung({ captured: iso(90) }), 'over', true, NOW).points).toBeNull();
    expect(rungView(rung({ captured: null }), 'over', true, NOW).points).toBeNull();
    const none = rungView(rung({ modelP: null }), 'over', true, NOW);
    expect(none.model).toBeNull();
    expect(none.points).toBeNull();
    expect(rungView(rung({ yesAsk: null }), 'over', true, NOW)).toMatchObject({ breakEven: null, points: null, fee: null });
  });
});

describe('a gap is investigated only where the publication holds a signal for that contract', () => {
  const byMarket = new Map([['mkt_kalshi_T-7', { status: 'RESEARCH_CANDIDATE', authority: 'RESEARCH_ONLY', statusReason: 'flagged' }]]);
  const wide = rungView(rung({ yesAsk: 0.4, modelP: 0.7 }), 'over', true, NOW);
  it('unexplained when no opportunity covers the contract', () => {
    expect(classifyDifference(wide, null, new Map()).kind).toBe('unexplained');
  });
  it('an investigated research signal when one does, named with its authority', () => {
    const c = classifyDifference(wide, null, byMarket);
    expect(c.kind).toBe('signal');
    if (c.kind === 'signal') expect(c.authority.word).toBe('Research candidate');
  });
  it('close inside the threshold, whichever way the gap points', () => {
    const near = rungView(rung({ yesAsk: 0.5, modelP: 0.53 }), 'over', true, NOW);
    expect(Math.abs(near.points!)).toBeLessThan(CLOSE_POINTS);
    expect(classifyDifference(near, null, byMarket).kind).toBe('close');
  });
  it('says why there is nothing to compare instead of inventing a gap', () => {
    expect(classifyDifference(null, null, byMarket).kind).toBe('noPrice');
    expect(classifyDifference(rungView(rung({ modelP: null }), 'over', true, NOW), 'Projection withheld: x.', byMarket)).toMatchObject({ kind: 'noProjection', why: 'Projection withheld: x.' });
    expect(classifyDifference(rungView(rung({ captured: iso(90) }), 'over', true, NOW), null, byMarket).kind).toBe('stale');
    expect(classifyDifference(rungView(rung({ yesAsk: null }), 'over', true, NOW), null, byMarket).kind).toBe('noPrice');
  });
});

describe('the explorer list', () => {
  const a = d(row({ name: 'Chris Olave', pid: 'a' }), 'e1');
  const b = d(row({ name: 'Josh Allen', pid: 'b', family: 'passing' }), 'e2');
  const c = d(row({ name: 'Josh Allen', pid: 'b', family: 'rushing', main: null }), 'e2');
  it('search matches name, role or team, every word', () => {
    expect(matchesSearch(a.row, 'olave')).toBe(true);
    expect(matchesSearch(a.row, 'wr saints')).toBe(true);
    expect(matchesSearch(a.row, 'olave allen')).toBe(false);
    expect(matchesSearch(a.row, '  ')).toBe(true);
    expect(matchesSearch(a.row, 'zz')).toBe(false);
  });
  it('filters by game, family and search', () => {
    const all = [a, b, c];
    expect(filterRows(all, { game: 'e2' })).toEqual([b, c]);
    expect(filterRows(all, { family: 'passing' })).toEqual([b]);
    expect(filterRows(all, { family: 'all', q: 'josh' })).toEqual([b, c]);
    expect(filterRows(all, {})).toEqual(all);
  });
  it('groups one entry per player per game and leads with a priced prop', () => {
    const g = groupPlayers([c, b, a]);
    expect(g.map((x) => x.name)).toEqual(['Josh Allen', 'Chris Olave']);
    expect(g[0].lead).toBe(b);
    expect(g[0].rows).toHaveLength(2);
  });
  it('the featured order is the board order untouched', () => {
    expect(orderRows([a, b], 'featured')).toEqual({ ordered: [a, b], unranked: 0 });
  });
  it('a ranking that cannot place a row keeps it, after the ranked ones, and counts it', () => {
    const noSim = d(row({ name: 'No Sim', pid: 'n', projection: null, separation: null, read: 'NO_SIM' }));
    const out = orderRows([noSim, a], 'gap');
    expect(out.ordered).toHaveLength(2);
    expect(out.ordered[0]).toBe(a);
    expect(out.unranked).toBe(1);
  });
});

describe('what the row says about the model', () => {
  const f = (v: number) => `${v} rec`;
  it('a probability when the projection prices the main line', () => { expect(modelFigure(row(), f)).toEqual({ kind: 'probability', text: '60%' }); });
  it('the projection when it prices no probability', () => { expect(modelFigure(row({ main: rung({ modelP: null }) }), f)).toEqual({ kind: 'projection', text: 'Proj 7.3 rec' }); });
  it('withheld and absent projections are said, never a zero', () => {
    expect(modelFigure(row({ projection: null, projectionStatus: { kind: 'withheld', code: 'STALE', reason: 'inputs are old' }, main: rung({ modelP: null }) }), f)).toEqual({ kind: 'withheld', text: 'Projection withheld' });
    expect(modelFigure(row({ projection: null, main: rung({ modelP: null }) }), f)).toEqual({ kind: 'none', text: 'No projection' });
  });
  it('explains why a projection is missing', () => {
    expect(projectionWhy(row())).toBeNull();
    expect(projectionWhy(row({ projection: null, projectionStatus: { kind: 'withheld', code: 'STALE', reason: 'inputs are old' } }))).toBe('Projection withheld: inputs are old.');
    expect(projectionWhy(row({ projection: null }))).toMatch(/No simulation row/);
  });
});

describe('addresses carry sport, game, player and prop', () => {
  it('builds the detail and explorer links', () => {
    expect(propHref('nfl', 'evt 1', 'prt/2', 'receptions')).toBe('/v4/props/nfl/evt%201/prt%2F2?stat=receptions');
    expect(propHref('nfl', 'e', 'p')).toBe('/v4/props/nfl/e/p');
    expect(propsExplorerHref()).toBe('/v4/props');
    expect(propsExplorerHref({ sport: 'mlb' })).toBe('/v4/props?sport=mlb');
    expect(propsExplorerHref({ sport: 'nfl', game: 'e1' })).toBe('/v4/props?game=e1');
    expect(statShort('passing_yards', 'Passing yards')).toBe('pass yds');
    expect(statShort('mystery', 'Mystery Stat')).toBe('mystery stat');
  });
});

describe('Save writes the research tray the rest of the app reads', () => {
  const label = { label: 'Chris Olave receptions 7+', sub: 'Over 52¢ · under 50¢', href: '/nfl/props?game=e1&prop=p1|receptions' };
  const props = { sport: 'NFL', id: 'mkt_kalshi_T-7', extra: { market_id: 'mkt_kalshi_T-7', event_id: 'e1' }, label };
  const show = (kickoff: string) => render(<MemoryRouter><TrayProvider><SaveControl {...props} kickoff={kickoff} /></TrayProvider></MemoryRouter>);
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  it('saves a MARKET item with the same label and link, then removes it', () => {
    show('2026-10-05T17:00:00Z');
    fireEvent.click(screen.getByRole('button', { name: /^Save to My Board/ }));
    const stored = JSON.parse(localStorage.getItem(TRAY_KEY)!);
    expect(stored.tray.items).toHaveLength(1);
    expect(stored.tray.items[0].ref_kind).toBe('MARKET');
    expect(Object.values(stored.labels)[0]).toMatchObject({ label: label.label, href: label.href, kickoff: '2026-10-05T17:00:00Z' });
    fireEvent.click(screen.getByRole('button', { name: /^Remove from My Board/ }));
    expect(JSON.parse(localStorage.getItem(TRAY_KEY)!).tray.items).toHaveLength(0);
  });
  it('after kickoff nothing new is saved, and the control says why', () => {
    show('2026-10-04T12:00:00Z');
    const b = screen.getByRole('button', { name: /cannot be saved after kickoff/ });
    expect(b.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(b);
    expect(JSON.parse(localStorage.getItem(TRAY_KEY) ?? '{"tray":{"items":[]}}').tray.items).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toMatch(/can’t be saved after kickoff/);
  });
  it('an item saved before kickoff stays saved and can be removed after it', () => {
    const first = show('2026-10-05T17:00:00Z');
    fireEvent.click(screen.getByRole('button', { name: /^Save to My Board/ }));
    first.unmount();
    show('2026-10-04T12:00:00Z');
    expect(screen.getByRole('button', { name: /^Remove from My Board/ }).getAttribute('aria-pressed')).toBe('true');
  });
});
