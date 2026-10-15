import { lazy, Suspense } from 'react';
import { Outlet } from '../routing';
import { Skeleton } from '../components/ui';
import '../styles/sift2-tokens.css';
import '../styles/sift2-workspace.css';

const Props = lazy(() => import('./props/PropsHub').then((m) => ({ default: m.PropsHubView })));
const Intelligence = lazy(() => import('./intel/TerminalView').then((m) => ({ default: m.TerminalView })));
const Lab = lazy(() => import('./explore/ExploreView').then((m) => ({ default: m.ExploreView })));

/** Isolated review workspace over existing evidence-gated research, never a parallel data pipeline. */
export function Sift2Workspace() {
  return <div className="sift2-workspace">
    <Suspense fallback={<div className="page" role="status" aria-label="Loading research"><Skeleton lines={5} tall /></div>}><Outlet /></Suspense>
  </div>;
}
export function Sift2Props() { return <Props />; }
export function Sift2Intelligence() { return <Intelligence />; }
export function Sift2Lab() { return <Lab />; }
