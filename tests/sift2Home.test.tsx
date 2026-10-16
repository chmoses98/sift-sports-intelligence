import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
