// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router';
import { UiGate } from '../src/App';

const tree = [{
  path: '/', element: <Outlet />, children: [
    { path: 'design/sift2/home', element: <div>S2 home</div> },
    { path: 'design/sift2/games', element: <div>S2 games</div> },
    { path: 'design/sift2/lab', element: <div>S2 lab</div> },
    { path: 'design/sift2/nfl/game/:id', element: <div>S2 game</div> },
    { element: <UiGate />, children: [
      { index: true, element: <div>classic home</div> },
      { path: 'games', element: <div>classic games</div> },
      { path: 'explore', element: <div>classic explore</div> },
      { path: ':sport/game/:id', element: <div>classic game</div> },
    ] },
  ],
}];
const open = (to: string) => render(<RouterProvider router={createMemoryRouter(tree, { initialEntries: [to] })} />);

describe('UiGate (SIFT 2.0 is the default interface)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);
  it('sends the root and classic addresses to their SIFT 2.0 equivalents', async () => {
    open('/');
    expect(await screen.findByText('S2 home')).toBeTruthy();
  });
  it('maps games, explore (the Research Lab) and game addresses', async () => {
    open('/games'); expect(await screen.findByText('S2 games')).toBeTruthy();
  });
  it('maps /explore to the lab', async () => { open('/explore'); expect(await screen.findByText('S2 lab')).toBeTruthy(); });
  it('maps a classic game address', async () => { open('/nfl/game/evt_1'); expect(await screen.findByText('S2 game')).toBeTruthy(); });
  it('?ui=classic keeps the classic interface and is remembered', async () => {
    open('/?ui=classic');
    expect(await screen.findByText('classic home')).toBeTruthy();
    expect(localStorage.getItem('sift.ui')).toBe('classic');
  });
  it('a remembered classic choice applies to later classic addresses; ?ui=default forgets it', async () => {
    localStorage.setItem('sift.ui', 'classic');
    const a = open('/games'); expect(await screen.findByText('classic games')).toBeTruthy(); a.unmount();
    open('/?ui=default'); expect(await screen.findByText('S2 home')).toBeTruthy();
    expect(localStorage.getItem('sift.ui')).toBeNull();
  });
});
