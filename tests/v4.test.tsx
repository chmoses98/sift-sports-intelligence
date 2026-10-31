// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { UiGate } from '../src/App';
import { exitV4, resolveUi } from '../src/lib/uiMode';
import { applyFilter, dateKey, dayStrip, defaultGameTab, followsGame, groupByPhase, isGameTab, pickFeature, shiftDay } from '../src/v4/model';
import { resetFollowCache, teamKey } from '../src/v4/follow';
import { calibrationWord } from '../src/v4/words';
import type { GameRow } from '../src/views/broadcast/games';

const row = ({ away, home, sport, ...o }: Omit<Partial<GameRow>, 'away' | 'home' | 'sport'> & { away?: string; home?: string; sport?: string }): GameRow => ({
  sport: sport ?? 'NFL', slug: 'nfl', label: '', phase: 'PREGAME', stale: false, startMs: 1000, candidates: 0, best: null, opps: [],
  away: { participant_id: 'a', display_name: away ?? 'Away', short_name: away ?? 'AWY', participant_type: 'TEAM' },
  home: { participant_id: 'h', display_name: home ?? 'Home', short_name: home ?? 'HOM', participant_type: 'TEAM' },
  item: { event_id: 'e', markets_available: 0 }, ...o,
} as unknown as GameRow);

describe('?ui=v4 mode', () => {
  beforeEach(() => localStorage.clear());
  it('is opt-in: the default and a bare address never resolve to v4', () => {
    expect(resolveUi('')).not.toBe('v4');
    expect(resolveUi('?ui=default')).not.toBe('v4');
  });
  it('?ui=v4 is remembered; ?ui=default forgets it', () => {
    expect(resolveUi('?ui=v4')).toBe('v4');
    expect(localStorage.getItem('sift.ui')).toBe('v4');
    expect(resolveUi('')).toBe('v4');
    expect(resolveUi('?ui=default')).not.toBe('v4');
    expect(localStorage.getItem('sift.ui')).toBeNull();
  });
});

describe('leaving v4 on purpose (exitV4)', () => {
  beforeEach(() => localStorage.clear());
  it('drops a remembered v4 choice, so a classic address no longer redirects back into v4', () => {
    resolveUi('?ui=v4');
    exitV4();
    expect(localStorage.getItem('sift.ui')).toBeNull();
    expect(resolveUi('')).not.toBe('v4');
  });
  it('gives back the classic choice made before v4, and the SIFT 2.0 one', () => {
    localStorage.setItem('sift.ui', 'classic');
    resolveUi('?ui=v4');
    expect(localStorage.getItem('sift.ui')).toBe('v4');
    exitV4();
    expect(localStorage.getItem('sift.ui')).toBe('classic');
    expect(localStorage.getItem('sift.ui.before-v4')).toBeNull();
    localStorage.setItem('sift.ui', 'sift2');
    resolveUi('?ui=v4');
    exitV4();
    expect(localStorage.getItem('sift.ui')).toBe('sift2');
  });
  it('does not disturb a classic or SIFT 2.0 choice when v4 was never remembered', () => {
    localStorage.setItem('sift.ui', 'classic');
    exitV4();
    expect(localStorage.getItem('sift.ui')).toBe('classic');
    localStorage.clear();
    exitV4();
    expect(localStorage.getItem('sift.ui')).toBeNull();
  });
  it('re-opening with ?ui=v4 again works after an exit; an explicit ?ui=classic replaces the saved choice', () => {
    localStorage.setItem('sift.ui', 'classic');
    resolveUi('?ui=v4'); exitV4();
    expect(resolveUi('?ui=v4')).toBe('v4');
    resolveUi('?ui=sift2');
    expect(localStorage.getItem('sift.ui')).toBe('sift2');
    exitV4();
    expect(localStorage.getItem('sift.ui')).toBe('sift2');
  });
  it('a repeated ?ui=v4 never overwrites the choice kept aside with v4 itself', () => {
    localStorage.setItem('sift.ui', 'classic');
    resolveUi('?ui=v4'); resolveUi('?ui=v4'); resolveUi('?ui=v4');
    exitV4();
    expect(localStorage.getItem('sift.ui')).toBe('classic');
  });
});

describe('UiGate with v4', () => {
  afterEach(cleanup);
  const tree = [{ path: '/', element: <Outlet />, children: [
    { path: 'v4', element: <div>v4 shell</div> },
    { path: 'v3', element: <div>V3 home</div> },
    { path: 'design/sift2/home', element: <div>S2 home</div> },
    { element: <UiGate />, children: [{ index: true, element: <div>classic home</div> }, { path: 'games', element: <div>classic games</div> }] },
    { path: '*', element: <Navigate to="/" /> },
  ] }];
  const open = (to: string) => render(<RouterProvider router={createMemoryRouter(tree, { initialEntries: [to] })} />);
  beforeEach(() => localStorage.clear());
  it('?ui=v4 on a classic address opens the v4 shell', async () => { open('/?ui=v4'); expect(await screen.findByText('v4 shell')).toBeTruthy(); });
  it('a remembered v4 choice sends later classic addresses to v4', async () => { localStorage.setItem('sift.ui', 'v4'); open('/games'); expect(await screen.findByText('v4 shell')).toBeTruthy(); });
  it('without the flag the default interface is SIFT 3.0', async () => { open('/'); expect(await screen.findByText('V3 home')).toBeTruthy(); });
  it('after exitV4 a classic address answers with the default (SIFT 3.0) again, not v4', async () => {
    localStorage.setItem('sift.ui', 'v4');
    exitV4();
    open('/games');
    expect(await screen.findByText('V3 home')).toBeTruthy();
  });
  it('after exitV4 a remembered classic choice still holds', async () => {
    localStorage.setItem('sift.ui', 'classic');
    resolveUi('?ui=v4'); exitV4();
    open('/games');
    expect(await screen.findByText('classic games')).toBeTruthy();
  });
});

describe('v4 calendar helpers', () => {
  it('shifts by calendar days across month and daylight-saving boundaries', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDay('2026-03-08', 1)).toBe('2026-03-09');
  });
  it('the strip is three days back, today, ten ahead; today is marked once', () => {
    const now = new Date(2026, 9, 4, 12).getTime();
    const s = dayStrip(now);
    expect(s).toHaveLength(14);
    expect(s.filter((d) => d.today)).toHaveLength(1);
    expect(s[3].key).toBe(dateKey(now));
    expect(s[0].key).toBe('2026-10-01');
  });
});

describe('v4 game default tab', () => {
  const g = (phase: string) => ({ phase }) as unknown as GameRow;
  it('pregame opens Matchups; in play and final open Live', () => {
    expect(defaultGameTab(g('PREGAME'))).toBe('matchups');
    expect(defaultGameTab(g('NO_START'))).toBe('matchups');
    expect(defaultGameTab(g('STARTED'))).toBe('live');
    expect(defaultGameTab(g('FINAL'))).toBe('live');
  });
  it('postponed, cancelled and suspended games open the Live tab, where their status is explained', () => {
    for (const p of ['POSTPONED', 'CANCELLED', 'SUSPENDED']) expect(defaultGameTab(g(p))).toBe('live');
  });
  it('only the four known tabs are accepted from an address', () => {
    expect(isGameTab('players')).toBe(true);
    expect(isGameTab('markets')).toBe(true);
    expect(isGameTab('props')).toBe(false);
    expect(isGameTab(null)).toBe(false);
  });
});

describe('v4 slate filters', () => {
  const live = row({ phase: 'STARTED', away: 'BUF' });
  const stale = row({ phase: 'STARTED', stale: true });
  const fin = row({ phase: 'FINAL' });
  const pre = row({ phase: 'PREGAME', candidates: 2, away: 'NE', startMs: 5 });
  const pre2 = row({ phase: 'PREGAME', startMs: 2 });
  const pp = row({ phase: 'POSTPONED' });
  const rows = [live, stale, fin, pre, pre2, pp];
  it('Live is only games in play, never ones awaiting a result', () => { expect(applyFilter(rows, 'live', [])).toEqual([live]); });
  it('Signals is only games with published research signals', () => { expect(applyFilter(rows, 'signals', [])).toEqual([pre]); });
  it('Following matches either side by the publication short name', () => {
    expect(followsGame(live, ['NFL:BUF'])).toBe(true);
    expect(followsGame(live, ['NBA:BUF'])).toBe(false);
    expect(applyFilter(rows, 'following', ['NFL:NE'])).toEqual([pre]);
    expect(applyFilter(rows, 'following', [])).toEqual([]);
  });
  it('groups by lifecycle: live, upcoming (soonest first), over (final and awaiting), other', () => {
    const g = groupByPhase(rows);
    expect(g.live).toEqual([live]);
    expect(g.upcoming).toEqual([pre2, pre]);
    expect(g.over).toEqual([stale, fin]);
    expect(g.other).toEqual([pp]);
  });
  it('the feature is the app rule when it applies, else the game with the most research; never a game without both teams', () => {
    expect(pickFeature(rows, pre2)).toBe(pre2);
    expect(pickFeature(rows, null)).toBe(pre);
    expect(pickFeature([], null)).toBeNull();
    expect(pickFeature([{ ...pre, home: undefined } as GameRow], null)).toBeNull();
  });
});

describe('v4 follow keys and words', () => {
  it('a team key is sport-scoped; no abbreviation, no key', () => {
    resetFollowCache();
    expect(teamKey('NFL', 'BUF')).toBe('NFL:BUF');
    expect(teamKey('NFL', null)).toBeNull();
  });
  it('calibration words state the record, never a verdict', () => {
    expect(calibrationWord('MARKET_BEATS_MODEL')).toBe('Market has beaten the model');
    expect(calibrationWord('UNVALIDATED')).toBe('No settled record');
  });
});
