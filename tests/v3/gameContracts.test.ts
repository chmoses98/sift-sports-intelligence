// What the game screens tell the one exact-contract sheet: every rung of a line or prop is a contract the sheet can resolve, each knows the
// game's SCHEDULE start and whether it is live, and the price handed over is the ungated one (the sheet applies the contract gate itself).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { EventDetailDoc, Market } from '../../src/contract/types';
import { deriveLines } from '../../src/v3/data/adapt';
import type { V3Game, V3Team } from '../../src/v3/model/types';
import { cleanDescription, contractsOfGame, contractsOfLine } from '../../src/v3/ui/gameContracts';

const T = (id: string, name: string): V3Team => ({ id, slug: 'nfl', sport: 'NFL', name, nick: name, abbr: id, logo: null, colors: ['#000', '#fff'] });
const away = T('DAL', 'Dallas Cowboys'), home = T('PHI', 'Philadelphia Eagles');
const M = (o: Partial<Market>): Market => ({ market_id: 'm', kalshi_ticker: 'T', event_id: 'e', market_family: 'spread', yes_description: '', yes_bid: 0.5, yes_ask: 0.52, market_probability: 0.51, captured_at: '2026-10-26T18:23:01Z', participant_id: null, player_id: null, period: 'FULL', line: null, threshold: null, market_status: 'OPEN', ...o } as Market);
const START = Date.parse('2026-10-27T00:15:00Z');
const game = (lines: V3Game['lines'], phase: V3Game['phase'] = 'pregame'): V3Game => ({ key: 'nfl:e', slug: 'nfl', sport: 'NFL', eventId: 'e', league: 'NFL', phase, startMs: START - 1000, away, home, score: null, lines, signals: 0, provenance: 'publication' });

describe('cleanDescription', () => {
  it('drops the publication scaffolding and keeps the contract\'s own words', () => {
    expect(cleanDescription('SAMPLE: SF wins by more than 2.5')).toBe('SF wins by more than 2.5');
    expect(cleanDescription('YES iff team margin > 0 (FULL) [subject: DAL]')).toBe('team margin > 0');
    expect(cleanDescription('YES iff total_points (FULL_GAME) >= 45.0')).toBe('total_points >= 45.0');
  });
});

describe('contractsOfLine', () => {
  const lines = deriveLines([
    M({ kalshi_ticker: 'SP-A', market_family: 'spread', participant_id: 'ph', threshold: 2.5, yes_ask: 0.5, market_probability: 0.5 }),
    M({ kalshi_ticker: 'SP-B', market_family: 'spread', participant_id: 'ph', threshold: 3.5, yes_ask: 0.4, market_probability: 0.4 }),
    M({ kalshi_ticker: 'GW-A', market_family: 'game_winner', participant_id: 'pa', market_probability: 0.6, yes_ask: 0.61 }),
    M({ kalshi_ticker: 'GW-H', market_family: 'game_winner', participant_id: 'ph', market_probability: 0.4, yes_ask: 0.41 }),
  ], away, home, { away: 'pa', home: 'ph' });
  const f = { g: game(lines), startMs: START, detailHref: '/v3/game/nfl/e' };

  it('every rung of a ladder is a contract with the schedule start, the game phase, the other rungs as neighbours and a link to the game', () => {
    const sp = lines.find((l) => l.kind === 'spread')!;
    const out = contractsOfLine(f, sp);
    expect(out.map((c) => c.ticker).sort()).toEqual(['SP-A', 'SP-B']);
    for (const c of out) {
      expect(c.startMs).toBe(START);
      expect(c.live).toBe(false);
      expect(c.neighbours?.map((n) => n.ticker).sort()).toEqual(['SP-A', 'SP-B']);
      expect(c.subtitle).toMatch(/^DAL at PHI · .+ · Kalshi YES$/);
      expect(c.actions).toEqual([{ label: 'Game Detail', to: '/v3/game/nfl/e', primary: true }]);
    }
    expect(out.find((c) => c.ticker === sp.price.ticker)!.title).toBe(`Spread · ${sp.label}`);
    // the price is the ungated publication price: the sheet, not this module, decides whether it may be printed
    expect(out.find((c) => c.ticker === 'SP-A')!.price).toMatchObject({ ask: 50, source: 'Kalshi', observedAt: '2026-10-26T18:23:01Z' });
  });

  it('a moneyline names its two sides, away first', () => {
    const ml = lines.find((l) => l.kind === 'moneyline')!;
    const out = contractsOfLine(f, ml);
    expect(out.map((c) => c.neighbours!.map((n) => n.label))[0]).toEqual(['Dallas Cowboys to win', 'Philadelphia Eagles to win']);
  });

  it('a game in play is live (a tighter tier), and a missing start stays null (the strictest tier)', () => {
    const live = contractsOfLine({ g: game(lines, 'live'), startMs: null }, lines[0]);
    expect(live.every((c) => c.live)).toBe(true);
    expect(live.every((c) => c.startMs === START - 1000)).toBe(true); // falls back to the board's start only when the schedule has none
    const noStart = contractsOfLine({ g: { ...game(lines), startMs: NaN }, startMs: null }, lines[0]);
    expect(noStart.every((c) => c.startMs === null)).toBe(true);
    expect(noStart[0].subtitle).toBe('DAL at PHI · Kalshi YES');
  });

  it('no link to the game when the screen is the game', () => {
    expect(contractsOfLine({ g: game(lines), startMs: START }, lines[0]).every((c) => !c.actions?.length)).toBe(true);
  });
});

describe('contractsOfGame on the real DAL at PHI document', () => {
  const detail = JSON.parse(readFileSync('tests/v3/fixtures/nfl-event-dal-phi-detail.json', 'utf8')) as EventDetailDoc;
  const g = game([]);
  const out = contractsOfGame({ g, startMs: START }, detail);
  const byTicker = new Map(out.map((c) => [c.ticker, c]));

  it('publishes the win contracts, the team totals and every player-prop rung with a title the viewer can read', () => {
    expect(byTicker.get('KXNFLGAME-26OCT26DALPHI-DAL')!.title).toBe('Dallas Cowboys to win');
    expect(out.some((c) => /team total over/.test(c.title))).toBe(true);
    const prop = out.find((c) => /: Passing yards over/.test(c.title))!;
    expect(prop.title).toMatch(/^[A-Z][A-Za-z.' -]+: Passing yards over \d+(\.\d)?$/);
    expect(prop.neighbours!.length).toBeGreaterThan(1);
    expect(prop.neighbours![0].label).toMatch(/^over /);
  });

  it('resolves every contract of the game by ticker, each with the schedule start, and none carries an age or freshness word', () => {
    expect(out.length).toBeGreaterThan(50);
    for (const c of out) {
      expect(c.startMs).toBe(START);
      expect(`${c.title} ${c.subtitle} ${c.neighbours?.map((n) => n.label).join(' ') ?? ''}`).not.toMatch(/\bago\b|stale|last known|just now|fresh/i);
    }
  });
});
