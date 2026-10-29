import { describe, expect, it } from 'vitest';
import type { BoardItem } from '../../src/contract/types';
import type { SportRepo } from '../../src/data/repo';
import type { SportConfig } from '../../src/data/sports';
import { EARLY_GAMES, soonestWithin } from '../../src/v3/data/props/early';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-28T15:00:00Z');
const sport = (slug: string) => ({ slug, code: slug.toUpperCase() }) as unknown as SportConfig;
const repo = {} as SportRepo;
const row = (id: string, startH: number, markets = 100) => ({ event_id: id, start_time_utc: new Date(NOW + startH * HOUR).toISOString(), markets_available: markets, detail_path: `event_detail/${id}.json` }) as unknown as BoardItem;

describe('Prop Discovery early start: which games are read ahead', () => {
  it('takes the soonest games of every sport inside 48 hours, soonest first, and no more than EARLY_GAMES', () => {
    const boards = [
      { sport: sport('nba'), repo, items: [row('n1', 8), row('n2', 8), row('n3', 30), row('n4', 47)] },
      { sport: sport('nhl'), repo, items: [row('h1', 9.5), row('h2', 12)] },
      { sport: sport('nfl'), repo, items: [row('f1', 14), row('f2', 40)] },
    ];
    const got = soonestWithin(boards, NOW);
    expect(got).toHaveLength(EARLY_GAMES);
    expect(got.map((c) => c.row.event_id)).toEqual(['n1', 'n2', 'h1', 'h2', 'f1', 'n3']);
    expect(got.every((c, i) => i === 0 || got[i - 1].startMs <= c.startMs)).toBe(true);
  });

  it('never reads a game that has started, lists no market, starts beyond the default horizon, or has no readable start', () => {
    const boards = [{
      sport: sport('nba'), repo,
      items: [row('started', -1), row('nomarkets', 5, 0), row('far', 49), row('edge', 48), row('ok', 3), { ...row('bad', 1), start_time_utc: 'soon' } as BoardItem],
    }];
    expect(soonestWithin(boards, NOW).map((c) => c.row.event_id)).toEqual(['ok', 'edge']);
  });

  it('reads nothing when no game starts inside the horizon', () => {
    expect(soonestWithin([{ sport: sport('nfl'), repo, items: [row('f', 100)] }], NOW)).toEqual([]);
    expect(soonestWithin([], NOW)).toEqual([]);
  });

  it('a board row that does not say how many markets is read (the list reads it too)', () => {
    const r = { ...row('x', 2) } as Record<string, unknown>;
    delete r.markets_available;
    expect(soonestWithin([{ sport: sport('nba'), repo, items: [r as unknown as BoardItem] }], NOW)).toHaveLength(1);
  });
});
