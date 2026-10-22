// v4 early access: the explicit "keep v4" choice, the Home Screen identity, and the way back to SIFT 2.0.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exitV4, isV4Remembered, rememberV4, resolveUi, UI_CHANGED } from '../src/lib/uiMode';
import { isStandalone, setInstallIdentity } from '../src/lib/installIdentity';
import { EarlyAccessCard, EarlyAccessFooter, EarlyAccessSheet } from '../src/v4/EarlyAccess';

const doc = () => {
  const d = document.implementation.createHTMLDocument('Sift · Sports Intelligence');
  d.head.innerHTML = '<meta name="apple-mobile-web-app-title" content="Sift"><link rel="manifest" href="/sift-sports-intelligence/manifest.webmanifest">';
  return d;
};
const href = (d: Document) => d.querySelector('link[rel="manifest"]')!.getAttribute('href');

describe('the Home Screen identity', () => {
  it('v4 installs as "SIFT v4" with its own manifest; leaving v4 gives SIFT back', () => {
    const d = doc();
    setInstallIdentity('v4', d);
    expect(href(d)).toBe('/sift-sports-intelligence/manifest-v4.webmanifest');
    expect(d.querySelector('meta[name="apple-mobile-web-app-title"]')!.getAttribute('content')).toBe('SIFT v4');
    expect(d.title).toBe('SIFT v4 · early access');
    setInstallIdentity('default', d);
    expect(href(d)).toBe('/sift-sports-intelligence/manifest.webmanifest');
    expect(d.querySelector('meta[name="apple-mobile-web-app-title"]')!.getAttribute('content')).toBe('Sift');
    expect(d.title).toBe('Sift · Sports Intelligence');
  });
  it('is idempotent and never throws when the page has no manifest link', () => {
    const d = doc();
    setInstallIdentity('v4', d); setInstallIdentity('v4', d);
    expect(href(d)).toBe('/sift-sports-intelligence/manifest-v4.webmanifest');
    const bare = document.implementation.createHTMLDocument('x');
    expect(() => setInstallIdentity('v4', bare)).not.toThrow();
    expect(() => setInstallIdentity('default', bare)).not.toThrow();
  });
  it('knows when it runs as a Home Screen app', () => {
    expect(isStandalone()).toBe(false);
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(isStandalone()).toBe(true);
    Reflect.deleteProperty(navigator, 'standalone');
    expect(isStandalone()).toBe(false);
  });
});

describe('keeping v4 is an explicit choice', () => {
  beforeEach(() => localStorage.clear());

  it('rememberV4 stores v4, tells open screens, and keeps an earlier SIFT 2.0 / classic choice aside', () => {
    localStorage.setItem('sift.ui', 'sift2');
    const seen = vi.fn();
    window.addEventListener(UI_CHANGED, seen);
    rememberV4();
    expect(isV4Remembered()).toBe(true);
    expect(localStorage.getItem('sift.ui.before-v4')).toBe('sift2');
    expect(seen).toHaveBeenCalledTimes(1);
    exitV4();
    expect(localStorage.getItem('sift.ui')).toBe('sift2');
    expect(isV4Remembered()).toBe(false);
    expect(seen).toHaveBeenCalledTimes(2);
    window.removeEventListener(UI_CHANGED, seen);
  });

  it('resolving an address (while rendering) stores ?ui=v4 but never announces', () => {
    const seen = vi.fn();
    window.addEventListener(UI_CHANGED, seen);
    expect(resolveUi('?ui=v4')).toBe('v4');
    expect(isV4Remembered()).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    window.removeEventListener(UI_CHANGED, seen);
  });

  it('nothing but a choice makes a device open v4: a bare address is SIFT 2.0', () => {
    expect(isV4Remembered()).toBe(false);
    expect(resolveUi('')).not.toBe('v4');
  });
});

describe('the early-access screens', () => {
  beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ sha: 'abcdef0123456789', built_at: '2026-10-22T12:00:00Z' })))); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'standalone'); });

  it('the card offers to keep v4; keeping it is stored, announced and the card goes away', () => {
    render(<EarlyAccessCard />);
    expect(screen.getByText('You are in SIFT v4 early access')).toBeTruthy();
    expect(localStorage.getItem('sift.ui')).toBeNull(); // showing the card chose nothing
    fireEvent.click(screen.getByRole('button', { name: 'Keep v4 on this device' }));
    expect(localStorage.getItem('sift.ui')).toBe('v4');
    expect(screen.queryByText('You are in SIFT v4 early access')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('v4 is now kept on this device.');
  });

  it('"Not now" changes nothing about the device and is not asked again', () => {
    const a = render(<EarlyAccessCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(localStorage.getItem('sift.ui')).toBeNull();
    expect(screen.queryByText('You are in SIFT v4 early access')).toBeNull();
    a.unmount();
    render(<EarlyAccessCard />);
    expect(screen.queryByText('You are in SIFT v4 early access')).toBeNull();
  });

  it('the card is not shown in the Home Screen app: the icon is the choice', () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    render(<EarlyAccessCard />);
    expect(screen.queryByText('You are in SIFT v4 early access')).toBeNull();
  });

  it('the sheet keeps and releases v4 and always offers the way back to SIFT 2.0', async () => {
    render(<EarlyAccessSheet />);
    expect(screen.getByRole('link', { name: 'Return to SIFT 2.0' }).getAttribute('href')).toBe('#/design/sift2/home');
    fireEvent.click(screen.getByRole('button', { name: 'Keep v4 on this device' }));
    expect(localStorage.getItem('sift.ui')).toBe('v4');
    expect(screen.getByText('v4 is kept on this device: opening SIFT here lands in v4.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop keeping v4' }));
    expect(localStorage.getItem('sift.ui')).toBeNull();
    // returning is a real exit: it forgets a kept v4 first
    fireEvent.click(screen.getByRole('button', { name: 'Keep v4 on this device' }));
    expect(localStorage.getItem('sift.ui')).toBe('v4');
    fireEvent.click(screen.getByRole('link', { name: 'Return to SIFT 2.0' }));
    expect(localStorage.getItem('sift.ui')).toBeNull();
  });

  it('the sheet tells the truth about live scores and does not recommend bets', () => {
    render(<EarlyAccessSheet />);
    expect(screen.getByText(/Live scores, game clocks and plays are not available yet/)).toBeTruthy();
    expect(screen.getByText(/SIFT does not recommend bets/)).toBeTruthy();
  });

  it('the sheet gives the iPhone steps in a browser and says which app you are in when installed', () => {
    const a = render(<EarlyAccessSheet />);
    expect(screen.getByRole('heading', { name: 'Add to your iPhone Home Screen' })).toBeTruthy();
    expect(screen.getByText(/do not share saved research/)).toBeTruthy();
    a.unmount();
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    render(<EarlyAccessSheet />);
    expect(screen.getByRole('heading', { name: 'You are in the Home Screen app' })).toBeTruthy();
    expect(screen.queryByText(/Tap Share/)).toBeNull();
  });

  it('the sheet shows this copy and the latest published build, and omits the latter when none is published', async () => {
    const a = render(<EarlyAccessSheet />);
    await waitFor(() => expect(document.querySelector('[data-v4-build]')!.textContent).toContain('latest published abcdef0'));
    expect(document.querySelector('[data-v4-build]')!.textContent).toMatch(/^Build \S+ · latest published abcdef0 · 2026-10-22T12:00:00Z$/);
    a.unmount();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    render(<EarlyAccessSheet />);
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('[data-v4-build]')!.textContent).not.toContain('latest published');
  });

  it('the footer on every screen offers the way back to SIFT 2.0', () => {
    render(<EarlyAccessFooter />);
    expect(screen.getByRole('link', { name: 'Return to SIFT 2.0' }).getAttribute('href')).toBe('#/design/sift2/home');
    expect(screen.getByRole('button', { name: 'SIFT v4 early access' })).toBeTruthy();
  });
});
