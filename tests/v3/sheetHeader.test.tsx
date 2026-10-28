// The shared sheet header: an action on the title row ("Reset" in Research filters and Sort and filter) published by the sheet body,
// the 44pt close, dialog naming, Escape and Back, and the contract sheet's decorative avatar.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { SheetHost, useSheet, useSheetHeaderAction } from '../../src/v3/ui/Sheet';
import { Avatar } from '../../src/v3/ui/ContractSheet';

beforeAll(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

/** A filters-like body: Reset is enabled only while the draft differs from the default, and it resets the draft. */
function Body({ onReset }: { onReset: () => void }) {
  const [n, setN] = useState(0);
  useSheetHeaderAction({ label: 'Reset', onClick: () => { setN(0); onReset(); }, disabled: n === 0 });
  return <button type="button" onClick={() => setN(n + 1)}>draft {n}</button>;
}
function Screen({ onReset }: { onReset: () => void }) {
  const sheet = useSheet();
  return (
    <div>
      <button onClick={() => sheet.open('Research filters', <Body onReset={onReset} />, { tall: true, locked: true })}>filters</button>
      <button onClick={() => sheet.open('Alerts', <p>plain body</p>)}>plain</button>
    </div>
  );
}
function setup(onReset: () => void = () => {}) {
  const router = createMemoryRouter(
    [{ element: <SheetHost><Outlet /></SheetHost>, children: [{ path: '/s', element: <Screen onReset={onReset} /> }, { path: '/prev', element: <p>prev</p> }] }],
    { initialEntries: ['/prev', '/s'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('sheet header action', () => {
  it('draws the action on the title row, beside the title, inside the dialog named by that title', async () => {
    setup();
    await userEvent.setup().click(screen.getByText('filters'));
    const dlg = await screen.findByRole('dialog', { name: 'Research filters' });
    const head = dlg.querySelector('header')!;
    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(head.contains(reset)).toBe(true);
    expect(head.querySelector('h2')!.id).toBe(dlg.getAttribute('aria-labelledby'));
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    // The close button stays in the same row, and Reset is not repeated in the body.
    expect(head.contains(screen.getAllByRole('button', { name: 'Close' }).find((b) => b.classList.contains('v3-sheet__x'))!)).toBe(true);
    expect(dlg.querySelector('.v3-sheet__body')!.textContent).not.toContain('Reset');
    expect(dlg.className).toContain('v3-sheet--locked');
  });
  it('announces and honours the disabled state, keeping focus, and runs the body handler once enabled', async () => {
    const onReset = vi.fn();
    setup(onReset);
    const u = userEvent.setup();
    await u.click(screen.getByText('filters'));
    const reset = await screen.findByRole('button', { name: 'Reset' });
    expect(reset.getAttribute('aria-disabled')).toBe('true');
    expect(reset.hasAttribute('disabled')).toBe(false);          // stays focusable
    await u.click(reset);
    expect(onReset).not.toHaveBeenCalled();
    await u.click(screen.getByText('draft 0'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset' }).hasAttribute('aria-disabled')).toBe(false));
    screen.getByRole('button', { name: 'Reset' }).focus();
    await u.keyboard('{Enter}');
    expect(onReset).toHaveBeenCalledTimes(1);
    // It reset the body's draft, which disables the action again without losing the keyboard user's place.
    await waitFor(() => expect(screen.getByText('draft 0')).toBeTruthy());
    const again = screen.getByRole('button', { name: 'Reset' });
    expect(again.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(again);
  });
  it('a sheet without an action has none (and keeps the circular close of the other sheets)', async () => {
    setup();
    await userEvent.setup().click(screen.getByText('plain'));
    const dlg = await screen.findByRole('dialog', { name: 'Alerts' });
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    expect(dlg.className).not.toContain('v3-sheet--locked');
  });
  it('the action goes away with the sheet and does not leak into the next one', async () => {
    const r = setup();
    const u = userEvent.setup();
    await u.click(screen.getByText('filters'));
    await screen.findByRole('button', { name: 'Reset' });
    await act(async () => { await r.navigate(-1); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await u.click(screen.getByText('plain'));
    await screen.findByRole('dialog', { name: 'Alerts' });
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });
});

describe('sheet dismissal with a header action', () => {
  it('Escape closes it once, pressed straight after it opens, and focus returns to the opener', async () => {
    const r = setup();
    const u = userEvent.setup();
    const opener = screen.getByText('filters');
    await u.click(opener);
    await screen.findByRole('dialog');
    // No wait: the handler and the focus are in place in the commit that shows the dialog.
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });            // a second Escape must not step back twice
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(r.state.location.pathname).toBe('/s');
    expect(document.activeElement).toBe(opener);
    await act(async () => { await r.navigate(-1); });
    expect(r.state.location.pathname).toBe('/prev');           // one entry was pushed and one popped: no stray extra
  });
  it('Back closes it, and the 44pt close button closes it', async () => {
    const r = setup();
    const u = userEvent.setup();
    await u.click(screen.getByText('filters'));
    await screen.findByRole('dialog');
    await act(async () => { await r.navigate(-1); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(r.state.location.pathname).toBe('/s');
    await u.click(screen.getByText('filters'));
    await u.click(document.querySelector('.v3-sheet__x')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => { await r.navigate(-1); });
    expect(r.state.location.pathname).toBe('/prev');
  });
});

describe('contract sheet avatar', () => {
  it('is a decorative image of the committed logo (alt empty, hidden from assistive tech)', () => {
    const { container } = render(<Avatar a={{ logo: '/logos/nhl/TOR.png', abbr: 'TOR' }} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('src')).toBe('/logos/nhl/TOR.png');
    expect(container.querySelector('[data-testid="contract-avatar"]')!.getAttribute('aria-hidden')).toBe('true');
  });
  it('falls back to the code on neutral colours when there is no logo, and when the image fails', () => {
    const none = render(<Avatar a={{ logo: null, abbr: 'TOR' }} />);
    expect(none.container.querySelector('img')).toBeNull();
    expect(none.container.textContent).toBe('TOR');
    cleanup();
    const bad = render(<Avatar a={{ logo: '/missing.png', abbr: 'CGY', colors: ['#aa0000', '#550000'] }} />);
    fireEvent.error(bad.container.querySelector('img')!);
    expect(bad.container.querySelector('img')).toBeNull();
    expect(bad.container.textContent).toBe('CGY');
  });
});
