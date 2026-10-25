import { lazy } from 'react';

// Every screen is its own chunk. The whole v3 tree is itself lazy-loaded by App.tsx, so none of it is in the classic bundle.
const Home = lazy(() => import('./screens/Home').then((x) => ({ default: x.Home })));
const Games = lazy(() => import('./screens/Games').then((x) => ({ default: x.Games })));
const GameDetail = lazy(() => import('./screens/GameDetail').then((x) => ({ default: x.GameDetail })));
const Team = lazy(() => import('./screens/Team').then((x) => ({ default: x.Team })));
const Stat = lazy(() => import('./screens/Stat').then((x) => ({ default: x.Stat })));
const Player = lazy(() => import('./screens/Player').then((x) => ({ default: x.Player })));
const Explore = lazy(() => import('./screens/Explore').then((x) => ({ default: x.Explore })));
const Following = lazy(() => import('./screens/Following').then((x) => ({ default: x.Following })));
const Settings = lazy(() => import('./screens/Settings').then((x) => ({ default: x.Settings })));

/** The children of `/v3`. The parent (V3Root, with its stylesheets and the data providers) is lazy-loaded by App.tsx so none of v3 is in the classic bundle. */
export const v3Children = [
  { index: true, element: <Home /> },
  { path: 'games', element: <Games /> },
  { path: 'game/:slug/:eventId', element: <GameDetail /> },
  { path: 'team/:slug/:teamId', element: <Team /> },
  { path: 'stat/:slug/:statId', element: <Stat /> },
  { path: 'player/:slug/:playerId', element: <Player /> },
  { path: 'explore', element: <Explore /> },
  { path: 'following', element: <Following /> },
  { path: 'settings', element: <Settings /> },
  { path: '*', element: <Home /> },
];
