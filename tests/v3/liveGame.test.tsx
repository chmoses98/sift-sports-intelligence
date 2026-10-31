// @vitest-environment jsdom
// The live block as rendered: every honest state (a licensed feed with plays, a score-only feed, no feed, a blocked source, stale and delayed answers,
// live scores switched off), and that nothing is invented. Detail is parsed from the TEST FIXTURE shaped like the MLB live feed (not a recording).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disableFeed, enableFeed } from '../../src/live/scores/feed';
import { parseMlbFeed } from '../../src/v3/data/live/mlb';
import { DETAIL_SOURCES } from '../../src/v3/data/live/rights';
import { useLiveDetail, type LiveDetailState } from '../../src/v3/data/live/useLiveDetail';
import type { V3Game } from '../../src/v3/model/types';
import type { GameCtx } from '../../src/v3/screens/GameShared';
import { LiveGame } from '../../src/v3/screens/live/LiveGame';

const FEED = () => JSON.parse(readFileSync(join('tests', 'v3', 'fixtures', 'live', 'mlb-feed-live.shape.json'), 'utf8'));
const team = (id: string, name: string) => ({ id, slug: 'mlb', sport: 'MLB', name, nick: name, abbr: id, logo: null, colors: ['#000', '#fff'] as [string, string] });
const game = (over: Partial<V3Game> = {}): V3Game => ({ key: 'mlb:e', slug: 'mlb', sport: 'MLB', eventId: 'e', league: 'MLB', phase: 'live', startMs: 0, away: team('NYY', 'New York Yankees'), home: team('LAD', 'Los Angeles Dodgers'), score: { away: 3, home: 2, clock: 'Top 7th', source: 'score-feed', asOf: null }, lines: [], signals: 0, provenance: 'publication', ...over });
const ctx = (g: V3Game, live?: LiveDetailState): GameCtx => ({ g, startMs: g.startMs, detail: null, research: null, researchLoading: false, live });
const detail = () => parseMlbFeed(FEED(), Date.now());
const ready = (freshness: 'live' | 'delayed' | 'withheld', error: unknown = null): LiveDetailState => ({ kind: 'ready', source: DETAIL_SOURCES[1], detail: detail(), freshness, error, retry: vi.fn() });

afterEach(() => { cleanup(); enableFeed(); });
const text = () => document.body.textContent ?? '';

describe('LiveGame', () => {
  it('a feed with everything: state, plays (real sentences, newest first) and player performances', () => {
    render(<LiveGame ctx={ctx(game(), ready('live'))} />);
    const st = screen.getByTestId('live-state');
    expect(within(st).getByTestId('live-score').textContent).toContain('NYY 3–2 LAD');
    expect(within(st).getByTestId('live-period').textContent).toContain('Top 7th');
    expect(within(st).getByTestId('live-clock').textContent).toContain('Baseball has no game clock.');
    expect(within(st).getByTestId('live-situation').textContent).toContain('1 out, 2-1 count, runners on 1st and 3rd');
    const plays = within(screen.getByTestId('live-plays')).getAllByRole('listitem');
    expect(plays).toHaveLength(5);
    expect(plays[0].textContent).toContain('Test Batter Four singles');
    expect(screen.getByTestId('live-leaders').textContent).toContain('Test Hitter Nine');
    expect(screen.getByTestId('live-leaders').textContent).toContain('2-for-3, HR, 2 RBI');
    expect(screen.queryByTestId('live-unavailable')).toBeNull();
    expect(document.querySelector('[data-delayed]')).toBeNull();
  });

  it('more than twelve plays collapse behind "Show all"', () => {
    const d = detail();
    d.plays = Array.from({ length: 20 }, (_, i) => ({ id: String(i), periodLabel: 'Top 1st', clock: null, text: `Play ${i}`, scoring: null, score: null }));
    render(<LiveGame ctx={ctx(game(), { ...ready('live'), detail: d } as LiveDetailState)} />);
    expect(within(screen.getByTestId('live-plays')).getAllByRole('listitem')).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 20 plays' }));
    expect(within(screen.getByTestId('live-plays')).getAllByRole('listitem')).toHaveLength(20);
  });

  it('a delayed answer shows the one muted word; a stale one withholds every live value and offers a retry', () => {
    render(<LiveGame ctx={ctx(game(), ready('delayed'))} />);
    expect(document.querySelector('[data-delayed]')?.textContent).toBe('Delayed');
    cleanup();
    const stale = ready('withheld');
    render(<LiveGame ctx={ctx(game(), stale)} />);
    expect(screen.queryByTestId('live-plays')).toBeNull();
    expect(screen.getByTestId('live-score').textContent).toContain('has not updated in over five minutes');
    expect(text()).not.toContain('Test Batter Four singles');
    expect(screen.queryByTestId('live-leaders')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('NBA: the licensed feed gives score and period; plays and performances say why they are not there; the credit link is present', () => {
    const g = game({ sport: 'NBA', slug: 'nba', away: team('BOS', 'Boston Celtics'), home: team('NYK', 'New York Knicks'), score: { away: 61, home: 58, clock: '3rd quarter', source: 'score-feed', asOf: null } });
    render(<LiveGame ctx={ctx(g, { kind: 'score-only', source: DETAIL_SOURCES[0] })} />);
    expect(screen.getByTestId('live-score').textContent).toContain('BOS 61–58 NYK');
    expect(screen.getByTestId('live-period').textContent).toContain('3rd quarter');
    expect(screen.getByTestId('live-clock').textContent).toContain('Not published by the feed.');
    const un = screen.getAllByTestId('live-unavailable');
    expect(un).toHaveLength(2);
    expect(un[0].textContent).toMatch(/Play-by-play not available.*publishes the score and period only/);
    expect(un[1].textContent).toMatch(/Player performances not available/);
    const a = screen.getByRole('link', { name: 'Powered by SportScore' });
    expect(a.getAttribute('rel')).toBe('dofollow');
    expect(screen.queryByTestId('live-plays')).toBeNull();
  });

  it('NFL (no feed): no score, no situation, no plays, and not one estimated number', () => {
    const g = game({ sport: 'NFL', slug: 'nfl', score: null, away: team('KC', 'Kansas City Chiefs'), home: team('BUF', 'Buffalo Bills') });
    render(<LiveGame ctx={ctx(g, { kind: 'none' })} />);
    expect(screen.getByTestId('live-score').textContent).toContain('Score unavailable');
    expect(screen.getByTestId('live-situation').textContent).toContain('Possession and down and distance is not available');
    expect(screen.getAllByTestId('live-unavailable')).toHaveLength(2);
    expect(screen.queryByTestId('live-source')).toBeNull();
    expect(text()).not.toMatch(/\d+–\d+/);
  });

  it('a blocked source is named as not connected, and nothing is shown from it', () => {
    render(<LiveGame ctx={ctx(game({ score: null }), { kind: 'blocked', source: DETAIL_SOURCES[1] })} />);
    expect(screen.getAllByTestId('live-unavailable')[0].textContent).toContain('MLB StatsAPI, which is not connected');
    expect(screen.queryByTestId('live-plays')).toBeNull();
  });

  it('a failed refresh keeps the last answer and says the refresh failed', () => {
    render(<LiveGame ctx={ctx(game(), ready('live', new Error('down')))} />);
    expect(screen.getByTestId('live-refresh-failed')).toBeTruthy();
    expect(screen.getByTestId('live-plays')).toBeTruthy();
  });

  it('with live scores switched off the block asks for nothing and says so', () => {
    render(<LiveGame ctx={ctx(game(), { kind: 'disabled' })} />);
    expect(screen.getByTestId('live-unavailable').textContent).toContain('Live updates are turned off');
    expect(screen.queryByTestId('live-state')).toBeNull();
  });

  it('renders nothing for a sample game or a game that is not in play', () => {
    const { container } = render(<LiveGame ctx={ctx(game({ provenance: 'demo' }), ready('live'))} />);
    expect(container.innerHTML).toBe('');
    cleanup();
    const r2 = render(<LiveGame ctx={ctx(game({ phase: 'pregame' }), ready('live'))} />);
    expect(r2.container.innerHTML).toBe('');
  });
});

describe('useLiveDetail asks for nothing it may not read', () => {
  const spy = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 500 }));
  afterEach(() => { vi.restoreAllMocks(); });

  it('MLB in the default build is blocked on rights: no request is made to any host', async () => {
    const f = spy();
    const { result } = renderHook(() => useLiveDetail(game(), 0));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.kind).toBe('blocked');
    expect(f).not.toHaveBeenCalled();
  });
  it('NBA reads its score through the score store only (no detail request); NFL has no source; a sample or pregame game is off', async () => {
    const f = spy();
    expect(renderHook(() => useLiveDetail(game({ sport: 'NBA', slug: 'nba' }), 0)).result.current.kind).toBe('score-only');
    expect(renderHook(() => useLiveDetail(game({ sport: 'NFL', slug: 'nfl' }), 0)).result.current.kind).toBe('none');
    expect(renderHook(() => useLiveDetail(game({ provenance: 'demo' }), 0)).result.current.kind).toBe('off');
    expect(renderHook(() => useLiveDetail(game({ phase: 'pregame' }), 0)).result.current.kind).toBe('off');
    expect(renderHook(() => useLiveDetail(null, null)).result.current.kind).toBe('off');
    disableFeed();
    expect(renderHook(() => useLiveDetail(game({ sport: 'NBA', slug: 'nba' }), 0)).result.current.kind).toBe('disabled');
    expect(renderHook(() => useLiveDetail(game(), 0)).result.current.kind).toBe('disabled'); // MLB too: and still no request
    await waitFor(() => expect(f).not.toHaveBeenCalled());
  });
});
