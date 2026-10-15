import { lazy, Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Skeleton } from '../components/ui';
import '../styles/sift2-tokens.css';
import '../styles/sift2-workspace.css';

const Props = lazy(() => import('./props/PropsHub').then((m) => ({ default: m.PropsHubView })));
const Intelligence = lazy(() => import('./intel/TerminalView').then((m) => ({ default: m.TerminalView })));
const Lab = lazy(() => import('./explore/ExploreView').then((m) => ({ default: m.ExploreView })));

/** Isolated review workspace over existing evidence-gated research, never a parallel data pipeline. */
export function Sift2Workspace() {
  return <div className="sift2-workspace">
    <div className="sift2-workspace__bar page"><Link to="/design/sift2/home">SIFT 2.0 / DESIGN PREVIEW</Link>
      <nav aria-label="SIFT 2.0 preview destinations">
        <NavLink to="/design/sift2/home">Home</NavLink>
        <NavLink to="/design/sift2/props">Players</NavLink>
        <NavLink to="/design/sift2/intelligence">Intelligence</NavLink>
        <NavLink to="/design/sift2/lab">Research Lab</NavLink>
      </nav>
    </div>
    <Suspense fallback={<div className="page" role="status" aria-label="Loading research"><Skeleton lines={5} tall /></div>}><Outlet /></Suspense>
  </div>;
}
export function Sift2Props() { return <Props />; }
export function Sift2Intelligence() { return <Intelligence />; }
export function Sift2Lab() { return <Lab />; }
