// The pages that read the established simulation directly (Player, Market) show ONE number for a promoted stat: the selected
// projection's, with its own range and line probabilities. The established simulation's mean (6.3 receptions for Chris Olave in
// the bundled ATL–NO publication), its fair price and its range never appear beside it, a withheld projection shows a reason
// and no number from either engine, and no page carries development vocabulary.
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { clearAsyncMemo } from '../src/data/hooks';
import { setFetchJson } from '../src/data/fetcher';
import { distributionsUrl, projectionsUrl } from '../src/lib/projections';
import { cents } from '../src/lib/format';
import { routes } from '../src/lib/routes';
import { MarketView } from '../src/views/Market';
import { PlayerView } from '../src/views/Player';
import { distributionArtifact, feed, feedSummary, nflPlayer, part, pmfDistribution } from './support/projectionFeed';
import { readDisk } from './helpers';
import { renderScreen } from './render';
import { CONFUSING } from './support/terminology';

const OLAVE = 'prt_9b2e8d8fa10766e401a1';
const GAME = 'evt_639f74e87ff25310c542';
const RUNG7 = 'mkt_kalshi_KXNFLREC-26OCT05ATLNO-NOCOLAVE12-7';
const LEGACY = '6.3';

afterEach(() => { cleanup(); clearAsyncMemo(); setFetchJson(readDisk); });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const dist = pmfDistribution(7.3);
/** The feed as the NFL publisher writes it (study rungs, no quantiles) and the distribution artifact beside it. */
function feedFor(over: Record<string, unknown> = {}) {
  const asOf = hoursAgo(3);
  return {
    ...feed('NFL', [nflPlayer({
      player_id: '00-0037239', name: 'Chris Olave', team: 'NO', opponent: 'ATL', game_id: '2026_05_ATL_NO', family: 'receptions',
      ...feedSummary(dist), participation: part('CONFIRMED_ACTIVE', { captured_utc: asOf }), data_asof_utc: asOf, ...over,
    })], { receptions: {} }),
    generated_utc: asOf, data_asof_utc: asOf,
  };
}
const artifactFor = (f: Record<string, unknown>) => distributionArtifact(f, [{ player_id: '00-0037239', family: 'receptions', game_id: '2026_05_ATL_NO', dist }]);
const serve = (doc: Record<string, unknown> | null, art: Record<string, unknown> | null | 'auto' = 'auto') => setFetchJson(async (url) => {
  if (url === projectionsUrl('NFL')) { if (doc == null) throw new Error('feed down'); return doc; }
  if (url === distributionsUrl('NFL')) { const a = art === 'auto' ? (doc ? artifactFor(doc) : null) : art; if (a == null) throw new Error('no artifact'); return a; }
  return readDisk(url);
});

const banned = (text: string) => CONFUSING.filter((re) => re.test(text)).map(String);
const SHADOW_WORDS = /\bshadow\b|incumbent|challenger|research arm/i;

describe('Player page', () => {
  it('a promoted stat shows the selected projection’s value, range and distribution — never the established simulation’s', async () => {
    serve(feedFor());
    const { container } = renderScreen(routes.player('nfl', OLAVE), '/:sport/player/:playerId', <PlayerView />);
    await waitFor(() => expect(container.querySelector('.pthis')).not.toBeNull());
    // the stat tab: Olave's receptions
    const rec = [...container.querySelectorAll('.pthis [role=tab]')].find((t) => /Receptions/.test(t.textContent ?? ''));
    expect(rec).toBeTruthy();
    (rec as HTMLElement).click();
    await waitFor(() => expect(container.querySelector('.pthis__nums')?.textContent).toContain('7.3'));
    expect(container.querySelector('.pthis__nums')!.textContent).not.toContain(LEGACY);
    expect(container.querySelector('.fr-plprops')!.textContent).not.toContain(LEGACY);
    expect(container.querySelector('.frd')).not.toBeNull();                       // the published distribution is drawn
    expect(container.querySelector('.frd__cap')?.textContent).toMatch(/7 published quantiles/);
    expect(container.textContent).not.toMatch(SHADOW_WORDS);
    expect(banned(container.textContent ?? '')).toEqual([]);
  });

  it('a withheld projection shows the reason and no number from either engine', async () => {
    serve(feedFor({ participation: part('CONFIRMED_OUT', { captured_utc: hoursAgo(1) }) }));
    const { container } = renderScreen(routes.player('nfl', OLAVE), '/:sport/player/:playerId', <PlayerView />);
    await waitFor(() => expect(container.querySelector('.fr-plprops')).not.toBeNull());
    await waitFor(() => expect(container.querySelector('.fr-plprops')!.textContent).toMatch(/withheld/));
    const table = container.querySelector('.fr-plprops')!.textContent!;
    expect(table).not.toContain(LEGACY);
    expect(table).not.toContain('7.3');
    expect(container.querySelector('.pthis__nums')?.textContent ?? '').not.toMatch(/6\.3|7\.3/);
  });

  it('an unavailable feed never shows the established number unless it passes its own checks (here it is a week old)', async () => {
    serve(null);
    const { container } = renderScreen(routes.player('nfl', OLAVE), '/:sport/player/:playerId', <PlayerView />);
    await waitFor(() => expect(container.querySelector('.fr-plprops')).not.toBeNull());
    await waitFor(() => expect(container.querySelector('.fr-plprops')!.textContent).toMatch(/withheld|not published/));
    expect(container.querySelector('.fr-plprops')!.textContent).not.toContain(LEGACY);
  });
});

describe('Market page', () => {
  const open = () => renderScreen(`${routes.market('nfl', RUNG7, GAME)}`, '/:sport/market/:marketId', <MarketView />);

  it('a promoted stat’s rung shows the projection’s probability of the line, and no second model price', async () => {
    serve(feedFor());
    const { container } = open();
    await waitFor(() => expect(screen.getByText('Projected probability of YES')).toBeInTheDocument());
    const px = screen.getByText('Projected probability of YES').closest('.px')!;
    const p7 = dist.thresholds['7'];
    expect(px.textContent).toContain(cents(p7));
    expect(screen.queryByText('Model fair P(YES)')).toBeNull();
    expect(container.textContent).not.toContain(LEGACY);
    expect(container.textContent).not.toMatch(SHADOW_WORDS);
    expect(banned(container.textContent ?? '')).toEqual([]);
  });

  it('withheld: no probability and no projection from either engine', async () => {
    serve(feedFor({ participation: part('CONFIRMED_OUT', { captured_utc: hoursAgo(1) }) }));
    const { container } = open();
    await waitFor(() => expect(screen.getByText('Projected probability of YES')).toBeInTheDocument());
    const px = screen.getByText('Projected probability of YES').closest('.px')!;
    expect(px.textContent).not.toMatch(/\d+¢/);
    expect(container.textContent).not.toContain(LEGACY);
    expect(container.textContent).not.toContain('7.3');
  });
});
