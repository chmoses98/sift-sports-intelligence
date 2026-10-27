// A standalone entry for sharing SIFT 3.0 on its own (npm run build:v3-preview): only the v3 route tree, no classic app, no service
// worker, relative asset URLs so the folder can be hosted anywhere. It opens on labelled SAMPLE data (the safest thing to hand a
// phone); "Use real data" in the sample strip, or #/v3?demo=0, switches to the published research when the host allows the fetches.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';

// Captured-data builds (scripts/build-v3-captured-preview.mjs) serve the published documents captured on disk, in real-data mode, and open on Home
// (all four tabs and every research route are reachable by tapping). See ./snapshot.ts.
declare const __SIFT_SNAPSHOT__: boolean | undefined;
const SNAPSHOT = typeof __SIFT_SNAPSHOT__ !== 'undefined' && __SIFT_SNAPSHOT__ === true;
if (SNAPSHOT) {
  const { installSnapshot } = await import('./snapshot');
  await installSnapshot();
  // The live-score provider reads this switch (and captures `fetch` and the clock) when the app's modules are first evaluated, so the switch is
  // set, and the app imported, only after the shim is installed. Nothing here ever requests a score feed.
  try { localStorage.setItem('sift.v4.livescores', '0'); } catch { /* storage unavailable: the shim still answers any external request 404 */ }
  try { sessionStorage.removeItem('sift3.demo'); } catch { /* real data */ }
  if (!/^#\/v3(\/|\?|$)/.test(location.hash)) location.hash = '#/v3';
  // Sample-data mode is never offered here: the captured documents are never mixed with the labelled sample.
  if (/[?&]demo=/.test(location.hash)) location.hash = location.hash.replace(/([?&])demo=[^&]*&?/, '$1').replace(/[?&]$/, '');
}

try {
  if (SNAPSHOT) throw new Error('real data');
  const explicit = /[?&]demo=/.test(location.hash) || sessionStorage.getItem('sift3.demo') != null;
  if (!explicit) sessionStorage.setItem('sift3.demo', '1');
} catch { /* storage unavailable: real data */ }

// The app is imported only now (after the captured-data shim, if any, is in place): the score provider and others bind `fetch` and `Date.now` at import.
const { V3Root } = await import('../V3Root');
const { v3Children } = await import('../routes');
const router = createHashRouter([
  { path: '/v3', element: <V3Root />, children: v3Children },
  { path: '*', element: <Navigate to="/v3" replace /> },
]);

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
