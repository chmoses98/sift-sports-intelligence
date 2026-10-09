// Soccer on Sift: the soccer script engine decodes as published (shares, expressions, counter-cases, fee model),
// markets read in soccer language, and the home and match screens render from a trimmed real publication with an
// honest PASS where the engine did not run. Every soccer model number stays RESEARCH_ONLY.
import { screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EventResearchDoc } from '../src/contract/types';
import { clearAsyncMemo } from '../src/data/hooks';
import { NAV_SPORTS } from '../src/data/nav';
import { explorable, sportByCode } from '../src/data/sports';
import { routes } from '../src/lib/routes';
import { clubInitials, isSoccerEngine, readSoccerEngine, soccerBoard, soccerCalibration, soccerMarketTitle, SOCCER_SCRIPT_TITLE } from '../src/lib/soccer';
import { GameRoute } from '../src/views/Game';
import { SportHomeView } from '../src/views/SportHome';
import { readSoccer, useDiskFetch } from './helpers';
import { renderScreen } from './render';

const ARS_LEE = 'evt_0a69396895a311cb26b2';
const SAN_FLA = 'evt_588a4c8417a2e976344d';
const PUE_LEO = 'evt_19cfa921a7dcc9bfa189';
const doc = (id: string) => readSoccer<EventResearchDoc>(`explorer/events/${id}.json`);
const NAMES = { home: 'Arsenal', away: 'Leeds United', homeId: 'prt_be94f63b5798695abd7e', awayId: 'prt_x' };
const BANNED = /\block\b|best bet|guaranteed|\bproven\b|\bprofitable\b/i;

beforeAll(() => {
  useDiskFetch();
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = undefined;
});
beforeEach(() => {
  clearAsyncMemo();
  localStorage.clear();
});

describe('Soccer is a first-class sport', () => {
  it('is explorable and in beta in the navigation', () => {
    expect(explorable(sportByCode('SOCCER')!)).toBe(true);
    expect(NAV_SPORTS.find((s) => s.slug === 'soccer')).toMatchObject({ status: 'beta' });
  });
});

describe('the soccer script engine decodes as published', () => {
  it('six scripts whose shares reconcile to one, most common first, with fixed tones', () => {
    const e = readSoccerEngine(doc(ARS_LEE));
    expect(isSoccerEngine(e)).toBe(true);
    if (!isSoccerEngine(e)) return;
    expect(e.scripts).toHaveLength(6);
    expect(e.scripts.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 2);
    for (let i = 1; i < e.scripts.length; i++) expect(e.scripts[i - 1].share).toBeGreaterThanOrEqual(e.scripts[i].share);
    expect(new Set(e.scripts.map((s) => s.tone)).size).toBe(6);
    expect(e.scripts[0].title).toBe(SOCCER_SCRIPT_TITLE[e.scripts[0].id]);
    expect(e.glance.primaryScript?.id).toBe(e.scripts[0].id);
  });

  it('the strongest expression carries price, break-even, fair, worst case, support and the counter-case that beats it', () => {
    const e = readSoccerEngine(doc(ARS_LEE));
    if (!isSoccerEngine(e)) throw new Error('engine');
    const b = e.glance.bestRobust!;
    expect(b.side).toBe('no');
    expect(b.label).toBe('ROBUST');
    expect(b.price).toBeCloseTo(0.29, 6);
    expect(b.breakEven).toBeGreaterThan(b.price!);
    expect(b.fairProbability).toBeGreaterThan(0.4);
    expect(b.worstCaseEdge).toBeGreaterThan(0);
    expect(b.supportingScripts).toBe(4);
    expect(b.materialScripts).toBe(5);
    expect(b.counterCase?.statement).toMatch(/Home control/);
    expect(b.authority).toBe('RESEARCH_ONLY');
    expect(e.expressions.length).toBeGreaterThanOrEqual(3);
    expect(e.feeModel).toMatch(/0\.07/);
    expect(e.researchOnly).toBe(true);
    expect(e.dataConfidence?.level).toBe('MEDIUM');
    expect(e.dataGaps.some((g) => g.code === 'SCRIPT_SHARES_NOT_CALIBRATED')).toBe(true);
  });

  it('says when the engine did not run, and the model board is absent for a fixture off the board', () => {
    const e = readSoccerEngine(doc(SAN_FLA));
    expect(e.status).toBe('UNAVAILABLE');
    expect(soccerBoard(doc(SAN_FLA))).toBeNull();
    expect(soccerBoard(doc(PUE_LEO))!.pHome).toBeCloseTo(0.41759, 4);
    expect(readSoccerEngine(null).status).toBe('ABSENT');
  });

  it('publishes settled calibration per family with the market beside the model', () => {
    const c = soccerCalibration(doc(PUE_LEO));
    expect(c.length).toBeGreaterThan(3);
    const r = c.find((x) => x.family === 'match_result_3way')!;
    expect(r.n).toBeGreaterThan(100);
    expect(r.marketLogLoss).not.toBeNull();
  });
});

describe('soccer market language', () => {
  const t = (fam: string, desc: string, extra: Record<string, unknown> = {}) => soccerMarketTitle({ kalshi_ticker: 'KXEPLGAME-X', market_family: fam, yes_description: desc, ...extra }, NAMES);
  it('reads results, totals, handicaps and scores in soccer words', () => {
    expect(t('match_result_3way', 'Result: home', { participant_id: NAMES.homeId })).toBe('Arsenal to win');
    expect(t('match_result_3way', 'Result: draw')).toBe('Draw');
    expect(t('first_half_result', 'First-half result: away', { extensions: { period: 'first_half' } })).toBe('First half: Leeds United to win');
    expect(t('total_goals', 'Total goals over 2.5', { line: 2.5 })).toBe('Over 2.5 goals');
    expect(t('team_total', 'home team total over 1.5', { participant_id: NAMES.homeId, line: 1.5 })).toBe('Arsenal over 1.5 goals');
    expect(t('handicap', 'home wins by more than 1.5', { participant_id: NAMES.homeId, line: 1.5 })).toBe('Arsenal −1.5');
    expect(t('exact_score', 'Exact score 2-1 (home-away)')).toBe('Exact score Arsenal 2–1 Leeds United');
    expect(t('btts', 'btts')).toBe('Both teams score');
  });
  it('club initials for marks', () => {
    expect(clubInitials('Arsenal')).toBe('ARS');
    expect(clubInitials('Leeds United')).toBe('LU');
    expect(clubInitials('FC Augsburg')).toBe('AUG');
  });
});

describe('soccer screens render from the real publication', () => {
  it('the home lists competitions and every fixture, with research candidates and the honest model status', async () => {
    renderScreen(routes.sport('soccer'), '/:sport', <SportHomeView />, {}, 'soccer');
    expect(await screen.findByRole('heading', { name: 'Soccer', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Premier League/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Liga MX/ })).toBeInTheDocument();
    expect((await screen.findAllByText(/Arsenal/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Opportunities' })).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/undefined|NaN|KXEPL|KXLIGA/);
    expect(text).not.toMatch(BANNED);
    expect(text).toMatch(/research only/i);
  });

  it('the match page leads with the strongest research expression, its counter-case, the scripts and every market', async () => {
    renderScreen(routes.game('soccer', ARS_LEE), '/:sport/game/:eventId', <GameRoute />, {}, 'soccer');
    expect(await screen.findByRole('heading', { name: 'The research read' })).toBeInTheDocument();
    const head = await screen.findByRole('heading', { name: /NO on “Arsenal to win”/ });
    expect(head).toBeInTheDocument();
    expect(screen.getByText(/What beats it:/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How the match could play' })).toBeInTheDocument();
    expect(screen.getByText('Tight, low event')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Markets' })).toBeInTheDocument();
    expect((await screen.findAllByText('Match result (1X2)', { exact: false })).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Every research expression' })).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/undefined|NaN/);
    expect(text).not.toMatch(BANNED);
    expect(text).toMatch(/research only/i);
    // Break-even is above the judged price: the fee is never hidden.
    const nums = within(head.closest('.skopp')!).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(nums.find((x) => x.startsWith('Price judged'))).toMatch(/29¢/);
    expect(nums.find((x) => x.startsWith('Break-even'))).toMatch(/30¢/);
  });

  it('a fixture the engine did not run says PASS and still shows the matchup and markets', async () => {
    renderScreen(routes.game('soccer', SAN_FLA), '/:sport/game/:eventId', <GameRoute />, {}, 'soccer');
    expect(await screen.findByRole('heading', { name: 'No script-engine read for this fixture.' })).toBeInTheDocument();
    expect(screen.getByText(/fixture not on the model board/)).toBeInTheDocument();
    expect(await screen.findByText('No Kalshi contract is published for this game yet.')).toBeInTheDocument();
    expect(document.querySelectorAll('.skrk__row').length).toBeGreaterThan(5);
  });
});
