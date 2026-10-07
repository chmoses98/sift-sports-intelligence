// Render a Sift screen inside its real providers, reading the real NFL publication from disk.
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Capability, CapabilityManifestDoc, MetricRegistryDoc } from '../src/contract/types';
import { SportProvider } from '../src/state/sport';
import { TrailProvider } from '../src/state/trail';
import { TrayProvider } from '../src/state/tray';
import { cfbRepo, mlbRepo, nflRepo, nhlRepo, readCfb, readMlb, readNhl, readSnapshot } from './helpers';

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

export function mlbContext() {
  const repo = mlbRepo();
  const capDoc = readMlb<CapabilityManifestDoc>('explorer/capabilities.json');
  const caps = new Map<string, Capability>(capDoc.items.map((c) => [c.capability, c]));
  const metrics = new Map(readMlb<MetricRegistryDoc>('explorer/metrics.json').items.map((m) => [m.metric_id, m]));
  return { sport: repo.sport, slug: 'mlb', repo, caps, capDoc, metrics };
}

export function renderScreen(path: string, pattern: string, element: ReactElement, capsOverride: Record<string, string> = {}, sport: 'nfl' | 'cfb' | 'nhl' | 'mlb' = 'nfl') {
  const ctx = sport === 'cfb' ? cfbContext() : sport === 'nhl' ? nhlContext() : sport === 'mlb' ? mlbContext() : nflContext(capsOverride);
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
