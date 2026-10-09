// Tennis on Sift: an individual sport. Player A is whoever match_winner_ticker.a names, there is no home or away
// side, doubles carry no model, and every model number is RESEARCH_ONLY. Screens render from a trimmed real
// Tennis-Edge-Finder publication.
import { screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EntityProfileDoc, EventResearchDoc } from '../src/contract/types';
import { clearAsyncMemo } from '../src/data/hooks';
import { NAV_SPORTS } from '../src/data/nav';
import { explorable, sportByCode } from '../src/data/sports';
import { routes } from '../src/lib/routes';
import { readTennis, tennisMarketTitle, tennisRating, tournamentTier } from '../src/lib/tennis';
import { GameRoute } from '../src/views/Game';
import { MarketView } from '../src/views/Market';
import { PlayerView } from '../src/views/Player';
import { SportHomeView } from '../src/views/SportHome';
import { readTennis as readFixture, useDiskFetch } from './helpers';
import { renderScreen } from './render';

const KHA_FER = 'evt_626bc16043b56b7b1921';
const MER_SWI = 'evt_581f889e1dfb4de11420';
const DOUBLES = 'evt_d09d8721f706b006741f';
const KHACHANOV = 'prt_dc998b2d3279e7cce73b';
const FERY_WIN = 'mkt_kalshi_KXATPMATCH-26OCT09KHAFER-FER';
const doc = (id: string) => readFixture<EventResearchDoc>(`explorer/events/${id}.json`);
const BANNED = /\block\b|best bet|guaranteed|\bproven\b|\bprofitable\b/i;

beforeAll(() => {
  useDiskFetch();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});
beforeEach(() => {
  clearAsyncMemo();
  localStorage.clear();
});

describe('Tennis is a first-class sport', () => {
  it('is explorable and in beta in the navigation', () => {
    expect(explorable(sportByCode('TENNIS')!)).toBe(true);
    expect(NAV_SPORTS.find((s) => s.slug === 'tennis')).toMatchObject({ status: 'beta' });
  });
});

describe('a tennis match decodes as published', () => {
  it('names player A from the match-winner ticker, reads surface, level, start status and three model generations', () => {
    const t = readTennis(doc(KHA_FER));
    expect(t.a.name).toBe('Karen Khachanov');
    expect(t.b.name).toBe('Arthur Fery');
    expect(t.a.ticker).toBe('KXATPMATCH-26OCT09KHAFER-KHA');
    expect(t.discipline).toBe('singles');
    expect(t.surface).toBe('Hard');
    expect(t.level).toBe('MASTERS_1000');
    expect(t.start.status).toBe('VERIFIED_UPCOMING');
    expect(t.model.fairV1).toBeCloseTo(0.5931, 3);
    expect(t.model.gen1).toBeCloseTo(0.6331, 3);
    expect(t.model.gen2).toBeCloseTo(0.5882, 3);
    expect(t.external).toHaveLength(2);
    expect(t.external[0].triangulation).toBe('MODEL_LONE_OUTLIER');
    expect(t.authority).toBe('RESEARCH_ONLY');
    expect(t.rows.length).toBeGreaterThan(5);
    expect(t.dataQuality.grade).toBe('A');
  });

  it('doubles carry no model and say why', () => {
    const t = readTennis(doc(DOUBLES));
    expect(t.discipline).toBe('doubles');
    expect(t.model.fairV1).toBeNull();
    expect(t.model.validityReason).toMatch(/doubles/i);
    expect(t.a.identity.status).toBe('NOT_APPLICABLE_DOUBLES');
  });

  it('reads markets in tennis language', () => {
    const t = readTennis(doc(MER_SWI));
    const title = (fam: string, desc: string, extra: Record<string, unknown> = {}) => tennisMarketTitle({ kalshi_ticker: 'KXWTAMATCH-X', market_family: fam, yes_description: desc, ...extra }, t);
    expect(title('match_winner', 'Iga Swiatek', { participant_id: t.b.id })).toBe('Iga Swiatek to win the match');
    expect(title('set_winner', 'Elise Mertens', { participant_id: t.a.id, extensions: { set_index: 2 } })).toBe('Elise Mertens wins set 2');
    expect(title('total_games', 'Over 20.5 games', { line: 20.5 })).toBe('Over 20.5 total games');
    expect(title('game_spread', 'Elise Mertens', { participant_id: t.a.id, line: 4.5 })).toBe('Elise Mertens +4.5 games');
  });

  it('a player profile yields a rating with rank and surface splits', () => {
    const r = tennisRating(readFixture<EntityProfileDoc>(`explorer/players/${KHACHANOV}.json`));
    expect(r.elo).toBeGreaterThan(2000);
    expect(r.eloRank).toBe(20);
    expect(r.surfaceElo.length).toBeGreaterThan(0);
    expect(r.identity).toBe('MAPPED');
    expect(r.matchesRated).toBe(757);
  });

  it('tiers tournaments from their names', () => {
    expect(tournamentTier('ATP Shanghai')).toBe('main');
    expect(tournamentTier('ATP Challenger Braga')).toBe('challenger');
    expect(tournamentTier('M25 Kigali')).toBe('itf');
    expect(tournamentTier('W15 Islamabad')).toBe('itf');
  });
});

describe('tennis screens render from the real publication', () => {
  it('the home lists tournaments and matches with both players and the honest no-edge status', async () => {
    renderScreen(routes.sport('tennis'), '/:sport', <SportHomeView />, {}, 'tennis');
    expect(await screen.findByRole('heading', { name: 'Tennis', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('no evidence of edge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ATP Shanghai/ })).toBeInTheDocument();
    expect(await screen.findByText('Karen Khachanov')).toBeInTheDocument();
    expect(screen.getByText('Iga Swiatek')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/undefined|NaN|KXATP|KXWTA/);
    expect(text).not.toMatch(BANNED);
  });

  it('the match page shows the model read with triangulation, serve and return evidence and every market', async () => {
    renderScreen(routes.game('tennis', KHA_FER), '/:sport/game/:eventId', <GameRoute />, {}, 'tennis');
    expect(await screen.findByRole('heading', { name: /Karen Khachanov wins 59% of the time in the model/ })).toBeInTheDocument();
    expect(screen.getByText(/Model is the lone outlier/)).toBeInTheDocument();
    expect(screen.getByText(/Why this is not a bet/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Serve, return and rating' })).toBeInTheDocument();
    expect(await screen.findByText('Match winner', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Arthur Fery to win the match')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/undefined|NaN/);
    expect(text).not.toMatch(BANNED);
  });

  it('a doubles match says PASS: no model probability', async () => {
    renderScreen(routes.game('tennis', DOUBLES), '/:sport/game/:eventId', <GameRoute />, {}, 'tennis');
    expect(await screen.findByRole('heading', { name: 'No model probability for doubles.' })).toBeInTheDocument();
  });

  it('a player page shows the rating profile', async () => {
    renderScreen(routes.player('tennis', KHACHANOV), '/:sport/player/:playerId', <PlayerView />, {}, 'tennis');
    expect(await screen.findByRole('heading', { name: 'Karen Khachanov', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(/Elo rating \(overall\)/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'By surface' })).toBeInTheDocument();
  });

  it('a market page names the match by its players (no home or away side)', async () => {
    renderScreen(routes.market('tennis', FERY_WIN, KHA_FER), '/:sport/market/:marketId', <MarketView />, {}, 'tennis');
    await screen.findAllByText(/Karen Khachanov v Arthur Fery/);
    expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
  });
});
