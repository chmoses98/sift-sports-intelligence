// NHL on Sift: the NHL_SCRIPT_V1 payload decodes as published, raw statistics are never presented as betting
// evidence, research candidates stay RESEARCH_ONLY with their survival and status visible, the learning state is
// read from real counts, hockey markets read as hockey, NFL lookups never leak into hockey, and the NHL screens
// (home, game, scripts, candidates, market, team, player, scorecard) render from a trimmed real publication.
import { screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventResearchDoc, MetricDef, MetricRegistryDoc } from '../src/contract/types';
import { clearAsyncMemo } from '../src/data/hooks';
import { NAV_SPORTS } from '../src/data/nav';
import { explorable, sportByCode } from '../src/data/sports';
import { injuryRows } from '../src/lib/gamedata';
import { describeMarket, describeNhlMarket } from '../src/lib/marketLabel';
import {
  candidateTitle,
  evAt,
  isNhlScripts,
  learningLine,
  priceCheck,
  readFindings,
  readLearning,
  readNhl,
  sideProbabilities,
  survivalText,
  TIER_WORD,
  type NhlScripts,
} from '../src/lib/nhl';
import { routes } from '../src/lib/routes';
import { teamColors } from '../src/lib/teams';
import { venueFor } from '../src/lib/venues';
import { GameRoute } from '../src/views/Game';
import { MarketView } from '../src/views/Market';
import { PlayerView } from '../src/views/Player';
import { ScorecardView } from '../src/views/Scorecard';
import { SportHomeView } from '../src/views/SportHome';
import { TeamView } from '../src/views/Team';
import { readNhl as readFixture, useDiskFetch } from './helpers';
import { renderScreen } from './render';

const FLA_LAK = 'evt_5938c3f8a7c1b24c0118';
const LAK = 'prt_1513313ad992fb9eb71f';
const KEMPE = 'prt_9e5d52ad51ba0c6a2f60';
const KUEMPER = 'prt_628b1d1dc955ba0a8b41';

const doc = (id = FLA_LAK) => readFixture<EventResearchDoc>(`explorer/events/${id}.json`);
const scriptsOf = (id = FLA_LAK): NhlScripts => {
  const s = readNhl(doc(id));
  if (!isNhlScripts(s)) throw new Error('fixture event has no NHL scripts');
  return s;
};
const metrics = () => new Map<string, MetricDef>(readFixture<MetricRegistryDoc>('explorer/metrics.json').items.map((m) => [m.metric_id, m]));

beforeAll(() => {
  useDiskFetch();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});
beforeEach(() => {
  clearAsyncMemo();
  localStorage.clear();
});

describe('NHL is a first-class sport', () => {
  it('is explorable, live in the navigation and right after NFL', () => {
    const nhl = sportByCode('NHL')!;
    expect(explorable(nhl)).toBe(true);
    expect(nhl.rawBase).toContain('NHL-edge-finder/data-archive/app/latest');
    expect(NAV_SPORTS[1]).toMatchObject({ slug: 'nhl', status: 'live' });
  });

  it('never borrows NFL stadiums, nicknames or colours for hockey clubs that share an abbreviation', () => {
    expect(venueFor('CAR', null, 'NHL')).toBeNull();
    expect(venueFor('SEA', 'Climate Pledge Arena', 'NHL')).toBeNull();
    expect(venueFor('SEA', null)).not.toBeNull(); // NFL keeps its table
    expect(teamColors('NHL', 'CAR')).not.toEqual(teamColors('NFL', 'CAR'));
    const label = describeMarket({ kalshi_ticker: 'KXNHLGAME-26OCT06CARMTL-CAR', market_family: 'game_winner', yes_description: 'Carolina wins', period: 'FULL' });
    expect(label.title).toBe('Carolina to win');
    expect(label.title).not.toContain('Panthers');
  });
});

describe('hockey market language', () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ kalshi_ticker: 'KXNHLSPREAD-X-CAR2', market_family: 'game_spread', yes_description: 'Carolina wins by over 1.5 goals', period: 'FULL' }, 'Carolina −1.5'],
    [{ kalshi_ticker: 'KXNHLTOTAL-X-6', market_family: 'game_total', yes_description: 'Full Game: Over 5.5 goals scored', period: 'FULL' }, 'Game total over 5.5 goals'],
    [{ kalshi_ticker: 'KXNHLTEAMTOTAL-X-CAR3', market_family: 'team_total', yes_description: 'Carolina over 2.5 goals scored', period: 'FULL' }, 'Carolina team total over 2.5 goals'],
    [{ kalshi_ticker: 'KXNHLGOAL-X-1', market_family: 'player_goals', yes_description: 'Andrei Svechnikov: 1+ goals', period: 'FULL' }, 'Andrei Svechnikov to score a goal'],
    [{ kalshi_ticker: 'KXNHLSAVE-X-28', market_family: 'goalie_saves', yes_description: 'Jakub Dobes: 28+ saves', period: 'FULL' }, 'Jakub Dobes over 27.5 saves'],
    [{ kalshi_ticker: 'KXNHL1P-X-CAR', market_family: 'period_winner', yes_description: 'Carolina wins the 1st period', period: 'P1' }, 'Carolina wins the 1st period'],
  ];
  it.each(cases)('%o reads as %s', (m, want) => {
    expect(describeNhlMarket(m as never)?.title).toBe(want);
    expect(describeMarket(m as never).title).not.toMatch(/KXNHL/);
  });
});

describe('NHL_SCRIPT_V1 decoding', () => {
  it('decodes seven scripts that reconcile to 100%, most likely first, with fixed colour identities', () => {
    const s = scriptsOf();
    expect(s.scripts).toHaveLength(7);
    expect(s.scripts.reduce((a, x) => a + x.probability, 0)).toBeCloseTo(1, 2);
    for (let i = 1; i < s.scripts.length; i++) expect(s.scripts[i - 1].probability).toBeGreaterThanOrEqual(s.scripts[i].probability);
    expect(new Set(s.scripts.map((x) => x.tone)).size).toBe(7);
    expect(s.order).toHaveLength(7);
    expect(s.versions.script).toBe('NHL_SCRIPT_V1');
  });

  it('decodes the compact market matrix with YES/NO sides on their own ask, and EV per script follows the published identity', () => {
    const s = scriptsOf();
    const row = [...s.markets.values()].find((r) => r.family === 'game_total' && r.yes?.cost != null && r.no?.cost != null)!;
    expect(row.pYesByScript).toHaveLength(7);
    const yes = sideProbabilities(row, 'yes');
    const no = sideProbabilities(row, 'no');
    yes.forEach((p, i) => expect((p ?? 0) + (no[i] ?? 0)).toBeCloseTo(1, 2));
    expect(row.yes!.ask).not.toBe(row.no!.ask);
    const ev = evAt(row, 'yes', row.yes!.cost);
    const expected = s.order.reduce((a, id, i) => a + (s.byId.get(id)!.probability * (ev[i] ?? 0)), 0);
    expect(expected).toBeCloseTo(row.yes!.ev ?? 0, 2);
  });

  it('every candidate is research only, carries survival, robustness, a governance status and its executable price', () => {
    const s = scriptsOf();
    expect(s.candidates.length).toBeGreaterThan(0);
    for (const c of s.candidates) {
      expect(c.authority).toBe('RESEARCH_ONLY');
      expect(['FUNDED_RESEARCH', 'SHADOW_ONLY', 'REJECTED']).toContain(c.governance.status);
      expect(c.survival.mass_survived).not.toBeNull();
      expect(c.price.ask_cents).not.toBeNull();
      expect(TIER_WORD[c.robustness]).toBeTruthy();
      expect(c.supporting.every((f) => f.basis !== 'RAW')).toBe(true);
      if (c.governance.status !== 'FUNDED_RESEARCH') expect(c.governance.stake_dollars).toBe(0);
    }
    const ranks = s.candidates.map((c) => c.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    // a fragile candidate never outranks a moderate or robust one
    const firstFragile = s.candidates.findIndex((c) => c.robustness === 'FRAGILE');
    if (firstFragile >= 0) expect(s.candidates.slice(firstFragile).some((c) => c.robustness === 'ROBUST' && c.governance.status !== 'REJECTED')).toBe(false);
  });

  it('says why when a game was not simulated or the layer failed, and ignores non-NHL documents', () => {
    const d = doc();
    const notSim = { ...d, extensions: { ...(d.extensions as object), nhl_scripts_v1: { status: 'NOT_SIMULATED', reason: 'the NHL model simulates a game on its game day' } } } as EventResearchDoc;
    expect(readNhl(notSim)).toEqual({ status: 'NOT_SIMULATED', reason: 'the NHL model simulates a game on its game day' });
    const failed = { ...d, extensions: { ...(d.extensions as object), nhl_scripts_v1: { status: 'FAILED', reason: 'boom' } } } as EventResearchDoc;
    expect(readNhl(failed)?.status).toBe('FAILED');
    const nfl = { ...d, event: { ...d.event, sport: 'NFL' } } as EventResearchDoc;
    expect(readNhl(nfl)).toBeNull();
  });

  it('formats survival, prices against bet-up-to and candidate titles plainly', () => {
    expect(survivalText(0.71, [true, true, false, true, false, true, false], 7)).toBe('Survives 71% of simulated games · 4 of 7 scripts');
    expect(priceCheck(75, 72)).toBe('ABOVE_BET_UP_TO');
    expect(priceCheck(70, 72)).toBe('OK');
    expect(priceCheck(null, 72)).toBe('UNKNOWN');
    expect(candidateTitle({ title: 'Florida wins by over 1.5 goals', side: 'no' }, { kalshi_ticker: 'KXNHLSPREAD-X', yes_description: 'Florida wins by over 1.5 goals', market_family: 'game_spread', period: 'FULL' })).toBe('Florida −1.5 — NO');
  });
});

describe('findings: raw statistics are never betting evidence', () => {
  it('only opponent-adjusted, model and availability findings are evidence; What Matters never leads with a raw stat', () => {
    const { findings, whatMatters } = readFindings(doc());
    expect(findings.length).toBeGreaterThan(3);
    for (const f of findings) expect(f.evidence_eligible).toBe(['OPPONENT_ADJUSTED', 'MODEL', 'AVAILABILITY'].includes(f.basis));
    expect(findings.filter((f) => f.basis === 'RAW').every((f) => /not opponent-adjusted/i.test(f.text))).toBe(true);
    expect(whatMatters.length).toBeGreaterThan(0);
    expect(whatMatters.length).toBeLessThanOrEqual(5);
    expect(whatMatters.some((f) => f.basis === 'RAW')).toBe(false);
    expect(findings.filter((f) => f.basis === 'OPPONENT_ADJUSTED').every((f) => /opponent-adjusted/i.test(f.text))).toBe(true);
  });

  it('opponent-adjusted metrics are separate metric ids that say so; no raw metric claims adjustment', () => {
    for (const m of metrics().values()) {
      const adjusted = Boolean(m.supports.opponent_adjustment);
      expect(adjusted).toBe(m.metric_id.startsWith('met_nhl.oa_'));
      if (adjusted) expect(m.category).toBe('opponent_adjusted');
    }
  });
});

describe('learning state', () => {
  it('comes from real counts in the metric registry, never from constants', () => {
    const l = readLearning(metrics())!;
    expect(l.status).toBe('OK');
    expect(l.stage?.stage).toBe('EARLY_LEARNING');
    expect(learningLine(l)).toMatch(/\d+ games projected · \d+ settled · [\d,]+ market snapshots/);
    expect(l.unknowns?.length).toBeGreaterThan(0);
    expect(readLearning(new Map())).toBeNull();
  });
});

describe('NHL injuries', () => {
  it('reads the NHL injury format and attributes teams only from the game’s own rosters', () => {
    const d = doc();
    const rows = injuryRows(d, (n) => (n === 'Jakub Dvorak' ? 'LAK' : null));
    const dv = rows.find((r) => r.player === 'Jakub Dvorak')!;
    expect(dv).toMatchObject({ position: 'D', team: 'LAK' });
    expect(rows.filter((r) => r.player !== 'Jakub Dvorak').every((r) => r.team === null)).toBe(true);
  });
});

describe('NHL screens', () => {
  // The fixture's slate, before its first puck drop (2026-10-07 00:00Z).
  beforeAll(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-06T23:30:00Z') }));
  afterAll(() => vi.useRealTimers());

  it('the NHL home is a hockey dashboard: compact status, the slate with logos and goalies, research that survives', async () => {
    renderScreen(routes.sport('nhl'), '/:sport', <SportHomeView />, {}, 'nhl');
    await screen.findByRole('heading', { name: 'NHL', level: 1 }, { timeout: 6000 });
    expect(screen.getAllByRole('link', { name: /NHL model status: Learning/ }).length).toBeGreaterThan(0);
    await screen.findAllByText(/most likely script/, {}, { timeout: 6000 });
    const rows = document.querySelectorAll('.nsl');
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.querySelectorAll('img.teammark--logo, span.teammark--logo').length).toBe(2);
      expect(row.querySelectorAll('.ngi').length).toBe(2);
    }
    expect(screen.getByRole('link', { name: /St\. Louis Blues at Chicago Blackhawks/ })).toBeTruthy();
    await screen.findByRole('heading', { name: 'Research that survives the scripts' }, { timeout: 6000 });
    expect(screen.getByRole('heading', { name: 'Research status' })).toBeTruthy();
    // Goal-scorer contracts are never featured on the home.
    const strong = document.querySelector('.nsr')!.textContent!;
    expect(strong).not.toMatch(/to score|goals? —|\bGoal\b/);
    expect(screen.getAllByText('Goalie unconfirmed').length).toBeGreaterThan(0);
    const text = document.body.textContent!.toLowerCase();
    for (const banned of ['lock', 'best bet', 'guaranteed', 'proven', 'profitable', 'undefined', 'nan%']) expect(text).not.toContain(banned);
  });

  it('the NHL game page tells the story: summary, thesis, scripts, goalies, market fit, special teams, players', async () => {
    renderScreen(routes.game('nhl', FLA_LAK), '/:sport/game/:eventId', <GameRoute />, {}, 'nhl');
    const thesis = await screen.findByRole('heading', { name: 'How this game is most likely to play' }, { timeout: 6000 });
    const game = within(document.querySelector('.game--nhl') as HTMLElement);
    const order = ['How this game is most likely to play', 'Game scripts', 'Goalie matchup', 'Market fit', 'Special teams', 'Player research'].map((n) => game.getByRole('heading', { name: n }));
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(thesis).toBeTruthy();
    expect(game.getByRole('img', { name: /Model win probability: FLA 44%, LAK 56%/ })).toBeTruthy();
    expect(game.getByText(/LAK slight edge/)).toBeTruthy();
    expect(game.getByText(/LAK has the stronger control-and-pull-away branch/)).toBeTruthy();
    expect(game.getByRole('note', { name: 'Contradiction check' })).toBeTruthy();
    expect(game.getByText('Survives multiple scripts')).toBeTruthy();
    expect(game.getAllByText(/Darcy Kuemper|Jacob Markstrom/).length).toBeGreaterThan(1);
    expect(screen.getAllByText('Confirmed').length).toBeGreaterThanOrEqual(2);
    // Every script is listed with a written probability.
    for (const x of scriptsOf().scripts) expect(game.getAllByText(x.label).length).toBeGreaterThan(0);
    const page = document.querySelector('.game--nhl')!.textContent!;
    expect(page).not.toMatch(/KXNHL|undefined|NaN/);
    expect(page.toLowerCase()).not.toMatch(/\block\b|best bet|guaranteed/);
  });

  it('links published before the story layout still open the right tab', async () => {
    renderScreen(`${routes.game('nhl', FLA_LAK)}?tab=candidates`, '/:sport/game/:eventId', <GameRoute />, {}, 'nhl');
    await screen.findByRole('heading', { name: 'What the model says about each market' }, { timeout: 6000 });
    clearAsyncMemo();
    document.body.innerHTML = '';
    renderScreen(`${routes.game('nhl', FLA_LAK)}?tab=lineups`, '/:sport/game/:eventId', <GameRoute />, {}, 'nhl');
    await screen.findByRole('heading', { name: 'Injuries' }, { timeout: 6000 });
    expect(screen.getByRole('heading', { name: 'Player research' })).toBeTruthy();
  });

  it('the scripts tab shows every script and the cross-script matrix', async () => {
    renderScreen(`${routes.game('nhl', FLA_LAK)}?tab=script`, '/:sport/game/:eventId', <GameRoute />, {}, 'nhl');
    await screen.findByRole('heading', { name: 'Which markets survive which scripts' }, { timeout: 6000 });
    const s = scriptsOf();
    for (const x of s.scripts) expect(screen.getByRole('heading', { name: x.label, level: 3 })).toBeTruthy();
    expect(screen.getAllByText('What creates it').length).toBe(s.scripts.length);
    expect(screen.getAllByText('Markets it hurts').length).toBe(s.scripts.length);
    const table = screen.getByRole('region', { name: 'Script survival matrix' });
    expect(within(table).getAllByRole('columnheader').length).toBe(s.scripts.length + 2);
  });

  it('a market page shows script behaviour and says plainly when the model does not price a market', async () => {
    const s = scriptsOf();
    const d = doc();
    const priced = d.markets.find((m) => s.markets.has(m.kalshi_ticker) && m.market_family === 'game_total')!;
    renderScreen(routes.market('nhl', priced.market_id, FLA_LAK), '/:sport/market/:marketId', <MarketView />, {}, 'nhl');
    await screen.findByRole('heading', { name: /does it survive the game scripts/ }, { timeout: 6000 });
    expect(screen.getByRole('region', { name: 'Script-conditioned prices' })).toBeTruthy();
    const unpriced = d.markets.find((m) => !s.markets.has(m.kalshi_ticker));
    if (unpriced) {
      clearAsyncMemo();
      document.body.innerHTML = '';
      renderScreen(routes.market('nhl', unpriced.market_id, FLA_LAK), '/:sport/market/:marketId', <MarketView />, {}, 'nhl');
      await screen.findByText(/Model does not price this market/, {}, { timeout: 6000 });
    }
  });

  it('a team page separates opponent-adjusted strength from raw numbers', async () => {
    renderScreen(routes.team('nhl', LAK), '/:sport/team/:teamId', <TeamView />, {}, 'nhl');
    await screen.findByRole('heading', { name: 'Opponent-adjusted strength' }, { timeout: 6000 });
    const region = screen.getByRole('region', { name: 'Opponent-adjusted strength' });
    expect(within(region).getByRole('columnheader', { name: 'Raw (same games)' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Next game/ })).toBeTruthy();
  });

  it('a skater page is research first: role, production, game log; a goalie page shows start status and saves by script', async () => {
    renderScreen(routes.player('nhl', KEMPE), '/:sport/player/:playerId', <PlayerView />, {}, 'nhl');
    await screen.findByRole('heading', { name: 'Current role' }, { timeout: 6000 });
    const role = screen.getByRole('heading', { name: 'Current role' });
    const priced = await screen.findByRole('heading', { name: /what the model prices/ }, { timeout: 6000 });
    expect(role.compareDocumentPosition(priced) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/on the .*line/)).toBeTruthy(), { timeout: 6000 });
    clearAsyncMemo();
    document.body.innerHTML = '';
    renderScreen(routes.player('nhl', KUEMPER), '/:sport/player/:playerId', <PlayerView />, {}, 'nhl');
    await screen.findByRole('heading', { name: 'Start status' }, { timeout: 6000 });
    await waitFor(() => expect(screen.getAllByText(/Projected starter/).length).toBeGreaterThan(0), { timeout: 6000 });
    await screen.findByRole('region', { name: 'Saves by game script' }, { timeout: 6000 });
  });

  it('the NHL scorecard leads with the sample and never mixes shadow candidates with actual wagers', async () => {
    renderScreen(routes.scorecard('nhl'), '/:sport/scorecard', <ScorecardView />, {}, 'nhl');
    await screen.findByRole('heading', { name: 'NHL Scorecard' }, { timeout: 6000 });
    expect(screen.getByRole('heading', { name: 'Sample' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What we still do not know' })).toBeTruthy();
    expect(screen.getByText(/Actual routed wagers are reported only by the accounting ledger/)).toBeTruthy();
    const text = document.body.textContent!.toLowerCase();
    expect(text).not.toMatch(/\bprofitable\b|\bproven\b/);
  });
});
