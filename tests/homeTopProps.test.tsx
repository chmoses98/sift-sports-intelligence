// Home's Top Props (views/home/HomeTopProps.tsx) over the shared slate ranking (views/props/ranking.ts), on the real
// NFL snapshot: at most ten props, never padded; research vs validated words read from the opportunity layer only;
// games that have kicked off refused; loading / empty / insufficient states; multi-select into My Board; links into
// the explorer. Plus the data layer's on-screen revalidation that keeps Home current (data/hooks.ts).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { BoardDoc, BoardItem, EventDetailDoc, EventResearchDoc } from '../src/contract/types';
import { ageAsyncMemo, clearAsyncMemo, REVALIDATE_CHECK_MS, useAsync, type Async } from '../src/data/hooks';
import type { SportRepo } from '../src/data/repo';
import { propBoard } from '../src/insights/propBoard';
import type { Opportunity } from '../src/opportunity/types';
import { TRAY_KEY, TrayProvider } from '../src/state/tray';
import { TrailProvider } from '../src/state/trail';
import { TopPropsPreview } from '../src/views/home/HomeTopProps';
import { rankByGap, roleDisagreement, type DiscoveryRow } from '../src/views/props/model';
import { HOME_TOP_PROPS, homeTopProps, lineInsideTypical, opportunitiesByMarket, propAuthority, rankSlate } from '../src/views/props/ranking';
import { addPropsToBoard, gameName, propHref, upcomingGames } from '../src/views/props/slate';
import { nflRepo, readSnapshot, useDiskFetch } from './helpers';

const NOW = Date.parse('2026-10-04T15:00:00Z');
const ATL_NO = 'evt_639f74e87ff25310c542'; // Monday night, 2026-10-06T00:15Z
const board = readSnapshot<BoardDoc>('board.json');
const games = upcomingGames(board.items, NOW, 8);
const rowsOf = (g: BoardItem, research?: EventResearchDoc): DiscoveryRow[] =>
  propBoard(research ?? readSnapshot<EventResearchDoc>(`explorer/events/${g.event_id}.json`), readSnapshot<EventDetailDoc>(g.detail_path)).rows
    .map((row) => ({ row, eventId: g.event_id, kickoff: g.start_time_utc, game: gameName(g) }));
const slate = games.flatMap((g) => rowsOf(g));

const opp = (marketId: string, status: Opportunity['status']) => ({ sport: 'NFL', marketId, status, authority: status === 'ACTIONABLE' ? 'PRODUCTION' : 'RESEARCH_ONLY', statusReason: 'test' }) as unknown as Opportunity;

describe('the shared slate ranking', () => {
  it('is the /props board’s own gap order (rankByGap) with role disagreements set aside', () => {
    const r = rankSlate(slate, { sort: 'gap' });
    const g = rankByGap(slate.filter((d) => d.row.main));
    expect(r.ranked.map((x) => x.d)).toEqual(g.ranked);
    expect(r.setAside).toEqual(g.setAside);
    expect(r.setAside.every((d) => roleDisagreement(d.row))).toBe(true);
    expect(r.ranked.some((x) => x.d.row.family === 'touchdowns')).toBe(false);
  });
});

describe('homeTopProps', () => {
  const t = homeTopProps(slate, { now: NOW });
  it('shows at most ten props, in the shared ranking order, each one qualifying', () => {
    expect(t.qualifying).toBeGreaterThan(HOME_TOP_PROPS);
    expect(t.picks).toHaveLength(HOME_TOP_PROPS);
    const order = rankSlate(slate, { sort: 'gap' }).ranked.map((x) => x.d).filter((d) => d.row.read === 'ABOVE' || d.row.read === 'BELOW');
    expect(t.picks.map((p) => p.d)).toEqual(order.slice(0, HOME_TOP_PROPS));
    for (const p of t.picks) {
      expect(p.d.row.main).not.toBeNull();
      expect(p.d.row.family).not.toBe('touchdowns');
      expect(roleDisagreement(p.d.row)).toBe(false);
      expect(['ABOVE', 'BELOW']).toContain(p.d.row.read);
      expect(p.strength).toBe(lineInsideTypical(p.d.row) ? 'lean' : 'separated');
    }
    expect(t.picks.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('accounts for every row on the slate: shown, ranked below the top ten, or excluded with a reason', () => {
    const excluded = Object.values(t.excluded).reduce((a, b) => a + b, 0);
    expect(t.picks.length + (t.qualifying - t.picks.length) + excluded).toBe(t.considered);
    expect(t.excluded.roleDisagreement).toBe(2);
    expect(t.excluded.touchdowns).toBeGreaterThan(0);
  });
  it('groups the picks one card per player, no pick lost', () => {
    expect(t.players.reduce((n, p) => n + p.picks.length, 0)).toBe(t.picks.length);
    expect(new Set(t.players.map((p) => p.key)).size).toBe(t.players.length);
    for (const p of t.players) expect(p.picks.every((x) => x.d.row.playerId === p.row.playerId)).toBe(true);
  });
  it('never pads: when three qualify it returns three', () => {
    const three = t.picks.slice(0, 3).map((p) => p.d);
    const weak = slate.filter((d) => d.row.main && d.row.family !== 'touchdowns' && d.row.read === 'ON' && !roleDisagreement(d.row)).slice(0, 20);
    const few = homeTopProps([...weak, ...three], { now: NOW });
    expect(few.picks.map((p) => p.d)).toEqual(three);
    expect(few.qualifying).toBe(3);
    expect(few.excluded.onTheLine).toBe(weak.length);
    expect(homeTopProps(weak, { now: NOW }).picks).toEqual([]);
  });
  it('labels every prop research only unless the opportunity layer marks that exact contract ACTIONABLE', () => {
    expect(t.picks.every((p) => p.authority.level === 'research' && p.authority.word === 'Research only')).toBe(true);
    expect(t.validated).toEqual([]);
    const target = slate.find((d) => d.row.main && d.row.read === 'ON')!; // would not qualify on research alone
    const tenth = t.picks[9].d;
    const byMarket = opportunitiesByMarket([
      opp(target.row.main!.market.market_id, 'ACTIONABLE'),
      opp(t.picks[0].d.row.main!.market.market_id, 'RESEARCH_CANDIDATE'),
      opp(t.picks[1].d.row.main!.market.market_id, 'WATCH'),
      opp(t.picks[2].d.row.main!.market.market_id, 'PASS'),
    ]);
    const v = homeTopProps(slate, { now: NOW, byMarket });
    expect(v.picks).toHaveLength(HOME_TOP_PROPS);
    expect(v.picks[0].d).toBe(target);
    expect(v.picks[0].authority).toMatchObject({ level: 'validated', word: 'Validated' });
    expect(v.validated.map((p) => p.picks.map((x) => x.d))).toEqual([[target]]);
    expect(v.picks.find((p) => p.d === t.picks[0].d)!.authority).toMatchObject({ level: 'candidate', word: 'Research candidate' });
    expect(v.picks.find((p) => p.d === t.picks[1].d)!.authority.level).toBe('research');
    expect(v.picks.find((p) => p.d === t.picks[2].d)!.authority.level).toBe('research');
    expect(v.picks.some((p) => p.d === tenth)).toBe(false); // the cap still holds
    expect(v.picks.filter((p) => p.authority.word === 'Validated')).toHaveLength(1);
    // Another sport's opportunity never validates an NFL prop.
    expect(propAuthority(target.row.main!.market.market_id, opportunitiesByMarket([opp(target.row.main!.market.market_id, 'ACTIONABLE')], 'NHL')).level).toBe('research');
  });
  it('refuses games that have kicked off and counts them', () => {
    const sunday1pm = Date.parse('2026-10-04T17:00:00Z') + 60_000;
    const k = homeTopProps(slate, { now: sunday1pm });
    const started = slate.filter((d) => Date.parse(d.kickoff) <= sunday1pm).length;
    expect(started).toBeGreaterThan(0);
    expect(k.excluded.kickedOff).toBe(started);
    expect(k.picks.every((p) => Date.parse(p.d.kickoff) > sunday1pm)).toBe(true);
  });
});

describe('saving to My Board', () => {
  it('adds one MARKET item per prop and counts the ones the tray refuses after kickoff', () => {
    const rows = homeTopProps(slate, { now: NOW }).picks.slice(0, 3).map((p) => p.d);
    const added: unknown[] = [];
    const tray = { add: vi.fn((a: { kickoff?: string | null }) => (a.kickoff === rows[1].kickoff && rows[1].kickoff !== rows[0].kickoff ? null : (added.push(a), {} as never))) };
    const res = addPropsToBoard(tray as never, rows, 'NFL', 'nfl');
    expect(tray.add).toHaveBeenCalledTimes(3);
    expect(tray.add.mock.calls[0][0]).toMatchObject({ ref_kind: 'MARKET', sport: 'NFL', id: rows[0].row.main!.market.market_id, extra: { market_id: rows[0].row.main!.market.market_id, event_id: rows[0].eventId } });
    expect(res.ok + res.refused).toBe(3);
  });
});

// ------------------------------------------------------------------ component

function wrap(el: React.ReactElement) {
  const router = createMemoryRouter([{ path: '*', element: <TrailProvider>{el}</TrailProvider> }], { initialEntries: ['/'] });
  return render(<TrayProvider><RouterProvider router={router} /></TrayProvider>);
}
const ready = (repo: SportRepo): Async<SportRepo> => ({ data: repo, error: undefined, loading: false });

beforeAll(() => {
  useDiskFetch();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});
beforeEach(() => {
  clearAsyncMemo();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Home Top Props section', () => {
  it('shows a loading state while the publication resolves', () => {
    const { container } = wrap(<TopPropsPreview repo={{ data: undefined, error: undefined, loading: true }} opportunities={[]} now={NOW} />);
    expect(container.querySelector('.htp [aria-busy=true]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Top props/i, level: 2 })).toBeTruthy();
  });
  it('says so when the publication cannot be read', () => {
    wrap(<TopPropsPreview repo={{ data: undefined, error: new Error('down'), loading: false }} opportunities={[]} now={NOW} />);
    expect(screen.getByText('NFL props are unavailable right now')).toBeTruthy();
  });
  it('says there is no slate when no game is upcoming', async () => {
    wrap(<TopPropsPreview repo={ready(nflRepo())} opportunities={[]} now={Date.parse('2026-12-01T00:00:00Z')} />);
    expect(await screen.findByText('No NFL games on the coming slate')).toBeTruthy();
  });
  it('renders ten props, one card per player, every one labelled research only, with line, projection, history and freshness', async () => {
    const { container } = wrap(<TopPropsPreview repo={ready(nflRepo())} opportunities={[]} now={NOW} />);
    await waitFor(() => expect(container.querySelectorAll('.htp-pick')).toHaveLength(HOME_TOP_PROPS));
    const t = homeTopProps(slate, { now: NOW });
    expect(container.querySelectorAll('.htp-card')).toHaveLength(t.players.length);
    expect([...container.querySelectorAll('.htp-pick .htp-auth')].every((e) => e.textContent === 'Research only')).toBe(true);
    expect(container.querySelector('.htp')!.textContent).not.toMatch(/Validated\b(?! props)|best bet|lock|% chance/);
    const first = container.querySelector('.htp-pick')!;
    expect(first.querySelector('.htp-num--line b')!.textContent).toBe(String(t.picks[0].d.row.line));
    expect(first.querySelector('.frfresh')!.textContent).toMatch(/^Line .* ago/);
    await waitFor(() => expect(container.querySelector('.htp-pick__hist')!.textContent).toMatch(/of \d+ (over|under)|over, \d+ under|too few|No game log/));
    expect(container.querySelector('.htp__meta')!.textContent).toContain(`of ${t.qualifying} qualifying`);
    expect(container.querySelector('.htp__meta')!.textContent).toContain('0 validated');
  });
  it('shows only what qualifies when fewer than ten do, and says why the rest do not', async () => {
    const g = games.find((x) => x.event_id === ATL_NO)!;
    const research = readSnapshot<EventResearchDoc>(`explorer/events/${ATL_NO}.json`);
    const full = homeTopProps(rowsOf(g), { now: NOW });
    const keep = new Set(full.players.slice(0, 2).map((p) => p.row.playerId));
    const trimmed = { ...research, players: research.players.filter((p) => keep.has(p.participant_id)) };
    const want = homeTopProps(rowsOf(g, trimmed), { now: NOW });
    expect(want.picks.length).toBeGreaterThan(0);
    expect(want.picks.length).toBeLessThan(HOME_TOP_PROPS);
    const repo = nflRepo();
    const fake = Object.assign(Object.create(Object.getPrototypeOf(repo)), repo, {
      source: { ...repo.source, root: 'disk://nfl-few' },
      board: async () => ({ ...board, items: [g] }),
      eventResearch: async () => trimmed,
      eventDetail: async () => readSnapshot<EventDetailDoc>(g.detail_path),
    }) as SportRepo;
    const { container } = wrap(<TopPropsPreview repo={ready(fake)} opportunities={[]} now={NOW} />);
    await waitFor(() => expect(container.querySelectorAll('.htp-pick')).toHaveLength(want.picks.length));
    expect(container.querySelector('.htp__few')!.textContent).toContain(`Only ${want.picks.length} prop`);
    expect(container.querySelector('.htp__why summary')!.textContent).toMatch(/Why \d+ other props? (is|are) not shown/);
  });
  it('ticks two props and adds both to My Board as MARKET items; links open the explorer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW); // the tray judges kickoff against the device clock
    const { container } = wrap(<TopPropsPreview repo={ready(nflRepo())} opportunities={[]} now={NOW} />);
    await waitFor(() => expect(container.querySelectorAll('.htp-pick')).toHaveLength(HOME_TOP_PROPS));
    const boxes = container.querySelectorAll<HTMLInputElement>('.htp-pick input[type=checkbox]');
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    expect(container.querySelector('.htp__bar')!.textContent).toContain('2 selected');
    fireEvent.click(screen.getByRole('button', { name: /Add selected to My Board/ }));
    expect(container.querySelector('.htp__bar')!.textContent).toContain('Added 2 props to My Board');
    const stored = JSON.parse(localStorage.getItem(TRAY_KEY)!);
    expect(stored.tray.items).toHaveLength(2);
    expect(stored.tray.items.every((i: { ref_kind: string }) => i.ref_kind === 'MARKET')).toBe(true);
    expect(boxes[0].disabled).toBe(true);
    const t = homeTopProps(slate, { now: NOW });
    const go = container.querySelector<HTMLAnchorElement>('.htp-pick__go')!;
    expect(go.getAttribute('href')).toBe(propHref('nfl', t.picks[0].d));
    expect(go.getAttribute('href')).toMatch(/^\/nfl\/props\?game=evt_[0-9a-f]+&prop=/);
    expect(screen.getByRole('link', { name: /Open the Player Prop Explorer/ }).getAttribute('href')).toBe('/props');
  });
  it('refuses a selected prop whose game kicked off before the click', async () => {
    const { container } = wrap(<TopPropsPreview repo={ready(nflRepo())} opportunities={[]} now={NOW} />);
    await waitFor(() => expect(container.querySelectorAll('.htp-pick')).toHaveLength(HOME_TOP_PROPS));
    fireEvent.click(container.querySelector<HTMLInputElement>('.htp-pick input[type=checkbox]')!);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T00:00:00Z')); // after every game on this slate
    fireEvent.click(screen.getByRole('button', { name: /Add selected to My Board/ }));
    expect(container.querySelector('.htp__bar')!.textContent).toContain('Added 0 props to My Board · 1 not saved: the game has kicked off');
    expect(localStorage.getItem(TRAY_KEY) ? JSON.parse(localStorage.getItem(TRAY_KEY)!).tray.items : []).toHaveLength(0);
  });
});

describe('Home Top Props on a phone (SIFT 2.0 rows)', () => {
  const phone = (m: boolean) => { window.matchMedia = ((q: string) => ({ matches: m && q.includes('719'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia; };
  it('renders three full-width rows with player, team, market, line, projection, research status and value signal, and a See all props link', async () => {
    phone(true);
    const { container } = wrap(<TopPropsPreview repo={ready(nflRepo())} opportunities={[]} now={NOW} phoneRows />);
    await waitFor(() => expect(container.querySelectorAll('.htp-row')).toHaveLength(3));
    const t = homeTopProps(slate, { now: NOW });
    expect(container.querySelectorAll('.htp-card')).toHaveLength(0);
    const rows = [...container.querySelectorAll('.htp-row')];
    rows.forEach((row, i) => {
      const p = t.picks[i];
      expect(row.querySelector('.htp-row__name')!.textContent).toBe(p.d.row.name);
      expect(row.querySelector('.htp-row__team')!.textContent).toContain(p.d.row.team.abbr);
      expect(row.querySelector('.htp-row__stat')!.textContent).toBe(p.d.row.def.label);
      expect(row.querySelector('.htp-num--line b')!.textContent).toBe(String(p.d.row.line));
      expect(row.querySelector('.htp-num--proj')).not.toBeNull();
      expect(row.querySelector('.htp-auth')!.textContent).toBe('Research only');
      expect(row.querySelector('.htp-str')!.textContent).toMatch(/Lean|Outside mid-50%/);
      expect(row.querySelector('.frfresh')!.textContent).toMatch(/^Line .* ago/);
      expect(row.querySelector('.htp-pick__go')!.getAttribute('href')).toBe(propHref('nfl', p.d));
    });
    const all = screen.getByRole('link', { name: /See all props/ });
    expect(all.getAttribute('href')).toBe('/props');
    expect(container.querySelector('.htp')!.textContent).not.toMatch(/best bet|lock|% chance/i);
    // the research-only warning survives the shorter lede
    expect(container.querySelector('.htp__lede--phone')!.textContent).toContain('Research only');
    expect(container.querySelector('.htp__how')).not.toBeNull();
  });
  it('rows can still be ticked and saved to My Board', async () => {
    phone(true);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { container } = wrap(<TopPropsPreview repo={ready(nflRepo())} opportunities={[]} now={NOW} phoneRows />);
    await waitFor(() => expect(container.querySelectorAll('.htp-row')).toHaveLength(3));
    fireEvent.click(container.querySelector<HTMLInputElement>('.htp-row input[type=checkbox]')!);
    fireEvent.click(screen.getByRole('button', { name: /Add selected to My Board/ }));
    expect(JSON.parse(localStorage.getItem(TRAY_KEY)!).tray.items).toHaveLength(1);
  });
  it('keeps the card layout when SIFT 2.0 rows are not requested, even on a phone (classic Home)', async () => {
    phone(true);
    const { container } = wrap(<TopPropsPreview repo={ready(nflRepo())} opportunities={[]} now={NOW} />);
    await waitFor(() => expect(container.querySelectorAll('.htp-pick')).toHaveLength(HOME_TOP_PROPS));
    expect(container.querySelectorAll('.htp-row')).toHaveLength(0);
  });
});

describe('useAsync revalidate', () => {
  function Probe({ loader }: { loader: () => Promise<number> }) {
    const a = useAsync('probe', loader, { revalidate: true });
    return <span data-testid="v">{a.data ?? '-'}</span>;
  }
  it('re-reads a mounted screen’s data once the research clock has passed, and keeps the copy on failure', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let n = 0;
    const loader = vi.fn(async () => {
      n++;
      if (n === 3) throw new Error('offline');
      return n;
    });
    render(<Probe loader={loader} />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('1'));
    await act(async () => { vi.advanceTimersByTime(REVALIDATE_CHECK_MS); });
    expect(loader).toHaveBeenCalledTimes(1); // still young: nothing re-read
    ageAsyncMemo(11 * 60_000);
    await act(async () => { vi.advanceTimersByTime(REVALIDATE_CHECK_MS); });
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('2'));
    ageAsyncMemo(11 * 60_000);
    await act(async () => { vi.advanceTimersByTime(REVALIDATE_CHECK_MS); });
    expect(loader).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('v').textContent).toBe('2');
  });
});
