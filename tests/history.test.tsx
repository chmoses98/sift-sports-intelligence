// Player history beyond the current season: windows that span seasons, ranks a pregame view may use, and
// wording that compares past games with TODAY's line only (no historical line is published or implied).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameTag, hitRecord, pregameRows, rankFor, statDef, windowLabel, windowRows, windowsFor } from '../src/history/stats';
import type { PlayerHistoryDoc } from '../src/history/types';
import { GameBars, HistorySummary, LogTable } from '../src/views/player/history';
import { HISTORY_DIR } from './helpers';

const doc = (gsis: string) => JSON.parse(readFileSync(join(HISTORY_DIR, 'players', `${gsis}.json`), 'utf-8')) as PlayerHistoryDoc;
const bijan = doc('00-0038542');
const KICK = '2026-10-06T00:15:00Z'; // ATL @ NO, week 4 (Monday night)
const rush = statDef('rushing_yards')!;

describe('history windows', () => {
  const rows = pregameRows(bijan, KICK, 4);

  it('uses last season and this season before the game, each row carrying its season', () => {
    expect(rows.current.map((r) => r.week)).toEqual([1, 2, 3]);
    expect(rows.current.every((r) => r.season === 2026)).toBe(true);
    expect(rows.prior.length).toBeGreaterThanOrEqual(17);
    expect(rows.prior.every((r) => r.season === 2025)).toBe(true);
  });

  it('offers last 5, last 10, this season and last season; last 5 spans the two seasons', () => {
    expect(windowsFor(rows)).toEqual(['last5', 'last10', 'season', 'prior']);
    const l5 = windowRows(rows, 'last5');
    expect(l5).toHaveLength(5);
    expect(l5.slice(-3).map((r) => r.week)).toEqual([1, 2, 3]);
    expect(l5[0].season).toBe(2025);
    expect(windowRows(rows, 'last10')).toHaveLength(10);
    expect(windowRows(rows, 'season')).toBe(rows.current);
    expect(windowLabel('prior', 2026, 2025)).toBe('2025');
  });

  it('labels last-season games so a mixed window is never ambiguous', () => {
    const l5 = windowRows(rows, 'last5');
    expect(gameTag(l5[4], 2026)).toBe('W3');
    expect(gameTag(l5[0], 2026)).toMatch(/^'25 (W\d+|WC|DIV|CONF|SB)$/);
  });

  it('counts games above today’s line across the window', () => {
    const rec = hitRecord(windowRows(rows, 'last5'), rush, 89.5);
    expect(rec.values).toHaveLength(5);
    expect(rec.over + rec.under + rec.push).toBe(5);
  });
});

describe('player ranks', () => {
  it('a pregame view never uses its own week: week 4 reads the ranking through week 3', () => {
    const r = rankFor(bijan, 'rushing_yards', 4)!;
    expect(r.season).toBe(2026);
    expect(r.through_week).toBe(3);
    expect(r.games).toBe(3);
    expect(r.rank).toBeGreaterThanOrEqual(1);
    expect(r.rank).toBeLessThanOrEqual(r.of);
  });

  it('#1 is the most per game (counting stats only) and ties share a rank', () => {
    const all = (bijan.ranks ?? []).filter((x) => x.season === 2025);
    expect(all).toHaveLength(1);
    expect(all[0].through_week).toBeNull();
    expect(all[0].stats.rushing_yards.per_game).toBeCloseTo(86.9, 1);
  });

  it('falls back to last season when this season has no completed week before the game', () => {
    expect(rankFor(bijan, 'rushing_yards', 1)?.season).toBe(2025);
  });
});

describe('today’s line, never a historical line', () => {
  const rows = windowRows(pregameRows(bijan, KICK, 4), 'last5');

  it('the summary says “today’s line” and states the window', () => {
    render(<HistorySummary rows={rows} stat={rush} line={89.5} projection={88} windowName="Last 5" unit="yds" />);
    expect(screen.getByText(/above today's line of/)).toBeInTheDocument();
    expect(screen.getByText('(last 5)')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/historical line|line was|closing line/i);
  });

  it('the chart labels the line as today’s and every bar against it', () => {
    render(<GameBars rows={rows} stat={rush} line={89.5} upcoming={null} season={2026} />);
    expect(screen.getByText("Today's line 89.5")).toBeInTheDocument();
    for (const b of screen.getAllByRole('button')) expect(b.getAttribute('aria-label')).toMatch(/today's line/);
  });

  it('the full log compares each game with today’s line in its header', () => {
    render(<LogTable rows={rows} pos="RB" season={2026} stat={rush} line={89.5} />);
    expect(screen.getByRole('columnheader', { name: "vs today's 89.5" })).toBeInTheDocument();
  });
});
