// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SaveControl } from '../src/v4/SaveControl';
import { marketChange } from '../src/board/model';
import { propSave } from '../src/v4/PropSheet';
import { sideExtra } from '../src/v4/saveSide';
import { TrayProvider, TRAY_KEY } from '../src/state/tray';
import { classifyDifference, filterRows, groupPlayers, matchesSearch, modelFigure, orderRows, projectionWhy, propHref, propsExplorerHref, quoteView, rungView, statShort } from '../src/v4/propsModel';
import type { PropRow, Rung } from '../src/insights/propBoard';
import { opp } from './support/v4Opportunity';
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

describe('the model-versus-break-even difference is stated, never graded by size', () => {
  const MKT = 'mkt_kalshi_T-7';
  const published = opp({ marketId: MKT });
  const wide = rungView(rung({ yesAsk: 0.4, modelP: 0.7 }), 'over', true, NOW);
  it('has no "close" classification: a one-point and a thirty-point difference are the same kind of statement', () => {
    const near = rungView(rung({ yesAsk: 0.5, modelP: 0.53 }), 'over', true, NOW);
    const a = classifyDifference(near, null, [], NOW);
    const b = classifyDifference(wide, null, [], NOW);
    expect(a.kind).toBe('compared');
    expect(b.kind).toBe('compared');
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  });
  it('reports the sign of the difference and nothing about its significance', () => {
    expect(classifyDifference(wide, null, [], NOW)).toMatchObject({ kind: 'compared', relation: 'above' });
    const below = rungView(rung({ yesAsk: 0.7, modelP: 0.5 }), 'over', true, NOW);
    expect(classifyDifference(below, null, [], NOW)).toMatchObject({ kind: 'compared', relation: 'below' });
    expect(Math.sign((classifyDifference(below, null, [], NOW) as { points: number }).points)).toBe(-1);
  });
  it('a difference with no published signal says so: signal none', () => {
    expect(classifyDifference(wide, null, [], NOW)).toMatchObject({ kind: 'compared', signal: { kind: 'none' } });
  });
  it('a valid published signal on the same market and side is attached', () => {
    expect(classifyDifference(wide, null, [published], NOW)).toMatchObject({ signal: { kind: 'valid' } });
  });
  it('an opposite-side signal is not attached as this side’s', () => {
    const no = opp({ marketId: MKT, what: { side: 'NO' }, price: { side: 'NO' } });
    expect(classifyDifference(wide, null, [no], NOW)).toMatchObject({ signal: { kind: 'oppositeSide', has: 'NO' } });
    const under = rungView(rung({ noAsk: 0.4, modelP: 0.3 }), 'under', true, NOW);
    expect(classifyDifference(under, null, [published], NOW)).toMatchObject({ signal: { kind: 'oppositeSide', has: 'YES', wanted: 'NO' } });
    expect(classifyDifference(under, null, [no], NOW)).toMatchObject({ signal: { kind: 'valid' } });
  });
  it('stale and passed signals are reported as what they are', () => {
    expect(classifyDifference(wide, null, [opp({ marketId: MKT, price: { observedAt: iso(60) } })], NOW)).toMatchObject({ signal: { kind: 'ineligible' } });
    expect(classifyDifference(wide, null, [opp({ marketId: MKT, status: 'PASS' })], NOW)).toMatchObject({ signal: { kind: 'passed' } });
  });
  it('says why there is nothing to compare instead of inventing a gap', () => {
    expect(classifyDifference(null, null, [published], NOW).kind).toBe('noPrice');
    expect(classifyDifference(rungView(rung({ modelP: null }), 'over', true, NOW), 'Projection withheld: x.', [published], NOW)).toMatchObject({ kind: 'noProjection', why: 'Projection withheld: x.' });
    expect(classifyDifference(rungView(rung({ captured: iso(90) }), 'over', true, NOW), null, [published], NOW).kind).toBe('stale');
    expect(classifyDifference(rungView(rung({ yesAsk: null }), 'over', true, NOW), null, [published], NOW).kind).toBe('noPrice');
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

describe('Save keeps the selected side: the Board can never show the other outcome', () => {
  const ctx = { row: row(), slug: 'nfl', eventId: 'e1', kickoff: '2026-10-05T17:00:00Z', status: null };
  const MKT = 'mkt_kalshi_T-7';
  const showSave = (side: 'over' | 'under', kickoff = ctx.kickoff) => {
    const s = propSave(ctx, MKT, side)!;
    return render(<MemoryRouter><TrayProvider><SaveControl {...s} kickoff={kickoff} /></TrayProvider></MemoryRouter>);
  };
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  const stored = () => JSON.parse(localStorage.getItem(TRAY_KEY) ?? '{"tray":{"items":[]},"labels":{}}');

  it('the over keeps the identity every earlier save of the market has; the under is a different item', () => {
    expect(sideExtra(MKT, 'e1', 'YES')).toEqual({ market_id: MKT, event_id: 'e1' });
    expect(sideExtra(MKT, 'e1', 'NO')).toEqual({ market_id: MKT, event_id: 'e1', x: 'side=NO' });
  });
  it('labels state the side: the over by its line, the under as "under 6.5"', () => {
    expect(propSave(ctx, MKT, 'over')!.label).toMatchObject({ label: 'Chris Olave receptions 7+', side: 'YES' });
    expect(propSave(ctx, MKT, 'under')!.label).toMatchObject({ label: 'Chris Olave under 6.5 receptions', side: 'NO' });
    expect(propSave(ctx, MKT, 'under')!.label.sub).toMatch(/under \(No\)/);
  });
  it('saves the quote the viewer saw, for both sides, with its own capture time', () => {
    const m = propSave(ctx, MKT, 'under')!.label.market!;
    expect(m).toMatchObject({ ticker: 'T-7', yesAsk: 0.52, noAsk: 0.5, source: 'publication' });
    expect(m.observedAt).toBe(iso(2));
  });
  it('saving the over and the under are two separate items, each with its side recorded', () => {
    const a = showSave('over');
    fireEvent.click(screen.getByRole('button', { name: /^Save to My Board/ }));
    a.unmount();
    showSave('under');
    expect(screen.getByRole('button', { name: /^Save to My Board/ }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /^Save to My Board/ }));
    const s = stored();
    expect(s.tray.items).toHaveLength(2);
    expect(Object.values(s.labels).map((l) => (l as { side: string }).side).sort()).toEqual(['NO', 'YES']);
  });
  it('removing the under leaves the over saved', () => {
    const a = showSave('over');
    fireEvent.click(screen.getByRole('button', { name: /^Save to My Board/ }));
    a.unmount();
    const b = showSave('under');
    fireEvent.click(screen.getByRole('button', { name: /^Save to My Board/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Remove from My Board/ }));
    b.unmount();
    expect(stored().tray.items).toHaveLength(1);
    showSave('over');
    expect(screen.getByRole('button', { name: /^Remove from My Board/ })).toBeTruthy();
  });
  it('an earlier un-sided save of the market (SIFT 2.0, or v4 before sides) is the over: still shown saved, and the under is not', () => {
    const first = render(<MemoryRouter><TrayProvider><SaveControl sport="NFL" id={MKT} extra={{ market_id: MKT, event_id: 'e1' }} label={{ label: 'Chris Olave receptions 7+', href: '/x', kickoff: ctx.kickoff }} kickoff={ctx.kickoff} /></TrayProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /^Save to My Board/ }));
    first.unmount();
    const o = showSave('over');
    expect(screen.getByRole('button', { name: /^Remove from My Board/ })).toBeTruthy();
    o.unmount();
    showSave('under');
    expect(screen.getByRole('button', { name: /^Save to My Board/ }).getAttribute('aria-pressed')).toBe('false');
  });
  it('the pregame freeze policy holds for both sides: nothing new after kickoff', () => {
    showSave('under', '2026-10-04T12:00:00Z');
    expect(screen.getByRole('button', { name: /cannot be saved after kickoff/ }).getAttribute('aria-disabled')).toBe('true');
    expect(stored().tray.items).toHaveLength(0);
  });
});

describe('My Board tracks the side that was saved', () => {
  const snap = { ticker: 'T-7', yesAsk: 0.52, yesBid: 0.5, noAsk: 0.5, noBid: null, observedAt: iso(2), source: 'publication' };
  const quote = (yes: number, no: number) => ({ ticker: 'T-7', yesAsk: yes, noAsk: no, yesBid: null, noBid: null, observedAt: iso(0) }) as never;
  it('an under save compares the NO ask, not the YES ask', () => {
    expect(marketChange(snap, quote(0.52, 0.58), 'NO')!.text).toMatch(/^NO ask up 8¢ since saved: 50¢ → 58¢/);
  });
  it('a save with no side keeps the YES wording it always had', () => {
    expect(marketChange(snap, quote(0.58, 0.5))!.text).toMatch(/^YES ask up 6¢ since saved: 52¢ → 58¢/);
    expect(marketChange(snap, quote(0.58, 0.5), 'YES')!.text).toMatch(/^YES ask up 6¢/);
  });
  it('says so when the saved side had no quote', () => {
    expect(marketChange({ ...snap, noAsk: null }, quote(0.5, 0.5), 'NO')!.kind).toBe('unpriced');
  });
});
