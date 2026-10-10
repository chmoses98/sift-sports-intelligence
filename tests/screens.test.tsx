// Capability-aware rendering, navigation and chart mapping on real screens with real data.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearAsyncMemo } from '../src/data/hooks';
import { routes } from '../src/lib/routes';
import { MetricView } from '../src/views/Metric';
import { PlayerView } from '../src/views/Player';
import { RankingView } from '../src/views/Ranking';
import { TeamView } from '../src/views/Team';
import { GameRoute } from '../src/views/Game';
import { useDiskFetch } from './helpers';
import { renderScreen } from './render';

const BAL = 'prt_38f80e30c7c786aaf5b4';
const BUF = 'prt_16bee2e0460c651b4bca';
const ALLEN = 'prt_06ec4b4943c66094d6f3';
const GAME = 'evt_0cb333291f580a201a70';

beforeAll(() => {
  useDiskFetch();
  // jsdom has no layout observers; charts fall back to their default width.
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});
beforeEach(() => {
  clearAsyncMemo();
  localStorage.clear();
});

describe('metric experience', () => {
  it('answers what, compared with whom, window, average, median, best, worst and the opponent counterpart', async () => {
    renderScreen(routes.metric('nfl', 'met_nfl.adj_def_db_epa', { team: BAL, opp: BUF }), '/nfl/metric/:metricId', <MetricView />);
    expect(await screen.findByText('of 32')).toBeInTheDocument();
    expect(screen.getByText('18th')).toBeInTheDocument();
    expect(screen.getByText('League average')).toBeInTheDocument();
    expect(screen.getByText('League median')).toBeInTheDocument();
    expect(screen.getByText('Minnesota Vikings')).toBeInTheDocument(); // best (lowest EPA allowed)
    expect(screen.getByText('Dallas Cowboys')).toBeInTheDocument(); // worst
    expect(screen.getByText(/NFL teams, 2026/)).toBeInTheDocument();
    expect(await screen.findByText(/Buffalo Bills · Adjusted offensive EPA per dropback/)).toBeInTheDocument();
    // The window's name for people; the publication's code (ADJ_RIDGE) never shows.
    expect(screen.getAllByText('Opponent-adjusted').length).toBeGreaterThan(0);
    expect(screen.queryByText(/ADJ_RIDGE/)).toBeNull();
    const full = await screen.findByRole('link', { name: /Full NFL ranking/ });
    expect(full.getAttribute('href')).toContain('/nfl/ranking/rnk_e3485aaecabb0ec363a8');
  });
});

describe('league ranking', () => {
  it('shows all 32 teams, highlights the team and its opponent, and every row navigates', async () => {
    const { container } = renderScreen(routes.ranking('nfl', 'rnk_e3485aaecabb0ec363a8', { focus: BAL, opp: BUF }), '/nfl/ranking/:rankingId', <RankingView />);
    await screen.findByText('All 32');
    const rows = container.querySelectorAll('.rankbars__row');
    expect(rows).toHaveLength(32);
    expect(container.querySelectorAll('.rankbars__row--focus')).toHaveLength(1);
    expect(container.querySelector('.rankbars__row--focus')!.textContent).toContain('Baltimore Ravens');
    expect(container.querySelector('.rankbars__row--opp')!.textContent).toContain('Buffalo Bills');
    expect(container.querySelector('.rankbars__ref--mean')).not.toBeNull();
    expect(container.querySelector('.rankbars__ref--median')).not.toBeNull();
    for (const a of container.querySelectorAll('.rankbars__link')) expect(a.getAttribute('href')).toMatch(/^\/nfl\/metric\/met_nfl\.adj_def_db_epa\?team=prt_/);
    // pinning a comparison team lights it in the comparison color
    fireEvent.click(within(rows[0] as HTMLElement).getByRole('button'));
    await waitFor(() => expect(container.querySelectorAll('.rankbars__row--compare')).toHaveLength(1));
  });
});

describe('team profile + historical drill-down', () => {
  it('trend columns are games; selecting one exposes a link into that historical game and its opponent', async () => {
    const { container } = renderScreen(routes.team('nfl', BUF, 'results'), '/nfl/team/:teamId', <TeamView />);
    await waitFor(() => expect(container.querySelectorAll('.trend').length).toBe(3));
    const first = container.querySelector('.trend')!;
    const cols = first.querySelectorAll('.trend__col');
    expect(cols.length).toBe(40);
    const hits = first.querySelectorAll('.trend__hit');
    fireEvent.click(hits[0]);
    const detail = first.querySelector('.trend__detail')!;
    const open = within(detail as HTMLElement).getByRole('link', { name: /Open game/ });
    expect(open.getAttribute('href')).toMatch(new RegExp(`^/nfl/game/evt_[0-9a-f]{20}\\?team=${BUF}$`));
    expect(within(detail as HTMLElement).getByRole('link', { name: /profile/ }).getAttribute('href')).toMatch(/^\/nfl\/team\/prt_/);
  });

  it('a historical game without a research document renders from both teams’ published records', async () => {
    renderScreen(routes.game('nfl', 'evt_a43eb842fdfc72bae684', { team: BUF }), '/nfl/game/:eventId', <GameRoute />);
    expect(await screen.findByText('Historical game')).toBeInTheDocument();
    expect((await screen.findAllByText('47')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);
    expect(await screen.findByText(/Player game logs are RESEARCH/)).toBeInTheDocument();
  });
});

describe('capability-aware rendering', () => {
  it('shows player lenses the manifest supports and hides the ones it does not', async () => {
    const a = renderScreen(routes.player('nfl', ALLEN), '/nfl/player/:playerId', <PlayerView />);
    expect(await screen.findByRole('heading', { name: 'Market Context' })).toBeInTheDocument();
    expect(await screen.findByText('Projected ranges for every stat in this game')).toBeInTheDocument();
    expect(screen.getByText('Usage & Role')).toBeInTheDocument();
    a.unmount();
    clearAsyncMemo();
    renderScreen(routes.player('nfl', ALLEN), '/nfl/player/:playerId', <PlayerView />, { usage: 'UNAVAILABLE', projection_distributions: 'UNAVAILABLE', player_props: 'UNAVAILABLE' });
    await screen.findByText('Josh Allen');
    expect(screen.queryByRole('heading', { name: 'Market Context' })).toBeNull();
    expect(screen.queryByText('Projected ranges for every stat in this game')).toBeNull();
    expect(screen.queryByText('Usage & Role')).toBeNull();
  });

  it('the game page drops sections whose capability is unavailable', async () => {
    const off = { matchup_metrics: 'UNAVAILABLE', market_price_history: 'UNAVAILABLE' };
    const markets = renderScreen(routes.game('nfl', GAME, { tab: 'markets' }), '/nfl/game/:eventId', <GameRoute />, off);
    await screen.findByRole('heading', { name: 'Market and simulation' });
    expect(markets.container.querySelector('#g-markets')).not.toBeNull();
    markets.unmount();
    const matchup = renderScreen(routes.game('nfl', GAME, { tab: 'matchup' }), '/nfl/game/:eventId', <GameRoute />, off);
    await screen.findByText('No matchup metrics published for this game');
    expect(matchup.container.querySelector('#g-matchup')).toBeNull();
    matchup.unmount();
    const trends = renderScreen(routes.game('nfl', GAME, { tab: 'trends' }), '/nfl/game/:eventId', <GameRoute />, off);
    await screen.findByRole('heading', { name: 'Recent Head to Head' });
    expect(trends.container.querySelector('#g-movement')).toBeNull();
  });
});

describe('game page', () => {
  it('links every matchup cell into metric views with team, opponent and game context', async () => {
    const { container } = renderScreen(routes.game('nfl', GAME, { tab: 'matchup' }), '/nfl/game/:eventId', <GameRoute />);
    await screen.findByText('Unit by unit');
    const cells = container.querySelectorAll('.mb__cell');
    expect(cells.length).toBe(28);
    for (const c of cells) expect(c.getAttribute('href')).toMatch(/^\/nfl\/metric\/met_nfl\.adj_(off|def)_\w+\?team=prt_\w+&opp=prt_\w+&event=evt_/);
    // No combined "advantage" figure is drawn from the publication's sign-inverted advantage_to_offense.
    expect(container.querySelector('.mb__adv')).toBeNull();
    // The whole-game packet is an export at the foot of the page, not a hero action.
    expect(screen.getAllByRole('link', { name: /Export this game's full handicap packet/ })[0].getAttribute('href')).toBe(routes.packet({ sport: 'nfl', scope: 'GAME', event: GAME }));
    expect(container.querySelector('.gh a[href*="packet"]')).toBeNull();
  });

  it('the overview leads with what matters, then the scripts (most likely first) and the compact prop explorer', async () => {
    const { container } = renderScreen(routes.game('nfl', GAME), '/nfl/game/:eventId', <GameRoute />);
    await screen.findByRole('heading', { name: 'What Matters' }, { timeout: 10_000 });
    // The headline edge in NE @ BUF: Buffalo's #1 rush offense against New England's #21 run defense.
    expect((await screen.findAllByText('Bills rush offense has a major edge')).length).toBeGreaterThan(0);
    expect([...container.querySelectorAll('.scard__name')].map((e) => e.textContent)).toEqual(['Close Game Either Way', 'Bills Win Big', 'Bills Win Comfortably', 'Patriots Win Comfortably']);
    expect([...container.querySelectorAll('.scard__pct')].map((e) => e.textContent)).toEqual(['36%', '26%', '24%', '13%']);
    expect(container.querySelector('.scard__top')!.textContent).toBe('Most likely');
    // No raw Kalshi ticker anywhere on the overview.
    await act(async () => {});
    expect(container.textContent).not.toMatch(/KXNFL/);
    expect(await screen.findByRole('heading', { name: 'Player Prop Explorer' }, { timeout: 10_000 })).toBeTruthy();
    // The compact explorer filters by category and team, and deep-links into the full explorer for this game.
    expect(screen.getByRole('group', { name: 'Prop category' })).toBeTruthy();
    expect(container.querySelector(`a[href="${routes.props('nfl', { game: GAME })}"]`)).not.toBeNull();
    // Selecting a script is a link (deep-linkable) that keeps the tab.
    expect(container.querySelector('.scard--s2 .scard__a')!.getAttribute('href')).toBe(routes.game('nfl', GAME, { script: 'fav' }));
    // The hero carries no market chips or research actions.
    expect(container.querySelector('.gh .savebtn, .gh .qchip')).toBeNull();
  });

  it('the markets tab lists every contract on the game', async () => {
    renderScreen(routes.game('nfl', GAME, { tab: 'markets' }), '/nfl/game/:eventId', <GameRoute />);
    await act(async () => {});
    expect((await screen.findAllByText(/796\)/)).length).toBeGreaterThan(0);
  });
});
