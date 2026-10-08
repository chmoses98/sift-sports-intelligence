// The CFB game page for a V2 game: a five-second Quick Read (one sentence, the claim chips, the CONTROL side's own
// price and what the research signal means for it), the best research, and every older panel inside a closed Deep
// Dive. Little text by default, nothing deleted, nothing that reads as a chance; a 1.1.0 payload keeps the old page.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventResearchDoc } from '../src/contract/types';
import { setSignalsLoader } from '../src/data/cfbSignals';
import { clearAsyncMemo } from '../src/data/hooks';
import { CFB_RESEARCH_SIGNALS_URL } from '../src/data/sports';
import { routes } from '../src/lib/routes';
import { isEngine, readEngine } from '../src/lib/scriptEngine';
import { GameRoute } from '../src/views/Game';
import { CfbOverview } from '../src/views/game/CfbOverview';
import { BANNED, percentOutsideRanges } from './cfbWords';
import { CFB_SIGNALS_FILE, useDiskFetch } from './helpers';
import { renderScreen } from './render';

const ISU_BYU = 'evt_1f7f2822f37fb1a8e34e';
const ARIZ_WVU = 'evt_16c15c04ce50a5cb83f5';
const SAC_BGSU = 'evt_f32aa654d1e5ccd474f9';
const STAN_ND = 'evt_7ca164d80f042f650a5c';
const TENN_ARK = 'evt_f121611ae29ec3e9d56e';
const LSU_UK = 'evt_8c3166866b2bfa530c17';
const UGA_ALA = 'evt_93e12676ae9337017c63';
const NMSU_FIU = 'evt_f39ef6a955b04b97fe84';
const V2_GAMES = [ISU_BYU, ARIZ_WVU, SAC_BGSU, STAN_ND, TENN_ARK, LSU_UK, UGA_ALA];
const DEEP = ['Why this read?', 'Matchup evidence', 'All claims & scripts', 'Historical details', 'Markets', 'Methodology & provenance'];

const signals = () => JSON.parse(readFileSync(CFB_SIGNALS_FILE, 'utf-8'));

async function open(id: string) {
  renderScreen(routes.game('cfb', id), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
  const q = await screen.findByTestId('cfb-quick-read', {}, { timeout: 8000 });
  // the signals document arrives beside the event research
  await waitFor(() => expect(document.querySelector('[data-deep="methodology"]')?.textContent).toContain('Signals protocol'));
  return q;
}

/** What a reader sees without opening anything: the overview with every closed disclosure reduced to its summary. */
function visibleText(root: Element): string {
  const c = root.cloneNode(true) as Element;
  for (const d of c.querySelectorAll('details:not([open])')) for (const ch of [...d.children]) if (ch.tagName !== 'SUMMARY') ch.remove();
  // one space between text nodes, so words from neighbouring elements are counted apart
  const parts: string[] = [];
  const walk = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) parts.push(walk.currentNode.textContent ?? '');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
const words = (t: string) => t.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

beforeAll(() => {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  useDiskFetch();
  clearAsyncMemo();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Quick Read', () => {
  it('Moderate CONTROL: the SIFT read sentence, its chips, the price and a prominent Value Watch with its facts', async () => {
    const q = await open(LSU_UK);
    const g = signals().games.find((x: { event_id: string }) => x.event_id === LSU_UK);
    expect(within(q).getByRole('heading', { name: 'SIFT Read' })).toBeTruthy();
    expect(within(q).getByText(g.read)).toBeTruthy();
    const chips = within(q).getByRole('list', { name: 'SIFT read claims' }).textContent;
    expect(chips).toContain('Value Watch');
    expect(chips).toContain('LSU · Moderate Control');
    expect(chips).toContain('Fast pace');
    expect(chips).toContain('LSU disruption');
    expect(q.textContent).toContain('LSU win · 76¢');
    expect(q.textContent).toContain('Value Watch — Promising early market evidence');
    expect(q.textContent).toMatch(/Research status\s*Prospective confirmation in progress/);
    expect(q.textContent).toMatch(/Small sample\s*Initial priced n = 6/);
    const why = within(q).getByText('What Value Watch means').closest('details')!;
    expect(why.open).toBe(false);
    expect(why.textContent).toContain(g.read ? 'Moderate CONTROL is a historically validated football signal' : '');
    expect(q.textContent).not.toContain('Market Disagreement');
  });

  it('Strong CONTROL already priced high says so, with no Value Watch and no disagreement', async () => {
    const q = await open(STAN_ND);
    expect(q.textContent).toContain('Notre Dame · Strong Control');
    expect(q.textContent).toContain('Strong Control — Validated football signal');
    expect(q.textContent).toContain('No offer below $1');
    expect(q.textContent).toContain('Market already prices this side aggressively');
    expect(q.textContent).not.toMatch(/Value Watch|Market Disagreement/);
    expect(q.textContent).not.toMatch(/value|cheap|\+EV/i);
  });

  it('Strong CONTROL below 85¢ is a Market Disagreement, the contract explanation behind a tap', async () => {
    const q = await open(SAC_BGSU);
    expect(q.textContent).toContain('Sacramento State win · 28¢');
    expect(q.textContent).toContain('Market Disagreement — Market unusually skeptical of Strong CONTROL');
    const why = within(q).getByText('Why this is flagged').closest('details')!;
    expect(why.open).toBe(false);
    expect(why.textContent).toContain('not a betting rule');
    expect(q.textContent).not.toContain('Value Watch');
    expect(q.textContent).not.toContain('Market already prices this side aggressively');
  });

  it('a close game without CONTROL shows each team\'s own price, side by side', async () => {
    const q = await open(UGA_ALA);
    expect(q.textContent).toContain('Close game');
    expect(q.textContent).toContain('Georgia win · 48¢');
    expect(q.textContent).toContain('Alabama win · 53¢');
    expect(screen.queryByRole('region', { name: 'Best Research' })?.querySelector('.cfrange') ?? null).toBeNull();
  });
});

describe('Best Research', () => {
  it('the historical empirical range, exact for Notre Dame (Strong home CONTROL), and wins as a count', async () => {
    await open(STAN_ND);
    const range = within(screen.getByRole('region', { name: 'Best Research' })).getByRole('group', { name: 'Historical empirical range' });
    const t = range.textContent!.replace(/\s+/g, ' ');
    expect(t).toContain('TeamNotre Dame');
    expect(t).toContain('Control strengthStrong');
    expect(t).toContain('Median+23');
    expect(t).toContain('Middle 50%+8 to +35');
    expect(t).toContain('Middle 80%+1 to +48');
    expect(t).toContain('Historical wins566 of 628 past games');
  });

  it('two to four main matchup edges, as ✓ bullets', async () => {
    for (const id of [LSU_UK, UGA_ALA, STAN_ND]) {
      await open(id);
      const items = document.querySelectorAll('.cfedges__l > li');
      expect(items.length, id).toBeGreaterThanOrEqual(2);
      expect(items.length, id).toBeLessThanOrEqual(4);
      cleanup();
      clearAsyncMemo();
    }
  });
});

describe('Deep Dive', () => {
  it('every section is present and closed, and holds the panels the page used to show', async () => {
    await open(UGA_ALA);
    const dd = screen.getByRole('region', { name: 'Deep Dive' });
    const sections = [...dd.querySelectorAll('details')].filter((d) => d.parentElement === dd);
    expect(sections.map((d) => d.querySelector('summary')!.textContent)).toEqual(DEEP);
    for (const d of sections) expect(d.open).toBe(false);
    const inDeep = (sel: string) => !!dd.querySelector(sel);
    expect(inDeep('#eng-read-h')).toBe(true); // V1 SIFT read
    expect(inDeep('.eng-scripts')).toBe(true); // V1 scripts
    expect(inDeep('[data-testid="game-read-v2"]')).toBe(true); // the full V2 read with range provenance
    expect(inDeep('.eng-conf')).toBe(true);
    expect(dd.textContent).toContain('Bets That Survive Multiple Scripts');
    expect(dd.textContent).toContain('Matchup Edges');
    // nothing of the old stack sits above the fold
    const quick = screen.getByTestId('cfb-quick-read');
    expect(quick.querySelector('.eng-read, .eng-scripts, .eng-conf')).toBeNull();
    expect(document.querySelector('.ov--engine')).toBeNull();
  });

  it('far less text by default: under 180 visible words for every V2 game, and no forbidden words in them', async () => {
    for (const id of V2_GAMES) {
      await open(id);
      const t = visibleText(document.querySelector('.cfov')!);
      expect(words(t), `${id}: ${t}`).toBeLessThan(180);
      for (const re of BANNED) expect(t, `${id} ${re}`).not.toMatch(re);
      expect(percentOutsideRanges(t), `${id}: ${t}`).toBe(false);
      expect(t).not.toMatch(/prediction interval|forecast/i);
      cleanup();
      clearAsyncMemo();
    }
  });
});

describe('fallbacks', () => {
  it('without the signals document: the game\'s own V2 headline and chips, the price, no Value Watch', async () => {
    setSignalsLoader(async () => { throw new Error('offline'); });
    renderScreen(routes.game('cfb', LSU_UK), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    const q = await screen.findByTestId('cfb-quick-read', {}, { timeout: 8000 });
    const e = readEngine(JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cfb', 'app', 'latest', 'explorer', 'events', `${LSU_UK}.json`), 'utf-8')));
    if (!isEngine(e)) throw new Error('no engine');
    expect(q.textContent).toContain(e.claimsV2!.story.headline);
    expect(q.textContent).toContain('LSU · Moderate Control');
    expect(q.textContent).toContain('LSU win · 76¢');
    expect(q.textContent).not.toContain('Value Watch');
  });

  it('no supported claim: a compact "No clear SIFT read" with the explanation one tap down', async () => {
    const r = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cfb-v2', 'no_claim.json'), 'utf-8')) as EventResearchDoc;
    const e = readEngine(r);
    if (!isEngine(e)) throw new Error('no engine');
    setSignalsLoader(async (url) => { if (url !== CFB_RESEARCH_SIGNALS_URL) throw new Error(url); return signals(); });
    const el = (
      <CfbOverview
        engine={e} eventId="evt_not_on_the_slate" markets={[]} participants={{ home: 'h', away: 'a' }} signalsUrl={CFB_RESEARCH_SIGNALS_URL}
        now={Date.now()} marketsHref="/cfb/game/x?tab=markets"
        deep={{ read: null, scripts: null, v2: null, survivors: null, edges: null, confidence: null }}
      />
    );
    render(<RouterProvider router={createMemoryRouter([{ path: '/', element: el }])} />);
    const q = screen.getByTestId('cfb-quick-read');
    await waitFor(() => expect(q.textContent).toContain('No clear SIFT read'));
    expect(q.textContent).toContain('No supported matchup claim cleared the evidence requirements.');
    expect(q.textContent!.match(/No supported matchup claim/g)).toHaveLength(1);
    const why = within(q).getByText('What this means').closest('details')!;
    expect(why.open).toBe(false);
    expect(why.textContent).toContain('does not mean the game is unusually unpredictable');
    expect(within(q).queryByRole('list', { name: 'SIFT read claims' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Historical empirical range' })).toBeNull();
    expect(words(visibleText(document.querySelector('.cfov')!))).toBeLessThan(80);
  });

  it('a 1.1.0 payload (no claims_v2) keeps the old overview exactly', async () => {
    renderScreen(routes.game('cfb', NMSU_FIU), '/:sport/game/:eventId', <GameRoute />, {}, 'cfb');
    await screen.findByRole('heading', { name: /Likely Game Scripts/ }, { timeout: 8000 });
    const ov = document.querySelector('.ov--engine')!;
    expect(ov).not.toBeNull();
    expect(screen.queryByTestId('cfb-quick-read')).toBeNull();
    expect([...ov.children].map((c) => c.className.split(' ').find((k) => k.startsWith('eng-')))).toEqual(['eng-read', 'eng-scripts', 'eng-surv', 'eng-edges', 'eng-conf']);
    expect(ov.closest('details')).toBeNull();
  });
});
