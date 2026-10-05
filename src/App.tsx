import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router';
import { Skeleton } from './components/ui';
import { Shell } from './components/Shell';
import { SportLayout } from './components/SportLayout';
import { TrailProvider } from './state/trail';
import { TrayProvider } from './state/tray';
import { HomeView } from './views/Home';
import { NotFound } from './views/NotFound';
import { SportHomeView } from './views/SportHome';

const CompareView = lazy(() => import('./views/Compare').then((x) => ({ default: x.CompareView })));
const DesignView = lazy(() => import('./views/Design').then((x) => ({ default: x.DesignView })));
const GameRoute = lazy(() => import('./views/Game').then((x) => ({ default: x.GameRoute })));
const MarketView = lazy(() => import('./views/Market').then((x) => ({ default: x.MarketView })));
const MetricView = lazy(() => import('./views/Metric').then((x) => ({ default: x.MetricView })));
const PacketView = lazy(() => import('./views/Packet').then((x) => ({ default: x.PacketView })));
const PlayerView = lazy(() => import('./views/Player').then((x) => ({ default: x.PlayerView })));
const RankingView = lazy(() => import('./views/Ranking').then((x) => ({ default: x.RankingView })));
const SearchView = lazy(() => import('./views/Search').then((x) => ({ default: x.SearchView })));
const StatusView = lazy(() => import('./views/Status').then((x) => ({ default: x.StatusView })));
const TeamView = lazy(() => import('./views/Team').then((x) => ({ default: x.TeamView })));
const TrayView = lazy(() => import('./views/Tray').then((x) => ({ default: x.TrayView })));
const SlateView = lazy(() => import('./views/Slate').then((x) => ({ default: x.SlateView })));
const ScorecardView = lazy(() => import('./views/Scorecard').then((x) => ({ default: x.ScorecardView })));
const ParlaysView = lazy(() => import('./views/Parlays').then((x) => ({ default: x.ParlaysView })));
const NewsView = lazy(() => import('./views/News').then((x) => ({ default: x.NewsView })));
const SettingsView = lazy(() => import('./views/Settings').then((x) => ({ default: x.SettingsView })));
const SportsView = lazy(() => import('./views/Sports').then((x) => ({ default: x.SportsView })));

// Every screen is its own chunk: a phone downloads the code for the screen it opens.
const Page = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<div className="page"><Skeleton lines={6} tall /></div>}>{children}</Suspense>
);

function Root() {
  return (
    <TrailProvider>
      <Shell>
        <Page>
          <Outlet />
        </Page>
      </Shell>
      <ScrollRestoration />
    </TrailProvider>
  );
}

export const routeTree = [
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <HomeView /> },
      { path: 'search', element: <SearchView /> },
      { path: 'tray', element: <TrayView /> },
      { path: 'packet', element: <PacketView /> },
      { path: 'status', element: <StatusView /> },
      { path: 'design', element: <DesignView /> },
      { path: 'sports', element: <SportsView /> },
      { path: 'news', element: <NewsView /> },
      { path: 'settings', element: <SettingsView /> },
      {
        path: ':sport',
        element: <SportLayout />,
        children: [
          { index: true, element: <SportHomeView /> },
          { path: 'slate', element: <SlateView /> },
          { path: 'parlays', element: <ParlaysView /> },
          { path: 'scorecard', element: <ScorecardView /> },
          { path: 'game/:eventId', element: <GameRoute /> },
          { path: 'team/:teamId', element: <TeamView /> },
          { path: 'player/:playerId', element: <PlayerView /> },
          { path: 'metric/:metricId', element: <MetricView /> },
          { path: 'ranking/:rankingId', element: <RankingView /> },
          { path: 'market/:marketId', element: <MarketView /> },
          { path: 'compare', element: <CompareView /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];

const router = createHashRouter(routeTree);

export default function App() {
  return (
    <TrayProvider>
      <RouterProvider router={router} />
    </TrayProvider>
  );
}
