// Contract parsing against the real NFL publication (public/data/nfl): versions, paths, cross-references.
import { beforeAll, describe, expect, it } from 'vitest';
import { getJson, NotFoundError, SchemaVersionError, setFetchJson } from '../src/data/fetcher';
import type { EntityProfileDoc, RankingDoc } from '../src/contract/types';
import { nflRepo, readSnapshot, useDiskFetch } from './helpers';

describe('contract parsing', () => {
  beforeAll(() => useDiskFetch());

  it('reads the explorer index and resolves every entity through its file table (never a guessed path)', async () => {
    const repo = nflRepo();
    const idx = await repo.index();
    expect(idx.kind).toBe('explorer_index');
    expect(idx.counts.teams).toBe(32);
    const buf = idx.teams.find((t) => t.short_name === 'BUF')!;
    expect(await repo.pathFor(buf.participant_id, 'entity_profile')).toBe(buf.path);
    const prof = await repo.profile(buf.participant_id);
    expect(prof.entity.display_name).toBe('Buffalo Bills');
    expect(await repo.pathFor('prt_does_not_exist', 'entity_profile')).toBeNull();
    await expect(repo.profile('prt_does_not_exist')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('every explorer event and board row points at a published document', async () => {
    const repo = nflRepo();
    const idx = await repo.index();
    for (const e of idx.events) expect(Object.keys(idx.files)).toContain(e.path.replace('explorer/', ''));
    const board = await repo.board();
    for (const row of board.items) {
      const d = await repo.eventDetail(row.event_id);
      expect(d.event.event_id).toBe(row.event_id);
      expect(d.markets.length).toBe(row.markets_available);
    }
  });

  it('rejects any schema version other than edge_finder.app.v1', async () => {
    setFetchJson(async () => ({ schema_version: 'edge_finder.app.v2', kind: 'health' }));
    await expect(getJson('x://health.json')).rejects.toBeInstanceOf(SchemaVersionError);
    useDiskFetch();
  });

  it('observation context agrees with the published ranking it names', async () => {
    const repo = nflRepo();
    const idx = await repo.index();
    const bal = idx.teams.find((t) => t.short_name === 'BAL')!;
    const prof = await repo.profile(bal.participant_id);
    const ranked = prof.metrics.filter((o) => o.context?.ranking_id);
    expect(ranked.length).toBeGreaterThan(40);
    for (const o of ranked.slice(0, 12)) {
      const rk = await repo.ranking(o.context!.ranking_id!);
      const entry = rk.entries.find((e) => e.entity_id === bal.participant_id)!;
      expect(entry.rank).toBe(o.context!.rank);
      expect(rk.universe.size).toBe(o.context!.universe_size);
      expect(rk.summary.mean).toBeCloseTo(o.context!.league_average!, 9);
      expect(rk.entries.length).toBe(rk.universe.size);
    }
  });

  it('series points link to games and opponents', () => {
    const prof = readSnapshot<EntityProfileDoc>('explorer/teams/prt_16bee2e0460c651b4bca.json');
    const ser = readSnapshot<{ points: { event_id: string; opponent_id: string }[] }>(prof.series[0].path);
    const games = new Set(prof.games.map((g) => g.event_id));
    for (const p of ser.points) {
      expect(games.has(p.event_id)).toBe(true);
      expect(p.opponent_id).toMatch(/^prt_/);
    }
  });

  it('rankings are complete comparison universes in rank order', () => {
    const rk = readSnapshot<RankingDoc>('explorer/rankings/rnk_e3485aaecabb0ec363a8.json');
    expect(rk.entries).toHaveLength(32);
    const ranks = rk.entries.map((e) => e.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });
});
