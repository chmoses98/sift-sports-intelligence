// The live CFB production check (scripts/cfb-production-check.mjs) must hold the Slate Priorities rail to the state
// the published board is in. Both states are correct app behaviour: priorities while a game is still to play, and
// "No upcoming games" once every game on the slate has kicked off or finished (late Saturday night, Sunday). These
// tests feed the REAL rendered rail of each state through the check's own judging code (scripts/cfb/priorities.mjs),
// so a change to either the rail or the check that breaks the pairing fails here, not in production.
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { BoardDoc } from '../src/contract/types';
import { decodeSignals, slateGame } from '../src/lib/cfbSignals';
import { normalizeCfbNames } from '../src/lib/cfbTeams';
import { CfbSlatePriorities } from '../src/views/cfb/CfbPriorities';
import { judgeRailState, noUpcomingChecks, railStateOf } from '../scripts/cfb/priorities.mjs';
import { upcoming } from '../scripts/cfb/select.mjs';
import { CFB_SIGNALS_FILE, readCfb } from './helpers';
import { readFileSync } from 'node:fs';

const board = normalizeCfbNames(readCfb<BoardDoc>('board.json'));
const doc = decodeSignals(JSON.parse(readFileSync(CFB_SIGNALS_FILE, 'utf-8')));
const NOW = Date.parse('2026-10-07T23:25:00Z'); // upcoming games exist, prices fresh
const AFTER_SLATE = Date.parse('2026-10-20T00:00:00Z'); // every game has kicked off or finished

/** What the production check reads from the rail on the page: its text, item links and value slots. */
function seen(now: number) {
  const games = board.items.map((i) => slateGame(i, doc, null));
  const { container } = render(<MemoryRouter><CfbSlatePriorities games={games} doc={doc} loading={false} slug="cfb" now={now} /></MemoryRouter>);
  const rail = container.querySelector('section')!;
  return {
    text: (rail.textContent ?? '').replace(/\s+/g, ' '),
    links: rail.querySelectorAll('a.prio__a').length,
    valueSlots: rail.querySelectorAll('[data-priority="value"]').length,
  };
}

describe('CFB production check: Slate Priorities states', () => {
  it('the board and the app agree on which state a time is in', () => {
    expect(upcoming(board, NOW).length).toBeGreaterThan(0);
    expect(upcoming(board, AFTER_SLATE)).toHaveLength(0);
  });

  it('no upcoming games: the check expects the plain empty state, not the Top Value Signal', () => {
    const s = seen(AFTER_SLATE);
    expect(railStateOf(s.text)).toBe('none');
    expect(judgeRailState(s.text, 0, 0).ok).toBe(true);
    // The Top Value Signal slot is absent in this state: it must not be required.
    expect(s.valueSlots).toBe(0);
    expect(s.text).not.toMatch(/top value signal/i);
    const results = noUpcomingChecks('test', s);
    expect(results.length).toBeGreaterThanOrEqual(4);
    expect(results.filter(([ok]) => !ok)).toEqual([]);
  });

  it('upcoming games: the check expects priorities and the Top Value Signal', () => {
    const s = seen(NOW);
    expect(railStateOf(s.text)).toBe('upcoming');
    expect(judgeRailState(s.text, upcoming(board, NOW).length, upcoming(board, NOW).length).ok).toBe(true);
    expect(s.valueSlots).toBe(1);
    expect(s.text).toMatch(/top value signal/i);
    expect(s.links).toBeGreaterThanOrEqual(1);
    // The empty-state assertions would (rightly) reject a populated rail.
    expect(noUpcomingChecks('test', s).some(([ok]) => !ok)).toBe(true);
  });

  it('a mismatch between the board and the rail fails the check', () => {
    const empty = seen(AFTER_SLATE);
    expect(judgeRailState(empty.text, 3, 3).ok).toBe(false); // the board has games, the rail claims none
    expect(judgeRailState('Top value signal LSU win 76¢', 0, 0).ok).toBe(false); // the board has none, the rail shows priorities
  });

  it('a game kicking off while the page is open is tolerated in either state', () => {
    expect(judgeRailState('No upcoming games', 1, 0).ok).toBe(true);
    expect(judgeRailState('Top value signal', 1, 0).ok).toBe(true);
  });
});
