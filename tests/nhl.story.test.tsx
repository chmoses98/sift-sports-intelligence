// The NHL story layer (lib/nhlStory.ts, lib/nhlTeams.ts) and the states the NHL screens must handle: all 32 clubs
// resolve to a committed logo, phases and freshness read honestly, market fit only regroups published survival,
// contradictions are flagged, goalies and players read from the publication, and started / final games show their
// frozen pregame research and the publisher's review — on the real 2026-10-07 slate after puck drop.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardItem, EventResearchDoc } from '../src/contract/types';
import { clearAsyncMemo } from '../src/data/hooks';
import { isNhlScripts, readNhl, type NhlCandidate, type NhlScripts } from '../src/lib/nhl';
import {
  HIGH_VARIANCE_FAMILIES,
  isOut,
  conflicts,
  gamePhase,
  goalieLines,
  marketFit,
  modelFreshness,
  playerLines,
  priceFreshness,
  projection,
  scoringEnvironment,
  sidesOf,
  slateRead,
  thesis,
} from '../src/lib/nhlStory';
import { NHL_TEAMS, nhlCode, nhlLogo, nhlTeam } from '../src/lib/nhlTeams';
import { routes } from '../src/lib/routes';
import { teamColors, teamLogo } from '../src/lib/teams';
import { GameRoute } from '../src/views/Game';
import { SportHomeView } from '../src/views/SportHome';
import { slateItems } from '../src/views/nhl/NhlSlate';
import { readNhl as readFixture, readNhlFinal, useDiskFetch } from './helpers';
import { renderScreen } from './render';

const FLA_LAK = 'evt_5938c3f8a7c1b24c0118';
const VGK_SEA = 'evt_4f20f09608cc97c362a7';
const PIT_WSH = 'evt_a7a78f07c40f2542da30';
const COL_WPG = 'evt_ced0054a8fcfd15477e5';
const EDM_ANA = 'evt_e3797432fbc05a48f863';
const doc = (id: string) => readFixture<EventResearchDoc>(`explorer/events/${id}.json`);
const finalDoc = (id: string) => readNhlFinal<EventResearchDoc>(`explorer/events/${id}.json`);
const scripts = (r: EventResearchDoc): NhlScripts => {
  const s = readNhl(r);
  if (!isNhlScripts(s)) throw new Error('no scripts');
  return s;
};
const PUBLIC = join(__dirname, '..', 'public');

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

describe('NHL team identity', () => {
  it('all 32 clubs resolve to one deterministic identity with a committed logo file', () => {
    expect(NHL_TEAMS).toHaveLength(32);
    expect(new Set(NHL_TEAMS.map((t) => t.code)).size).toBe(32);
    for (const t of NHL_TEAMS) {
      const src = nhlLogo(t.code);
      expect(src, t.code).toMatch(new RegExp(`teams/nhl/${t.code}\\.webp$`));
      expect(existsSync(join(PUBLIC, 'teams', 'nhl', `${t.code}.webp`)), t.code).toBe(true);
      expect(teamLogo('NHL', t.code)).toBe(src);
      expect(teamColors('NHL', t.code)[0]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('aliases from other feeds resolve to the same club; unknown codes do not', () => {
    expect(nhlCode('LA')).toBe('LAK');
    expect(nhlCode('tb')).toBe('TBL');
    expect(nhlCode('UTAH')).toBe('UTA');
    expect(nhlTeam('NJ')?.name).toBe('Devils');
    expect(nhlCode('XXX')).toBeNull();
    expect(nhlLogo(null)).toBeNull();
  });

  it('every team the publication names is one of the 32', () => {
    const idx = readFixture<{ teams: { short_name: string }[] }>('explorer/index.json');
    for (const t of idx.teams) expect(nhlTeam(t.short_name), t.short_name).not.toBeNull();
  });
});

describe('game phase and freshness', () => {
  const at = '2026-10-07T02:00:00Z';
  it('is UPCOMING before puck drop, LIVE after it even when the publication lags, FINAL only when published', () => {
    expect(gamePhase({ status: 'SCHEDULED', start_time_utc: at }, Date.parse(at) - 60e3).phase).toBe('UPCOMING');
    expect(gamePhase({ status: 'SCHEDULED', start_time_utc: at }, Date.parse(at) + 60e3).phase).toBe('LIVE');
    expect(gamePhase({ status: 'LIVE', start_time_utc: at }, Date.parse(at) - 60e3).phase).toBe('LIVE');
    const f = gamePhase({ status: 'FINAL', start_time_utc: at, extensions: { home_score: 3, away_score: 2 } }, Date.parse(at));
    expect(f).toMatchObject({ phase: 'FINAL', score: { home: 3, away: 2 } });
    // A live score is never shown (a periodic publication's live score is stale by construction).
    expect(gamePhase({ status: 'LIVE', start_time_utc: at, extensions: { home_score: 1, away_score: 0 } }, Date.parse(at)).score).toBeNull();
  });

  it('model research is CURRENT / AGING / STALE before puck drop and FROZEN after it', () => {
    const run = '2026-10-06T22:45:00Z';
    const t = Date.parse(run);
    expect(modelFreshness(run, 'UPCOMING', t + 30 * 60e3)).toBe('CURRENT');
    expect(modelFreshness(run, 'UPCOMING', t + 3 * 3600e3)).toBe('AGING');
    expect(modelFreshness(run, 'UPCOMING', t + 7 * 3600e3)).toBe('STALE');
    expect(modelFreshness(run, 'LIVE', t + 7 * 3600e3)).toBe('FROZEN');
    expect(modelFreshness(null, 'UPCOMING', t)).toBe('UNKNOWN');
  });

  it('prices use the market clock: current under 15 minutes, stale past 30', () => {
    const q = '2026-10-06T23:00:00Z';
    expect(priceFreshness(q, Date.parse(q) + 5 * 60e3)).toBe('CURRENT');
    expect(priceFreshness(q, Date.parse(q) + 20 * 60e3)).toBe('AGING');
    expect(priceFreshness(q, Date.parse(q) + 45 * 60e3)).toBe('STALE');
    expect(priceFreshness(null, Date.parse(q))).toBe('UNKNOWN');
  });
});

describe('the game story', () => {
  it('projection reads the published simulation; script expectations are exact identities over the scripts', () => {
    const r = doc(FLA_LAK);
    const s = scripts(r);
    const p = projection(r, s)!;
    expect(p.pHome).toBeCloseTo(0.5566, 4);
    expect(p.total).toBeCloseTo(6.252, 3);
    expect(p.totalRange).toEqual({ lo: 3, hi: 11 });
    const shots = s.scripts.reduce((a, x) => a + x.probability * x.homeShots!, 0);
    expect(p.shots!.home).toBeCloseTo(shots, 6);
    expect(scoringEnvironment(p)).toBe('AVERAGE');
  });

  it('the thesis is fixed wording on published numbers', () => {
    const r = doc(FLA_LAK);
    const s = scripts(r);
    const ids = sidesOf(r)!;
    const t = thesis(s, projection(r, s), ids, goalieLines(r, s, ids), null)!;
    expect(t.headline).toBe('LAK slight edge · back-and-forth most likely · league-average scoring');
    expect(t.shape.join(' ')).toMatch(/Back-and-forth game is the single most likely shape \(28%\)/);
    expect(t.shape.join(' ')).toMatch(/LAK has the stronger control-and-pull-away branch \(14% vs 7%\)/);
    expect(t.drivers.map((d) => d.key)).toEqual(expect.arrayContaining(['strength', 'pace', 'shots', 'goalies', 'special', 'home']));
    expect(thesis(null, null, ids, [], null)).toBeNull();
  });

  it('goalies: confirmed and unconfirmed starters are read from the publication', () => {
    const conf = doc(FLA_LAK);
    const g1 = goalieLines(conf, scripts(conf), sidesOf(conf)!);
    expect(g1.map((g) => [g.team, g.status])).toEqual([['FLA', 'CONFIRMED'], ['LAK', 'CONFIRMED']]);
    const unc = doc(VGK_SEA);
    const g2 = goalieLines(unc, scripts(unc), sidesOf(unc)!);
    expect(g2.some((g) => g.status !== 'CONFIRMED')).toBe(true);
  });

  it('market fit regroups the published candidates; goal scorers are only ever high-variance research', () => {
    const s = scripts(doc(FLA_LAK));
    const fit = marketFit(s);
    expect(fit.length).toBe(s.candidates.filter((c) => c.governance.status !== 'REJECTED').length);
    for (const it of fit) {
      if (HIGH_VARIANCE_FAMILIES.has(it.c.family)) expect(it.group).toBe('HIGH_VARIANCE');
      else expect(it.group).not.toBe('HIGH_VARIANCE');
      if (it.group === 'SURVIVES') expect(it.c.robustness).toBe('ROBUST');
      const topIdx = s.order.indexOf(s.scripts[0].id);
      if (it.group === 'FITS') expect(it.c.survival.survives?.[topIdx]).toBe(true);
      if (it.group === 'CONFLICTS') expect(it.c.survival.survives?.[topIdx]).toBe(false);
    }
  });

  it('contradiction check: two ideas that need different games are flagged from the published survival bits', () => {
    const s = scripts(doc(FLA_LAK));
    const base = s.candidates.find((c) => c.family === 'game_spread')!;
    const flip = (c: NhlCandidate, id: string, bits: boolean[]): NhlCandidate => ({
      ...c, bet_id: id, relations: [], survival: { ...c.survival, survives: bits, mass_survived: s.order.reduce((a, o, i) => a + (bits[i] ? s.byId.get(o)!.probability : 0), 0) },
    });
    // A: back-and-forth or open (47% of simulated games); B: everything else (53%). Disjoint: they need different games.
    const bits = s.order.map((id) => ['BACK_AND_FORTH', 'OPEN_GAME'].includes(id));
    const a = flip(base, 'A|yes', bits);
    const b = flip(base, 'B|no', bits.map((x) => !x));
    const out = conflicts({ ...s, candidates: [a, b] }, marketFit({ ...s, candidates: [a, b] }));
    expect(out).toHaveLength(1);
    expect(out[0].together).toBe(0);
    expect(out[0].text).toMatch(/need different games/);
  });

  it('player research: every prop is tied to a team, ordered by the model point probability', () => {
    const r = doc(FLA_LAK);
    const s = scripts(r);
    const lines = playerLines(r, s, r.markets as never, () => null, () => null);
    expect(lines.length).toBeGreaterThan(4);
    for (const p of lines) expect(['FLA', 'LAK']).toContain(p.team);
    expect(lines.some((p) => p.goalie)).toBe(true);
    const sk = lines.filter((p) => !p.goalie);
    const pt = (i: number) => sk[i].markets.find((m) => m.family === 'player_points' && (m.threshold ?? 0.5) <= 0.5)?.pYes ?? -1;
    for (let i = 1; i < sk.length; i++) expect(pt(i - 1)).toBeGreaterThanOrEqual(pt(i));
  });

  it('out-of-lineup designations include injured reserve, never day-to-day', () => {
    for (const st of ['OUT', 'INJURED_RESERVE', 'IR', 'LTIR']) expect(isOut(st), st).toBe(true);
    for (const st of ['DAY-TO-DAY', 'QUESTIONABLE', '', null]) expect(isOut(st), String(st)).toBe(false);
  });

  it('a game without scripts reads as such, never as an error', () => {
    const r = doc(FLA_LAK);
    const without = { ...r, extensions: { ...r.extensions, nhl_scripts_v1: { status: 'NOT_SIMULATED', reason: 'not in the latest simulated slate' } } } as EventResearchDoc;
    const read = slateRead(without);
    expect(read.status).toBe('NOT_SIMULATED');
    expect(read.scripts).toBeNull();
    expect(read.projection?.pHome).toBeCloseTo(0.5566, 4); // the simulation block still carries the win probability
    expect(slateRead(null).status).toBe('NO_RESEARCH');
  });
});

describe('started and final games (the real 2026-10-07 slate)', () => {
  it('started games keep their frozen pregame research; finals carry the publisher review', () => {
    for (const id of [PIT_WSH, COL_WPG, EDM_ANA]) {
      const s = scripts(finalDoc(id));
      expect(s.frozen, id).toBe(true);
      expect(s.pregame, id).toBe(true);
      expect(Date.parse(s.generatedAt!)).toBeLessThan(Date.parse(finalDoc(id).event.start_time_utc));
    }
    expect(scripts(finalDoc(COL_WPG)).outcome).toMatchObject({ realized_script: 'GOALIE_DRIVEN', realized_rank: 6, final_score: { home: 3, away: 2 } });
    expect(scripts(finalDoc(EDM_ANA)).outcome).toBeNull();
  });

  it('the slate lists finals for review and live games as live, never offering live prices as pregame research', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-08T05:00:00Z') });
    renderScreen(routes.sport('nhl'), '/:sport', <SportHomeView />, {}, 'nhl-final');
    await screen.findAllByText(/most likely script/, {}, { timeout: 6000 });
    const rows = [...document.querySelectorAll('.nsl')];
    expect(rows).toHaveLength(3);
    expect(document.querySelectorAll('.nsl--final').length).toBe(2);
    expect(document.querySelectorAll('.nsl--live').length).toBe(1);
    expect(screen.getByText(/WPG 3/)).toBeTruthy();
    expect(screen.getAllByText('Pregame research frozen').length).toBe(3);
    expect(document.querySelector('.nsr')).toBeNull();
    expect(screen.getByText(/Every game on this slate has started/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/undefined|NaN/);
    const items = readNhlFinal<{ items: BoardItem[] }>('board.json').items;
    expect(slateItems(items, Date.parse('2026-10-08T05:00:00Z'))).toHaveLength(3);
    expect(slateItems(items, Date.parse('2026-10-10T05:00:00Z')).every((i) => i.status !== 'FINAL')).toBe(true);
  });

  it('a final game page leads with the review against the frozen pregame read', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-08T05:00:00Z') });
    renderScreen(routes.game('nhl', COL_WPG), '/:sport/game/:eventId', <GameRoute />, {}, 'nhl-final');
    const review = await screen.findByRole('heading', { name: 'Review' }, { timeout: 6000 });
    const game = within(document.querySelector('.game--nhl') as HTMLElement);
    expect(review.compareDocumentPosition(game.getByRole('heading', { name: 'How this game is most likely to play' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(game.getByText(/Goaltending steals it · forecast 8% \(ranked 6 of 7\)/)).toBeTruthy();
    expect(game.getByLabelText('Final: COL 2, WPG 3')).toBeTruthy();
    expect(game.getByText(/Pregame model win probability/)).toBeTruthy();
    expect(game.getAllByText(/frozen at/).length).toBeGreaterThan(0);
    expect(game.getAllByText('Frozen at puck drop').length).toBeGreaterThan(0);
    expect(document.querySelector('.game--nhl')!.textContent).not.toMatch(/undefined|NaN/);
  });

  it('a live game page says the puck has dropped and shows the frozen research, not live prices, as research', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-08T02:30:00Z') });
    renderScreen(routes.game('nhl', EDM_ANA), '/:sport/game/:eventId', <GameRoute />, {}, 'nhl-final');
    await screen.findByText(/Puck has dropped\./, {}, { timeout: 6000 });
    expect(screen.getByText(/Live prices move with the score and are never a new pregame signal/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Review' })).toBeNull();
    expect(screen.getAllByText('pregame', { exact: false }).length).toBeGreaterThan(0);
  });
});
