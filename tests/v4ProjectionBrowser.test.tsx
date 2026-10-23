// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const NOW = Date.parse('2026-10-22T14:00:00Z');
const tip = (i: number) => new Date(NOW + (i + 1) * 3600_000).toISOString();
const NAMES = Array.from({ length: 12 }, (_, i) => [`T${i}A`, `T${i}H`] as const);
const rows = NAMES.map(([a, h], i) => ({
  sport: 'NBA', slug: 'nba', startMs: Date.parse(tip(i)), phase: 'PREGAME',
  away: { short_name: a, display_name: `Away ${a}` }, home: { short_name: h, display_name: `Home ${h}` },
  item: { event_id: `evt_${i}`, start_time_utc: tip(i) },
}));
const teams = NAMES.flatMap(([a, h], i) => [a, h].map((t) => ({
  gameId: `espn:${i}`, team: t, teamId: null, family: 'team_points', mean: 110, p10: 100, p90: 120, startUtc: tip(i), home: h, away: a, homeId: null, awayId: null,
})));
vi.mock('../src/data/projections', () => ({
  useProjections: () => ({ doc: { sport: 'NBA', generatedAt: '2026-10-22T13:00:00Z', dataAsOf: '2026-10-22T13:00:00Z', modelVersion: 't', families: {}, players: [], teams }, loading: false }),
  useAuthority: () => ({ authority: null, ready: true }),
}));
vi.mock('../src/v4/slate', () => ({ useSlate: () => ({ rows, now: NOW, loading: false }) }));

const { ProjectionBrowser } = await import('../src/v4/ProjectionPanels');
const show = () => render(<MemoryRouter><ProjectionBrowser sport="nba" /></MemoryRouter>);
const choose = (name: RegExp) => fireEvent.click(screen.getAllByRole('button', { name }).find((b) => b.getAttribute('aria-pressed') != null)!);

describe('Props → NBA/CFB game list on a phone', () => {
  const scroll = vi.fn();
  beforeEach(() => {
    scroll.mockClear();
    Element.prototype.scrollIntoView = scroll;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('opens at the top: nothing scrolls on the first paint', () => {
    show();
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('picking a game far down the list brings that game\'s forecasts into view, once', () => {
    show();
    choose(/Away T9A @ Home T9H/);
    expect(scroll).toHaveBeenCalledTimes(1);
    const target = scroll.mock.contexts[0] as HTMLElement;
    expect(target.textContent).toContain('NBA player projections');        // the chosen game's panel, not the list
    expect(target.querySelector('[aria-label="Choose a projected game"]')).toBeNull();
    expect(scroll.mock.calls[0][0]).toMatchObject({ block: 'start' });
    expect(screen.getByRole('button', { name: /Away T9A @ Home T9H/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('a later re-render does not scroll again', () => {
    const { rerender } = show();
    choose(/Away T4A @ Home T4H/);
    rerender(<MemoryRouter><ProjectionBrowser sport="nba" /></MemoryRouter>);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('honours reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    show();
    choose(/Away T2A @ Home T2H/);
    expect(scroll.mock.calls[0][0]).toMatchObject({ behavior: 'auto' });
    vi.unstubAllGlobals();
  });
});
