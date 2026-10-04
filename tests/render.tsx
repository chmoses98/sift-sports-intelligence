// Render a Sift screen inside its real providers, reading the real NFL publication from disk.
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Capability, CapabilityManifestDoc, MetricRegistryDoc } from '../src/contract/types';
import { SportProvider } from '../src/state/sport';
import { TrailProvider } from '../src/state/trail';
import { TrayProvider } from '../src/state/tray';
import { nflRepo, readSnapshot } from './helpers';

export function nflContext(capsOverride: Record<string, string> = {}) {
  const repo = nflRepo();
  const capDoc = readSnapshot<CapabilityManifestDoc>('explorer/capabilities.json');
  const caps = new Map<string, Capability>(capDoc.items.map((c) => [c.capability, { ...c, status: (capsOverride[c.capability] ?? c.status) as Capability['status'] }]));
  const metrics = new Map(readSnapshot<MetricRegistryDoc>('explorer/metrics.json').items.map((m) => [m.metric_id, m]));
  return { sport: repo.sport, slug: 'nfl', repo, caps, capDoc, metrics };
}

export function renderScreen(path: string, pattern: string, element: ReactElement, capsOverride: Record<string, string> = {}) {
  const ctx = nflContext(capsOverride);
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
