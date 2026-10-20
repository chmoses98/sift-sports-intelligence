// The production monitors' schedule-aware expectations (scripts/monitor-expectations.mjs): the NFL home rail and the /props hub describe
// the PREGAME slate, so the monitor asks the publication's own schedule what to expect. This pins
//   * the mirror: the expectation uses the same predicates the app does (src/views/props/slate.ts, src/lib/priorities.ts),
//   * the judgement: an empty slate is accepted ONLY when the schedule has no pregame game; with a pregame game an empty state is a
//     failure exactly as before, and a screen that renders neither state is always a failure,
//   * the selectors: the facts the monitor reads are produced from the REAL components in both conditions (empty and populated).
import { cleanup, render, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAsyncMemo } from '../../src/data/hooks';
import { setFetchJson } from '../../src/data/fetcher';
import type { BoardDoc, EventResearchDoc } from '../../src/contract/types';
import { isActionable as appActionable } from '../../src/lib/priorities';
import { SlatePriorities } from '../../src/views/home/Priorities';
import { PropsHubView } from '../../src/views/props/PropsHub';
import { upcomingGames as appUpcoming } from '../../src/views/props/slate';
import { expectation, HUB_HORIZON_DAYS, isActionable, judgePropsHub, judgeRail, KICKOFF_TOLERANCE_MS, upcomingGames } from '../../scripts/monitor-expectations.mjs';
import { readDisk, ROOT } from '../helpers';
import { renderScreen } from '../render';

afterEach(() => { cleanup(); clearAsyncMemo(); setFetchJson(readDisk); vi.useRealTimers(); });

const H = 3600e3;
const NOW = Date.parse('2026-10-20T01:00:00Z');
const it_ = (id: string, status: string, start: number | string) => ({ event_id: id, status, start_time_utc: typeof start === 'string' ? start : new Date(start).toISOString(), participants: [] as never[] });
// Monday night as it was on 2026-10-20 01:00Z: the one remaining game kicked off 45 minutes earlier, the week's others are final.
const EMPTY_BOARD = [it_('a', 'FINAL', NOW - 3 * 86400e3), it_('b', 'IN_PROGRESS', NOW - 0.75 * H)];
const POPULATED_BOARD = [...EMPTY_BOARD, it_('c', 'SCHEDULED', NOW + 3 * H)];

describe('the expectation mirrors the app and follows the schedule', () => {
  const items = [it_('final', 'FINAL', NOW + H), it_('cancel', 'CANCELLED', NOW + H), it_('live', 'IN_PROGRESS', NOW - H), it_('soon', 'SCHEDULED', NOW + H), it_('unknown', 'UNKNOWN', NOW + 2 * H),
    it_('later', 'SCHEDULED', NOW + 7 * 86400e3), it_('far', 'SCHEDULED', NOW + 9 * 86400e3), it_('bad', 'SCHEDULED', 'not-a-date')];
  it('uses the same predicates as the hub and the rail', () => {
    for (const days of [1, HUB_HORIZON_DAYS, 30]) expect(upcomingGames(items as never, NOW, days).map((i: { event_id: string }) => i.event_id)).toEqual(appUpcoming(items as never, NOW, days).map((i) => i.event_id));
    for (const i of items) expect(isActionable(i as never, NOW)).toBe(appActionable(i as never, NOW));
  });
  it('an empty slate: the last game has kicked off', () => {
    expect(expectation(EMPTY_BOARD as never, NOW)).toMatchObject({ pregame: 0, actionable: 0, rail: 'EMPTY_SLATE', hub: 'EMPTY_SLATE' });
  });
  it('a populated slate: a pregame game exists', () => {
    expect(expectation(POPULATED_BOARD as never, NOW)).toMatchObject({ pregame: 1, actionable: 1, rail: 'POPULATED', hub: 'POPULATED' });
  });
  it('a missing or unreadable board is an empty slate by the schedule, never a reason to relax a populated one', () => {
    expect(expectation([] as never, NOW).rail).toBe('EMPTY_SLATE');
    expect(expectation(undefined as never, NOW).hub).toBe('EMPTY_SLATE');
  });
  it('accepts either state only within minutes of a kick-off, never when a game is clearly pregame or clearly over', () => {
    const edge = [it_('k', 'SCHEDULED', NOW + KICKOFF_TOLERANCE_MS - 1000)];
    expect(expectation(edge as never, NOW)).toMatchObject({ rail: 'EITHER', hub: 'EITHER' });
    expect(expectation([it_('k', 'SCHEDULED', NOW + KICKOFF_TOLERANCE_MS + 60e3)] as never, NOW).rail).toBe('POPULATED');
    expect(expectation([it_('k', 'IN_PROGRESS', NOW - KICKOFF_TOLERANCE_MS - 60e3)] as never, NOW).rail).toBe('EMPTY_SLATE');
  });
});

describe('judging the NFL home rail', () => {
  const E = expectation(EMPTY_BOARD as never, NOW), P = expectation(POPULATED_BOARD as never, NOW);
  const list = { list: true, items: 4, emptyState: false, waiting: false }, empty = { list: false, items: 0, emptyState: true, waiting: false };
  it('empty schedule + the rail saying so passes; with a list it fails', () => {
    expect(judgeRail(E, empty)).toMatchObject({ ok: true, mode: 'EMPTY_SLATE' });
    expect(judgeRail(E, list).ok).toBe(false);
  });
  it('populated schedule + a list passes; an empty state means data is missing and fails (no weakening)', () => {
    expect(judgeRail(P, list)).toMatchObject({ ok: true, mode: 'POPULATED' });
    const bad = judgeRail(P, empty);
    expect(bad.ok).toBe(false);
    expect(bad.msg).toMatch(/data missing/);
  });
  it('a rail that renders neither state, or never finishes loading, fails under either expectation', () => {
    for (const e of [E, P]) {
      expect(judgeRail(e, { list: false, items: 0, emptyState: false, waiting: false }).ok).toBe(false);
      expect(judgeRail(e, { list: false, items: 0, emptyState: false, waiting: true }).ok).toBe(false);
    }
  });
  it('within minutes of kick-off either honest state passes, but still not a blank rail', () => {
    const X = expectation([it_('k', 'SCHEDULED', NOW + 60e3)] as never, NOW);
    expect(judgeRail(X, list).ok && judgeRail(X, empty).ok).toBe(true);
    expect(judgeRail(X, { list: false, items: 0, emptyState: false, waiting: false }).ok).toBe(false);
  });
});

describe('judging the /props hub', () => {
  const E = expectation(EMPTY_BOARD as never, NOW), P = expectation(POPULATED_BOARD as never, NOW);
  const base = { heading: true, tiles: 6, unavailable: false };
  const emptyHub = { ...base, tprops: false, rows: 0, boardEmpty: 0, strip: 0, note: true };
  const board = { ...base, tprops: true, rows: 18, boardEmpty: 0, strip: 3, note: false };
  it('empty schedule: the note and no board pass; a board or a missing note fail', () => {
    expect(judgePropsHub(E, emptyHub)).toMatchObject({ ok: true, mode: 'EMPTY_SLATE' });
    expect(judgePropsHub(E, board).ok).toBe(false);
    expect(judgePropsHub(E, { ...emptyHub, note: false }).ok).toBe(false);
  });
  it('populated schedule: the board passes; its absence is missing data, an empty board with no rows and no honest state fails', () => {
    expect(judgePropsHub(P, board)).toMatchObject({ ok: true, mode: 'POPULATED' });
    expect(judgePropsHub(P, emptyHub).msg).toMatch(/data missing/);
    expect(judgePropsHub(P, { ...board, rows: 0, boardEmpty: 0 }).ok).toBe(false);
    expect(judgePropsHub(P, { ...board, strip: 0 }).ok).toBe(false);
  });
  it('a hub that did not render, lost its sports, or cannot read the publication fails under any expectation', () => {
    for (const e of [E, P]) {
      expect(judgePropsHub(e, { ...emptyHub, heading: false }).ok).toBe(false);
      expect(judgePropsHub(e, { ...emptyHub, tiles: 0 }).ok).toBe(false);
      expect(judgePropsHub(e, { ...emptyHub, unavailable: true }).ok).toBe(false);
    }
  });
});

describe('the facts the monitor reads come from the real components, in both conditions', () => {
  const DIR = join(__dirname, '..', 'fixtures', 'nfl-week5');
  const board = JSON.parse(readFileSync(join(DIR, 'board.json'), 'utf-8')) as BoardDoc;
  const research = new Map<string, EventResearchDoc>(readdirSync(DIR).filter((f) => f.startsWith('evt_')).map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(DIR, f), 'utf-8'))]));
  const RNOW = Date.parse('2026-10-08T00:45:00Z');
  const railFacts = (c: HTMLElement) => {
    const r = c.querySelector('section.prio')!;
    const text = (r.textContent ?? '').replace(/\s+/g, ' ');
    return { list: !!r.querySelector('.prio__l'), items: r.querySelectorAll('a.prio__a').length, emptyState: /No upcoming games/.test(text), waiting: /Reading this week/.test(text) };
  };
  const renderRail = (items: BoardDoc['items'], now: number) => render(<MemoryRouter><SlatePriorities items={items} research={research} recommendations={[]} recError={false} slug="nfl" sport="NFL" now={now} loading={false} /></MemoryRouter>);

  it('populated rail', () => {
    const { container } = renderRail(board.items, RNOW);
    const facts = railFacts(container);
    expect(facts.list).toBe(true);
    expect(judgeRail(expectation(board.items as never, RNOW), facts)).toMatchObject({ ok: true, mode: 'POPULATED' });
    // the same screen judged against an empty schedule is a failure (the monitor cannot be talked into accepting a list on an empty slate)
    expect(judgeRail(expectation([] as never, RNOW), facts).ok).toBe(false);
  });
  it('empty rail', () => {
    const finals = board.items.filter((i) => i.status === 'FINAL');
    const { container } = renderRail(finals, RNOW);
    const facts = railFacts(container);
    expect(facts).toMatchObject({ list: false, emptyState: true });
    expect(judgeRail(expectation(finals as never, RNOW), facts)).toMatchObject({ ok: true, mode: 'EMPTY_SLATE' });
    // while a pregame game exists on the schedule, the same empty rail is missing data
    expect(judgeRail(expectation(board.items as never, RNOW), facts).ok).toBe(false);
  });

  const hubFacts = (c: HTMLElement) => {
    const main = (c.textContent ?? '').replace(/\s+/g, ' ');
    const tp = c.querySelector('.tprops');
    return { heading: !!c.querySelector('h1'), tiles: c.querySelectorAll('.phub__sport').length, tprops: !!tp, rows: c.querySelectorAll('.tprops .tprow').length, boardEmpty: c.querySelectorAll('.tprops .bempty').length,
      strip: c.querySelectorAll('.phub__gl a.phub__g').length, note: /No upcoming NFL games are listed in the publication/.test(main), unavailable: /NFL props are unavailable right now/.test(main) };
  };
  describe('the /props hub', () => {
    // the hub resolves its source from the live publication's address; serve that address from the bundled real snapshot
    const RAW = 'https://raw.githubusercontent.com/chmoses98/nfl-edge-finder/handicap-reports/app/latest/';
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); setFetchJson((u: string) => readDisk(u.startsWith(RAW) ? `${ROOT}/${u.slice(RAW.length)}` : u)); });
    const fixtureBoard = JSON.parse(readFileSync(join(__dirname, '..', '..', 'public', 'data', 'nfl', 'app', 'latest', 'board.json'), 'utf-8')) as BoardDoc;
    it('empty slate: every fixture game has kicked off', async () => {
      const at = Date.parse('2026-10-06T03:00:00Z');
      vi.setSystemTime(at);
      const { container } = renderScreen('/props', '/props', <PropsHubView />);
      await waitFor(() => expect(container.querySelector('.phub__games')).not.toBeNull());
      const facts = hubFacts(container);
      expect(facts).toMatchObject({ tprops: false, strip: 0, note: true });
      expect(judgePropsHub(expectation(fixtureBoard.items as never, at), facts)).toMatchObject({ ok: true, mode: 'EMPTY_SLATE' });
      expect(judgePropsHub(expectation(POPULATED_BOARD as never, NOW), facts).ok).toBe(false);
    });
    it('populated slate: pregame games exist', async () => {
      const at = Date.parse('2026-10-04T00:45:00Z');
      vi.setSystemTime(at);
      const { container } = renderScreen('/props', '/props', <PropsHubView />);
      await waitFor(() => expect(container.querySelector('.tprops')).not.toBeNull(), { timeout: 20_000 });
      await waitFor(() => expect(container.querySelectorAll('.tprops .tprow, .tprops .bempty').length).toBeGreaterThan(0), { timeout: 20_000 });
      const facts = hubFacts(container);
      expect(facts.strip).toBeGreaterThan(0);
      expect(judgePropsHub(expectation(fixtureBoard.items as never, at), facts)).toMatchObject({ ok: true, mode: 'POPULATED' });
      // the empty-slate expectation does not accept this populated hub
      expect(judgePropsHub(expectation(EMPTY_BOARD as never, NOW), facts).ok).toBe(false);
    }, 60_000);
  });
});
