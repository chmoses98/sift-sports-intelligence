// NBA on Sift: team identity resolves every tricode, markets read in basketball language, the publication's
// model-vs-market study and injury report decode as published, and the home and game screens render an honest PASS
// (no model prices; the market beats the model in every family) from a trimmed real publication.
import { screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EventResearchDoc } from '../src/contract/types';
import { clearAsyncMemo } from '../src/data/hooks';
import { NAV_SPORTS } from '../src/data/nav';
import { explorable, sportByCode } from '../src/data/sports';
import { NBA_TEAMS, nbaInjuries, nbaMarketTitle, nbaModelVsMarket, nbaTeam } from '../src/lib/nba';
import { routes } from '../src/lib/routes';
import { teamColors } from '../src/lib/teams';
import { GameRoute } from '../src/views/Game';
import { SportHomeView } from '../src/views/SportHome';
import { TeamView } from '../src/views/Team';
import { readNba, useDiskFetch } from './helpers';
import { renderScreen } from './render';

const DAL_HOU = 'evt_0787342e3e624193d62e';
const DAL = 'prt_fe5481634395448d9b19';
const HOU = 'prt_154c9a432d4539fabeea';
const doc = (id: string) => readNba<EventResearchDoc>(`explorer/events/${id}.json`);
const BANNED = /\block\b|best bet|guaranteed|\bproven\b|\bprofitable\b/i;

beforeAll(() => {
  useDiskFetch();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});
beforeEach(() => {
  clearAsyncMemo();
  localStorage.clear();
});

describe('NBA is a first-class sport', () => {
  it('is explorable and in beta in the navigation', () => {
    expect(explorable(sportByCode('NBA')!)).toBe(true);
    expect(NAV_SPORTS.find((s) => s.slug === 'nba')).toMatchObject({ status: 'beta' });
  });
  it('resolves all 30 clubs and never borrows NFL or NHL colours for a shared code', () => {
    expect(NBA_TEAMS).toHaveLength(30);
    expect(nbaTeam('DAL')).toMatchObject({ city: 'Dallas', name: 'Mavericks' });
    expect(nbaTeam('BRK')?.code).toBe('BKN');
    expect(teamColors('NBA', 'DAL')).not.toEqual(teamColors('NFL', 'DAL'));
    expect(teamColors('NBA', 'MIN')).not.toEqual(teamColors('NHL', 'MIN'));
  });
});

describe('NBA decoders', () => {
  it('reads markets in basketball language', () => {
    const abbrOf = (pid: string | null) => (pid === DAL ? 'DAL' : pid === HOU ? 'HOU' : null);
    expect(nbaMarketTitle({ kalshi_ticker: 'KXNBAGAME-X-DAL', market_family: 'game_winner', yes_description: 'Dallas wins', participant_id: DAL, period: 'FULL' }, abbrOf)).toBe('Dallas Mavericks to win');
    expect(nbaMarketTitle({ kalshi_ticker: 'KXNBASPREAD-X-DAL11', market_family: 'game_spread', yes_description: 'Dallas wins by over 10.5 points', participant_id: DAL, threshold: 10.5, period: 'FULL' }, abbrOf)).toBe('Dallas Mavericks −10.5');
    expect(nbaMarketTitle({ kalshi_ticker: 'KXNBATOTAL-X-201', market_family: 'game_total', yes_description: 'Full Game: Over 200.5 points scored', threshold: 200.5, period: 'FULL' }, abbrOf)).toBe('Game total over 200.5');
    expect(nbaMarketTitle({ kalshi_ticker: 'KXNBA1H-X-HOU', market_family: 'period_winner', yes_description: 'Houston wins the 1st half', participant_id: HOU, period: '1H' }, abbrOf)).toBe('Houston Rockets wins the 1st half');
  });
  it('decodes the model-vs-market study and the injury report', () => {
    const f = nbaModelVsMarket(doc(DAL_HOU));
    expect(f).toHaveLength(8);
    // The publication's claim: the raw Kalshi price beats the data-only model in every family (lower log loss).
    for (const x of f) expect(x.marketLogLoss!).toBeLessThan(x.modelLogLoss!);
    const inj = nbaInjuries(doc(DAL_HOU));
    expect(inj.length).toBeGreaterThan(0);
    expect(inj[0]).toMatchObject({ status: 'QUESTIONABLE' });
    expect(inj[0].player).not.toMatch(/\(/);
  });
});

describe('NBA screens render from the real publication', () => {
  it('the home shows the slate with both clubs and the honest research PASS', async () => {
    renderScreen(routes.sport('nba'), '/:sport', <SportHomeView />, {}, 'nba');
    expect(await screen.findByRole('heading', { name: 'NBA', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('market beats model 8/8 families')).toBeInTheDocument();
    expect(await screen.findByText('Dallas Mavericks')).toBeInTheDocument();
    expect(screen.getByText('Houston Rockets')).toBeInTheDocument();
    // The shared opportunity panel says PASS with the publication's own reason.
    expect((await screen.findAllByText(/prices no contract/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Opportunities' })).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/undefined|NaN|KXNBA/);
    expect(text).not.toMatch(BANNED);
  });

  it('the game page leads with the PASS, then matchup ranks of 30, the injury report, rosters and every market as prices only', async () => {
    renderScreen(routes.game('nba', DAL_HOU), '/:sport/game/:eventId', <GameRoute />, {}, 'nba');
    expect(await screen.findByRole('heading', { name: /No defensible opportunity/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Matchup' })).toBeInTheDocument();
    expect(screen.getAllByText(/rank of 30/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Injury report' })).toBeInTheDocument();
    expect((await screen.findAllByText('Spread', { exact: false })).length).toBeGreaterThan(0);
    expect(screen.getByText(/The model prices none of these/)).toBeInTheDocument();
    expect(screen.getByText('Dallas Mavericks −10.5')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/undefined|NaN/);
    expect(text).not.toMatch(BANNED);
  });

  it('a team page renders through the generic team view', async () => {
    renderScreen(routes.team('nba', DAL), '/:sport/team/:teamId', <TeamView />, {}, 'nba');
    expect(await screen.findByRole('heading', { name: /Dallas Mavericks/, level: 1 })).toBeInTheDocument();
  });
});
