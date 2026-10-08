// The CFB home as a reader meets it: Top CFB Signals, the research-signals status, filter and sort, the game cards
// (SIFT's read, the CONTROL side and that side's own price) and the full schedule — rendered from the real board and
// the research-signals fixture, with no per-game research fetches and no forbidden words.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardDoc } from '../src/contract/types';
import { setSignalsLoader } from '../src/data/cfbSignals';
import { setFetchJson } from '../src/data/fetcher';
import { clearAsyncMemo } from '../src/data/hooks';
import { CFB_RESEARCH_SIGNALS_URL } from '../src/data/sports';
import { SportHomeView } from '../src/views/SportHome';
import { BANNED, percentOutsideRanges } from './cfbWords';
import { CFB_SIGNALS_FILE, readCfb, readDisk, useDiskFetch } from './helpers';
import { renderScreen } from './render';

const ISU_BYU = 'evt_1f7f2822f37fb1a8e34e';
const ARIZ_WVU = 'evt_16c15c04ce50a5cb83f5';
const SAC_BGSU = 'evt_f32aa654d1e5ccd474f9';
const STAN_ND = 'evt_7ca164d80f042f650a5c';
const TENN_ARK = 'evt_f121611ae29ec3e9d56e';
const LSU_UK = 'evt_8c3166866b2bfa530c17';
const UGA_ALA = 'evt_93e12676ae9337017c63';
const JVST_KENN = 'evt_e56d7cee653c3507226b';
const NMSU_FIU = 'evt_f39ef6a955b04b97fe84';
const MODERATE = [ISU_BYU, TENN_ARK, LSU_UK];
const STRONG = [ARIZ_WVU, SAC_BGSU, STAN_ND];

const signalsRaw = () => JSON.parse(readFileSync(CFB_SIGNALS_FILE, 'utf-8'));
const cardIds = () => [...document.querySelectorAll('.cfcards .cfc')].map((c) => c.getAttribute('data-event'));
const card = (id: string) => document.querySelector(`.cfcards .cfc[data-event="${id}"]`) as HTMLElement;

async function renderHome(path = '/cfb') {
  const r = renderScreen(path, '/:sport', <SportHomeView />, {}, 'cfb');
  await screen.findByRole('heading', { name: 'Top CFB Signals' }, { timeout: 8000 });
  await waitFor(() => expect(document.querySelectorAll('.cfcards .cfc').length).toBeGreaterThan(0));
  return r;
}

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

describe('Top CFB Signals', () => {
  it('leads with Value Watch (every Moderate CONTROL game), then the strongest football edges and the market disagreements', async () => {
    await renderHome();
    const vw = screen.getByRole('region', { name: 'Value Watch' });
    expect(within(vw).getAllByRole('link')).toHaveLength(3);
    expect(vw.textContent).toContain('BYU · Moderate Control');
    expect(vw.textContent).toContain('BYU win · 79¢');
    expect(vw.textContent).toContain('Tennessee win · 83¢');
    expect(vw.textContent).toContain('LSU win · 76¢');
    expect(vw.textContent).toContain('Promising early market evidence');

    const strong = screen.getByRole('region', { name: 'Strongest Football Edges' });
    expect(strong.textContent).toContain('Notre Dame · Strong Control');
    expect(strong.textContent).toContain('No offer below $1');
    expect(strong.textContent).not.toMatch(/value|cheap|\+EV/i);

    const dis = screen.getByRole('region', { name: 'Market Disagreement' });
    const rows = within(dis).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(rows.sort()).toEqual([`/cfb/game/${ARIZ_WVU}`, `/cfb/game/${SAC_BGSU}`].sort());
    expect(dis.textContent).toContain('Arizona win · 61¢');
    expect(dis.textContent).toContain('Sacramento State win · 28¢');
    // the contract's explanation is one tap down
    const why = dis.querySelector('details')!;
    expect(why.open).toBe(false);
    expect(why.textContent).toContain('Early 2026 research found these disagreements performed poorly');

    expect(screen.getByRole('region', { name: 'Close Game Profiles' }).textContent).toContain('Georgia @ Alabama');
    expect(within(screen.getByRole('region', { name: 'Pace / Scoring Spots' })).getAllByRole('link')).toHaveLength(5);
  });

  it('a section header applies its filter below', async () => {
    const { router } = await renderHome();
    fireEvent.click(screen.getByRole('button', { name: /^Market Disagreement: show 2 games/ }));
    await waitFor(() => expect(cardIds().sort()).toEqual([ARIZ_WVU, SAC_BGSU].sort()));
    expect(router.state.location.search).toBe('?f=disagreement');
  });

  it('shows the research-signals status honestly: no prospective settlements yet, never a 0% return', async () => {
    await renderHome();
    const rs = screen.getByRole('region', { name: 'CFB Research Signals' });
    expect(rs.textContent).toContain('Value Watch');
    expect(rs.textContent).toContain('Prospective confirmation in progress');
    expect(rs.textContent).toContain('Initial priced n = 6');
    expect(rs.textContent).toContain('Validated football signal');
    expect(rs.textContent).toContain('Market approximately efficient so far');
    expect(rs.textContent).toContain('4 games awaiting their 3-hour pre-kickoff window');
    expect(rs.textContent).toContain('Moderate CONTROL: n = 0');
    expect(rs.textContent).toContain('No prospective settlements yet.');
    expect(rs.textContent).not.toMatch(/ROI|0%/);
  });
});

describe('game cards', () => {
  it('every claimed card shows its script line, its CONTROL side and that side\'s price', async () => {
    await renderHome();
    const sig = signalsRaw();
    for (const g of sig.games.filter((x: { status: string; season_week: number }) => x.status === 'CLAIMS_PUBLISHED' && x.season_week === 6)) {
      const c = card(g.event_id);
      expect(c, g.title).toBeTruthy();
      expect(c.textContent, g.title).toContain(g.card_line);
      if (g.claims.control) expect(c.textContent, g.title).toContain(`${g.claims.control.team} · ${g.claims.control.strength === 'STRONG' ? 'Strong' : 'Moderate'} Control`);
    }
    expect(card(ISU_BYU).textContent).toContain('BYU win · 79¢');
    expect(card(SAC_BGSU).textContent).toContain('Sacramento State win · 28¢');
    expect(card(STAN_ND).textContent).toContain('No offer below $1');
    expect(card(ISU_BYU).textContent).toContain('Historical margin: +3 to +24 (middle half)');
    expect(card(STAN_ND).textContent).toContain('Historical margin: +8 to +35 (middle half)');
    expect(card(UGA_ALA).textContent).not.toContain('Historical margin');
    // no clear read: a muted line, not a blank card
    expect(card(JVST_KENN).textContent).toContain('No SIFT read for this game yet');
    // every card opens its game
    expect(card(LSU_UK).getAttribute('href')).toBe(`/cfb/game/${LSU_UK}`);
  });

  it('Moderate CONTROL games carry the Value Watch badge; Strong CONTROL never does, and is never called value', async () => {
    await renderHome();
    for (const id of MODERATE) expect(card(id).querySelector('.cfbadge--star')?.textContent, id).toBe('Value Watch');
    for (const id of STRONG) {
      expect(card(id).querySelector('.cfbadge--star'), id).toBeNull();
      expect(card(id).textContent, id).not.toMatch(/value|cheap|\+EV/i);
    }
    expect(card(ARIZ_WVU).querySelector('.cfbadge--alert')?.textContent).toBe('Market Disagreement');
    expect(card(SAC_BGSU).querySelector('.cfbadge--alert')).not.toBeNull();
    expect(card(STAN_ND).querySelector('.cfbadge--alert')).toBeNull();
  });

  it('a missing price reads "Price unavailable"', async () => {
    setSignalsLoader(async (url) => {
      if (url !== CFB_RESEARCH_SIGNALS_URL) throw new Error(url);
      const d = signalsRaw();
      d.games.find((g: { event_id: string }) => g.event_id === TENN_ARK).market.price = { status: 'PRICE_UNAVAILABLE', yes_ask: null, captured_at: null, market_ticker: null };
      return d;
    });
    await renderHome();
    expect(card(TENN_ARK).textContent).toContain('Price unavailable');
    expect(card(TENN_ARK).textContent).not.toMatch(/Tennessee win · \d/);
  });

  it('defaults to SIFT priority; Time sorts by kickoff; both persist in the URL', async () => {
    const { router } = await renderHome();
    expect(cardIds()).toEqual([ISU_BYU, TENN_ARK, LSU_UK, STAN_ND, ARIZ_WVU, SAC_BGSU, UGA_ALA, JVST_KENN, NMSU_FIU]);
    fireEvent.click(within(screen.getByRole('group', { name: 'Sort games' })).getByRole('button', { name: 'Time' }));
    await waitFor(() => expect(cardIds()).toEqual([JVST_KENN, NMSU_FIU, ISU_BYU, ARIZ_WVU, SAC_BGSU, STAN_ND, TENN_ARK, LSU_UK, UGA_ALA]));
    expect(router.state.location.search).toBe('?sort=time');
  });

  it('the Value Watch filter shows exactly the Moderate CONTROL games, from the URL too', async () => {
    const { router } = await renderHome();
    const filters = screen.getByRole('group', { name: 'Filter games' });
    fireEvent.click(within(filters).getByRole('button', { name: 'Value Watch' }));
    await waitFor(() => expect(cardIds()).toEqual(MODERATE));
    expect(router.state.location.search).toBe('?f=value-watch');
    expect(within(filters).getByRole('button', { name: 'Value Watch' }).getAttribute('aria-pressed')).toBe('true');
    cleanup();
    await renderHome('/cfb?f=strong&sort=time');
    expect(cardIds()).toEqual([ARIZ_WVU, SAC_BGSU, STAN_ND]);
  });

  it('every filter chip filters', async () => {
    await renderHome();
    const filters = screen.getByRole('group', { name: 'Filter games' });
    const expectFor: [string, string[]][] = [
      ['Moderate Control', MODERATE], ['Strong Control', [STAN_ND, ARIZ_WVU, SAC_BGSU]], ['Close', [UGA_ALA]], ['Fast pace', [LSU_UK, ARIZ_WVU]],
      ['Market Disagreement', [ARIZ_WVU, SAC_BGSU]], ['All', [ISU_BYU, TENN_ARK, LSU_UK, STAN_ND, ARIZ_WVU, SAC_BGSU, UGA_ALA, JVST_KENN, NMSU_FIU]],
    ];
    for (const [name, want] of expectFor) {
      fireEvent.click(within(filters).getByRole('button', { name }));
      await waitFor(() => expect(cardIds(), name).toEqual(want));
    }
    fireEvent.click(within(filters).getByRole('button', { name: 'Defensive' }));
    expect(await screen.findByText(/No game on this slate matches Defensive/)).toBeTruthy();
  });
});

describe('full schedule', () => {
  it('lists every board game, this slate first', async () => {
    await renderHome();
    const sched = screen.getByRole('region', { name: 'Full Schedule' });
    const rows = [...sched.querySelectorAll('[data-event]')].map((r) => r.getAttribute('data-event'));
    const all = readCfb<BoardDoc>('board.json').items.map((i) => i.event_id);
    expect(rows.sort()).toEqual([...all].sort());
    expect(new Set(rows).size).toBe(rows.length);
    expect(sched.textContent).toContain('Beyond this slate');
    // signal marks carry their names
    const byu = sched.querySelector(`[data-event="${ISU_BYU}"]`)!;
    expect(within(byu as HTMLElement).getByRole('img', { name: 'Value Watch' })).toBeTruthy();
  });
});

describe('what the home reads, and what it never says', () => {
  it('reads the board and the signals document only: no per-game event research', async () => {
    const seen: string[] = [];
    setFetchJson((url) => {
      seen.push(url);
      return readDisk(url);
    });
    await renderHome();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(seen.some((u) => u.endsWith('board.json'))).toBe(true);
    expect(seen.filter((u) => /explorer\/events\/|event_detail\//.test(u))).toEqual([]);
  });

  it('never renders a banned word, a chance, or a percentage', async () => {
    await renderHome();
    const text = document.body.textContent ?? '';
    for (const re of BANNED) expect(text, String(re)).not.toMatch(re);
    expect(percentOutsideRanges(text)).toBe(false);
  });

  it('without the signals document, the full schedule still shows with an honest notice and no Value Watch', async () => {
    setSignalsLoader(async () => { throw new Error('offline'); });
    renderScreen('/cfb', '/:sport', <SportHomeView />, {}, 'cfb');
    expect(await screen.findByText(/SIFT research signals are unavailable right now/, {}, { timeout: 8000 })).toBeTruthy();
    const sched = screen.getByRole('region', { name: 'Full Schedule' });
    expect(sched.querySelectorAll('[data-event]')).toHaveLength(readCfb<BoardDoc>('board.json').items.length);
    expect(screen.queryByRole('heading', { name: 'Top CFB Signals' })).toBeNull();
    expect(document.querySelector('.cfbadge')).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Filter games' })).queryByRole('button', { name: 'Value Watch' })).toBeNull();
    expect(cardIds()).toHaveLength(9);
  });
});
