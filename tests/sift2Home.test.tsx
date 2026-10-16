import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sportByCode } from '../src/data/sports';
import type { BoardItem } from '../src/contract/types';
import { Sift2HomePreview } from '../src/views/Sift2HomePreview';

const state = vi.hoisted(() => ({ loading: false, error: null as string | null, bundles: [] as unknown[], opportunities: [], verdicts: [] }));
vi.mock('../src/opportunity/load', () => ({ useAllOpportunities: () => state }));
vi.mock('../src/live/hooks', () => ({ useNow: () => Date.parse('2026-10-15T12:00:00Z') }));
vi.mock('../src/views/home/HomeTopProps', () => ({ default: () => <p>Published props component</p> }));
const failed = (label: string) => ({ sport: { label }, board: [], error: 'Publication unavailable' });
const show = () => render(<MemoryRouter><Sift2HomePreview /></MemoryRouter>);

afterEach(cleanup);

describe('SIFT 2.0 publication coverage', () => {
  it('does not call all failed sport publications an empty slate', () => {
    Object.assign(state, { loading: false, error: null, bundles: [failed('NFL'), failed('NHL')] });
    show();
    expect(screen.getByRole('alert').textContent).toContain('Do not interpret missing games');
    expect(screen.queryByText('No games published for today.')).toBeNull();
    expect(screen.queryByText('Published props component')).toBeNull();
  });
  it('keeps available feeds visible and identifies partial coverage', () => {
    state.bundles = [failed('NHL'), { sport: { label: 'NFL' }, board: [], error: null }];
    show();
    expect(screen.getByText(/Partial publication coverage: NHL unavailable/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/No games published for today/)).toBeTruthy();
  });
  it('does not rank an empty opportunity list while publications load', () => {
    Object.assign(state, { loading: true, error: null, bundles: [] });
    show();
    expect(screen.getByText('Loading published player research…')).toBeTruthy();
    expect(screen.queryByText('Published props component')).toBeNull();
  });
});

const NOW = Date.parse('2026-10-15T12:00:00Z');
const item = (i: number, startIso: string): BoardItem => ({
  event_id: `nba_${i}`, league: 'NBA', competition: null, status: 'SCHEDULED', start_time_utc: startIso, home_participant: 'h', away_participant: 'a',
  participants: [{ participant_id: 'h', display_name: `Home Club ${i}`, short_name: `H${i}`, participant_type: 'TEAM' }, { participant_id: 'a', display_name: `Away Club ${i}`, short_name: `A${i}`, participant_type: 'TEAM' }],
  data_freshness: 'FRESH' as never, health_flags: [], detail_path: '', market_captured_at: null, model_generated_at: null, markets_available: 3, markets_priced: 0, recommendations_count: 0, wagers_count: 0,
});
const nba = (starts: string[]) => ({ sport: sportByCode('NBA')!, board: starts.map((s, i) => item(i, s)), recommendations: null, theses: null, signals: null, modelState: null, marketCaptureAt: null, error: null });
const hours = (n: number) => Array.from({ length: n }, (_, i) => new Date(NOW + (1 + (i % 9)) * 3600_000 + i * 60_000).toISOString());

describe('SIFT 2.0 Home: one purpose per section', () => {
  it.each([[2, 1], [4, 3], [10, 6], [40, 6], [120, 6]])('a %i-game slate previews %i games, never the featured one, and links to every game', (n, shown) => {
    process.env.TZ = 'UTC';
    Object.assign(state, { loading: false, error: null, bundles: [nba(hours(n))], opportunities: [], verdicts: [] });
    show();
    const list = screen.getByRole('list', { name: "Today's games preview" });
    const rows = list.querySelectorAll('li');
    expect(rows).toHaveLength(shown);
    expect(new Set([...rows].map((r) => r.querySelector('a')!.getAttribute('href'))).size).toBe(shown);
    const more = screen.getAllByRole('link', { name: /View all/ });
    expect(more.length).toBeGreaterThan(0);
    for (const a of more) expect(a.getAttribute('href')).toBe('/design/sift2/games');
    if (n - 1 > shown) expect(screen.getByRole('link', { name: `View all ${n} games →` })).toBeTruthy();
    // the featured matchup is a single hero; its game does not reappear as a row
    expect(document.querySelectorAll('.s2-broadcast')).toHaveLength(1);
    expect(document.querySelectorAll('.s2-match-card')).toHaveLength(0);
  });
  it('with no game today it says so and offers other days, without inventing today’s findings', () => {
    process.env.TZ = 'UTC';
    const tomorrow = new Date(NOW + 30 * 3600_000).toISOString();
    Object.assign(state, { loading: false, error: null, bundles: [nba([tomorrow])], opportunities: [], verdicts: [] });
    show();
    expect(screen.getByText(/No games published for today/)).toBeTruthy();
    expect(screen.getByText(/No research findings for games on October 15/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: "Today's games preview" })).toBeNull();
  });
  it('with an empty slate everywhere it shows useful empty states, not blank sections', () => {
    Object.assign(state, { loading: false, error: null, bundles: [nba([])], opportunities: [], verdicts: [] });
    show();
    expect(screen.getByText(/No eligible featured matchup/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What matters today' })).toBeTruthy();
    expect(screen.getByText(/No games published for today/)).toBeTruthy();
  });
});
