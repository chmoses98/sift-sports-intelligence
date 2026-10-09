// Render a Sift screen inside its real providers, reading the real NFL publication from disk.
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Capability, CapabilityManifestDoc, MetricRegistryDoc } from '../src/contract/types';
import { SportProvider } from '../src/state/sport';
import { TrailProvider } from '../src/state/trail';
import { TrayProvider } from '../src/state/tray';
import { cfbRepo, mlbRepo, nbaRepo, nflRepo, nhlFinalRepo, nhlRepo, readCfb, readMlb, readNba, readNhl, readNhlFinal, readSnapshot, readSoccer, readTennis, soccerRepo, tennisRepo } from './helpers';
import type { SportRepo } from '../src/data/repo';

export function nflContext(capsOverride: Record<string, string> = {}) {
  const repo = nflRepo();
  const capDoc = readSnapshot<CapabilityManifestDoc>('explorer/capabilities.json');
  const caps = new Map<string, Capability>(capDoc.items.map((c) => [c.capability, { ...c, status: (capsOverride[c.capability] ?? c.status) as Capability['status'] }]));
  const metrics = new Map(readSnapshot<MetricRegistryDoc>('explorer/metrics.json').items.map((m) => [m.metric_id, m]));
  return { sport: repo.sport, slug: 'nfl', repo, caps, capDoc, metrics };
}

export function cfbContext() {
  const repo = cfbRepo();
  const capDoc = readCfb<CapabilityManifestDoc>('explorer/capabilities.json');
  const caps = new Map<string, Capability>(capDoc.items.map((c) => [c.capability, c]));
  const metrics = new Map(readCfb<MetricRegistryDoc>('explorer/metrics.json').items.map((m) => [m.metric_id, m]));
  return { sport: repo.sport, slug: 'cfb', repo, caps, capDoc, metrics };
}

export function nhlContext() {
  const repo = nhlRepo();
  const capDoc = readNhl<CapabilityManifestDoc>('explorer/capabilities.json');
  const caps = new Map<string, Capability>(capDoc.items.map((c) => [c.capability, c]));
  const metrics = new Map(readNhl<MetricRegistryDoc>('explorer/metrics.json').items.map((m) => [m.metric_id, m]));
  return { sport: repo.sport, slug: 'nhl', repo, caps, capDoc, metrics };
}

export function nhlFinalContext() {
  const repo = nhlFinalRepo();
  const capDoc = readNhlFinal<CapabilityManifestDoc>('explorer/capabilities.json');
  const caps = new Map<string, Capability>(capDoc.items.map((c) => [c.capability, c]));
  const metrics = new Map(readNhlFinal<MetricRegistryDoc>('explorer/metrics.json').items.map((m) => [m.metric_id, m]));
  return { sport: repo.sport, slug: 'nhl', repo, caps, capDoc, metrics };
}

export function mlbContext() {
  const repo = mlbRepo();
  const capDoc = readMlb<CapabilityManifestDoc>('explorer/capabilities.json');
  const caps = new Map<string, Capability>(capDoc.items.map((c) => [c.capability, c]));
  const metrics = new Map(readMlb<MetricRegistryDoc>('explorer/metrics.json').items.map((m) => [m.metric_id, m]));
  return { sport: repo.sport, slug: 'mlb', repo, caps, capDoc, metrics };
}

function fixtureContext(repo: SportRepo, slug: string, read: <T>(rel: string) => T) {
  const capDoc = read<CapabilityManifestDoc>('explorer/capabilities.json');
  const caps = new Map<string, Capability>(capDoc.items.map((c) => [c.capability, c]));
  const metrics = new Map(read<MetricRegistryDoc>('explorer/metrics.json').items.map((m) => [m.metric_id, m]));
  return { sport: repo.sport, slug, repo, caps, capDoc, metrics };
}
export const soccerContext = () => fixtureContext(soccerRepo(), 'soccer', readSoccer);
export const tennisContext = () => fixtureContext(tennisRepo(), 'tennis', readTennis);
export const nbaContext = () => fixtureContext(nbaRepo(), 'nba', readNba);

export type FixtureSport = 'nfl' | 'cfb' | 'nhl' | 'nhl-final' | 'mlb' | 'soccer' | 'tennis' | 'nba';

export function renderScreen(path: string, pattern: string, element: ReactElement, capsOverride: Record<string, string> = {}, sport: FixtureSport = 'nfl') {
  const ctx = sport === 'cfb' ? cfbContext() : sport === 'nhl' ? nhlContext() : sport === 'nhl-final' ? nhlFinalContext() : sport === 'mlb' ? mlbContext() : sport === 'soccer' ? soccerContext() : sport === 'tennis' ? tennisContext() : sport === 'nba' ? nbaContext() : nflContext(capsOverride);
  const router = createMemoryRouter(
    [
      { path: pattern, element: <TrailProvider><SportProvider value={ctx}>{element}</SportProvider></TrailProvider> },
      { path: '*', element: <div data-testid="elsewhere" /> },
    ],
    { initialEntries: [path] },
  );
  const utils = render(
    <TrayProvider>
      <RouterProvider router={router} />
    </TrayProvider>,
  );
  return { ...utils, router, ctx };
}
