// @vitest-environment jsdom
// The NFL Game Script tab rendered over the REAL DAL at PHI documents (fixtures/real, `game` family). The scripts are a selector the address remembers; every Kalshi
// price goes through the quote gate (a current quote prints its ask, an old one prints a dash and says why); a game with no simulation shows the published thesis instead.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { EventDetailDoc, EventResearchDoc } from '../../src/contract/types';
import { setLiveStore } from '../../src/live/hooks';
import { QuoteStore } from '../../src/live/store';
import { readScripts } from '../../src/v3/model/nflScript';
import type { V3Game, V3Team } from '../../src/v3/model/types';
import type { GameCtx } from '../../src/v3/screens/GameShared';
import { NflScriptRow, NflScriptTab } from '../../src/v3/screens/nfl/NflScriptTab';
import { openBundle } from '../../scripts/v3-fixtures/lib.mjs';

const B = 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest';
const EVT = 'evt_cd335cc6d5f5b8d8f7b3';
let research: EventResearchDoc, detail: EventDetailDoc;

const T = (id: string, name: string): V3Team => ({ id, slug: 'nfl', sport: 'NFL', name, nick: name.split(' ').pop()!, abbr: id, logo: null, colors: ['#000', '#fff'] });
const game = (): V3Game => ({
  key: `nfl:${EVT}`, slug: 'nfl', sport: 'NFL', eventId: EVT, league: 'NFL', phase: 'pregame', startMs: Date.parse(research.event.start_time_utc),
  away: T('DAL', 'Dallas Cowboys'), home: T('PHI', 'Philadelphia Eagles'), score: null, lines: [], signals: 0, provenance: 'publication',
});
const ctxOf = (over: Partial<GameCtx> = {}): GameCtx => { const g = game(); return { g, startMs: g.startMs, detail, research, researchLoading: false, ...over }; };
const mount = (ui: React.ReactNode) => render(<RouterProvider router={createMemoryRouter([{ path: '/v3/game/nfl/:id', element: ui }], { initialEntries: ['/v3/game/nfl/x'] })} />);
const setClock = (offsetMs: number) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.parse(detail.markets[0].captured_at!) + offsetMs); };

beforeAll(async () => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  const fam = openBundle().family('game');
  const read = async (p: string) => JSON.parse(Buffer.from((await fam.get(`${B}/${p}`))!.body).toString('utf8'));
  research = await read(`explorer/events/${EVT}.json`);
  detail = await read(`event_detail/${EVT}.json`);
});
beforeEach(() => setLiveStore(new QuoteStore({ provider: null, persistence: null })));
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('the script selector', () => {
  it('shows a card per script with its share of simulated games, marks the most likely, and selects it by default', () => {
    setClock(20_000);
    mount(<NflScriptTab ctx={ctxOf()} fallback={<p>thesis</p>} />);
    const set = readScripts(research)!;
    const pick = within(screen.getByTestId('nfl-script-picker'));
    const buttons = pick.getAllByRole('button');
    expect(buttons).toHaveLength(set.scripts.length);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].textContent).toContain('Most likely');
    expect(buttons.filter((b) => b.textContent?.includes('Most likely'))).toHaveLength(1);
    expect(buttons[0].textContent).toContain(`${Math.round(set.scripts[0].share * 100)}%`);
    expect(screen.getByTestId('nfl-script-detail').getAttribute('data-script')).toBe(set.scripts[0].id);
  });

  it('follows the address’s script (sc) and writes the pick back to it', () => {
    setClock(20_000);
    const set = readScripts(research)!;
    const picked: (string | null)[] = [];
    const last = set.scripts[set.scripts.length - 1];
    mount(<NflScriptTab ctx={ctxOf({ scenario: last.id, setScenario: (id) => picked.push(id) })} fallback={null} />);
    expect(screen.getByTestId('nfl-script-detail').getAttribute('data-script')).toBe(last.id);
    fireEvent.click(within(screen.getByTestId('nfl-script-picker')).getAllByRole('button')[1]);
    expect(picked).toEqual([set.scripts[1].id]);
  });

  it('calls shares simulation shares, never odds, and keeps "How it plays" one tap down with the volume table', () => {
    setClock(20_000);
    mount(<NflScriptTab ctx={ctxOf()} fallback={null} />);
    expect(document.body.textContent).toMatch(/not odds and not calibrated probabilities/);
    expect(document.body.textContent).not.toMatch(/\bprobability of\b|\bEV\b|\block\b/i);
    const how = screen.getByTestId('nfl-script-how') as HTMLDetailsElement;
    expect(how.open).toBe(false);
    expect(within(how).getByTestId('nfl-script-volume').textContent).toMatch(/Pass attempts/);
    expect(screen.getByTestId('nfl-margin-map')).toBeTruthy();
    expect(screen.getByTestId('nfl-players').textContent).toMatch(/Team (pass|rush) att/);
  });
});

describe('prices go through the quote gate', () => {
  const tapText = (row: HTMLElement) => row.querySelector('a.cs-px')?.textContent ?? '';

  it('a current quote prints its ask on the survivors and ways to bet, each a tap on the addressed contract sheet', () => {
    setClock(20_000);
    mount(<NflScriptTab ctx={ctxOf()} fallback={null} />);
    const rows = [...screen.getAllByTestId('nfl-survivor'), ...screen.queryAllByTestId('nfl-expression')];
    expect(rows.length).toBeGreaterThan(0);
    let priced = 0;
    for (const row of rows) {
      const tk = row.getAttribute('data-ticker')!;
      const tap = row.querySelector('a.cs-px')!;
      expect(tap.getAttribute('data-dest')).toContain(`sheet=contract&tk=${tk}`);
      const side = row.getAttribute('data-side') ?? 'YES';
      const m = detail.markets.find((x) => x.kalshi_ticker === tk)!;
      const ask = side === 'YES' ? m.yes_ask : m.no_ask;
      if (/\d+¢/.test(tapText(row))) { priced++; expect(tapText(row)).toBe(`${side}${Math.round(ask! * 100)}¢`); }
    }
    expect(priced).toBeGreaterThan(0);
  });

  it('an old quote prints a dash, never the price, and says why', () => {
    setClock(6 * 3600_000);
    mount(<NflScriptTab ctx={ctxOf()} fallback={null} />);
    const rows = screen.getAllByTestId('nfl-survivor');
    for (const row of rows) {
      expect(tapText(row)).toBe('YES—');
      expect(row.textContent).toMatch(/no price shown/);
    }
    expect(document.body.textContent).not.toMatch(/(YES|NO)\d+¢/);
  });

  it('says so when the Kalshi contract list could not be read, and prints no price', () => {
    setClock(20_000);
    mount(<NflScriptTab ctx={ctxOf({ detail: null, detailError: new Error('x') })} fallback={null} />);
    expect(screen.queryAllByTestId('nfl-survivor')).toHaveLength(0);
    expect(document.body.textContent).toMatch(/Kalshi contract list for this game could not be read/);
    expect(screen.getByTestId('nfl-script-picker')).toBeTruthy();
  });
});

describe('without a simulation', () => {
  it('shows the published thesis instead of an invented script', () => {
    setClock(20_000);
    const r = structuredClone(research) as EventResearchDoc & { extensions: Record<string, unknown> };
    delete r.extensions.game_script_inputs;
    mount(<NflScriptTab ctx={ctxOf({ research: r })} fallback={<p data-testid="thesis">thesis</p>} />);
    expect(screen.getByTestId('thesis')).toBeTruthy();
    expect(screen.queryByTestId('nfl-script-tab')).toBeNull();
  });

  it('waits on the research without showing the thesis, and the Overview row renders nothing', () => {
    mount(<NflScriptTab ctx={ctxOf({ research: null, researchLoading: true })} fallback={<p data-testid="thesis">thesis</p>} />);
    expect(screen.queryByTestId('thesis')).toBeNull();
    cleanup();
    const { container } = mount(<NflScriptRow ctx={ctxOf({ research: null })} onOpen={() => {}} />);
    expect(container.textContent).toBe('');
  });
});

describe('the Overview row', () => {
  it('names the most likely script and its share and opens the tab on it', () => {
    const opened: string[] = [];
    mount(<NflScriptRow ctx={ctxOf()} onOpen={(id) => opened.push(id)} />);
    const set = readScripts(research)!;
    const row = screen.getByTestId('nfl-script-row');
    expect(row.textContent).toContain(set.scripts[0].name);
    expect(row.textContent).toContain(`${Math.round(set.scripts[0].share * 100)}%`);
    fireEvent.click(row);
    expect(opened).toEqual([set.scripts[0].id]);
  });
});
