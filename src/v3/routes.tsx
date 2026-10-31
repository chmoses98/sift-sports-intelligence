import { lazy } from 'react';
import { Navigate, useLocation } from '../routing';
import { startEarly } from './data/early';

// Every screen is its own chunk. The whole v3 tree is itself lazy-loaded by App.tsx, so none of it is in the classic bundle.
const load = {
  Home: () => import('./screens/Home').then((x) => ({ default: x.Home })),
  GameDetail: () => import('./screens/GameDetail').then((x) => ({ default: x.GameDetail })),
  Team: () => import('./screens/Team').then((x) => ({ default: x.Team })),
  Stat: () => import('./screens/Stat').then((x) => ({ default: x.Stat })),
  Player: () => import('./screens/Player').then((x) => ({ default: x.Player })),
  Props: () => import('./screens/props/Props').then((x) => ({ default: x.Props })),
  Search: () => import('./screens/Search').then((x) => ({ default: x.Search })),
  Following: () => import('./screens/Following').then((x) => ({ default: x.Following })),
  Settings: () => import('./screens/Settings').then((x) => ({ default: x.Settings })),
};
const Home = lazy(load.Home);
const GameDetail = lazy(load.GameDetail);
const Team = lazy(load.Team);
const Stat = lazy(load.Stat);
const Player = lazy(load.Player);
const Props = lazy(load.Props);
const Search = lazy(load.Search);
const Following = lazy(load.Following);
const Settings = lazy(load.Settings);

/** An old Games address ("/v3/games?sport=nfl&date=2026-10-31") opens Home at the same sport and day; the old state chips and the "all sports" value no longer exist. */
function GamesToHome() {
  const old = new URLSearchParams(useLocation().search);
  const q = new URLSearchParams();
  const sport = old.get('sport');
  if (sport && sport !== 'all') q.set('sport', sport);
  const date = old.get('date');
  if (date) q.set('date', date);
  return <Navigate replace to={{ pathname: '/v3', search: q.size ? `?${q}` : '' }} />;
}

/** The old Explore address is the search screen, with its query (`q`, `cat`, `sport`, `focus`) intact. */
function ExploreToSearch() {
  return <Navigate replace to={{ pathname: '/v3/search', search: useLocation().search }} />;
}

/** The children of `/v3`. The parent (V3Root, with its stylesheets and the data providers) is lazy-loaded by App.tsx so none of v3 is in the classic bundle. */
export const v3Children = [
  { index: true, element: <Home /> },
  { path: 'games', element: <GamesToHome /> },
  { path: 'game/:slug/:eventId', element: <GameDetail /> },
  { path: 'team/:slug/:teamId', element: <Team /> },
  { path: 'stat/:slug/:statId', element: <Stat /> },
  { path: 'player/:slug/:playerId', element: <Player /> },
  { path: 'props', element: <Props /> },
  { path: 'search', element: <Search /> },
  { path: 'explore', element: <ExploreToSearch /> },
  { path: 'following', element: <Following /> },
  { path: 'settings', element: <Settings /> },
  { path: '*', element: <Home /> },
];

// A SIFT 3.0 address starts its shell chunk, its screen's chunk and the slate's documents when the entry script runs (data/early.ts).
startEarly(() => import('./V3Root'), [
  [/^\/v3$/, load.Home],
  [/^\/v3\/game\//, load.GameDetail],
  [/^\/v3\/team\//, load.Team],
  [/^\/v3\/stat\//, load.Stat],
  [/^\/v3\/player\//, load.Player],
  [/^\/v3\/props$/, load.Props],
  [/^\/v3\/(?:search|explore)$/, load.Search],
  [/^\/v3\/following$/, load.Following],
  [/^\/v3\/settings$/, load.Settings],
]);
