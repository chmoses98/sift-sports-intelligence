// A standalone entry for sharing SIFT 3.0 on its own (npm run build:v3-preview): only the v3 route tree, no classic app, no service
// worker, relative asset URLs so the folder can be hosted anywhere. It opens on labelled SAMPLE data (the safest thing to hand a
// phone); "Use real data" in the sample strip, or #/v3?demo=0, switches to the published research when the host allows the fetches.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { V3Root } from '../V3Root';
import { v3Children } from '../routes';

// Snapshot builds (scripts/build-v3-snapshot.mjs) serve captured REAL documents and open on the captured player, in real-data mode.
declare const __SIFT_SNAPSHOT__: boolean | undefined;
const SNAPSHOT = typeof __SIFT_SNAPSHOT__ !== 'undefined' && __SIFT_SNAPSHOT__ === true;
if (SNAPSHOT) {
  const { installSnapshot } = await import('./snapshot');
  installSnapshot();
  try { sessionStorage.setItem('sift3.demo', '0'); sessionStorage.removeItem('sift3.demo'); } catch { /* real data */ }
  if (!/^#\/v3\/(player|team|stat|game)/.test(location.hash)) location.hash = '#/v3/player/nfl/prt_4c661ae8b854ff5f66dd';
}

try {
  if (SNAPSHOT) throw new Error('real data');
  const explicit = /[?&]demo=/.test(location.hash) || sessionStorage.getItem('sift3.demo') != null;
  if (!explicit) sessionStorage.setItem('sift3.demo', '1');
} catch { /* storage unavailable: real data */ }

const router = createHashRouter([
  { path: '/v3', element: <V3Root />, children: v3Children },
  { path: '*', element: <Navigate to="/v3" replace /> },
]);

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
