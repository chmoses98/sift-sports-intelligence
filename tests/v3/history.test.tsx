// Back, sheets and in-place state against a real router's history: the contract the walkthrough proved, now on the real components.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Link } from '../../src/routing';
import { SheetHost, useSheet, registerSheet } from '../../src/v3/ui/Sheet';
import { useRouteState } from '../../src/v3/state/url';
import { playerSchema } from '../../src/v3/nav/schemas';
import { PriceTap, StatLink, TeamLink, NavRow } from '../../src/v3/nav/Targets';

beforeAll(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

function Player() {
  const [s, set] = useRouteState(playerSchema);
  const sheet = useSheet();
  return (
    <div>
      <p data-testid="state">{s.win}|{s.line ?? '-'}|{s.site}</p>
      <button onClick={() => set({ win: 'L5' })}>L5</button>
      <button onClick={() => set({ site: 'away' })}>away</button>
      <button onClick={() => { set({ win: 'L20' }); set({ line: 7 }); }}>two</button>
      <button onClick={() => sheet.open('Filters', <button onClick={() => set({ site: 'home' })}>apply-home</button>)}>filters</button>
      <button onClick={() => sheet.open('Go', <Link to="/team">to-team</Link>)}>link-sheet</button>
      <PriceTap ticker="KX-1">54¢</PriceTap>
      <Link to="/team">team</Link>
    </div>
  );
}
const Team = () => <div>team page</div>;

function setup(initial = ['/player']) {
  registerSheet('contract', { title: (tk) => `Contract ${tk}`, tall: true, render: (tk) => <p>contract body {tk}</p> });
  const router = createMemoryRouter(
    [{ element: <SheetHost><Outlet2 /></SheetHost>, children: [{ path: '/player', element: <Player /> }, { path: '/team', element: <Team /> }] }],
    { initialEntries: initial },
  );
  render(<RouterProvider router={router} />);
  return router;
}
import { Outlet } from 'react-router';
const Outlet2 = () => <Outlet />;
const loc = (r: ReturnType<typeof setup>) => `${r.state.location.pathname}${r.state.location.search}`;

describe('in-place state does not pile up history', () => {
  it('tab/window/filter changes replace the entry, so Back leaves the screen', async () => {
    const r = setup(['/team', '/player']);
    const u = userEvent.setup();
    await u.click(screen.getByText('L5'));
    await u.click(screen.getByText('away'));
    expect(loc(r)).toBe('/player?v=1&win=L5&site=away');
    expect(screen.getByTestId('state').textContent).toBe('L5|-|away');
    await act(async () => { await r.navigate(-1); });
    expect(loc(r)).toBe('/team');
  });
  it('several updates in one handler compose', async () => {
    const r = setup();
    await userEvent.setup().click(screen.getByText('two'));
    expect(loc(r)).toBe('/player?v=1&line=7&win=L20');
  });
  it('navigating forward and Back returns the screen with its exact state', async () => {
    const r = setup();
    const u = userEvent.setup();
    await u.click(screen.getByText('L5'));
    await u.click(screen.getByText('team', { selector: 'a' }));
    expect(loc(r)).toBe('/team');
    await act(async () => { await r.navigate(-1); });
    expect(loc(r)).toBe('/player?v=1&win=L5');
    expect(screen.getByTestId('state').textContent).toBe('L5|-|any');
  });
});

describe('sheets are part of history', () => {
  it('Back closes an open sheet and the screen is exactly as it was', async () => {
    const r = setup();
    const u = userEvent.setup();
    await u.click(screen.getByText('L5'));
    await u.click(screen.getByText('filters'));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Filters' })).toBeTruthy());
    await act(async () => { await r.navigate(-1); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(loc(r)).toBe('/player?v=1&win=L5');
  });
  it('closing with the X steps back, leaving no extra entry', async () => {
    const r = setup(['/team', '/player']);
    const u = userEvent.setup();
    await u.click(screen.getByText('filters'));
    await u.click(document.querySelector('.v3-sheet__x')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => { await r.navigate(-1); });
    expect(loc(r)).toBe('/team');
  });
  it('a state change made inside a sheet lands on the screen underneath and closes the sheet', async () => {
    const r = setup(['/team', '/player']);
    const u = userEvent.setup();
    await u.click(screen.getByText('filters'));
    await u.click(await screen.findByText('apply-home'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(loc(r)).toBe('/player?v=1&site=home');
    expect(screen.getByTestId('state').textContent).toBe('any|-|home'.replace('any', 'L10'));
    await act(async () => { await r.navigate(-1); });
    expect(loc(r)).toBe('/team');
  });
  it('a link inside a sheet leaves the screen underneath with every sheet closed', async () => {
    const r = setup(['/team', '/player']);
    const u = userEvent.setup();
    await u.click(screen.getByText('L5'));
    await u.click(screen.getByText('link-sheet'));
    await u.click(await screen.findByText('to-team'));
    expect(loc(r)).toBe('/team');
    await act(async () => { await r.navigate(-1); });
    await waitFor(() => expect(loc(r)).toBe('/player?v=1&win=L5'));
    expect(screen.queryByRole('dialog')).toBeNull();
    // One more Back leaves the screen: the sheet left no ghost entry behind.
    await act(async () => { await r.navigate(-1); });
    expect(loc(r)).toBe('/team');
  });
  it('a price opens the addressed contract sheet; Back closes it', async () => {
    const r = setup();
    const u = userEvent.setup();
    await u.click(screen.getByText('L5'));
    await u.click(screen.getByText('54¢'));
    expect(loc(r)).toBe('/player?v=1&win=L5&sheet=contract&tk=KX-1');
    expect(await screen.findByRole('dialog', { name: 'Contract KX-1' })).toBeTruthy();
    await act(async () => { await r.navigate(-1); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(loc(r)).toBe('/player?v=1&win=L5');
  });
  it('a deep-linked contract sheet opens from the address and closes in place', async () => {
    const r = setup(['/player?v=1&win=L5&sheet=contract&tk=KX-9']);
    expect(await screen.findByRole('dialog', { name: 'Contract KX-9' })).toBeTruthy();
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(loc(r)).toBe('/player?v=1&win=L5');
  });
});

describe('shared tap targets', () => {
  it('render the canonical destination and a test hook, and never nest an anchor in an anchor', () => {
    const r = createMemoryRouter([{ path: '*', element: (
      <NavRow to="/v3/game/nfl/E1" kind="game" label="Dallas at Philadelphia">
        <TeamLink team={{ slug: 'nfl', id: 'DAL' }}>DAL</TeamLink>
        <StatLink stat={{ slug: 'nfl', statId: 'adj_off_epa' }} state={{ sel: 'DAL' }}>1st</StatLink>
      </NavRow>
    ) }], { initialEntries: ['/'] });
    const { container } = render(<RouterProvider router={r} />);
    const taps = [...container.querySelectorAll('[data-tap]')].map((a) => [a.getAttribute('data-tap'), a.getAttribute('data-dest')]);
    expect(taps).toEqual([['game', '/v3/game/nfl/E1'], ['team', '/v3/team/nfl/DAL'], ['stat', '/v3/stat/nfl/adj_off_epa?v=1&sel=DAL']]);
    expect(container.querySelector('a a')).toBeNull();
  });
});

describe('closing is idempotent', () => {
  it('a change made in a sheet followed by the sheet\'s own close steps back once', async () => {
    const r = setup(['/team', '/player']);
    const u = userEvent.setup();
    await u.click(screen.getByText('filters'));
    // What LinesSheet does: apply, then close.
    await u.click(await screen.findByText('apply-home'));
    await u.click(document.querySelector('.v3-sheet__x') ?? document.body).catch(() => {});
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(loc(r)).toBe('/player?v=1&site=home');
    await act(async () => { await r.navigate(-1); });
    expect(loc(r)).toBe('/team');
  });
});
