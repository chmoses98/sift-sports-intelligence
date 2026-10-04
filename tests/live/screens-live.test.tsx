// The market clock on real screens (real NFL publication from disk, fixture quote provider, fake
// clock): a price moves without a redeploy, survives navigation honestly, and ages on screen.
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EventDetailDoc } from '../../src/contract/types';
import { clearAsyncMemo } from '../../src/data/hooks';
import { setLiveStore } from '../../src/live/hooks';
import { QuoteStore } from '../../src/live/store';
import { ProviderError } from '../../src/live/types';
import { routes } from '../../src/lib/routes';
import { MarketView } from '../../src/views/Market';
import { readSnapshot, useDiskFetch } from '../helpers';
import { renderScreen } from '../render';
import { FakeClock, FakeEnv, FakeProvider } from './fakes';

const GAME = 'evt_0cb333291f580a201a70';
const detail = readSnapshot<EventDetailDoc>(`event_detail/${GAME}.json`);
const ML = detail.markets.find((m) => m.kalshi_ticker === 'KXNFLGAME-26OCT04NEBUF-BUF')!;

let clock: FakeClock;
let provider: FakeProvider;
beforeAll(() => {
  useDiskFetch();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});
beforeEach(() => {
  clearAsyncMemo();
  clock = new FakeClock(Date.now());
  provider = new FakeProvider(clock);
  for (const m of detail.markets) provider.prices.set(m.kalshi_ticker, m.yes_bid ?? 0.5);
  setLiveStore(new QuoteStore({ provider, now: clock.now, timers: clock, env: new FakeEnv(), persistence: null, random: () => 0.5 }));
});
afterEach(() => cleanup());
afterAll(() => setLiveStore(new QuoteStore({ provider: null, persistence: null })));

/**
 * Wait for the market clock's first answer. The screen registers its quote scope in an effect that can
 * land after a single clock.advance(0) on a slow runner, leaving the immediate fetch queued on the fake
 * clock; so each retry runs the clock's due timers again (never moving time forward).
 */
const onClock = (assertion: () => void) =>
  waitFor(async () => {
    await act(() => clock.advance(0));
    assertion();
  });

const priceCell = () => screen.getByText('YES bid / ask').parentElement!.querySelector('.px__v')!.textContent;

describe('market detail on the market clock', () => {
  it('46¢ -> 51¢ without a redeploy; away and back never resurrects 46¢; a failure keeps 51¢', async () => {
    provider.prices.set(ML.kalshi_ticker, 0.46);
    const { router } = renderScreen(routes.market('nfl', ML.market_id, GAME), '/nfl/market/:marketId', <MarketView />);
    await screen.findByText('YES pays $1 if');
    await onClock(() => expect(priceCell()).toBe('46¢ / 48¢'));
    expect(document.querySelector('[data-quote-source="live"]')).not.toBeNull();

    provider.prices.set(ML.kalshi_ticker, 0.51);
    await act(() => clock.advance(20_000)); // detail cadence
    await waitFor(() => expect(priceCell()).toBe('51¢ / 53¢'));

    await act(() => router.navigate('/somewhere-else'));
    expect(screen.getByTestId('elsewhere')).toBeInTheDocument();
    provider.failWith = new ProviderError('http', 'HTTP 503', 503);
    await act(() => clock.advance(5 * 60_000));
    await act(() => router.navigate(routes.market('nfl', ML.market_id, GAME)));
    await screen.findByText('YES pays $1 if');
    await act(() => clock.advance(0));
    expect(priceCell()).toBe('51¢ / 53¢'); // last-known-good, never the published 63¢ or the old 46¢
    expect(provider.calls.length).toBeGreaterThan(2);
  });

  it('labels a publication capture as published, never live, and its real age as STALE', async () => {
    provider.failWith = new ProviderError('network', 'down');
    renderScreen(routes.market('nfl', ML.market_id, GAME), '/nfl/market/:marketId', <MarketView />);
    await screen.findByText('YES pays $1 if');
    await act(() => clock.advance(0));
    const chip = document.querySelector('.qchip')!;
    expect(chip.getAttribute('data-quote-source')).toBe('publication');
    expect(chip.getAttribute('data-quote-state')).toBe('OPEN:STALE');
    expect(chip.textContent).toContain('published');
    expect(priceCell()).toBe(`${Math.round(ML.yes_bid! * 100)}¢ / ${Math.round(ML.yes_ask! * 100)}¢`);
  });

  it('shows a suspended contract as SUSPENDED, separately from its freshness', async () => {
    provider.status.set(ML.kalshi_ticker, 'SUSPENDED');
    renderScreen(routes.market('nfl', ML.market_id, GAME), '/nfl/market/:marketId', <MarketView />);
    await screen.findByText('YES pays $1 if');
    await onClock(() => expect(document.querySelector('.qchip')!.getAttribute('data-quote-state')).toBe('SUSPENDED:FRESH'));
    expect(document.querySelector('.qchip')!.textContent).toMatch(/SUSPENDED · quote \d+s old/);
  });
});
