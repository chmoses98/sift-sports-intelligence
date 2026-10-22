// The pause switch for v4 early access (lib/v4Switch.ts): a build with VITE_SIFT_V4=off keeps SIFT 2.0 exactly as it is and turns #/v4
// into a notice with the way out.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';

const mount = async (path: string) => {
  const { routeTree } = await import('../src/App');
  const router = createMemoryRouter(routeTree, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
};

describe('v4 pause switch', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

  it('is on unless a build says off', async () => {
    expect((await import('../src/lib/v4Switch')).V4_ENABLED).toBe(true);
    vi.stubEnv('VITE_SIFT_V4', '');
    vi.resetModules();
    expect((await import('../src/lib/v4Switch')).V4_ENABLED).toBe(true);
    vi.stubEnv('VITE_SIFT_V4', 'off');
    vi.resetModules();
    expect((await import('../src/lib/v4Switch')).V4_ENABLED).toBe(false);
  });

  it('paused: every v4 address says so, offers SIFT 2.0 and forgets a kept v4 choice; SIFT 2.0 routes are still there', async () => {
    vi.stubEnv('VITE_SIFT_V4', 'off');
    vi.resetModules();
    localStorage.setItem('sift.ui', 'v4');
    await mount('/v4/board');
    expect(await screen.findByRole('heading', { name: 'SIFT v4 early access is paused' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open SIFT 2.0' }).getAttribute('href')).toBe('#/design/sift2/home');
    expect(screen.getByText('SIFT 2.0 is unchanged and has everything you saved.')).toBeTruthy();
    expect(localStorage.getItem('sift.ui')).toBeNull();
    const { routeTree } = await import('../src/App');
    const paths = (routeTree as { path?: string }[]).map((r) => r.path);
    expect(paths).toContain('/v4/*');
    expect(paths).not.toContain('/v4');
    expect(paths).toContain('/');
  });

  it('on (the default): /v4 is the real v4 shell, not the notice', async () => {
    const { routeTree } = await import('../src/App');
    const paths = (routeTree as { path?: string }[]).map((r) => r.path);
    expect(paths).toContain('/v4');
    expect(paths).not.toContain('/v4/*');
  });
});
