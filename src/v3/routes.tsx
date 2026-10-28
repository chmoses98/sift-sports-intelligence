import { lazy } from 'react';
import { startEarly } from './data/early';

// Every screen is its own chunk. The whole v3 tree is itself lazy-loaded by App.tsx, so none of it is in the classic bundle.
const load = {
  Home: () => import('./screens/Home').then((x) => ({ default: x.Home })),
  Games: () => import('./screens/Games').then((x) => ({ default: x.Games })),
  GameDetail: () => import('./screens/GameDetail').then((x) => ({ default: x.GameDetail })),
  Team: () => import('./screens/Team').then((x) => ({ default: x.Team })),
  Stat: () => import('./screens/Stat').then((x) => ({ default: x.Stat })),
  Player: () => import('./screens/Player').then((x) => ({ default: x.Player })),
  Props: () => import('./screens/props/Props').then((x) => ({ default: x.Props })),
  Explore: () => import('./screens/Explore').then((x) => ({ default: x.Explore })),
  Following: () => import('./screens/Following').then((x) => ({ default: x.Following })),
  Settings: () => import('./screens/Settings').then((x) => ({ default: x.Settings })),
};
const Home = lazy(load.Home);
const Games = lazy(load.Games);
const GameDetail = lazy(load.GameDetail);
const Team = lazy(load.Team);
const Stat = lazy(load.Stat);
const Player = lazy(load.Player);
const Props = lazy(load.Props);
const Explore = lazy(load.Explore);
const Following = lazy(load.Following);
const Settings = lazy(load.Settings);

/** The children of `/v3`. The parent (V3Root, with its stylesheets and the data providers) is lazy-loaded by App.tsx so none of v3 is in the classic bundle. */
export const v3Children = [
  { index: true, element: <Home /> },
  { path: 'games', element: <Games /> },
  { path: 'game/:slug/:eventId', element: <GameDetail /> },
  { path: 'team/:slug/:teamId', element: <Team /> },
  { path: 'stat/:slug/:statId', element: <Stat /> },
  { path: 'player/:slug/:playerId', element: <Player /> },
  { path: 'props', element: <Props /> },
  { path: 'explore', element: <Explore /> },
  { path: 'following', element: <Following /> },
  { path: 'settings', element: <Settings /> },
  { path: '*', element: <Home /> },
];

// A SIFT 3.0 address starts its shell chunk, its screen's chunk and the slate's documents when the entry script runs (data/early.ts).
startEarly(() => import('./V3Root'), [
  [/^\/v3$/, load.Home],
  [/^\/v3\/games$/, load.Games],
  [/^\/v3\/game\//, load.GameDetail],
  [/^\/v3\/team\//, load.Team],
  [/^\/v3\/stat\//, load.Stat],
  [/^\/v3\/player\//, load.Player],
  [/^\/v3\/props$/, load.Props],
  [/^\/v3\/explore$/, load.Explore],
  [/^\/v3\/following$/, load.Following],
  [/^\/v3\/settings$/, load.Settings],
]);
