import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameOpportunities } from '../src/views/game/GameOpportunities';
const state = vi.hoisted(() => ({ loading: false, error: null as string | null, opportunities: [], verdict: { loaded: true, passReason: 'Prop pricing remains research only.' } }));
vi.mock('../src/state/sport', () => ({ useSport: () => ({ sport: { code: 'NFL', label: 'NFL' }, repo: {}, slug: 'nfl' }) }));
vi.mock('../src/opportunity/load', () => ({ useSportOpportunities: () => state }));
afterEach(cleanup);
describe('Game publication status integrity', () => {
  it('does not turn a sport bundle publication failure into No Edge', () => {
    state.verdict.loaded = false;
    render(<GameOpportunities eventId="game" now={0} />);
    expect(screen.getByRole('alert').textContent).toContain('cannot be interpreted as a no-edge verdict');
    expect(screen.queryByText('No Edge')).toBeNull();
  });
  it('does not turn an aggregate fetch failure into No Edge', () => {
    state.verdict.loaded = true; state.error = 'Offline';
    render(<GameOpportunities eventId="game" now={0} compact />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/No validated opportunity published/)).toBeNull();
  });
  it('preserves the exact publication restriction in the compact disclosure', () => {
    state.error = null;
    render(<GameOpportunities eventId="game" now={0} compact />);
    expect(screen.getByText(/No validated opportunity published/)).toBeTruthy();
    expect(screen.getByText(/Prop pricing remains research only/)).toBeTruthy();
  });
});
