// The game Back contract against a real (hash) router's history: switching games replaces, Back lands on the origin in one step.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHashRouter, Outlet, RouterProvider, useParams } from 'react-router';
import { Link } from '../../src/routing';
import { SheetHost, useSheet } from '../../src/v3/ui/Sheet';
import { useGameBack, useGameOriginMark, useSwitchGame } from '../../src/v3/nav/useGameNav';
import { useQueryPatch } from '../../src/v3/state/url';

beforeAll(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

const GAMES = ['a', 'b', 'c'];
function Home() { return <div><p>home</p><Link to="/v3/game/nfl/a">open-a</Link></div>; }
function Team() { return <div><p>team page</p><Link to="/v3/game/nfl/d">team-game</Link></div>; }
function PickerLike() { const sw = useSwitchGame(); return <button onClick={() => sw({ slug: 'nfl', eventId: 'c' })}>pick-c</button>; }
function Game() {
  const { eventId = '' } = useParams();
  useGameOriginMark();
  const back = useGameBack();
  const sw = useSwitchGame();
  const patch = useQueryPatch();
  const sheet = useSheet();
  return (
    <div>
      <p data-testid="game">{eventId}</p>
      <button onClick={back}>back</button>
      {GAMES.map((g) => <button key={g} onClick={() => sw({ slug: 'nfl', eventId: g })}>to-{g}</button>)}
      <button onClick={() => sheet.open('Switch', <PickerLike />)}>picker</button>
      <button onClick={() => patch({ unit: 'pass' }, { push: true })}>unit</button>
      <button onClick={() => patch({ tab: 'props', unit: null })}>tab</button>
      <Link to="/v3/team/DAL">game-team</Link>
    </div>
  );
}

const mk = () => createHashRouter([{ element: <SheetHost><Outlet /></SheetHost>, children: [{ path: '/v3', element: <Home /> }, { path: '/v3/team/:id', element: <Team /> }, { path: '/v3/game/:slug/:eventId', element: <Game /> }] }]);
type R = ReturnType<typeof mk>;
// (a real history traversal is asynchronous: wait for the router to settle rather than for a fixed time, so a loaded machine cannot flake it)
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const click = async (name: string) => { await act(async () => { screen.getByText(name).click(); }); await settle(); };
const where = (r: R) => `${r.state.location.pathname}${r.state.location.search}`;
const browserBack = async () => { await act(async () => { window.history.back(); await new Promise((r) => setTimeout(r, 400)); }); };

let router: R;
async function start(initial = '#/v3') {
  window.history.replaceState(null, '', initial);
  router = mk();
  render(<RouterProvider router={router} />);
  await settle();
}

describe('Back from a game', () => {
  it('open A, switch to B then C: one history entry; Back returns to the originating screen', async () => {
    await start();
    const before = window.history.length;
    await click('open-a');
    expect(where(router)).toBe('/v3/game/nfl/a');
    const afterOpen = window.history.length;
    expect(afterOpen).toBe(before + 1);
    await click('to-b'); await click('to-c');
    expect(screen.getByTestId('game').textContent).toBe('c');
    expect(window.history.length).toBe(afterOpen);
    await click('back');
    expect(where(router)).toBe('/v3');
    expect(screen.getByText('home')).toBeTruthy();
  });
  it('browser Back does the same', async () => {
    await start();
    await click('open-a'); await click('to-b'); await click('to-c');
    await browserBack();
    expect(where(router)).toBe('/v3');
  });
  it('a deep link has no history: Back goes Home and replaces the entry', async () => {
    await start('#/v3/game/nfl/a');
    await click('to-b'); await click('to-c');
    const len = window.history.length;
    await click('back');
    expect(where(router)).toBe('/v3');
    expect(window.history.length).toBe(len);
  });
  it('the picker sheet: closing it and switching leaves one game entry; Back reaches the origin', async () => {
    await start();
    await click('open-a');
    await click('picker');
    await click('pick-c');
    expect(where(router)).toBe('/v3/game/nfl/c');
    expect(router.state.location.state).not.toHaveProperty('v3sheet');
    await click('back');
    expect(where(router)).toBe('/v3');
  });
  it('an expanded unit and a tab changed from it do not sit between the game and its origin', async () => {
    await start();
    await click('open-a');
    await click('unit');
    await click('tab');
    await click('to-b');
    await click('back');
    expect(where(router)).toBe('/v3');
  });
  it('game to team to game stays ordinary: the game opened from the team returns to the team, and the team to the game', async () => {
    await start();
    await click('open-a'); await click('to-b');
    await click('game-team');
    expect(where(router)).toBe('/v3/team/DAL');
    await click('team-game');
    expect(where(router)).toBe('/v3/game/nfl/d');
    await click('to-c');
    await click('back');
    expect(where(router)).toBe('/v3/team/DAL');
    await browserBack();
    expect(where(router)).toBe('/v3/game/nfl/b');
    await click('back');
    expect(where(router)).toBe('/v3');
  });
  it('a reload keeps the origin (the marker lives in the entry)', async () => {
    await start();
    await click('open-a'); await click('to-b');
    cleanup();
    router = mk();
    render(<RouterProvider router={router} />);
    await settle();
    expect(where(router)).toBe('/v3/game/nfl/b');
    await click('back');
    expect(where(router)).toBe('/v3');
  });
});
