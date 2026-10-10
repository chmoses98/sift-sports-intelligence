// The research hubs' pure parts (Terminal panels, Explore rankings): every value read from a published field, no
// probability or rank invented, and only discovery kinds the publications produce offered as filters.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventResearchDoc } from '../src/contract/types';
import type { Discovery } from '../src/intelligence/discoveries';
import { areaPairs, gameEnvironment, isLayout, kindCounts, LAYOUT_PANELS, layoutFromWorkspace, mainLines, researchFair, TYPE_FILTERS } from '../src/views/intel/terminalModel';
import { cleanRank, fmtRankValue, rankWindow, teamRankings, unitOf } from '../src/views/explore/hub';
import { SNAPSHOT_DIR } from './helpers';

const ev = (id: string) => JSON.parse(readFileSync(join(SNAPSHOT_DIR, 'explorer', 'events', `${id}.json`), 'utf-8')) as EventResearchDoc;
const NEBUF = ev('evt_0cb333291f580a201a70');

describe('terminal model', () => {
  it('pairs each offense with the defense it faces from the published opponent-adjusted ranks only', () => {
    const pairs = areaPairs(NEBUF, 'BUF');
    expect(pairs.length).toBeGreaterThan(3);
    for (const p of pairs) {
      expect(p.off.abbr).toBe('BUF');
      expect(p.def.abbr).toBe('NE');
      for (const s of [p.off, p.def]) if (s.rank != null) expect(s.rank).toBeGreaterThanOrEqual(1);
    }
    // Red zone is a profile-sourced area: never filled from the matchup rows.
    expect(pairs.some((p) => p.key === 'redzone')).toBe(false);
    // Flipping the offense flips the sides.
    expect(areaPairs(NEBUF, 'NE').every((p) => p.off.abbr === 'NE' && p.def.abbr === 'BUF')).toBe(true);
  });

  it('reads the simulated game environment exactly as published, or nothing', () => {
    const env = gameEnvironment(NEBUF)!;
    expect(env.total).toEqual({ mean: 51.7, r50: [42, 60], r90: [31, 79] });
    expect(env.homeMargin?.r90).toEqual([-13, 27]);
    expect(env.centre.source).toBe('kalshi_implied_interpolated');
    expect(gameEnvironment({ ...NEBUF, extensions: {} })).toBeNull();
    expect(gameEnvironment(null)).toBeNull();
  });

  it('main lines are full-game winner, spread and total contracts the research document lists', () => {
    const lines = mainLines(NEBUF);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(6);
    const tickers = new Set(NEBUF.markets.map((m) => m.kalshi_ticker));
    for (const m of lines) {
      expect(tickers.has(m.kalshi_ticker)).toBe(true);
      expect(['game_winner', 'spread', 'total']).toContain(m.market_family);
      expect(m.player_id).toBeFalsy();
    }
    const fair = researchFair(NEBUF, 'mkt_kalshi_KXNFLGAME-26OCT04NEBUF-BUF');
    expect(fair).toBeCloseTo(0.743387, 6);
    expect(researchFair(NEBUF, 'no-such-market')).toBeNull();
  });

  it('offers a type filter only for kinds present, and every preset lays out known panels', () => {
    const d = (kind: Discovery['kind']) => ({ kind }) as Discovery;
    const c = kindCounts([d('mismatch'), d('mismatch'), d('market')]);
    expect(TYPE_FILTERS.filter((t) => c.get(t.kind)).map((t) => t.label)).toEqual(['Mismatches', 'Model vs market']);
    expect(TYPE_FILTERS.some((t) => /usage/i.test(t.label))).toBe(false);
    for (const l of ['discovery', 'matchups', 'markets'] as const) {
      expect(isLayout(l)).toBe(true);
      expect(new Set(LAYOUT_PANELS[l].map((p) => p.id)).size).toBe(LAYOUT_PANELS[l].length);
    }
    expect(isLayout('bogus')).toBe(false);
    expect(layoutFromWorkspace('football')).toBe('matchups');
    expect(layoutFromWorkspace('market')).toBe('markets');
    expect(layoutFromWorkspace(null)).toBeNull();
  });
});

describe('explore rankings', () => {
  const si = JSON.parse(readFileSync(join(SNAPSHOT_DIR, 'explorer', 'search_index.json'), 'utf-8')) as { items: { id: string; kind: string; label: string; secondary?: string | null }[] };
  it('orders team rankings opponent-adjusted first and splits units correctly', () => {
    const rk = teamRankings(si.items);
    expect(rk.length).toBeGreaterThan(20);
    expect(rk[0].label).toMatch(/\(ADJ/);
    expect(unitOf('Adjusted offensive EPA per play ranking (ADJ_RIDGE)')).toBe('offense');
    expect(unitOf('Adjusted defensive EPA per play allowed ranking (ADJ_RIDGE)')).toBe('defense');
    // A pass-protection metric is the offense's, even though it says "allowed".
    expect(unitOf('Adjusted sack rate allowed ranking (ADJ_RIDGE)')).toBe('offense');
    expect(unitOf('Expected goals against per 60 ranking')).toBe('defense');
  });
  it('names windows and values plainly', () => {
    expect(cleanRank('Adjusted offensive EPA per play ranking (ADJ_RIDGE)')).toBe('Adjusted offensive EPA per play');
    expect(rankWindow({ id: 'x', kind: 'RANKING', label: 'Offensive EPA per play ranking (L34)' })).toBe('last 34 games');
    expect(rankWindow({ id: 'x', kind: 'RANKING', label: 'Expected goals for per 60 ranking', secondary: 'NHL teams, 2026-27 regular season' })).toBe('2026-27 regular season');
    expect(fmtRankValue(0.1183)).toBe('+0.118');
    expect(fmtRankValue(-0.05)).toBe('−0.050');
    expect(fmtRankValue(28.37)).toBe('28.4');
    expect(fmtRankValue(null)).toBe('—');
  });
});
