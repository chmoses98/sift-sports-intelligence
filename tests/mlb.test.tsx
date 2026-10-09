// MLB on Sift, against the real edge-finder-api publication with a synthesized 2026-10-07 postseason slate
// (tests/fixtures/mlb): the source resolves live, the home / slate / game render in baseball language (Braves, not
// Falcons; full game = FULL_GAME; innings, not halves), football-only tabs say they are not published, and the
// Player Props section shows the market for every rung but a model number ONLY for a published *_PROJECTION.
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventDetailDoc, Market } from '../src/contract/types';
import { setFetchJson, NotFoundError } from '../src/data/fetcher';
import { clearAsyncMemo } from '../src/data/hooks';
import { resolveSource, setSourcePreference } from '../src/data/source';
import { sportByCode } from '../src/data/sports';
import { groupMarkets } from '../src/components/MarketBoard';
import { describeMarket } from '../src/lib/marketLabel';
import { describeMlbMarket, isMlbPlayerMarket, mlbNick, readPlayerProp } from '../src/lib/mlb';
import { inningWords, isFullGame } from '../src/lib/period';
import { routes } from '../src/lib/routes';
import { teamColors } from '../src/lib/teams';
import { GameRoute } from '../src/views/Game';
import { splitName } from '../src/views/game/Hero';
import { propBoard } from '../src/views/mlb/PlayerProps';
import { SlateView } from '../src/views/Slate';
import { SportHomeView } from '../src/views/SportHome';
import { MLB_DIR, readDisk, readMlb, useDiskFetch } from './helpers';
import { renderScreen } from './render';

const LADATL = 'evt_f809f61380cdbb0eb4f0';
const MILSD = 'evt_f5eb66fea0cf02bbe998';
const GLASNOW = 'prt_337d5d123a707f99b0ea';
const NOW = new Date('2026-10-07T20:10:00Z');
const detail = (id: string) => readMlb<EventDetailDoc>(`event_detail/${id}.json`);
const BANNED = /\bedge\b|confidence|best bet|\block\b|guaranteed/i;

beforeAll(() => {
  useDiskFetch();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
// No vitest globals here, so Testing Library cannot unmount on its own: every screen test starts from an empty DOM.
afterEach(cleanup);
beforeEach(() => {
  clearAsyncMemo();
  localStorage.clear();
});

describe('the MLB publication', () => {
  it('resolves LIVE when the explorer exists (no snapshot, straight from edge-finder-api main)', async () => {
    const mlb = sportByCode('MLB')!;
    const prefix = `${mlb.rawBase}/`;
    setFetchJson(async (url) => {
      if (!url.startsWith(prefix)) throw new NotFoundError(url);
      return JSON.parse(readFileSync(join(MLB_DIR, url.slice(prefix.length)), 'utf-8'));
    });
    setSourcePreference('auto');
    const src = await resolveSource(mlb, 'auto');
    expect([src.mode, src.root, src.liveHealth?.sport, src.liveHealth?.schema_version]).toEqual(['live', mlb.rawBase, 'MLB', 'edge_finder.app.v1']);
    useDiskFetch();
  });

  it('the fixture is the real market rows: every board game has its event detail, all KXMLB tickers on its own game', () => {
    const board = readMlb<{ items: { event_id: string; detail_path: string }[] }>('board.json');
    expect(board.items).toHaveLength(4);
    for (const it of board.items) {
      const d = readMlb<EventDetailDoc>(it.detail_path);
      expect(d.markets.length).toBeGreaterThan(100);
      const key = (d.event.extensions as { kalshi_event_ticker_suffix: string }).kalshi_event_ticker_suffix;
      expect(d.markets.every((m) => m.kalshi_ticker.startsWith('KXMLB') && m.kalshi_ticker.split('-')[1] === key)).toBe(true);
    }
    expect(readdirSync(join(MLB_DIR, 'event_detail'))).toHaveLength(4);
  });
});

describe('baseball language (never football)', () => {
  const lad = detail(LADATL).markets;
  const by = (t: string) => lad.find((m) => m.kalshi_ticker === t)!;

  it('ATL is the Braves, not the Falcons; nicknames are sport-aware; colours too', () => {
    expect(mlbNick('ATL')).toBe('Braves');
    const tt = by('KXMLBTEAMTOTAL-26OCT071800LADATL-ATL5');
    expect(describeMarket(tt).title).toBe('Braves team total over 4.5 runs');
    expect(describeMarket(tt, { sport: 'MLB' }).title).not.toMatch(/Falcons/);
    // ticker-only labels (price history, moves) read the same way
    expect(describeMarket({ kalshi_ticker: 'KXMLBGAME-26OCT071800LADATL-ATL' }).title).toBe('Braves moneyline');
    expect(describeMarket({ kalshi_ticker: 'KXMLBSPREAD-26OCT071800LADATL-LAD2' }).title).toBe('Dodgers −1.5');
    expect(describeMarket({ kalshi_ticker: 'KXMLBTOTAL-26OCT071800LADATL-9' }).title).toBe('Total runs over 8.5');
    expect(describeMarket({ kalshi_ticker: 'KXMLBKS-26OCT071800LADATL-LADTGLASNOW31-9' }).title).toBe('T. Glasnow 9+ strikeouts');
    // every published LAD@ATL market has a readable, football-free name
    for (const m of lad) {
      const t = describeMarket(m).title;
      expect(t).not.toMatch(/Falcons|Rams|Chargers|Cardinals moneyline|KXMLB|YES on/);
    }
    expect(teamColors('MLB', 'ATL')).not.toEqual(teamColors('NFL', 'ATL'));
    expect(splitName('Chicago White Sox', 'CWS', 'MLB')).toEqual({ city: 'Chicago', nick: 'White Sox' });
    expect(splitName('Toronto Blue Jays', 'TOR', 'MLB').nick).toBe('Blue Jays');
  });

  it('other sports are unchanged: NFL ATL is still the Falcons, NFL periods still halves and quarters', () => {
    expect(describeMarket({ kalshi_ticker: 'KXNFLTEAMTOTAL-26OCT05ATLNO-ATL25', market_family: 'team_total', period: 'FULL', threshold: 25, participant_id: null }).title).toBe('Falcons team total over 24.5');
    expect(splitName('Chicago White Sox').nick).toBe('Sox'); // without the MLB context the old rule stands
  });

  it('labels every family: moneyline, run line, totals, team totals, F5/F3/F7, YRFI, pitcher and hitter props', () => {
    const t = (x: string) => describeMlbMarket(by(x)).title;
    expect(t('KXMLBGAME-26OCT071800LADATL-LAD')).toBe('Dodgers moneyline');
    expect(t('KXMLBSPREAD-26OCT071800LADATL-ATL2')).toBe('Braves −1.5');
    expect(t('KXMLBTOTAL-26OCT071800LADATL-9')).toBe('Total runs over 8.5');
    expect(t('KXMLBF5-26OCT071800LADATL-LAD')).toBe('Dodgers lead after 5 innings');
    expect(t('KXMLBF5-26OCT071800LADATL-TIE')).toBe('First 5 innings tied');
    expect(t('KXMLBRFI-26OCT071800LADATL')).toBe('Run in 1st inning');
    expect(t('KXMLBKS-26OCT071800LADATL-LADTGLASNOW31-7')).toBe('Tyler Glasnow 7+ strikeouts');
    expect(t('KXMLBHRR-26OCT071800LADATL-LADMBETTS50-2')).toBe('Mookie Betts 2+ hits + runs + RBIs');
    const f5t = lad.find((m) => m.kalshi_series_ticker === 'KXMLBF5TOTAL')!;
    expect(describeMlbMarket(f5t).title).toMatch(/^First 5 innings: over \d+(\.5)? runs$/);
    expect(inningWords('F5')).toBe('First 5 innings');
    expect(inningWords('F3')).toBe('First 3 innings');
    expect(inningWords('F7')).toBe('First 7 innings');
  });

  it('FULL_GAME is the full game: game lines are lines, F5/F3/F7 are innings, props group by player (never by team)', () => {
    expect(isFullGame('FULL_GAME')).toBe(true);
    expect(isFullGame('FULL')).toBe(true);
    expect(isFullGame('F5')).toBe(false);
    const groups = groupMarkets(lad, () => null);
    const of = (t: string) => groups.find((g) => g.rows.some((m) => m.kalshi_ticker === t))!;
    expect(of('KXMLBGAME-26OCT071800LADATL-LAD').section).toBe('lines');
    expect(of('KXMLBTOTAL-26OCT071800LADATL-9').section).toBe('lines');
    expect(of('KXMLBTEAMTOTAL-26OCT071800LADATL-ATL5').section).toBe('lines');
    expect(of('KXMLBF5-26OCT071800LADATL-LAD')).toMatchObject({ section: 'periods' });
    expect(of('KXMLBF5-26OCT071800LADATL-LAD').title).toContain('First 5 innings');
    expect(groups.find((g) => g.rows.some((m) => m.kalshi_ticker.startsWith('KXMLBF7-')))!.title).toContain('First 7 innings');
    expect(of('KXMLBRFI-26OCT071800LADATL').section).toBe('periods');
    // hitters of one club never collapse into one ladder
    const betts = of('KXMLBHIT-26OCT071800LADATL-LADMBETTS50-1');
    expect(betts).toMatchObject({ section: 'players', subject: 'Mookie Betts', title: 'Hits' });
    expect(betts.rows.every((m) => m.kalshi_ticker.includes('MBETTS'))).toBe(true);
    // with player_id null (MIL@SD, today's production shape) the player name still separates them
    const sd = groupMarkets(detail(MILSD).markets, () => null).filter((g) => g.section === 'players');
    for (const g of sd) expect(new Set(g.rows.map((m) => m.kalshi_ticker.split('-')[2].replace(/\d+$/, ''))).size).toBe(1);
    expect(sd.find((g) => g.subject === 'Manny Machado' && g.title === 'Hits')).toBeTruthy();
    expect(groups.some((g) => g.section === 'periods' && g.rows.some(isMlbPlayerMarket))).toBe(false);
  });
});

describe('the player-prop object (mlb.player_prop.v1)', () => {
  it('reads a model probability ONLY for *_PROJECTION statuses, whatever else the object carries', () => {
    const base = { schema: 'mlb.player_prop.v1', player_name: 'X', model_probability_yes: 0.41, expected_stat: { mean: 6.2, unit: 'K' } };
    expect(readPlayerProp({ extensions: { player_prop: { ...base, projection_status: 'RESEARCH_PROJECTION' } } })!.modelProbabilityYes).toBe(0.41);
    expect(readPlayerProp({ extensions: { player_prop: { ...base, projection_status: 'VERIFIED_PROJECTION' } } })!.modelProbabilityYes).toBe(0.41);
    for (const s of ['NO_MODEL_SUPPORT', 'MISSING_REQUIRED_CONTEXT', 'LINEUP_UNCONFIRMED', 'PLAYER_NOT_STARTING', 'AMBIGUOUS_MARKET', 'GAME_STARTED', 'SOMETHING_NEW', null]) {
      const pp = readPlayerProp({ extensions: { player_prop: { ...base, projection_status: s } } })!;
      expect(pp.modelProbabilityYes).toBeNull();
      expect(pp.expected).toBeNull();
    }
    expect(readPlayerProp({ extensions: { player_prop: { ...base, projection_status: 'RESEARCH_PROJECTION', model_probability_yes: 1.7 } } })!.modelProbabilityYes).toBeNull();
    expect(readPlayerProp({ extensions: {} })).toBeNull();
    expect(readPlayerProp({ extensions: { player_prop: 'garbage' } })).toBeNull();
    expect(readPlayerProp({ extensions: { player_prop: {} } })).toMatchObject({ status: 'UNKNOWN', modelProbabilityYes: null, drivers: [], limitations: [] });
  });

  it('organises a game: pitchers then hitters, away club first, unsupported markets apart', () => {
    const b = propBoard(detail(LADATL).markets, ['LAD', 'ATL']);
    expect(b.projected).toBe(true);
    expect(b.pitchers.map((p) => p.name)).toEqual(['Tyler Glasnow', 'Tyler Mahle']);
    expect(b.hitters[0].team).toBe('LAD');
    expect(b.hitters.find((p) => p.name === 'Freddie Freeman')!.families.map((f) => f.family)).toEqual(['hitter_hits', 'hitter_total_bases', 'hitter_hrr', 'hitter_rbi']);
    expect(b.other.length).toBe(18);
    expect(b.other.every((m) => m.kalshi_series_ticker === 'KXMLBSB')).toBe(true);
    // the fallback: no player_prop anywhere → every player market, grouped by player, nothing projected
    const sd = propBoard(detail(MILSD).markets, ['MIL', 'SD']);
    expect(sd.projected).toBe(false);
    expect(sd.other).toEqual([]);
    expect([...sd.pitchers, ...sd.hitters].flatMap((p) => p.families.flatMap((f) => f.rows)).every((r) => r.pp === null)).toBe(true);
  });
});

describe('MLB screens', () => {
  it('the MLB home renders the slate in baseball words', async () => {
    renderScreen(routes.sport('mlb'), '/:sport', <SportHomeView />, {}, 'mlb');
    expect(await screen.findByRole('heading', { name: 'MLB', level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/Dodgers/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/White Sox/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Falcons|Kicked off|scripts and matchups/);
  });

  it('a board whose every game is final still carries the publication\'s market clock, never "Update time unknown"', async () => {
    // The 2026-10-09 production review: after the night's last out the MLB home read "0 games · 0 markets ·
    // Update time unknown · published" with a green dot, while the publication itself said its markets were
    // last captured 13 hours earlier. The clock falls back to the publication's health.last_market_capture.
    setFetchJson(async (url: string) => {
      const doc = (await readDisk(url)) as Record<string, unknown>;
      if (url.endsWith('/board.json')) {
        return { ...doc, items: (doc.items as Record<string, unknown>[]).map((i) => ({ ...i, status: 'FINAL', market_captured_at: null })) };
      }
      return doc;
    });
    try {
      renderScreen(routes.sport('mlb'), '/:sport', <SportHomeView />, {}, 'mlb');
      expect(await screen.findByRole('heading', { name: 'MLB', level: 1 })).toBeInTheDocument();
      // the fixture publication's own last_market_capture (2026-10-07T19:53:24Z, 16 minutes before NOW)
      const chip = await screen.findByText(/Updated 16m ago/);
      expect(chip.closest('.qchip')).toHaveAttribute('data-quote-source', 'publication');
      expect(document.body.textContent).not.toMatch(/Update time unknown/);
      expect(screen.getByText(/No upcoming games in this publication/)).toBeInTheDocument();
    } finally {
      useDiskFetch();
    }
  });

  it('the MLB slate lists the four postseason games', async () => {
    renderScreen(routes.slate('mlb'), '/:sport/slate', <SlateView />, {}, 'mlb');
    await waitFor(() => expect(screen.getAllByRole('link', { name: /at Atlanta Braves/ }).length).toBeGreaterThan(0));
    for (const n of [/Los Angeles Dodgers at Atlanta Braves/, /Tampa Bay Rays at New York Yankees/, /Milwaukee Brewers at San Diego Padres/, /Cleveland Guardians at Chicago White Sox/]) {
      expect(screen.getAllByRole('link', { name: n }).length).toBeGreaterThan(0);
    }
  });

  it('the MLB game route renders the generic game parts: hero, game lines, starting pitchers; no football tabs', async () => {
    renderScreen(routes.game('mlb', LADATL), '/:sport/game/:eventId', <GameRoute />, {}, 'mlb');
    expect(await screen.findByRole('heading', { name: 'Los Angeles Dodgers at Atlanta Braves', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Game Lines' })).toBeInTheDocument();
    const lines = screen.getByRole('heading', { name: 'Game Lines' }).closest('section')!;
    for (const t of ['Braves moneyline', 'Dodgers moneyline', 'Dodgers −1.5', 'Run in 1st inning', 'Dodgers lead after 5 innings']) expect(within(lines).getByRole('link', { name: t })).toBeInTheDocument();
    // the publication's model price for a game line, labelled as such (◆ Model); no model on a line without one
    const mp = detail(LADATL).model_prices.find((p) => p.market_id === 'mkt_kalshi_KXMLBGAME-26OCT071800LADATL-LAD')!;
    const mlRow = within(lines).getByRole('link', { name: 'Dodgers moneyline' }).closest('tr')!;
    expect(within(mlRow).getByLabelText(`model ${Math.round(mp.fair_probability! * 100)}%`)).toBeInTheDocument();
    expect(within(within(lines).getByRole('link', { name: 'Dodgers −1.5' }).closest('tr')!).getByLabelText('no model price')).toBeInTheDocument();
    expect(within(lines).getByText(/Lineups: LAD confirmed \(official\) · ATL confirmed \(official\)/)).toBeInTheDocument();
    expect(screen.getByText(/First pitch/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Starting pitchers' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('navigation', { name: 'Game sections' })).getAllByRole('link').map((a) => a.textContent);
    expect(tabs).toEqual(['Overview', 'Player props', 'Matchup', 'Markets', 'Trends']);
    expect(document.body.textContent).not.toMatch(/Falcons|What Matters|Kicked off|Injuries &/);
  });

  it('Matchup shows the published model inputs side by side, never a rank Sift did not receive', async () => {
    renderScreen(`${routes.game('mlb', LADATL)}?tab=matchup`, '/:sport/game/:eventId', <GameRoute />, {}, 'mlb');
    const sec = (await screen.findByRole('heading', { name: 'Model inputs, side by side' })).closest('section')!;
    const row = within(sec).getByRole('link', { name: 'Starter K% (slate)' }).closest('tr')!;
    expect(row.textContent).toContain('34.0%');
    expect(row.textContent).toContain('22.3%');
    expect(within(sec).getByRole('columnheader', { name: 'LAD' })).toBeInTheDocument();
    expect(sec.textContent).not.toMatch(/#\d|of 32/);
  });

  it('a game without model prices says so on its game lines', async () => {
    renderScreen(routes.game('mlb', MILSD), '/:sport/game/:eventId', <GameRoute />, {}, 'mlb');
    const lines = (await screen.findByRole('heading', { name: 'Game Lines' })).closest('section')!;
    expect(within(lines).getByText(/No model price is published for this game/)).toBeInTheDocument();
    expect(within(lines).queryByText(/◆/)).toBeNull();
  });

  it('a football tab deep link says MLB does not publish it (no crash, no NFL shapes)', async () => {
    renderScreen(`${routes.game('mlb', LADATL)}?tab=injuries`, '/:sport/game/:eventId', <GameRoute />, {}, 'mlb');
    expect(await screen.findByText('Injuries are not published for MLB')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Game sections' })).queryByRole('link', { current: 'page' })).toBeNull();
  });

  it('Player Props: market for every rung, a model number only for published projections, statuses with reasons', async () => {
    renderScreen(`${routes.game('mlb', LADATL)}?tab=props`, '/:sport/game/:eventId', <GameRoute />, {}, 'mlb');
    const sec = (await screen.findByRole('heading', { name: 'Player props', level: 2 })).closest('section')!;
    await within(sec).findByRole('region', { name: 'Pitchers' });
    expect(within(sec).getByRole('region', { name: 'Hitters' })).toBeInTheDocument();
    expect(within(sec).getAllByText('Research — not validated for betting').length).toBeGreaterThan(1);

    // RESEARCH_PROJECTION: Glasnow 7+ K shows the market and the research model, each labelled
    const ks = detail(LADATL).markets.find((m) => m.kalshi_ticker === 'KXMLBKS-26OCT071800LADATL-LADTGLASNOW31-7')!;
    const pp = readPlayerProp(ks)!;
    const row = within(sec).getAllByRole('row').find((r) => r.textContent?.includes('Tyler Glasnow records 7+ strikeouts'))!;
    expect(within(row).getByLabelText(`Model (research) ${Math.round(pp.modelProbabilityYes! * 100)}%`)).toBeInTheDocument();
    expect(within(row).getByLabelText(new RegExp(`^Market ${Math.round(((ks.yes_bid! + ks.yes_ask!) / 2) * 100)}%`))).toBeInTheDocument();
    expect(within(sec).getAllByText('Proj. 6.2 K (p10–p90 3–9)').length).toBeGreaterThan(0);
    expect(within(sec).getAllByText('Opp lineup K%').length).toBeGreaterThan(0);

    // NO_MODEL_SUPPORT and LINEUP_UNCONFIRMED: status + reason, never a model number, never the market as one
    const outs = within(sec).getAllByRole('row').find((r) => r.textContent?.includes('Tyler Glasnow records 18+ outs recorded'))!;
    expect(within(outs).getByText('Not projected — no model for this market')).toBeInTheDocument();
    expect(within(outs).queryByLabelText(/^Model/)).toBeNull();
    const betts = within(sec).getAllByRole('row').filter((r) => r.textContent?.includes('Mookie Betts records'));
    expect(betts.length).toBeGreaterThan(5);
    for (const r of betts) {
      expect(within(r).getByText('Not projected — lineup unconfirmed')).toBeInTheDocument();
      expect(within(r).queryByLabelText(/^Model/)).toBeNull();
      expect(r.querySelectorAll('td')[2].textContent).not.toMatch(/\d+%/);
    }
    // every model number on the page belongs to a published *_PROJECTION
    const projected = new Set(detail(LADATL).markets.filter((m) => readPlayerProp(m)?.modelProbabilityYes != null).map((m) => readPlayerProp(m)!.yesSemantics));
    for (const el of within(sec).queryAllByLabelText(/^Model/)) expect(projected.has(el.closest('tr')!.querySelector('.pp__yes')!.textContent)).toBe(true);
    expect(within(sec).queryAllByLabelText(/^Model/)).toHaveLength(projected.size);

    // unsupported markets: listed apart, with their price and "No projection published"
    const other = within(sec).getByRole('region', { name: 'Other player markets' });
    expect(within(other).getAllByText('No projection published')).toHaveLength(18);
    expect(within(other).getByText(/Shohei Ohtani: 1\+ stolen bases/)).toBeInTheDocument();

    // links: a resolvable player opens his profile; an unresolved one is plain text
    expect(within(sec).getByRole('link', { name: 'Tyler Glasnow' }).getAttribute('href')).toBe(routes.player('mlb', GLASNOW));
    expect(within(sec).getByRole('heading', { name: 'Andy Pages', level: 4 }).querySelector('a')).toBeNull();
    expect(sec.textContent).not.toMatch(BANNED);
  });

  it('a game with no player_prop at all still lists its player markets by player, "No projection published"', async () => {
    renderScreen(`${routes.game('mlb', MILSD)}?tab=props`, '/:sport/game/:eventId', <GameRoute />, {}, 'mlb');
    const sec = (await screen.findByRole('heading', { name: 'Player props', level: 2 })).closest('section')!;
    await within(sec).findByRole('note');
    expect(within(sec).getByRole('heading', { name: 'Manny Machado', level: 4 })).toBeInTheDocument();
    expect(within(sec).queryAllByLabelText(/^Model/)).toHaveLength(0);
    expect(within(sec).queryByText(/Research — not validated/)).toBeNull();
    expect(within(sec).getAllByText('No projection published').length).toBeGreaterThan(20);
    expect(sec.textContent).not.toMatch(BANNED);
  });

  it('the Markets tab files baseball under Game lines / Innings / Player props (no halves & quarters)', async () => {
    renderScreen(`${routes.game('mlb', LADATL)}?tab=markets`, '/:sport/game/:eventId', <GameRoute />, {}, 'mlb');
    const tabs = await screen.findByRole('tablist', { name: 'Market sections' });
    const labels = within(tabs).getAllByRole('tab').map((t) => t.textContent?.replace(/\s*\d+$/, ''));
    expect(labels).toEqual(['Game lines', 'Innings', 'Player props']);
    expect(document.body.textContent).not.toMatch(/Halves & quarters|Falcons/);
  });
});

describe('MLB markets keep the contract fields Sift reads', () => {
  it('every LAD@ATL prop market with a player_prop carries a schema and a betting_eligible=false flag', () => {
    const ms: Market[] = detail(LADATL).markets.filter((m) => (m.extensions as { player_prop?: unknown })?.player_prop);
    expect(ms.length).toBeGreaterThan(100);
    for (const m of ms) {
      const pp = (m.extensions as { player_prop: { schema: string; betting_eligible: boolean } }).player_prop;
      expect(pp.schema).toBe('mlb.player_prop.v1');
      expect(pp.betting_eligible).toBe(false);
    }
  });
});
